import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import type { OrderWithDetails } from '../../api/orders';
import type { ViewMode } from '../../hooks/useCalendarNav';
import { DayColumn, GRID_HEIGHT, HEADER_HEIGHT, HourAxis } from './DayColumn';
import { isSameDay } from '../../utils/date';

const AXIS_WIDTH = 48;
const WEEK_COLUMN_WIDTH = 130;

export function CalendarGrid({
  days,
  orders,
  viewMode,
  isLoading,
  onPressOrder,
  onPressSlot,
}: {
  days: Date[];
  orders: OrderWithDetails[];
  viewMode: ViewMode;
  isLoading: boolean;
  onPressOrder: (order: OrderWithDetails) => void;
  onPressSlot?: (date: Date) => void;
}) {
  const { width } = useWindowDimensions();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const columnWidth = viewMode === 'day' ? width - AXIS_WIDTH : WEEK_COLUMN_WIDTH;

  return (
    <ScrollView style={styles.grid}>
      <View style={{ flexDirection: 'row', height: GRID_HEIGHT + HEADER_HEIGHT }}>
        <HourAxis />
        <ScrollView horizontal={viewMode === 'week'} showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row' }}>
            {days.map((date) => (
              <DayColumn
                key={date.toISOString()}
                date={date}
                orders={orders}
                width={columnWidth}
                isToday={isSameDay(date, new Date())}
                onPressOrder={onPressOrder}
                onPressSlot={onPressSlot}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
