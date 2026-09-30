import { memo } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Text } from 'react-native-paper';
import type { CalendarOrder } from '../../api/orders';
import type { WorkingHours } from '../../api/companySettings';
import { OrderBlock } from './OrderBlock';
import { layoutDayOrders } from './orderLayout';
import { addMinutes, formatShortMonth, formatWeekday, isSameDay, minutesFromDayStart, startOfDay } from '../../utils/date';

export const HEADER_HEIGHT = 52;
export const AXIS_WIDTH = 44;
const SLOT_SNAP_MINUTES = 30;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Цвета сетки и шапки дней из референса (Bumpix).
export const GRID_COLORS = {
  line: '#DDDDDD',
  // Часовые линии в теле дня чуть темнее и не hairline — на реальном
  // iPhone бледный hairlineWidth почти не виден, сетка выглядела как
  // пустые белые полосы без часов (доработки 3, п.7).
  hourLine: '#C7C7C7',
  past: '#E6E6E6',
  nowLine: '#E53935',
  todayHeader: '#3F9A1C',
  futureHeader: '#F1F8E9',
  futureHeaderText: '#3F9A1C',
  pastHeader: '#FAFAFA',
  pastHeaderText: '#616161',
};

function dayKind(date: Date, now: Date) {
  if (isSameDay(date, now)) return 'today';
  return date < startOfDay(now) ? 'past' : 'future';
}

export const HourAxis = memo(function HourAxis({
  now,
  pixelsPerMinute,
  hourHeight,
  gridHeight,
}: {
  now: Date;
  pixelsPerMinute: number;
  hourHeight: number;
  gridHeight: number;
}) {
  const nowY = minutesFromDayStart(now) * pixelsPerMinute;
  return (
    <View style={[styles.axis, { height: gridHeight }]}>
      {HOURS.map((hour) => (
        <View key={hour} style={[styles.hourRow, { height: hourHeight }]}>
          <Text style={styles.hourLabel}>{String(hour).padStart(2, '0')}:00</Text>
        </View>
      ))}
      <View style={[styles.axisNowDot, { top: nowY - 3 }]} />
    </View>
  );
});

export const DayHeader = memo(function DayHeader({
  date,
  count,
  width,
  now,
}: {
  date: Date;
  count: number;
  width: number;
  now: Date;
}) {
  const kind = dayKind(date, now);
  const bg =
    kind === 'today' ? GRID_COLORS.todayHeader : kind === 'past' ? GRID_COLORS.pastHeader : GRID_COLORS.futureHeader;
  const color =
    kind === 'today' ? '#ffffff' : kind === 'past' ? GRID_COLORS.pastHeaderText : GRID_COLORS.futureHeaderText;
  const narrow = width < 70;
  return (
    <View style={[styles.header, { width, backgroundColor: bg }]}>
      <View style={styles.headerTop}>
        <Text style={[styles.headerSmall, { color }]} numberOfLines={1}>
          {formatShortMonth(date)}
        </Text>
        <Text style={[styles.headerSmall, { color }]}>{count}</Text>
      </View>
      <Text style={[styles.headerDay, narrow && styles.headerDayNarrow, { color }]}>{date.getDate()}</Text>
      <Text style={[styles.headerWeekday, { color }]}>{formatWeekday(date).toUpperCase()}</Text>
    </View>
  );
});

export const DayBody = memo(function DayBody({
  date,
  orders,
  width,
  now,
  compact,
  workingHours,
  pixelsPerMinute,
  hourHeight,
  gridHeight,
  onPressOrder,
  onPressSlot,
}: {
  date: Date;
  orders: CalendarOrder[];
  width: number;
  now: Date;
  compact: boolean;
  workingHours: WorkingHours;
  pixelsPerMinute: number;
  hourHeight: number;
  gridHeight: number;
  onPressOrder: (order: CalendarOrder) => void;
  onPressSlot?: (date: Date) => void;
}) {
  const kind = dayKind(date, now);
  const nowY = minutesFromDayStart(now) * pixelsPerMinute;
  const workStartY = workingHours.startMinutes * pixelsPerMinute;
  const workEndY = workingHours.endMinutes * pixelsPerMinute;

  const handlePress = (event: GestureResponderEvent) => {
    if (!onPressSlot) return;
    // В браузере (react-native-web) у клика нет locationY — берём offsetY DOM-события.
    const native = event.nativeEvent as typeof event.nativeEvent & { offsetY?: number };
    const y = Number.isFinite(native.locationY) ? native.locationY : native.offsetY;
    if (y == null || !Number.isFinite(y)) return;
    const minutes = Math.floor(y / pixelsPerMinute / SLOT_SNAP_MINUTES) * SLOT_SNAP_MINUTES;
    onPressSlot(addMinutes(startOfDay(date), minutes));
  };

  return (
    <Pressable style={[styles.body, { width, height: gridHeight }]} onPress={handlePress}>
      {kind === 'past' ? (
        // Весь прошедший день уже серый целиком — рабочие часы этого дня
        // отдельно красить незачем, разница не видна.
        <View style={[styles.pastShade, { height: gridHeight }]} />
      ) : (
        <>
          {workStartY > 0 && <View style={[styles.pastShade, { top: 0, height: workStartY }]} />}
          {workEndY < gridHeight && (
            <View style={[styles.pastShade, { top: workEndY, height: gridHeight - workEndY }]} />
          )}
          {kind === 'today' && nowY > workStartY && (
            <View
              style={[
                styles.pastShade,
                { top: workStartY, height: Math.min(nowY, workEndY) - workStartY },
              ]}
            />
          )}
        </>
      )}
      {HOURS.map((hour) => (
        <View key={hour} style={[styles.gridLine, { top: hour * hourHeight }]} />
      ))}
      {layoutDayOrders(orders).map(({ order, lane, lanes }) => (
        <OrderBlock
          key={order.id}
          order={order}
          lane={lane}
          lanes={lanes}
          columnWidth={width}
          now={now}
          compact={compact}
          pixelsPerMinute={pixelsPerMinute}
          gridHeight={gridHeight}
          onPress={onPressOrder}
        />
      ))}
      {kind === 'today' && <View style={[styles.nowLine, { top: nowY }]} />}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  axis: {
    width: AXIS_WIDTH,
    backgroundColor: '#ffffff',
  },
  hourRow: {
    borderTopWidth: 1,
    borderTopColor: GRID_COLORS.hourLine,
  },
  hourLabel: {
    fontSize: 11,
    color: '#333333',
    marginTop: 2,
    marginLeft: 4,
  },
  axisNowDot: {
    position: 'absolute',
    left: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: GRID_COLORS.nowLine,
  },
  header: {
    height: HEADER_HEIGHT,
    paddingHorizontal: 3,
    paddingTop: 2,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: GRID_COLORS.line,
    alignItems: 'center',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  headerSmall: {
    fontSize: 9,
  },
  headerDay: {
    fontSize: 18,
    lineHeight: 22,
  },
  headerDayNarrow: {
    fontSize: 16,
  },
  headerWeekday: {
    fontSize: 10,
  },
  body: {
    backgroundColor: '#ffffff',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: GRID_COLORS.line,
  },
  pastShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: GRID_COLORS.past,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: GRID_COLORS.hourLine,
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: GRID_COLORS.nowLine,
  },
});
