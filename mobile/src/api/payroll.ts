import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EmployeeRole, RateMode } from '../types/database';

export interface EmployeeRates {
  hourly_rate: number | null;
  driving_hourly_rate: number | null;
  loading_hourly_rate: number | null;
  rate_mode: RateMode;
}

// Ставки правит только администратор (RLS + триггер restrict_employee_self_role_change,
// миграция 0014) — мутация обособлена от useUpdateAccount (роль/права), как и на
// веб-кабинете (useUpdateEmployeeRates), чтобы ошибка в одной форме не задевала другую.
export function useUpdateEmployeeRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rates }: { id: string } & EmployeeRates) => {
      const { error } = await supabase.from('employees').update(rates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['current-employee'] });
      queryClient.invalidateQueries({ queryKey: ['pay-estimate'] });
    },
  });
}

export interface PayEstimateLine {
  orderId: string;
  scheduledStart: string;
  scheduledEnd: string;
  hours: number;
  roles: EmployeeRole[];
  rate: number;
  amount: number;
}

export interface PayEstimate {
  lines: PayEstimateLine[];
  totalHours: number;
  totalAmount: number;
}

// Дубль-роль (водитель, отмеченный на этом же заказе ещё и грузчиком) — по
// решению Максима (карточка решения, 2026-09-25) часы заказа считаются ОДИН
// раз, по большей из применимых ставок, а не по сумме обеих. В режиме
// 'combined' ставка одна на обе роли, но группировка по order_id всё равно
// нужна — иначе часы задвоятся, даже если сама ставка не отличается.
function rateForOrder(rates: EmployeeRates, roles: Set<EmployeeRole>): number {
  if (rates.rate_mode === 'combined') return rates.hourly_rate ?? 0;
  const candidates: number[] = [];
  if (roles.has('driver')) candidates.push(rates.driving_hourly_rate ?? 0);
  if (roles.has('loader')) candidates.push(rates.loading_hourly_rate ?? 0);
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

// Сборный груз: водитель может вести несколько заказов с пересекающимся
// временем (в отличие от грузчика — см. check_employee_availability,
// миграция 0007). По решению Максима (карточка решения, 2026-09-28) общее
// пересекающееся время оплачивается ОДИН раз — тем же правилом «одно время —
// одна оплата», что и для дубль-роли на одном заказе выше, только теперь
// между разными заказами: два заказа 10:00–14:00 дают 4 часа, а не 8. Если
// ставки на пересекающихся заказах различаются (режим 'split', на одном
// заказе он ещё и грузчик), за пересечение платится по большей.
//
// Считаем разверткой границ интервалов, а не суммой строк: между каждыми
// двумя соседними границами берём час(ы) сегмента один раз, по максимальной
// ставке среди заказов, которые в этот сегмент идут.
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

interface CrewOrderRow {
  order_id: string;
  role: EmployeeRole;
  orders: { id: string; scheduled_start: string; scheduled_end: string } | null;
}

// Калькуляция «часы × ставка» за период по завершённым заказам — для
// собственного просмотра сотрудником (раздел «Зарплата и отчёты водителей»).
// Период задаётся полуоткрытым интервалом [periodStart, periodEnd) по
// scheduled_start, как и остальные выборки по заказам в проекте.
export function useEmployeePayEstimate(employeeId: string | undefined, rates: EmployeeRates, periodStart: Date, periodEnd: Date) {
  const startIso = periodStart.toISOString();
  const endIso = periodEnd.toISOString();
  return useQuery({
    queryKey: [
      'pay-estimate',
      employeeId,
      startIso,
      endIso,
      rates.rate_mode,
      rates.hourly_rate,
      rates.driving_hourly_rate,
      rates.loading_hourly_rate,
    ],
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<PayEstimate> => {
      // «Выполненный» заказ — неотменённый и уже прошедший (ревью, задача 2;
      // раньше фильтр был orders.status = 'completed', который приложение
      // больше не проставляет, отчего оценка всегда выходила нулевой). См.
      // lib/orderCompletion.ts — то же правило в статистике и истории клиента.
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('order_crew')
        .select('order_id, role, orders!inner(id, scheduled_start, scheduled_end)')
        .eq('employee_id', employeeId as string)
        .neq('orders.status', 'cancelled')
        .lte('orders.scheduled_end', nowIso)
        .gte('orders.scheduled_start', startIso)
        .lt('orders.scheduled_start', endIso);
      if (error) throw error;

      const byOrder = new Map<string, { start: string; end: string; roles: Set<EmployeeRole> }>();
      for (const row of (data ?? []) as unknown as CrewOrderRow[]) {
        if (!row.orders) continue;
        const existing = byOrder.get(row.order_id);
        if (existing) {
          existing.roles.add(row.role);
        } else {
          byOrder.set(row.order_id, { start: row.orders.scheduled_start, end: row.orders.scheduled_end, roles: new Set([row.role]) });
        }
      }

      const entries = [...byOrder.entries()].map(([orderId, o]) => {
        const rate = rateForOrder(rates, o.roles);
        const startMs = new Date(o.start).getTime();
        const endMs = new Date(o.end).getTime();
        return { orderId, start: o.start, end: o.end, startMs, endMs, roles: o.roles, rate };
      });

      // Строки списка — по-прежнему по каждому заказу отдельно (для
      // прозрачности: видно, за что именно начислено); а итог — сведением
      // пересекающихся интервалов (unionPay), чтобы не задвоить время
      // сборного груза. На несовпадающих по времени заказах итог совпадает
      // с суммой строк, как и раньше.
      const lines: PayEstimateLine[] = entries
        .map((e) => ({
          orderId: e.orderId,
          scheduledStart: e.start,
          scheduledEnd: e.end,
          hours: (e.endMs - e.startMs) / 3_600_000,
          roles: [...e.roles],
          rate: e.rate,
          amount: ((e.endMs - e.startMs) / 3_600_000) * e.rate,
        }))
        .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));

      const { hours: totalHours, amount: totalAmount } = unionPay(
        entries.map((e) => ({ start: e.startMs, end: e.endMs, rate: e.rate }))
      );

      return { lines, totalHours, totalAmount };
    },
  });
}
