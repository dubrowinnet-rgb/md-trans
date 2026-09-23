import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import type { OrderWithDetails } from '../../api/orders';
import { OrderBlock } from './OrderBlock';
import type { CalendarColumn } from './columns';
import {
  addMinutes,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  dayBounds,
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
  column,
  width,
  onPressOrder,
  onPressSlot,
}: {
  column: CalendarColumn;
  width: number;
  onPressOrder: (order: OrderWithDetails) => void;
  onPressSlot?: (date: Date, column: CalendarColumn) => void;
}) {
  const theme = useTheme();

  const handlePressGrid = (event: GestureResponderEvent) => {
    if (!onPressSlot) return;
    // В браузере (react-native-web) у клика нет locationY — берём offsetY DOM-события.
    const native = event.nativeEvent as typeof event.nativeEvent & { offsetY?: number };
    const y = Number.isFinite(native.locationY) ? native.locationY : native.offsetY;
    if (y == null || !Number.isFinite(y)) return;
    const rawMinutes = y / PIXELS_PER_MINUTE;
    const snappedMinutes = Math.floor(rawMinutes / SLOT_SNAP_MINUTES) * SLOT_SNAP_MINUTES;
    onPressSlot(addMinutes(dayBounds(column.date).start, snappedMinutes), column);
  };

  return (
    <View style={[styles.column, { width, borderLeftColor: theme.colors.outlineVariant }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: column.highlighted ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <Text
          variant="labelMedium"
          numberOfLines={1}
          style={[styles.headerText, column.highlighted && { color: theme.colors.primary }]}
        >
          {column.title}
        </Text>
        <Text variant="labelSmall" style={[styles.count, { color: theme.colors.outline }]}>
          {column.orders.length}
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
        {column.orders.map((order) => (
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: {
    textTransform: 'capitalize',
    flexShrink: 1,
  },
  count: {
    minWidth: 10,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
