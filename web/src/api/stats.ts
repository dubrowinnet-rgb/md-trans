import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages, isMissingFunction } from '@/lib/supabaseQuery';
import { useCompanyId } from '@/providers/SessionProvider';
import { isOrderCompleted, orderBucket, type OrderBucket } from '@/lib/orderCompletion';
import type { AccountRole, CompanyOrderStats, OrderStatus } from '@/types/database';

export interface EmployeeStat {
  id: string;
  name: string;
  role: AccountRole;
  ordersCount: number;
  revenue: number;
}

export interface StatsOverview {
  totalOrders: number;
  ordersByBucket: Record<OrderBucket, number>;
  totalRevenue: number;
  employees: EmployeeStat[];
}

interface StatsOrderRow {
  status: OrderStatus;
  actual_price: number | null;
  scheduled_end: string;
  created_by: string | null;
  order_crew: { employee_id: string }[];
}

// Статистика для администратора (раздел «видит все срезы статистики по
// компании и по каждому сотруднику»): по компании — активные/завершённые/
// отменённые (lib/orderCompletion.ts) и выручка по завершённым; по
// сотруднику — те же два среза, посчитанные по его заказам (в бригаде —
// для водителя/грузчика, среди созданных — для диспетчера/админа через
// orders.created_by, миграция 0006). Считает база (company_order_stats,
// миграция 0020) — раньше кабинет скачивал все заказы периода и видел из
// них только первую 1000.
// В кабинете, в отличие от мобильного приложения, можно выбрать период
// (по дате начала заказа); range = null — за всё время. enabled = false —
// не спрашивать (статистику база отдаёт только администратору).
export function useStatsOverview(range: { from: Date; to: Date } | null, enabled = true) {
  const companyId = useCompanyId();
  const fromIso = range?.from.toISOString() ?? null;
  const toIso = range?.to.toISOString() ?? null;
  return useQuery({
    queryKey: ['stats-overview', companyId, fromIso, toIso],
    enabled,
    // Сводка за длинный период тяжёлая, а смотрят её не поминутно.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<StatsOverview> => {
      let accountsQuery = supabase.from('employees').select('id, name, role');
      if (companyId) accountsQuery = accountsQuery.eq('company_id', companyId);
      const [overview, accountsRes] = await Promise.all([
        fetchOverview(companyId, fromIso, toIso),
        accountsQuery.order('role').order('name'),
      ]);
      if (accountsRes.error) throw accountsRes.error;
      const accounts = accountsRes.data as { id: string; name: string; role: AccountRole }[];

      const perEmployee = new Map(overview.employees.map((e) => [e.employee_id, e]));
      const employees: EmployeeStat[] = accounts
        .map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          ordersCount: perEmployee.get(a.id)?.orders ?? 0,
          revenue: Number(perEmployee.get(a.id)?.revenue ?? 0),
        }))
        .sort((a, b) => b.ordersCount - a.ordersCount);

      return {
        totalOrders: overview.total,
        ordersByBucket: { active: overview.active, completed: overview.completed, cancelled: overview.cancelled },
        totalRevenue: Number(overview.revenue),
        employees,
      };
    },
  });
}

async function fetchOverview(companyId: string | null, fromIso: string | null, toIso: string | null): Promise<CompanyOrderStats> {
  const { data, error } = await supabase.rpc('company_order_stats', { p_from: fromIso, p_to: toIso });
  if (!error) return data as CompanyOrderStats;
  if (!isMissingFunction(error)) throw error;

  // В базе ещё нет функции (миграция не запущена) — считаем сами, как
  // раньше, но по всем страницам заказов, а не по первой тысяче.
  const orders = await fetchAllPages<StatsOrderRow>((from, to) => {
    let query = supabase.from('orders').select('status, actual_price, scheduled_end, created_by, order_crew(employee_id)');
    if (companyId) query = query.eq('company_id', companyId);
    if (fromIso && toIso) query = query.gte('scheduled_start', fromIso).lt('scheduled_start', toIso);
    return query.order('id', { ascending: true }).range(from, to);
  });

  const now = new Date();
  const result: CompanyOrderStats = { total: orders.length, active: 0, completed: 0, cancelled: 0, revenue: 0, employees: [] };
  const perEmployee = new Map<string, { employee_id: string; orders: number; revenue: number }>();
  for (const order of orders) {
    result[orderBucket(order, now)] += 1;
    const isCompleted = isOrderCompleted(order, now);
    if (isCompleted) result.revenue += Number(order.actual_price ?? 0);

    const creditedIds = new Set<string>();
    for (const crew of order.order_crew ?? []) creditedIds.add(crew.employee_id);
    if (order.created_by) creditedIds.add(order.created_by);

    for (const employeeId of creditedIds) {
      const entry = perEmployee.get(employeeId) ?? { employee_id: employeeId, orders: 0, revenue: 0 };
      entry.orders += 1;
      if (isCompleted) entry.revenue += Number(order.actual_price ?? 0);
      perEmployee.set(employeeId, entry);
    }
  }
  result.employees = [...perEmployee.values()];
  return result;
}
