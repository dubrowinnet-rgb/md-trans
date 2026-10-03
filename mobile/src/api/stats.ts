import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { OrderBucket } from '../lib/orderCompletion';
import type { AccountRole, CompanyOrderStats } from '../types/database';

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

// Статистика для администратора (раздел «видит все срезы статистики по
// компании и по каждому сотруднику»): по компании — число заказов по
// состоянию и выручка по выполненным; по сотруднику — те же два среза,
// посчитанные по его заказам (в бригаде — для водителя/грузчика, среди
// созданных — для диспетчера/админа через orders.created_by, миграция 0006).
// Считает сама база (company_order_stats, миграция 0020) по тому же
// правилу «выполнен», что и lib/orderCompletion.ts. Раньше приложение
// скачивало все заказы компании, а API отдаёт не больше 1000 строк — у
// компании с большой историей цифры молча обрезались.
export function useStatsOverview() {
  return useQuery({
    queryKey: ['stats-overview'],
    queryFn: async (): Promise<StatsOverview> => {
      const [statsRes, accountsRes] = await Promise.all([
        supabase.rpc('company_order_stats', {}),
        supabase.from('employees').select('id, name, role').order('role').order('name'),
      ]);
      if (statsRes.error) throw statsRes.error;
      if (accountsRes.error) throw accountsRes.error;

      const stats = statsRes.data as CompanyOrderStats;
      const accounts = accountsRes.data as { id: string; name: string; role: AccountRole }[];
      const perEmployee = new Map(stats.employees.map((e) => [e.employee_id, e]));

      const employees: EmployeeStat[] = accounts
        .map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          ordersCount: Number(perEmployee.get(a.id)?.orders ?? 0),
          revenue: Number(perEmployee.get(a.id)?.revenue ?? 0),
        }))
        .sort((a, b) => b.ordersCount - a.ordersCount);

      return {
        totalOrders: Number(stats.total),
        ordersByBucket: { active: Number(stats.active), completed: Number(stats.completed), cancelled: Number(stats.cancelled) },
        totalRevenue: Number(stats.revenue),
        employees,
      };
    },
  });
}
