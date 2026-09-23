import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Button,
  Chip,
  Dialog,
  Divider,
  HelperText,
  List,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import {
  useConfirmCrew,
  useDeleteOrder,
  useMarkCrewRead,
  useOrder,
  useUpdateOrderScheduleAndPrice,
  useUpdateOrderStatus,
  type OrderStatus,
} from '../../api/orders';
import { useSession } from '../../providers/SessionProvider';
import {
  canEditOrderScheduleAndPrice,
  canManageOrders,
  canViewClientPhone,
  canViewOrderAmount,
} from '../../lib/permissions';
import { DateTimeField } from '../../components/form/DateTimeField';
import { yandexMapsRouteUrl } from '../../lib/yandexMaps';
import { CREW_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../../theme';
import { formatDayLabel, formatTime } from '../../utils/date';

const STATUS_ORDER: OrderStatus[] = ['new', 'confirmed', 'in_progress', 'completed', 'cancelled'];

function combine(date: Date, time: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes());
}

// Карточка заказа. Права зависят от роли (раздел «права и доступы»):
// админ/диспетчер меняют статус и любое поле, могут удалить заказ;
// водитель без can_manage_orders меняет только время и сумму, остальное
// смотрит; грузчик — только смотрит, суммы не видит никогда. Водителю или
// грузчику с включённым can_manage_orders (галочка на «Команде») доступно
// всё то же, что диспетчеру. Водитель/грузчик при открытии отмечается как
// «открыл заказ» и может нажать «Принять заказ» (раздел 9.5 ТЗ) — это не
// зависит от прав на редактирование.
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { employee } = useSession();
  const isCrew = employee?.role === 'driver' || employee?.role === 'loader';
  const canManage = canManageOrders(employee);
  const showFullStatusUI = !isCrew || canManage;
  const canEditSchedulePrice = canEditOrderScheduleAndPrice(employee);

  const orderQuery = useOrder(id);
  const order = orderQuery.data;

  const updateStatus = useUpdateOrderStatus();
  const markRead = useMarkCrewRead();
  const confirmCrew = useConfirmCrew();
  const deleteOrder = useDeleteOrder();
  const updateSchedulePrice = useUpdateOrderScheduleAndPrice();
  const [showExtraStops, setShowExtraStops] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [editDate, setEditDate] = useState<Date | null>(null);
  const [editStart, setEditStart] = useState<Date | null>(null);
  const [editEnd, setEditEnd] = useState<Date | null>(null);
  const [editPriceText, setEditPriceText] = useState('');

  const myCrew = employee ? order?.order_crew.find((c) => c.employee_id === employee.id) : undefined;

  // Отмечаем прочтение один раз и только из статуса «уведомлён», чтобы не
  // откатить уже принятый заказ обратно в «открыл».
  const markedRead = useRef(false);
  useEffect(() => {
    if (!order || !employee || !isCrew || markedRead.current) return;
    if (myCrew?.status === 'notified') {
      markedRead.current = true;
      markRead.mutate({ orderId: order.id, employeeId: employee.id });
    }
  }, [order, employee, isCrew, myCrew, markRead]);

  // Поля времени/суммы заполняем один раз из заказа — дальше это черновик
  // водителя, обновления с сервера его не перетирают.
  useEffect(() => {
    if (!order || editDate) return;
    setEditDate(new Date(order.scheduled_start));
    setEditStart(new Date(order.scheduled_start));
    setEditEnd(new Date(order.scheduled_end));
    setEditPriceText(order.actual_price != null ? String(order.actual_price) : '');
  }, [order, editDate]);

  const handleDelete = async () => {
    if (!order) return;
    try {
      await deleteOrder.mutateAsync(order.id);
      setConfirmDelete(false);
      router.back();
    } catch {
      setConfirmDelete(false);
    }
  };

  const handleSaveSchedulePrice = async () => {
    if (!order || !editDate || !editStart || !editEnd) return;
    try {
      await updateSchedulePrice.mutateAsync({
        orderId: order.id,
        scheduledStart: combine(editDate, editStart),
        scheduledEnd: combine(editDate, editEnd),
        actualPrice: editPriceText.trim() ? Number(editPriceText.trim().replace(',', '.')) : null,
      });
    } catch {
      // ошибка уже показана через updateSchedulePrice.error
    }
  };

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
  const sortedStops = [...order.order_stops].sort((a, b) => a.order_index - b.order_index);
  const primaryStops = sortedStops.filter((s) => s.is_primary);
  const extraStops = sortedStops.filter((s) => !s.is_primary);
  const clientPhone = canViewClientPhone(employee, order) ? order.clients?.phone : null;
  const showAmount = canViewOrderAmount(employee);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="titleLarge">{order.clients?.name ?? 'Без клиента'}</Text>
      <Text variant="bodyMedium" style={styles.when}>
        {formatDayLabel(start)}, {formatTime(start)}–{formatTime(end)}
      </Text>

      {showFullStatusUI ? (
        <View style={styles.statusRow}>
          {STATUS_ORDER.map((status) => (
            <Chip
              key={status}
              compact
              selected={order.status === status}
              showSelectedOverlay
              disabled={!canManage || updateStatus.isPending}
              style={order.status === status && { backgroundColor: ORDER_STATUS_COLORS[status].bg }}
              onPress={() => updateStatus.mutate({ orderId: order.id, status })}
            >
              {ORDER_STATUS_LABELS[status]}
            </Chip>
          ))}
        </View>
      ) : (
        <>
          <Chip
            style={[styles.statusChip, { backgroundColor: ORDER_STATUS_COLORS[order.status].bg }]}
            compact
          >
            {ORDER_STATUS_LABELS[order.status]}
          </Chip>
          {myCrew && myCrew.status !== 'confirmed' && (
            <Button
              mode="contained"
              icon="check"
              style={styles.action}
              loading={confirmCrew.isPending}
              disabled={confirmCrew.isPending}
              onPress={() => employee && confirmCrew.mutate({ orderId: order.id, employeeId: employee.id })}
            >
              Принять заказ
            </Button>
          )}
          {myCrew?.status === 'confirmed' && (
            <Text variant="labelLarge" style={styles.accepted}>
              Вы приняли заказ
            </Text>
          )}
        </>
      )}
      {(updateStatus.error ?? confirmCrew.error ?? deleteOrder.error) && (
        <HelperText type="error">
          {(updateStatus.error ?? confirmCrew.error ?? deleteOrder.error)?.message}
        </HelperText>
      )}

      {clientPhone ? (
        <Button
          mode="outlined"
          icon="phone"
          style={styles.action}
          onPress={() => Linking.openURL(`tel:${clientPhone}`)}
        >
          {`Позвонить клиенту · ${clientPhone}`}
        </Button>
      ) : null}
      {order.clients?.discount_percent ? (
        <Text variant="bodySmall">Скидка клиента: {order.clients.discount_percent}%</Text>
      ) : null}

      {canEditSchedulePrice && myCrew && editDate && editStart && editEnd && (
        <View style={styles.editBlock}>
          <Divider style={styles.divider} />
          <Text variant="labelLarge">Изменить время и сумму</Text>
          <DateTimeField label="Дата" value={editDate} mode="date" onChange={setEditDate} />
          <View style={styles.timeRow}>
            <DateTimeField label="Начало" value={editStart} mode="time" onChange={setEditStart} />
            <DateTimeField label="Окончание" value={editEnd} mode="time" onChange={setEditEnd} />
          </View>
          <TextInput
            mode="outlined"
            label="Сумма"
            accessibilityLabel="Сумма заказа"
            placeholder="Например: 14500"
            value={editPriceText}
            onChangeText={setEditPriceText}
            keyboardType="numeric"
            right={<TextInput.Affix text="₽" />}
          />
          {updateSchedulePrice.error && (
            <HelperText type="error">{updateSchedulePrice.error.message}</HelperText>
          )}
          <Button
            mode="contained"
            onPress={handleSaveSchedulePrice}
            loading={updateSchedulePrice.isPending}
            disabled={updateSchedulePrice.isPending}
          >
            Сохранить время и сумму
          </Button>
        </View>
      )}

      <List.Section title="Маршрут">
        {primaryStops.map((stop) => (
          <List.Item
            key={stop.id}
            title={stop.address}
            titleNumberOfLines={3}
            description={stop.type === 'pickup' ? 'Загрузка' : 'Выгрузка'}
            left={(props) => (
              <List.Icon {...props} icon={stop.type === 'pickup' ? 'package-up' : 'package-down'} />
            )}
          />
        ))}
        {extraStops.length > 0 && (
          <Button compact onPress={() => setShowExtraStops((v) => !v)} style={styles.moreStops}>
            {showExtraStops ? 'Скрыть доп. точки' : `Ещё точки (${extraStops.length})`}
          </Button>
        )}
        {showExtraStops &&
          extraStops.map((stop) => (
            <List.Item
              key={stop.id}
              title={stop.address}
              description={stop.type === 'pickup' ? 'Доп. загрузка' : 'Доп. выгрузка'}
              left={(props) => <List.Icon {...props} icon="map-marker-outline" />}
            />
          ))}
        {sortedStops.length > 0 && (
          <Button
            mode="outlined"
            icon="navigation-variant"
            style={styles.route}
            onPress={() => Linking.openURL(yandexMapsRouteUrl(sortedStops.map((s) => s.address)))}
          >
            Маршрут в Яндекс.Картах
          </Button>
        )}
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
            right={(props) =>
              crew.status === 'confirmed' ? <List.Icon {...props} icon="check-circle" color="#22c55e" /> : null
            }
          />
        ))}
      </List.Section>
      <Divider />

      <List.Section title="Детали">
        {order.order_services.map((item, index) => (
          <List.Item
            key={item.services?.id ?? index}
            title={item.services?.name ?? 'Услуга'}
            description={item.qty > 1 ? `Услуга · ${item.qty} шт.` : 'Услуга'}
            left={() => (
              <View style={[styles.serviceBar, { backgroundColor: item.services?.color ?? '#8E24AA' }]} />
            )}
          />
        ))}
        <List.Item title={order.cargo_description || '—'} titleNumberOfLines={4} description="Груз" />
        {showAmount && (
          <List.Item
            title={order.actual_price != null ? `${order.actual_price} ₽` : '—'}
            description="Сумма"
          />
        )}
        {order.comment ? (
          <List.Item title={order.comment} titleNumberOfLines={6} description="Комментарий" />
        ) : null}
      </List.Section>

      {canManage && (
        <Button
          mode="outlined"
          icon="delete-outline"
          textColor="#b91c1c"
          style={styles.deleteButton}
          onPress={() => setConfirmDelete(true)}
        >
          Удалить заказ
        </Button>
      )}

      <Portal>
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)}>
          <Dialog.Title>Удалить заказ?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">Это действие нельзя отменить.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)}>Отмена</Button>
            <Button
              textColor="#b91c1c"
              onPress={handleDelete}
              loading={deleteOrder.isPending}
              disabled={deleteOrder.isPending}
            >
              Удалить
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginTop: 32,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  when: {
    textTransform: 'capitalize',
    marginTop: 4,
    marginBottom: 12,
  },
  statusChip: {
    alignSelf: 'flex-start',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  action: {
    marginTop: 8,
  },
  accepted: {
    marginTop: 8,
    color: '#15803d',
  },
  editBlock: {
    gap: 10,
    marginTop: 12,
  },
  divider: {
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  route: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  moreStops: {
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  serviceBar: {
    width: 4,
    marginLeft: 16,
    borderRadius: 2,
  },
  deleteButton: {
    marginTop: 16,
    borderColor: '#b91c1c',
  },
});
