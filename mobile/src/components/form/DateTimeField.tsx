import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { DatePickerModal, TimePickerModal } from 'react-native-paper-dates';
import { format } from 'date-fns';

export function DateTimeField({
  label,
  value,
  mode,
  onChange,
}: {
  label: string;
  value: Date;
  mode: 'date' | 'time';
  onChange: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const display = mode === 'date' ? format(value, 'dd.MM.yyyy') : format(value, 'HH:mm');

  return (
    <View style={styles.field}>
      <Text variant="labelMedium">{label}</Text>
      <Button mode="outlined" icon={mode === 'date' ? 'calendar' : 'clock-outline'} onPress={() => setOpen(true)}>
        {display}
      </Button>
      {mode === 'date' ? (
        <DatePickerModal
          locale="ru"
          mode="single"
          visible={open}
          date={value}
          onDismiss={() => setOpen(false)}
          onConfirm={({ date }) => {
            setOpen(false);
            if (date) onChange(date);
          }}
        />
      ) : (
        <TimePickerModal
          locale="ru"
          visible={open}
          hours={value.getHours()}
          minutes={value.getMinutes()}
          label="Время"
          cancelLabel="Отмена"
          confirmLabel="Готово"
          onDismiss={() => setOpen(false)}
          onConfirm={({ hours, minutes }) => {
            setOpen(false);
            const next = new Date(value);
            next.setHours(hours, minutes, 0, 0);
            onChange(next);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    gap: 4,
  },
});
