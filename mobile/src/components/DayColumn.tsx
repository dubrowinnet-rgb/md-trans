import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import type { OrderWithDetails } from '../api/orders';
import { OrderBlock } from './OrderBlock';
import {
  addMinutes,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  dayBounds,
  formatDayLabel,
  isSameDay,
  PIXELS_PER_MINUTE,
} from '../utils/date';

const SLOT_SNAP_MINUTES = 30;

export const HOURS = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR },
  (_, i) => CALENDAR_START_HOUR + i
);

export const GRID_HEIGHT = HOURS.length * 60 * PIXELS_PER_MINUTE;

export function HourAxis() {
  return (
    <View style={styles.axis}>
      <View style={styles.axisHeaderSpacer} />
      {HOURS.map((hour) => (
        <View key={hour} style={[styles.hourRow, { height: 60 * PIXELS_PER_MINUTE }]}>
          <Text style={styles.hourLabel}>{String(hour).padStart(2, '0')}:00</Text>
        </View>
      ))}
    </View>
  );
}

export function DayColumn({
  date,
  orders,
  width,
  onPressOrder,
  onPressSlot,
  isToday,
}: {
  date: Date;
  orders: OrderWithDetails[];
  width: number;
  onPressOrder: (order: OrderWithDetails) => void;
  onPressSlot?: (date: Date) => void;
  isToday: boolean;
}) {
  const dayOrders = orders.filter((o) => isSameDay(new Date(o.scheduled_start), date));

  const handlePressGrid = (event: GestureResponderEvent) => {
    if (!onPressSlot) return;
    const { locationY } = event.nativeEvent;
    const rawMinutes = locationY / PIXELS_PER_MINUTE;
    const snappedMinutes = Math.round(rawMinutes / SLOT_SNAP_MINUTES) * SLOT_SNAP_MINUTES;
    onPressSlot(addMinutes(dayBounds(date).start, snappedMinutes));
  };

  return (
    <View style={[styles.column, { width }]}>
      <View style={[styles.header, isToday && styles.headerToday]}>
        <Text style={[styles.headerText, isToday && styles.headerTextToday]}>
          {formatDayLabel(date)}
        </Text>
      </View>
      <Pressable style={{ height: GRID_HEIGHT }} onPress={handlePressGrid}>
        {HOURS.map((hour, i) => (
          <View key={hour} style={[styles.gridLine, { top: i * 60 * PIXELS_PER_MINUTE }]} />
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
  axisHeaderSpacer: {
    height: 36,
  },
  hourRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  hourLabel: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: -6,
  },
  column: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#e5e7eb',
  },
  header: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  headerToday: {
    backgroundColor: '#ede9fe',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'capitalize',
  },
  headerTextToday: {
    color: '#5b21b6',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f0f0f0',
  },
});
