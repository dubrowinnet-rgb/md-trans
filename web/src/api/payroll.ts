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

// Ставка за один заказ по режиму: combined — hourly_rate на всё время;
// split — по роли назначения (driving_hourly_rate для role='driver',
// loading_hourly_rate для role='loader'). Когда у сотрудника на одном заказе
// две роли (и водитель, и грузчик) — это две строки order_crew с одним
// order_id, и заказ оплачивается один раз по большей из двух ставок
// (решение Максима, мобильный тред 2026-09-25).
function rateForOrder(rates: EmployeeRates | undefined, roles: Set<'driver' | 'loader'>): number {
  if (!rates) return 0;
  if (rates.rate_mode !== 'split') return rates.hourly_rate ?? 0;
  return roles.has('driver') && roles.has('loader')
    ? Math.max(rates.driving_hourly_rate ?? 0, rates.loading_hourly_rate ?? 0)
    : ((roles.has('driver') ? rates.driving_hourly_rate : rates.loading_hourly_rate) ?? 0);
}

// Сборный груз: водитель может вести несколько заказов с пересекающимся
// временем (грузчик — нет, см. check_employee_availability, миграция 0007).
// По решению Максима (карточка в мобильном треде, 2026-09-28) общее время
// оплачивается ОДИН раз — то же правило «одно время — одна оплата», что и для
// двух ролей на одном заказе, только между разными заказами: два заказа
// 10:00–14:00 дают 4 часа, а не 8; за пересечение — по большей из ставок.
// Считаем разверткой границ интервалов: каждый отрезок между соседними
// границами — один раз, по максимальной ставке среди заказов, которые его
// покрывают. Один в один с mobile/src/api/payroll.ts (f185b92), чтобы
// «Моя зарплата» в телефоне и оценка в карточке сотрудника совпадали.
function unionPay(orders: { start: number; end: number; rate: number }[]): { hours: number; amount: number } {
  if (orders.length === 0) return { hours: 0, amount: 0 };
  const bounds = [...new Set(orders.flatMap((o) => [o.start, o.end]))].sort((a, b) => a - b);
  let hours = 0;
  let amount = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const segStart = bounds[i];
    const segEnd = bounds[i + 1];
    const activeRates = orders.filter((o) => o.start <= segStart && o.end >= segEnd).map((o) => o.rate);
    if (activeRates.length === 0) continue;
    const segHours = (segEnd - segStart) / 3_600_000;
    hours += segHours;
    amount += segHours * Math.max(...activeRates);
  }
  return { hours, amount };
}

// Предварительный расчёт зарплаты за период по завершённым заказам, где
// сотрудник в экипаже (order_crew): не отменён и уже закончился
// (lib/orderCompletion.ts, как в мобильном). Строки группируются по
// order_id (дубль-роль — см. rateForOrder), а итог сводится через unionPay,
// чтобы пересекающиеся заказы сборного груза не задваивали время.
export function useEmployeePayEstimate(employeeId: string | undefined, rates: EmployeeRates | undefined, periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ['payroll-estimate', employeeId, periodStart, periodEnd],
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<{ estimate: EmployeePayEstimate }> => {
      const { data, error } = await supabase
        .from('order_crew')
        .select('order_id, employee_id, role, orders!inner(scheduled_start, scheduled_end, status)')
        .eq('employee_id', employeeId as string)
        .neq('orders.status', 'cancelled')
        .lte('orders.scheduled_end', new Date().toISOString())
        .gte('orders.scheduled_start', periodStart)
        .lt('orders.scheduled_start', periodEnd);
      if (error) throw error;
      const rows = (data as unknown as (PayPeriodRow & { orders: { scheduled_start: string; scheduled_end: string } })[]) ?? [];
      const byOrder = new Map<string, { start: number; end: number; roles: Set<'driver' | 'loader'> }>();
      for (const row of rows) {
        const entry = byOrder.get(row.order_id) ?? {
          start: new Date(row.orders.scheduled_start).getTime(),
          end: new Date(row.orders.scheduled_end).getTime(),
          roles: new Set(),
        };
        entry.roles.add(row.role);
        byOrder.set(row.order_id, entry);
      }
      const { hours, amount } = unionPay(
        [...byOrder.values()].map((o) => ({ start: o.start, end: o.end, rate: rateForOrder(rates, o.roles) }))
      );
      return { estimate: { hours: Math.round(hours * 100) / 100, pay: Math.round(amount) } };
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
