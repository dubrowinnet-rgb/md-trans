import { Pressable, StyleSheet, Text } from 'react-native';
import type { OrderWithDetails } from '../api/orders';
import { formatTime, minutesFromCalendarStart, PIXELS_PER_MINUTE } from '../utils/date';

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  new: { bg: '#e5e7eb', border: '#9ca3af' },
  confirmed: { bg: '#dbeafe', border: '#3b82f6' },
  in_progress: { bg: '#fef3c7', border: '#f59e0b' },
  completed: { bg: '#dcfce7', border: '#22c55e' },
  cancelled: { bg: '#fee2e2', border: '#ef4444' },
};

function primaryAddress(order: OrderWithDetails, type: 'pickup' | 'dropoff') {
  return order.order_stops.find((s) => s.is_primary && s.type === type)?.address;
}

function crewConfirmed(order: OrderWithDetails) {
  if (order.order_crew.length === 0) return null;
  const confirmed = order.order_crew.filter((c) => c.status === 'confirmed').length;
  return `${confirmed}/${order.order_crew.length} приняли`;
}

export function OrderBlock({
  order,
  onPress,
}: {
  order: OrderWithDetails;
  onPress: (order: OrderWithDetails) => void;
}) {
  const top = minutesFromCalendarStart(new Date(order.scheduled_start)) * PIXELS_PER_MINUTE;
  const durationMinutes =
    (new Date(order.scheduled_end).getTime() - new Date(order.scheduled_start).getTime()) / 60000;
  const height = Math.max(durationMinutes * PIXELS_PER_MINUTE, 34);
  const colors = STATUS_COLORS[order.status] ?? STATUS_COLORS.new;
  const pickup = primaryAddress(order, 'pickup');
  const confirmation = crewConfirmed(order);

  return (
    <Pressable
      onPress={() => onPress(order)}
      style={[
        styles.block,
        { top, height, backgroundColor: colors.bg, borderLeftColor: colors.border },
      ]}
    >
      <Text style={styles.time} numberOfLines={1}>
        {formatTime(new Date(order.scheduled_start))}–{formatTime(new Date(order.scheduled_end))}
      </Text>
      <Text style={styles.client} numberOfLines={1}>
        {order.clients?.name ?? 'Без клиента'}
      </Text>
      {pickup && (
        <Text style={styles.address} numberOfLines={1}>
          {pickup}
        </Text>
      )}
      {confirmation && (
        <Text style={styles.confirmation} numberOfLines={1}>
          {confirmation}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderLeftWidth: 3,
    borderRadius: 6,
    padding: 4,
    overflow: 'hidden',
  },
  time: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1f2937',
  },
  client: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1f2937',
  },
  address: {
    fontSize: 10,
    color: '#4b5563',
  },
  confirmation: {
    fontSize: 10,
    color: '#4b5563',
    marginTop: 1,
  },
});
