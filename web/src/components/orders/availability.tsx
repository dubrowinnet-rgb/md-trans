// Доступность исполнителя на время заказа — как в мобильной форме
// (mobile/src/app/order/new.tsx): выходной (красная точка), другой заказ
// (жёлтая), иначе свободен (зелёная). В этом же порядке сортируем список.
export type AvailabilityTier = 'available' | 'busy' | 'dayoff';

const TIER_ORDER: Record<AvailabilityTier, number> = { available: 0, busy: 1, dayoff: 2 };
export const TIER_COLOR: Record<AvailabilityTier, string> = {
  available: '#22c55e',
  busy: '#f59e0b',
  dayoff: '#ef4444',
};
export const TIER_SUFFIX: Record<AvailabilityTier, string> = {
  available: '',
  busy: ' · другой заказ',
  dayoff: ' · выходной',
};

export function availabilityTier(id: string, busyIds: Set<string>, dayOffIds: Set<string>): AvailabilityTier {
  if (dayOffIds.has(id)) return 'dayoff';
  if (busyIds.has(id)) return 'busy';
  return 'available';
}

export function sortByAvailability<T extends { id: string }>(list: T[], busyIds: Set<string>, dayOffIds: Set<string>) {
  return [...list].sort(
    (a, b) =>
      TIER_ORDER[availabilityTier(a.id, busyIds, dayOffIds)] - TIER_ORDER[availabilityTier(b.id, busyIds, dayOffIds)]
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
