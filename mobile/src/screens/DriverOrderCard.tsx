import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { OrderWithDetails } from '../api/orders';
import { useConfirmCrew } from '../api/orders';
import { formatTime } from '../utils/date';

const CREW_STATUS_LABELS: Record<string, string> = {
  notified: 'Новый заказ',
  read: 'Открыт',
  confirmed: 'Принят',
};

function primaryAddress(order: OrderWithDetails, type: 'pickup' | 'dropoff') {
  return order.order_stops.find((s) => s.is_primary && s.type === type)?.address;
}

export function DriverOrderCard({
  order,
  employeeId,
}: {
  order: OrderWithDetails;
  employeeId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const confirmCrew = useConfirmCrew();

  const myCrew = order.order_crew.find((c) => c.employee_id === employeeId);
  const others = order.order_crew.filter((c) => c.employee_id !== employeeId);
  const extraStops = order.order_stops.filter((s) => !s.is_primary);
  const pickup = primaryAddress(order, 'pickup');
  const dropoff = primaryAddress(order, 'dropoff');

  return (
    <View style={styles.card}>
      <Pressable onPress={() => setExpanded((v) => !v)}>
        <View style={styles.headerRow}>
          <Text style={styles.time}>
            {formatTime(new Date(order.scheduled_start))}–{formatTime(new Date(order.scheduled_end))}
          </Text>
          {myCrew && (
            <View style={[styles.badge, myCrew.status === 'confirmed' && styles.badgeConfirmed]}>
              <Text style={styles.badgeText}>{CREW_STATUS_LABELS[myCrew.status]}</Text>
            </View>
          )}
        </View>
        <Text style={styles.client}>{order.clients?.name ?? 'Без клиента'}</Text>
        {pickup && <Text style={styles.address}>📍 Загрузка: {pickup}</Text>}
        {dropoff && <Text style={styles.address}>🏁 Выгрузка: {dropoff}</Text>}
      </Pressable>

      {expanded && (
        <View style={styles.details}>
          {extraStops.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ещё точки</Text>
              {extraStops.map((stop) => (
                <Text key={stop.id} style={styles.textMuted}>
                  {stop.type === 'pickup' ? 'Загрузка' : 'Выгрузка'}: {stop.address}
                </Text>
              ))}
            </View>
          )}

          {order.cargo_description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Груз</Text>
              <Text style={styles.text}>{order.cargo_description}</Text>
            </View>
          )}

          {others.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Вместе с вами</Text>
              {others.map((c) => (
                <Text key={c.employee_id} style={styles.text}>
                  {c.employees?.name ?? c.employee_id} ({c.role === 'driver' ? 'водитель' : 'грузчик'})
                </Text>
              ))}
            </View>
          )}

          {order.comment && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Комментарий</Text>
              <Text style={styles.text}>{order.comment}</Text>
            </View>
          )}

          <View style={styles.actions}>
            {order.clients?.phone && (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => Linking.openURL(`tel:${order.clients?.phone}`)}
              >
                <Text style={styles.secondaryButtonText}>Позвонить клиенту</Text>
              </Pressable>
            )}
            {myCrew && myCrew.status !== 'confirmed' && (
              <Pressable
                style={styles.primaryButton}
                onPress={() => confirmCrew.mutate({ orderId: order.id, employeeId })}
                disabled={confirmCrew.isPending}
              >
                <Text style={styles.primaryButtonText}>Принять заказ</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  time: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
  },
  badgeConfirmed: {
    backgroundColor: '#dcfce7',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  client: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  address: {
    fontSize: 14,
    color: '#111827',
  },
  details: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    gap: 10,
  },
  section: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  text: {
    fontSize: 14,
    color: '#111827',
  },
  textMuted: {
    fontSize: 13,
    color: '#6b7280',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#5b21b6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: '#5b21b6',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#5b21b6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
