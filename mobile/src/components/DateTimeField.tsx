import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

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

  const display = mode === 'date' ? value.toLocaleDateString('ru-RU') : value.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.value} onPress={() => setOpen(true)}>
        <Text style={styles.valueText}>{display}</Text>
      </Pressable>
      {open && (
        <>
          <DateTimePicker
            value={value}
            mode={mode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selected) => {
              if (event.type === 'dismissed') {
                setOpen(false);
                return;
              }
              if (selected) onChange(selected);
              if (Platform.OS === 'android') setOpen(false);
            }}
          />
          {Platform.OS === 'ios' && (
            <Pressable style={styles.done} onPress={() => setOpen(false)}>
              <Text style={styles.doneText}>Готово</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
  },
  value: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  valueText: {
    fontSize: 14,
    color: '#111827',
  },
  done: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  doneText: {
    color: '#5b21b6',
    fontWeight: '600',
    fontSize: 13,
  },
});
