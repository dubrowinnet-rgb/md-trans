import { Pressable, StyleSheet, Text } from 'react-native';
import type { OrderWithDetails } from '../../api/orders';
import { formatTime, minutesFromDayStart, PIXELS_PER_MINUTE, GRID_HEIGHT } from '../../utils/date';
import { orderColor } from './orderLayout';

function crewConfirmed(order: OrderWithDetails) {
  if (order.order_crew.length === 0) return null;
  const confirmed = order.order_crew.filter((c) => c.status === 'confirmed').length;
  return `${confirmed}/${order.order_crew.length} приняли`;
}

// Карточка заказа в сетке, как в Bumpix: «время, клиент, услуга» белым
// текстом на цвете услуги, плюс адрес откуда/куда и груз отдельными
// строками (раздел «баги 3», п.2) — видно, только если блок достаточно
// высокий (короткие заказы просто обрезаются по высоте, как раньше).
export function OrderBlock({
  order,
  lane,
  lanes,
  columnWidth,
  now,
  compact,
  onPress,
}: {
  order: OrderWithDetails;
  lane: number;
  lanes: number;
  columnWidth: number;
  now: Date;
  compact: boolean;
  onPress: (order: OrderWithDetails) => void;
}) {
  const start = new Date(order.scheduled_start);
  const end = new Date(order.scheduled_end);
  const top = minutesFromDayStart(start) * PIXELS_PER_MINUTE;
  const durationMinutes = (end.getTime() - start.getTime()) / 60000;
  const height = Math.min(Math.max(durationMinutes * PIXELS_PER_MINUTE, 22), GRID_HEIGHT - top);
  const laneWidth = columnWidth / lanes;
  const pickup = order.order_stops.find((s) => s.is_primary && s.type === 'pickup')?.address;
  const dropoff = order.order_stops.find((s) => s.is_primary && s.type === 'dropoff')?.address;
  const route = [pickup, dropoff].filter(Boolean).join(' → ');
  const service = order.order_services[0]?.services?.name;
  const confirmation = crewConfirmed(order);
  const cancelled = order.status === 'cancelled';

  return (
    <Pressable
      onPress={() => onPress(order)}
      style={[
        styles.block,
        {
          top,
          height,
          left: lane * laneWidth + 1,
          width: laneWidth - 2,
          backgroundColor: orderColor(order, now),
        },
      ]}
    >
      {cancelled && (
        <Text style={[styles.text, compact && styles.compact, styles.cancelledLabel]}>заказ отменен</Text>
      )}
      <Text style={[styles.text, compact && styles.compact, cancelled && styles.strikethrough]}>
        {formatTime(start)} - {formatTime(end)},{' '}
        <Text style={styles.bold}>{order.clients?.name ?? 'Без клиента'}</Text>
        {service ? `, ${service}` : ''}
      </Text>
      {route.length > 0 && (
        <Text style={[styles.text, compact && styles.compact, styles.detail, cancelled && styles.strikethrough]}>
          {route}
        </Text>
      )}
      {order.cargo_description && !compact && (
        <Text style={[styles.text, styles.detail, cancelled && styles.strikethrough]}>{`Груз: ${order.cargo_description}`}</Text>
      )}
      {confirmation && !compact && <Text style={[styles.text, styles.confirmation]}>{confirmation}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    borderRadius: 2,
    paddingHorizontal: 3,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  text: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
  },
  compact: {
    fontSize: 9,
    lineHeight: 11,
  },
  bold: {
    fontWeight: '700',
  },
  cancelledLabel: {
    fontWeight: '700',
    color: '#f87171',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  detail: {
    marginTop: 1,
    opacity: 0.9,
  },
  confirmation: {
    marginTop: 2,
    opacity: 0.9,
  },
});
