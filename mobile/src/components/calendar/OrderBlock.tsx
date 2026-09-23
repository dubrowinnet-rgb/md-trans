import { StyleSheet } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';
import type { OrderWithDetails } from '../../api/orders';
import { ORDER_STATUS_COLORS } from '../../theme';
import { formatTime, minutesFromCalendarStart, PIXELS_PER_MINUTE } from '../../utils/date';

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
  const start = new Date(order.scheduled_start);
  const end = new Date(order.scheduled_end);
  const top = minutesFromCalendarStart(start) * PIXELS_PER_MINUTE;
  const durationMinutes = (end.getTime() - start.getTime()) / 60000;
  const height = Math.max(durationMinutes * PIXELS_PER_MINUTE, 34);
  const colors = ORDER_STATUS_COLORS[order.status] ?? ORDER_STATUS_COLORS.new;
  const pickup = primaryAddress(order, 'pickup');
  const confirmation = crewConfirmed(order);

  return (
    <TouchableRipple
      onPress={() => onPress(order)}
      borderless
      style={[
        styles.block,
        { top, height, backgroundColor: colors.bg, borderLeftColor: colors.border },
      ]}
    >
      <>
        <Text variant="labelSmall" style={styles.bold} numberOfLines={1}>
          {formatTime(start)}–{formatTime(end)}
        </Text>
        <Text variant="labelSmall" style={styles.bold} numberOfLines={1}>
          {order.clients?.name ?? 'Без клиента'}
        </Text>
        {pickup && (
          <Text variant="bodySmall" numberOfLines={1}>
            {pickup}
          </Text>
        )}
        {confirmation && (
          <Text variant="bodySmall" numberOfLines={1}>
            {confirmation}
          </Text>
        )}
      </>
    </TouchableRipple>
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
  bold: {
    fontWeight: '700',
  },
});
