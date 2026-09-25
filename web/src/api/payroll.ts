import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Account } from './accounts';

// Ставки за час — предложенная схема (память payroll-and-driver-reports-feature),
// миграция мобильного треда ещё не пришла. Как companies/support_tickets —
// нетипизированный клиент, пока полей нет в types/database.ts.
const db = supabase as unknown as SupabaseClient;

export type RateMode = 'combined' | 'split';

export interface EmployeeRates {
  hourly_rate: number | null;
  driving_hourly_rate: number | null;
  loading_hourly_rate: number | null;
  rate_mode: RateMode;
}

// account, пришедший через select('*'), реально содержит эти поля, как
// только миграция применена — просто types/database.ts про них не знает.
export type AccountWithRates = Account & Partial<EmployeeRates>;

interface PayPeriodRow {
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
// role='loader') — см. открытый вопрос в памяти про разделение часов
// вождения/погрузки внутри одного заказа у водителя.
export function useEmployeePayEstimate(employeeId: string | undefined, rates: EmployeeRates | undefined, periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ['payroll-estimate', employeeId, periodStart, periodEnd],
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<{ estimate: EmployeePayEstimate; missingSchema: boolean }> => {
      const { data, error } = await db
        .from('order_crew')
        .select('employee_id, role, orders!inner(scheduled_start, scheduled_end, status)')
        .eq('employee_id', employeeId as string)
        .eq('orders.status', 'completed')
        .gte('orders.scheduled_start', periodStart)
        .lt('orders.scheduled_start', periodEnd);
      if (error) {
        if (/does not exist|Could not find/i.test(error.message)) {
          return { estimate: { hours: 0, pay: 0 }, missingSchema: true };
        }
        throw error;
      }
      const rows = (data as unknown as (PayPeriodRow & { orders: { scheduled_start: string; scheduled_end: string } })[]) ?? [];
      let hours = 0;
      let pay = 0;
      for (const row of rows) {
        const durationHours =
          (new Date(row.orders.scheduled_end).getTime() - new Date(row.orders.scheduled_start).getTime()) / 3_600_000;
        hours += durationHours;
        if (!rates) continue;
        const rate =
          rates.rate_mode === 'split'
            ? row.role === 'driver'
              ? rates.driving_hourly_rate
              : rates.loading_hourly_rate
            : rates.hourly_rate;
        pay += durationHours * (rate ?? 0);
      }
      return { estimate: { hours: Math.round(hours * 100) / 100, pay: Math.round(pay) }, missingSchema: false };
    },
  });
}

// Намеренно ОТДЕЛЬНАЯ мутация от useUpdateAccount (api/accounts.ts) — пока
// не пришла миграция с колонками ставок, ошибка «column does not exist»
// не должна ломать сохранение роли/прав/машины, идущее той же кнопкой
// «Сохранить». Вызывающая сторона (AccountModal) ловит missingSchema и
// показывает мягкое уведомление, не роняя всё сохранение.
export function useUpdateEmployeeRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, rates }: { id: string; rates: EmployeeRates }): Promise<{ missingSchema: boolean }> => {
      const { error } = await db.from('employees').update(rates).eq('id', id);
      if (error) {
        if (/does not exist|Could not find/i.test(error.message)) {
          return { missingSchema: true };
        }
        throw error;
      }
      return { missingSchema: false };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}
