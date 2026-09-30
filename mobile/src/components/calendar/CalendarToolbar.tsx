import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Menu, Text } from 'react-native-paper';
import type { DaysMode } from '../../hooks/useCalendarNav';

const MODE_LABELS: Record<DaysMode, string> = { 1: '1 день', 3: '3 дня', 7: '7 дней' };

// Переключатель 1/3/7 дней — маленькая иконка с текущим числом вместо
// SegmentedButtons на всю ширину (Максим, 30.09, «Правки 3», п.5: «Меню
// переключения сетки... сделать раскрывающимся меню, под одной небольшой
// иконкой», как в референсе Bumpix).
export function CalendarToolbar({
  mode,
  onPrev,
  onNext,
  onSetMode,
  disablePrev,
}: {
  mode: DaysMode;
  onPrev: () => void;
  onNext: () => void;
  onSetMode: (mode: DaysMode) => void;
  disablePrev?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View style={styles.row}>
      <IconButton icon="chevron-left" size={22} onPress={onPrev} disabled={disablePrev} accessibilityLabel="Назад" />
      <Menu
        visible={menuOpen}
        onDismiss={() => setMenuOpen(false)}
        anchor={
          <Pressable onPress={() => setMenuOpen(true)} style={styles.modeButton} accessibilityLabel="Вид календаря">
            <Text variant="titleMedium">{mode}</Text>
            <IconButton icon="menu-down" size={18} style={styles.chevron} />
          </Pressable>
        }
      >
        {([1, 3, 7] as DaysMode[]).map((value) => (
          <Menu.Item
            key={value}
            title={MODE_LABELS[value]}
            onPress={() => {
              onSetMode(value);
              setMenuOpen(false);
            }}
          />
        ))}
      </Menu>
      <IconButton icon="chevron-right" size={22} onPress={onNext} accessibilityLabel="Вперёд" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
  },
  chevron: {
    margin: 0,
  },
});
