import { StyleSheet, View } from 'react-native';
import { IconButton, SegmentedButtons, Text } from 'react-native-paper';
import type { ViewMode } from '../../hooks/useCalendarNav';
import { formatHeaderDate } from '../../utils/date';

export function CalendarToolbar({
  anchorDate,
  viewMode,
  onPrev,
  onNext,
  onToday,
  onSetViewMode,
}: {
  anchorDate: Date;
  viewMode: ViewMode;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSetViewMode: (mode: ViewMode) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.nav}>
        <IconButton icon="chevron-left" size={20} onPress={onPrev} accessibilityLabel="Назад" />
        <Text variant="titleSmall" style={styles.date} onPress={onToday}>
          {formatHeaderDate(anchorDate)}
        </Text>
        <IconButton icon="chevron-right" size={20} onPress={onNext} accessibilityLabel="Вперёд" />
      </View>
      <SegmentedButtons
        style={styles.modes}
        density="small"
        value={viewMode}
        onValueChange={(value) => onSetViewMode(value as ViewMode)}
        buttons={[
          { value: 'day', label: 'День' },
          { value: 'week', label: 'Неделя' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingRight: 12,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    textTransform: 'capitalize',
  },
  modes: {
    width: 180,
  },
});
