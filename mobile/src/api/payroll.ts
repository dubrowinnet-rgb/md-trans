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
      const { data, error } = await supabase
        .from('order_crew')
        .select('order_id, role, orders!inner(id, scheduled_start, scheduled_end)')
        .eq('employee_id', employeeId as string)
        .eq('orders.status', 'completed')
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

      const lines: PayEstimateLine[] = [...byOrder.entries()]
        .map(([orderId, o]) => {
          const hours = (new Date(o.end).getTime() - new Date(o.start).getTime()) / 3_600_000;
          const rate = rateForOrder(rates, o.roles);
          return {
            orderId,
            scheduledStart: o.start,
            scheduledEnd: o.end,
            hours,
            roles: [...o.roles],
            rate,
            amount: hours * rate,
          };
        })
        .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));

      return {
        lines,
        totalHours: lines.reduce((sum, l) => sum + l.hours, 0),
        totalAmount: lines.reduce((sum, l) => sum + l.amount, 0),
      };
    },
  });
}
