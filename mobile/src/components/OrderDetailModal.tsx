import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useUpdateOrderStatus, type OrderStatus, type OrderWithDetails } from '../api/orders';
import { formatTime } from '../utils/date';

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  in_progress: 'В работе',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

const STATUS_ORDER: OrderStatus[] = ['new', 'confirmed', 'in_progress', 'completed', 'cancelled'];

const CREW_STATUS_LABELS: Record<string, string> = {
  notified: 'уведомлён',
  read: 'открыл заказ',
  confirmed: 'принял заказ',
};

export function OrderDetailModal({
  order,
  onClose,
}: {
  order: OrderWithDetails;
  onClose: () => void;
}) {
  const [showAllStops, setShowAllStops] = useState(false);
  const updateStatus = useUpdateOrderStatus();

  const primaryStops = order.order_stops.filter((s) => s.is_primary);
  const extraStops = order.order_stops.filter((s) => !s.is_primary);
  const sortedPrimary = [...primaryStops].sort((a, b) => a.order_index - b.order_index);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>
            {formatTime(new Date(order.scheduled_start))}–{formatTime(new Date(order.scheduled_end))}
          </Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Закрыть</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusRow}>
          {STATUS_ORDER.map((status) => {
            const active = order.status === status;
            return (
              <Pressable
                key={status}
                disabled={updateStatus.isPending}
                onPress={() => updateStatus.mutate({ orderId: order.id, status })}
                style={[styles.statusChip, active && styles.statusChipActive]}
              >
                <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>
                  {STATUS_LABELS[status]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Section title="Клиент">
          <Text style={styles.text}>{order.clients?.name ?? 'Без клиента'}</Text>
          {order.clients?.phone && <Text style={styles.textMuted}>{order.clients.phone}</Text>}
          {!!order.clients?.discount_percent && (
            <Text style={styles.textMuted}>Скидка клиента: {order.clients.discount_percent}%</Text>
          )}
        </Section>

        <Section title="Точки маршрута">
          {sortedPrimary.map((stop) => (
            <Text key={stop.id} style={styles.text}>
              {stop.type === 'pickup' ? '📍 Загрузка' : '🏁 Выгрузка'}: {stop.address}
            </Text>
          ))}
          {extraStops.length > 0 && (
            <Pressable onPress={() => setShowAllStops((v) => !v)}>
              <Text style={styles.link}>
                {showAllStops ? 'Скрыть' : `Ещё точки (${extraStops.length})`}
              </Text>
            </Pressable>
          )}
          {showAllStops &&
            extraStops.map((stop) => (
              <Text key={stop.id} style={styles.textMuted}>
                {stop.type === 'pickup' ? 'Загрузка' : 'Выгрузка'}: {stop.address}
              </Text>
            ))}
        </Section>

        {order.cargo_description && (
          <Section title="Детали груза">
            <Text style={styles.text}>{order.cargo_description}</Text>
          </Section>
        )}

        <Section title="Экипаж">
          {order.order_crew.length === 0 && <Text style={styles.textMuted}>Не назначен</Text>}
          {order.order_crew.map((crew) => (
            <Text key={crew.employee_id} style={styles.text}>
              {crew.employees?.name ?? crew.employee_id} ({crew.role === 'driver' ? 'водитель' : 'грузчик'}) —{' '}
              <Text style={styles.textMuted}>{CREW_STATUS_LABELS[crew.status] ?? crew.status}</Text>
            </Text>
          ))}
        </Section>

        {order.actual_price != null && (
          <Section title="Сумма">
            <Text style={styles.text}>{order.actual_price} ₽</Text>
          </Section>
        )}

        {order.comment && (
          <Section title="Комментарий">
            <Text style={styles.text}>{order.comment}</Text>
          </Section>
        )}
      </ScrollView>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingTop: 48,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  close: {
    color: '#5b21b6',
    fontSize: 14,
  },
  statusRow: {
    marginBottom: 16,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginRight: 8,
  },
  statusChipActive: {
    backgroundColor: '#5b21b6',
    borderColor: '#5b21b6',
  },
  statusChipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  statusChipTextActive: {
    color: '#fff',
  },
  section: {
    marginBottom: 16,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  text: {
    fontSize: 14,
    color: '#111827',
  },
  textMuted: {
    fontSize: 13,
    color: '#6b7280',
  },
  link: {
    fontSize: 13,
    color: '#5b21b6',
    marginTop: 2,
  },
});
