import { StyleSheet, View } from 'react-native';
import { IconButton, SegmentedButtons } from 'react-native-paper';
import type { DaysMode } from '../../hooks/useCalendarNav';

export function CalendarToolbar({
  mode,
  onPrev,
  onNext,
  onSetMode,
}: {
  mode: DaysMode;
  onPrev: () => void;
  onNext: () => void;
  onSetMode: (mode: DaysMode) => void;
}) {
  return (
    <View style={styles.row}>
      <IconButton icon="chevron-left" size={22} onPress={onPrev} accessibilityLabel="Назад" />
      <SegmentedButtons
        style={styles.modes}
        density="small"
        value={String(mode)}
        onValueChange={(value) => onSetMode(Number(value) as DaysMode)}
        buttons={[
          { value: '1', label: '1 день' },
          { value: '3', label: '3 дня' },
          { value: '7', label: '7 дней' },
        ]}
      />
      <IconButton icon="chevron-right" size={22} onPress={onNext} accessibilityLabel="Вперёд" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modes: {
    flex: 1,
  },
});
