import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ActivityIndicator, Appbar, Button, HelperText, List, Text } from 'react-native-paper';
import { TimePickerModal } from 'react-native-paper-dates';
import { useSession } from '../../providers/SessionProvider';
import { useSetWorkingHours, useWorkingHours } from '../../api/companySettings';

function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// «Рабочее время компании» (Максим, 30.09, «Правки 3», п.1) — красит сетку
// календаря (белым/серым) и задаёт точку, откуда она открывается на 3/7-
// дневном виде (см. PagedCalendar). Одно значение на компанию, меняет
// только администратор.
export default function WorkingHoursSettingsScreen() {
  const { employee } = useSession();
  const hoursQuery = useWorkingHours();
  const setHours = useSetWorkingHours();
  const [pickerOpen, setPickerOpen] = useState<'start' | 'end' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (employee?.role !== 'admin') {
    return (
      <View style={styles.noAccess}>
        <Text variant="bodyMedium">Недостаточно прав для просмотра настройки.</Text>
      </View>
    );
  }

  const hours = hoursQuery.data;

  const handleConfirm = async ({ hours: h, minutes: m }: { hours: number; minutes: number }) => {
    if (!hours) return;
    setPickerOpen(null);
    setError(null);
    const next = pickerOpen === 'start' ? { startMinutes: h * 60 + m, endMinutes: hours.endMinutes } : { startMinutes: hours.startMinutes, endMinutes: h * 60 + m };
    if (next.startMinutes >= next.endMinutes) {
      setError('Начало должно быть раньше конца');
      return;
    }
    try {
      await setHours.mutateAsync(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Рабочее время" />
      </Appbar.Header>
      <Text variant="bodySmall" style={styles.hint}>
        Используется в календаре: рабочие часы — белым фоном, нерабочие — серым, как уже показано для
        прошедшего времени. На 3- и 7-дневном виде сетка открывается с начала рабочего времени.
      </Text>
      {hoursQuery.isLoading || !hours ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <List.Section>
          <List.Item
            title="Начало"
            description={formatMinutes(hours.startMinutes)}
            left={(props) => <List.Icon {...props} icon="clock-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => setPickerOpen('start')}
          />
          <List.Item
            title="Конец"
            description={formatMinutes(hours.endMinutes)}
            left={(props) => <List.Icon {...props} icon="clock-outline" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => setPickerOpen('end')}
          />
        </List.Section>
      )}
      {error && <HelperText type="error">{error}</HelperText>}
      {hours && (
        <TimePickerModal
          locale="ru"
          visible={pickerOpen !== null}
          onDismiss={() => setPickerOpen(null)}
          onConfirm={handleConfirm}
          hours={Math.floor((pickerOpen === 'start' ? hours.startMinutes : hours.endMinutes) / 60)}
          minutes={(pickerOpen === 'start' ? hours.startMinutes : hours.endMinutes) % 60}
        />
      )}
      <Button
        style={styles.reset}
        onPress={() => setHours.mutate({ startMinutes: 8 * 60, endMinutes: 21 * 60 })}
        disabled={setHours.isPending}
      >
        Сбросить на 08:00–21:00
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hint: {
    opacity: 0.6,
    marginHorizontal: 16,
    marginTop: 12,
  },
  loader: {
    marginTop: 32,
  },
  noAccess: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  reset: {
    marginHorizontal: 16,
    marginTop: 8,
  },
});
