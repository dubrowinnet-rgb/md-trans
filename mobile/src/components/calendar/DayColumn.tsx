import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { OrderWithDetails } from '../../api/orders';
import { OrderBlock } from './OrderBlock';
import {
  addMinutes,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  dayBounds,
  formatDayLabel,
  isSameDay,
  PIXELS_PER_MINUTE,
} from '../../utils/date';

const SLOT_SNAP_MINUTES = 30;
export const HEADER_HEIGHT = 36;
const HOUR_HEIGHT = 60 * PIXELS_PER_MINUTE;

export const HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
  (_, i) => CALENDAR_START_HOUR + i
);

export const GRID_HEIGHT = HOURS.length * HOUR_HEIGHT;

export function HourAxis() {
  const theme = useTheme();
  return (
    <View style={styles.axis}>
      <View style={{ height: HEADER_HEIGHT }} />
      {HOURS.map((hour) => (
        <View
          key={hour}
          style={[styles.hourRow, { height: HOUR_HEIGHT, borderTopColor: theme.colors.outlineVariant }]}
        >
          <Text variant="labelSmall" style={[styles.hourLabel, { color: theme.colors.outline }]}>
            {String(hour).padStart(2, '0')}:00
          </Text>
        </View>
      ))}
    </View>
  );
}

export function DayColumn({
  date,
  orders,
  width,
  isToday,
  onPressOrder,
  onPressSlot,
}: {
  date: Date;
  orders: OrderWithDetails[];
  width: number;
  isToday: boolean;
  onPressOrder: (order: OrderWithDetails) => void;
  onPressSlot?: (date: Date) => void;
}) {
  const theme = useTheme();
  const dayOrders = orders.filter((o) => isSameDay(new Date(o.scheduled_start), date));

  const handlePressGrid = (event: GestureResponderEvent) => {
    if (!onPressSlot) return;
    const rawMinutes = event.nativeEvent.locationY / PIXELS_PER_MINUTE;
    const snappedMinutes = Math.floor(rawMinutes / SLOT_SNAP_MINUTES) * SLOT_SNAP_MINUTES;
    onPressSlot(addMinutes(dayBounds(date).start, snappedMinutes));
  };

  return (
    <View style={[styles.column, { width, borderLeftColor: theme.colors.outlineVariant }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: isToday ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <Text
          variant="labelMedium"
          style={[styles.headerText, isToday && { color: theme.colors.primary }]}
        >
          {formatDayLabel(date)}
        </Text>
      </View>
      <Pressable style={{ height: GRID_HEIGHT }} onPress={handlePressGrid}>
        {HOURS.map((hour, i) => (
          <View
            key={hour}
            style={[
              styles.gridLine,
              { top: i * HOUR_HEIGHT, borderTopColor: theme.colors.surfaceVariant },
            ]}
          />
        ))}
        {dayOrders.map((order) => (
          <OrderBlock key={order.id} order={order} onPress={onPressOrder} />
        ))}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: {
    width: 48,
  },
  hourRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hourLabel: {
    marginTop: -7,
  },
  column: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  header: {
    height: HEADER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    textTransform: 'capitalize',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
