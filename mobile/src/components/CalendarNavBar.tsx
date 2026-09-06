import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewMode } from '../hooks/useCalendarNav';
import { formatHeaderDate } from '../utils/date';

export function CalendarNavBar({
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
    <View style={styles.controls}>
      <View style={styles.nav}>
        <Pressable onPress={onPrev} hitSlop={8}>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>
        <Pressable onPress={onToday}>
          <Text style={styles.dateLabel}>{formatHeaderDate(anchorDate)}</Text>
        </Pressable>
        <Pressable onPress={onNext} hitSlop={8}>
          <Text style={styles.navArrow}>›</Text>
        </Pressable>
      </View>
      <View style={styles.modeSwitch}>
        {(['day', 'week'] as ViewMode[]).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => onSetViewMode(mode)}
            style={[styles.modeButton, viewMode === mode && styles.modeButtonActive]}
          >
            <Text style={[styles.modeText, viewMode === mode && styles.modeTextActive]}>
              {mode === 'day' ? 'День' : 'Неделя'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navArrow: {
    fontSize: 22,
    color: '#5b21b6',
    paddingHorizontal: 4,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 2,
  },
  modeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modeButtonActive: {
    backgroundColor: '#fff',
  },
  modeText: {
    fontSize: 12,
    color: '#6b7280',
  },
  modeTextActive: {
    color: '#111827',
    fontWeight: '600',
  },
});
