import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { TimePickerModal } from 'react-native-paper-dates';
import { CompactField } from './CompactField';
import { formatTime } from '../../utils/date';

// Начало и окончание — два независимых тач-таргета в одной строке «Время»
// (внешний Pressable строки CompactField тут не задействован: onPress не
// передаём, чтобы не конкурировать с этими двумя).
export function TimeRangeRow({
  start,
  end,
  onChangeStart,
  onChangeEnd,
}: {
  start: Date;
  end: Date;
  onChangeStart: (date: Date) => void;
  onChangeEnd: (date: Date) => void;
}) {
  const [editing, setEditing] = useState<'start' | 'end' | null>(null);

  return (
    <>
      <CompactField label="Время" icon="clock-outline">
        <View style={styles.row}>
          <Text variant="bodyMedium" style={styles.word}>
            с
          </Text>
          <Pressable onPress={() => setEditing('start')} hitSlop={6}>
            <Text variant="bodyLarge" style={styles.value}>
              {formatTime(start)}
            </Text>
          </Pressable>
          <Text variant="bodyMedium" style={styles.word}>
            до
          </Text>
          <Pressable onPress={() => setEditing('end')} hitSlop={6}>
            <Text variant="bodyLarge" style={styles.value}>
              {formatTime(end)}
            </Text>
          </Pressable>
        </View>
      </CompactField>
      <TimePickerModal
        locale="ru"
        visible={editing === 'start'}
        hours={start.getHours()}
        minutes={start.getMinutes()}
        label="Начало"
        cancelLabel="Отмена"
        confirmLabel="Готово"
        onDismiss={() => setEditing(null)}
        onConfirm={({ hours, minutes }) => {
          setEditing(null);
          const next = new Date(start);
          next.setHours(hours, minutes, 0, 0);
          onChangeStart(next);
        }}
      />
      <TimePickerModal
        locale="ru"
        visible={editing === 'end'}
        hours={end.getHours()}
        minutes={end.getMinutes()}
        label="Окончание"
        cancelLabel="Отмена"
        confirmLabel="Готово"
        onDismiss={() => setEditing(null)}
        onConfirm={({ hours, minutes }) => {
          setEditing(null);
          const next = new Date(end);
          next.setHours(hours, minutes, 0, 0);
          onChangeEnd(next);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  word: {
    opacity: 0.6,
  },
  value: {
    color: '#5b21b6',
    fontWeight: '600',
  },
});
