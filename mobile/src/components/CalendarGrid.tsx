import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import type { OrderWithDetails } from '../api/orders';
import type { ViewMode } from '../hooks/useCalendarNav';
import { DayColumn, HourAxis, GRID_HEIGHT } from './DayColumn';
import { isSameDay } from '../utils/date';

export function CalendarGrid({
  days,
  orders,
  viewMode,
  columnWidth,
  isLoading,
  onPressOrder,
  onPressSlot,
}: {
  days: Date[];
  orders: OrderWithDetails[];
  viewMode: ViewMode;
  columnWidth: number;
  isLoading: boolean;
  onPressOrder: (order: OrderWithDetails) => void;
  onPressSlot?: (date: Date) => void;
}) {
  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.grid}>
      <View style={{ flexDirection: 'row', height: GRID_HEIGHT + 36 }}>
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
