import type { Employee } from '../api/employees';
import { effectiveScheduleStatus, formatTimeShort, isWorkingAt, type ScheduleDay } from '../api/schedule';

// Доступность исполнителя на выбранное время (раздел «рабочий график»):
// сперва выходной/не по графику (красная точка), потом другой заказ
// (жёлтая), иначе свободен (зелёная) — этот же порядок используется для
// сортировки списка. Общее для формы нового заказа и правки экипажа уже
// созданного (components/orders/CrewDialog.tsx), чтобы не разойтись.
export type AvailabilityTier = 'available' | 'busy' | 'dayoff';

export const TIER_ORDER: Record<AvailabilityTier, number> = { available: 0, busy: 1, dayoff: 2 };
export const TIER_COLOR: Record<AvailabilityTier, string> = {
  available: '#22c55e',
  busy: '#f59e0b',
  dayoff: '#ef4444',
};

export function evaluateAvailability(
  employee: Employee,
  busyIds: Set<string>,
  scheduleOn: Map<string, ScheduleDay>,
  orderStart: Date,
  orderEnd: Date
): { tier: AvailabilityTier; suffix: string } {
  const row = scheduleOn.get(employee.id);
  const status = effectiveScheduleStatus(employee.schedule_mode, row);
  if (status === 'off') return { tier: 'dayoff', suffix: ' · выходной' };
  if (row?.start_time && row?.end_time && !isWorkingAt(employee.schedule_mode, row, orderStart, orderEnd)) {
    return { tier: 'dayoff', suffix: ` · работает ${formatTimeShort(row.start_time)}–${formatTimeShort(row.end_time)}` };
  }
  if (busyIds.has(employee.id)) return { tier: 'busy', suffix: ' · другой заказ' };
  return { tier: 'available', suffix: '' };
}

export function sortByAvailability<T extends { id: string }>(
  list: T[],
  availability: Map<string, { tier: AvailabilityTier }>
) {
  return [...list].sort(
    (a, b) => TIER_ORDER[availability.get(a.id)?.tier ?? 'available'] - TIER_ORDER[availability.get(b.id)?.tier ?? 'available']
  );
}
