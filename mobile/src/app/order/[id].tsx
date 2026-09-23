import { ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Chip, Divider, HelperText, List, Text } from 'react-native-paper';
import { useOrder } from '../../api/orders';
import { CREW_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../../theme';
import { formatDayLabel, formatTime } from '../../utils/date';

// Просмотр заказа. Смена статуса, «Принять заказ» и звонок клиенту
// переносятся из старого OrderDetailModal следующим шагом.
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderQuery = useOrder(id);
  const order = orderQuery.data;

  if (orderQuery.isLoading) return <ActivityIndicator style={styles.loader} />;
  if (!order) {
    return (
      <HelperText type="error" visible>
        {orderQuery.error?.message ?? 'Заказ не найден'}
      </HelperText>
    );
  }

  const start = new Date(order.scheduled_start);
  const end = new Date(order.scheduled_end);
  const stops = [...order.order_stops].sort((a, b) => a.order_index - b.order_index);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Chip
        style={[styles.status, { backgroundColor: ORDER_STATUS_COLORS[order.status].bg }]}
        compact
      >
        {ORDER_STATUS_LABELS[order.status]}
      </Chip>
      <Text variant="titleLarge">{order.clients?.name ?? 'Без клиента'}</Text>
      <Text variant="bodyMedium" style={styles.when}>
        {formatDayLabel(start)}, {formatTime(start)}–{formatTime(end)}
      </Text>

      <List.Section title="Маршрут">
        {stops.map((stop) => (
          <List.Item
            key={stop.id}
            title={stop.address}
            description={stop.type === 'pickup' ? 'Загрузка' : 'Выгрузка'}
            left={(props) => (
              <List.Icon {...props} icon={stop.type === 'pickup' ? 'package-up' : 'package-down'} />
            )}
          />
        ))}
      </List.Section>
      <Divider />

      <List.Section title="Экипаж">
        {order.order_crew.length === 0 && <List.Item title="Никто не назначен" />}
        {order.order_crew.map((crew) => (
          <List.Item
            key={crew.employee_id}
            title={crew.employees?.name ?? 'Сотрудник'}
            description={`${crew.role === 'driver' ? 'Водитель' : 'Грузчик'} · ${CREW_STATUS_LABELS[crew.status]}`}
            left={(props) => (
              <List.Icon {...props} icon={crew.role === 'driver' ? 'truck' : 'account-hard-hat'} />
            )}
          />
        ))}
      </List.Section>
      <Divider />

      <List.Section title="Детали">
        <List.Item title={order.cargo_description || '—'} description="Груз" />
        <List.Item
          title={order.actual_price != null ? `${order.actual_price} ₽` : '—'}
          description="Сумма"
        />
        {order.comment ? <List.Item title={order.comment} description="Комментарий" /> : null}
      </List.Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginTop: 32,
  },
  content: {
    padding: 16,
  },
  status: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  when: {
    textTransform: 'capitalize',
    marginTop: 4,
  },
});
