import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Text } from 'react-native-paper';
import { formatDayLabel, formatTime } from '../../utils/date';

// Заглушка маршрута: форма создания заказа (CreateOrderModal со старой
// ветки: клиент, точки маршрута, экипаж с проверкой занятости) переносится
// сюда следующим шагом. API для неё уже есть — useCreateOrder в api/orders.ts.
export default function NewOrderScreen() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  const startDate = start ? new Date(start) : null;

  return (
    <View style={styles.container}>
      <Text variant="titleMedium">Форма заказа ещё переносится</Text>
      {startDate && (
        <Text variant="bodyMedium" style={styles.slot}>
          Выбранный слот: {formatDayLabel(startDate)}, {formatTime(startDate)}
        </Text>
      )}
      <Button mode="outlined" onPress={() => router.back()}>
        Назад к календарю
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
    justifyContent: 'center',
  },
  slot: {
    textTransform: 'capitalize',
  },
});
