import { useState } from 'react';
import { Text } from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { CompactField } from './CompactField';
import { formatFullDayLabel } from '../../utils/date';

export function DateRow({ value, onChange }: { value: Date; onChange: (date: Date) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <CompactField label="Дата" icon="calendar" onPress={() => setOpen(true)}>
        <Text variant="bodyLarge">{formatFullDayLabel(value)}</Text>
      </CompactField>
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
    </>
  );
}
