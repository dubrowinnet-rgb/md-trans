import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import type { OrderWithDetails } from '../../api/orders';
import { DayColumn, GRID_HEIGHT, HEADER_HEIGHT, HourAxis } from './DayColumn';
import type { CalendarColumn } from './columns';

const AXIS_WIDTH = 48;
const MIN_COLUMN_WIDTH = 120;

export function CalendarGrid({
  columns,
  isLoading,
  onPressOrder,
  onPressSlot,
}: {
  columns: CalendarColumn[];
  isLoading: boolean;
  onPressOrder: (order: OrderWithDetails) => void;
  onPressSlot?: (date: Date, column: CalendarColumn) => void;
}) {
  const { width } = useWindowDimensions();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  // Колонки делят ширину экрана, но не уже MIN_COLUMN_WIDTH — дальше горизонтальная прокрутка.
  const available = width - AXIS_WIDTH;
  const columnWidth = Math.max(available / Math.max(columns.length, 1), MIN_COLUMN_WIDTH);

  return (
    <ScrollView style={styles.grid}>
      <View style={{ flexDirection: 'row', height: GRID_HEIGHT + HEADER_HEIGHT }}>
        <HourAxis />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row' }}>
            {columns.map((column) => (
              <DayColumn
                key={column.key}
                column={column}
                width={columnWidth}
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
