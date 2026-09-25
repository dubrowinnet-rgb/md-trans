import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RateMode } from '@/types/database';

export type { RateMode };

export interface EmployeeRates {
  hourly_rate: number | null;
  driving_hourly_rate: number | null;
  loading_hourly_rate: number | null;
  rate_mode: RateMode;
}

interface PayPeriodRow {
  order_id: string;
  employee_id: string;
  role: 'driver' | 'loader';
  scheduled_start: string;
  scheduled_end: string;
}

export interface EmployeePayEstimate {
  hours: number;
  pay: number;
}

// Предварительный расчёт зарплаты за период: часы = сумма длительностей
// заказов, где сотрудник в экипаже (order_crew), по завершённым заказам.
// «Оплата» считается по режиму ставки: combined — вся продолжительность
// по hourly_rate; split — по ставке, соответствующей роли назначения в
// заказе (driving_hourly_rate для role='driver', loading_hourly_rate для
// role='loader'). Когда у сотрудника на одном заказе две роли (и водитель,
// и грузчик — например на сборном грузе), это две строки order_crew с
// одинаковым order_id: часы этого заказа считаются один раз, а не дважды
// (решение Максима, мобильный тред 2026-09-25), по большей из ставок
// вождения/погрузки — поэтому строки группируются по order_id перед счётом.
export function useEmployeePayEstimate(employeeId: string | undefined, rates: EmployeeRates | undefined, periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ['payroll-estimate', employeeId, periodStart, periodEnd],
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<{ estimate: EmployeePayEstimate }> => {
      const { data, error } = await supabase
        .from('order_crew')
        .select('order_id, employee_id, role, orders!inner(scheduled_start, scheduled_end, status)')
        .eq('employee_id', employeeId as string)
        .eq('orders.status', 'completed')
        .gte('orders.scheduled_start', periodStart)
        .lt('orders.scheduled_start', periodEnd);
      if (error) throw error;
      const rows = (data as unknown as (PayPeriodRow & { orders: { scheduled_start: string; scheduled_end: string } })[]) ?? [];
      const orderRoles = new Map<string, { durationHours: number; roles: Set<'driver' | 'loader'> }>();
      for (const row of rows) {
        const durationHours =
          (new Date(row.orders.scheduled_end).getTime() - new Date(row.orders.scheduled_start).getTime()) / 3_600_000;
        const entry = orderRoles.get(row.order_id) ?? { durationHours, roles: new Set() };
        entry.roles.add(row.role);
        orderRoles.set(row.order_id, entry);
      }
      let hours = 0;
      let pay = 0;
      for (const { durationHours, roles } of orderRoles.values()) {
        hours += durationHours;
        if (!rates) continue;
        if (rates.rate_mode !== 'split') {
          pay += durationHours * (rates.hourly_rate ?? 0);
          continue;
        }
        // Одна роль — её ставка; обе роли на одном заказе — большая из двух.
        const rate = roles.has('driver') && roles.has('loader')
          ? Math.max(rates.driving_hourly_rate ?? 0, rates.loading_hourly_rate ?? 0)
          : (roles.has('driver') ? rates.driving_hourly_rate : rates.loading_hourly_rate) ?? 0;
        pay += durationHours * rate;
      }
      return { estimate: { hours: Math.round(hours * 100) / 100, pay: Math.round(pay) } };
    },
  });
}

// Намеренно ОТДЕЛЬНАЯ мутация от useUpdateAccount (api/accounts.ts) — тот
// же клик «Сохранить» шлёт профиль/роль/права одним запросом и ставки
// другим, чтобы это разделение UI (см. AccountModal) не завязывалось на
// внутренний состав полей useUpdateAccount.
export function useUpdateEmployeeRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, rates }: { id: string; rates: EmployeeRates }) => {
      const { error } = await supabase.from('employees').update(rates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}
