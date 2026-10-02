// Доступность исполнителя на время заказа — как в мобильной форме
// (mobile/src/app/order/new.tsx): выходной (красная точка), другой заказ
// (жёлтая), иначе свободен (зелёная). В этом же порядке сортируем список.
import { effectiveScheduleStatus, formatTimeShort, isWorkingAt, type ScheduleDay } from '@/api/schedule';
import type { ScheduleMode } from '@/types/database';

export type AvailabilityTier = 'available' | 'busy' | 'dayoff';

const TIER_ORDER: Record<AvailabilityTier, number> = { available: 0, busy: 1, dayoff: 2 };
export const TIER_COLOR: Record<AvailabilityTier, string> = {
  available: '#22c55e',
  busy: '#f59e0b',
  dayoff: '#ef4444',
};
export interface Availability {
  tier: AvailabilityTier;
  suffix: string;
}

// Выходной по графику (с учётом режима сотрудника) или заказ вне его часов
// работы — красная точка; занят другим заказом — жёлтая.
export function evaluateAvailability(
  employee: { id: string; schedule_mode: ScheduleMode },
  busyIds: Set<string>,
  scheduleOn: Map<string, ScheduleDay>,
  start: Date,
  end: Date
): Availability {
  const row = scheduleOn.get(employee.id);
  if (effectiveScheduleStatus(employee.schedule_mode, row) === 'off') return { tier: 'dayoff', suffix: ' · выходной' };
  if (row?.start_time && row?.end_time && !isWorkingAt(employee.schedule_mode, row, start, end)) {
    return {
      tier: 'dayoff',
      suffix: ` · работает ${formatTimeShort(row.start_time)}–${formatTimeShort(row.end_time)}`,
    };
  }
  if (busyIds.has(employee.id)) return { tier: 'busy', suffix: ' · другой заказ' };
  return { tier: 'available', suffix: '' };
}

export function sortByAvailability<T extends { id: string }>(list: T[], availability: Map<string, Availability>) {
  return [...list].sort(
    (a, b) =>
      TIER_ORDER[availability.get(a.id)?.tier ?? 'available'] - TIER_ORDER[availability.get(b.id)?.tier ?? 'available']
  );
}

export function AvailabilityDot({ tier }: { tier: AvailabilityTier }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: 5,
        background: TIER_COLOR[tier],
        flexShrink: 0,
      }}
    />
  );
}
