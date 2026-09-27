import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { orderBucket, isOrderCompleted, type OrderBucket } from '../lib/orderCompletion';
import type { AccountRole, OrderStatus } from '../types/database';

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
// компании и по каждому сотруднику»): по компании — число заказов по
// статусам и выручка по завершённым; по сотруднику — те же два среза,
// посчитанные по его заказам (в бригаде — для водителя/грузчика, среди
// созданных — для диспетчера/админа через orders.created_by, миграция 0006).
// Считаем на клиенте одним запросом — так же, как useClientOrderStats.
export function useStatsOverview() {
  return useQuery({
    queryKey: ['stats-overview'],
    queryFn: async (): Promise<StatsOverview> => {
      const [ordersRes, accountsRes] = await Promise.all([
        supabase.from('orders').select('status, actual_price, scheduled_end, created_by, order_crew(employee_id)'),
        supabase.from('employees').select('id, name, role').order('role').order('name'),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (accountsRes.error) throw accountsRes.error;

      const orders = ordersRes.data as unknown as StatsOrderRow[];
      const accounts = accountsRes.data as { id: string; name: string; role: AccountRole }[];

      // «Завершён»/«Активен»/«Отменён» считаем по времени, а не по статусу
      // (ревью, задача 2): приложение больше не пишет 'completed'. Выручка —
      // по завершённым. См. lib/orderCompletion.ts (то же правило в веб-кабинете).
      const now = new Date();
      const ordersByBucket: Record<OrderBucket, number> = { active: 0, completed: 0, cancelled: 0 };
      let totalRevenue = 0;
      const perEmployee = new Map<string, { orders: number; revenue: number }>();

      for (const order of orders) {
        ordersByBucket[orderBucket(order, now)] += 1;
        const isCompleted = isOrderCompleted(order, now);
        if (isCompleted) totalRevenue += order.actual_price ?? 0;

        const creditedIds = new Set<string>();
        for (const crew of order.order_crew ?? []) creditedIds.add(crew.employee_id);
        if (order.created_by) creditedIds.add(order.created_by);

        for (const employeeId of creditedIds) {
          const entry = perEmployee.get(employeeId) ?? { orders: 0, revenue: 0 };
          entry.orders += 1;
          if (isCompleted) entry.revenue += order.actual_price ?? 0;
          perEmployee.set(employeeId, entry);
        }
      }

      const employees: EmployeeStat[] = accounts
        .map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          ordersCount: perEmployee.get(a.id)?.orders ?? 0,
          revenue: perEmployee.get(a.id)?.revenue ?? 0,
        }))
        .sort((a, b) => b.ordersCount - a.ordersCount);

      return { totalOrders: orders.length, ordersByBucket, totalRevenue, employees };
    },
  });
}
