import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
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
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  totalRevenue: number;
  employees: EmployeeStat[];
}

interface StatsOrderRow {
  status: OrderStatus;
  actual_price: number | null;
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
        supabase.from('orders').select('status, actual_price, created_by, order_crew(employee_id)'),
        supabase.from('employees').select('id, name, role').order('role').order('name'),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (accountsRes.error) throw accountsRes.error;

      const orders = ordersRes.data as unknown as StatsOrderRow[];
      const accounts = accountsRes.data as { id: string; name: string; role: AccountRole }[];

      const ordersByStatus: Partial<Record<OrderStatus, number>> = {};
      let totalRevenue = 0;
      const perEmployee = new Map<string, { orders: number; revenue: number }>();

      for (const order of orders) {
        ordersByStatus[order.status] = (ordersByStatus[order.status] ?? 0) + 1;
        const isCompleted = order.status === 'completed';
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

      return { totalOrders: orders.length, ordersByStatus, totalRevenue, employees };
    },
  });
}
