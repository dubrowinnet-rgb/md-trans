import { useEffect, useRef, useState } from 'react';
import { Keyboard, Linking, ScrollView, StyleSheet, TextInput as RNTextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Avatar,
  Button,
  Chip,
  Dialog,
  Divider,
  FAB,
  HelperText,
  IconButton,
  List,
  Portal,
  Text,
} from 'react-native-paper';
import {
  ACTIVE_ORDER_STATUS,
  useConfirmCrew,
  useDeleteOrder,
  useMarkCrewRead,
  useOrder,
  useUpdateOrderScheduleAndPrice,
  useUpdateOrderStatus,
  type CrewStatus,
} from '../../api/orders';
import { useSession } from '../../providers/SessionProvider';
import {
  canCreateOrders,
  canEditOrderScheduleAndPrice,
  canManageOrders,
  canViewClientPhone,
  canViewOrderAmount,
} from '../../lib/permissions';
import { CompactField, FieldLabel } from '../../components/form/CompactField';
import { DateRow } from '../../components/form/DateRow';
import { TimeRangeRow } from '../../components/form/TimeRangeRow';
import { FadeHighlight } from '../../components/common/FadeHighlight';
import { CrewDialog } from '../../components/orders/CrewDialog';
import { yandexMapsRouteAppUrl, yandexMapsRouteUrl, yandexNaviRouteAppUrl } from '../../lib/yandexMaps';
import { geocodeAddress } from '../../lib/yandexGeocode';
import { formatPhone, normalizePhone } from '../../lib/phone';
import { CREW_STATUS_LABELS } from '../../theme';
import { formatDayLabel, formatTime } from '../../utils/date';

function combine(date: Date, time: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes());
}

function crewRoleLabel(crew: { isDriver: boolean; isLoader: boolean }) {
  if (crew.isDriver && crew.isLoader) return 'Водитель и грузчик';
  return crew.isDriver ? 'Водитель' : 'Грузчик';
}

// Максим явно просил Яндекс.Навигатор, а не Карты (01.10, «Правки 5», п.2,
// 4-я попытка) — пробуем его первым, если удалось геокодировать обе точки
// (у Навигатора нет текстового адреса, только lat/lon, см.
// lib/yandexGeocode.ts). Дальше — схема самого приложения Яндекс.Карт
// (текстовый адрес, см. lib/yandexMaps.ts), и только потом обычная
// https-ссылка. Linking.openURL с незарегистрированной схемой отклоняется
// промисом с ошибкой (не тихо) — ловим и идём к следующему варианту.
// Не через canOpenURL: на Android 11+ он требует объявления видимости
// пакета в AndroidManifest (<queries>) — это добавлено отдельным локальным
// плагином (plugins/withAndroidQueries.js), вероятная настоящая причина,
// почему все 3 прошлые попытки не работали на реальном устройстве (меняет
// нативный манифест — нужна пересборка приложения, не OTA). Сама проверка
// здесь всё равно через try/catch, а не canOpenURL — так надёжнее независимо
// от того, сработает ли <queries> как ожидается.
async function openYandexRoute(addresses: string[]) {
  if (addresses.length >= 2) {
    const [fromAddr, toAddr] = [addresses[0], addresses[addresses.length - 1]];
    const [from, to] = await Promise.all([geocodeAddress(fromAddr), geocodeAddress(toAddr)]);
    if (from && to) {
      try {
        await Linking.openURL(yandexNaviRouteAppUrl(from, to));
        return;
      } catch {
        // Навигатор не установлен или схема не разрешилась — пробуем Карты ниже.
      }
    }
  }
  try {
    await Linking.openURL(yandexMapsRouteAppUrl(addresses));
  } catch {
    await Linking.openURL(yandexMapsRouteUrl(addresses));
  }
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
  const insets = useSafeAreaInsets();
  const { employee } = useSession();
  const isCrew = employee?.role === 'driver' || employee?.role === 'loader';
  const canManage = canManageOrders(employee);
  const showFullStatusUI = !isCrew || canManage;
  const canEditSchedulePrice = canEditOrderScheduleAndPrice(employee);
  const canDuplicate = canCreateOrders(employee);

  const orderQuery = useOrder(id);
  const order = orderQuery.data;

  // Подсветка изменившихся полей (Правки 6, п.3) — сравниваем с прошлым
  // снимком заказа при каждом обновлении с сервера (опрос/Realtime,
  // useOrder) и на 5 секунд подсвечиваем именно те поля, которые
  // поменялись, а не всю карточку. Первая загрузка — не изменение,
  // снимок просто запоминаем. Тот же набор полей, что уже отслеживает
  // уведомления сервер (notify_order_changed, миграция 0028).
  const prevOrderSnapshotRef = useRef<typeof order>(undefined);
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!order) return;
    const prev = prevOrderSnapshotRef.current;
    prevOrderSnapshotRef.current = order;
    if (!prev || prev.id !== order.id) return;
    const next = new Set<string>();
    if (prev.scheduled_start !== order.scheduled_start || prev.scheduled_end !== order.scheduled_end) next.add('time');
    if (prev.actual_price !== order.actual_price) next.add('price');
    if (prev.cargo_description !== order.cargo_description) next.add('cargo');
    if (prev.comment !== order.comment) next.add('comment');
    if (prev.vehicle_id !== order.vehicle_id) next.add('vehicle');
    if (next.size === 0) return;
    setChangedFields(next);
    const timer = setTimeout(() => setChangedFields(new Set()), 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const updateStatus = useUpdateOrderStatus();
  const markRead = useMarkCrewRead();
  const confirmCrew = useConfirmCrew();
  const deleteOrder = useDeleteOrder();
  const updateSchedulePrice = useUpdateOrderScheduleAndPrice();
  const [showExtraStops, setShowExtraStops] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);

  const [editDate, setEditDate] = useState<Date | null>(null);
  const [editStart, setEditStart] = useState<Date | null>(null);
  const [editEnd, setEditEnd] = useState<Date | null>(null);
  const [editPriceText, setEditPriceText] = useState('');

  // Водитель, совмещающий функции грузчика, даёт две строки order_crew на
  // этот заказ (role='driver' и role='loader') — но useConfirmCrew и
  // useMarkCrewRead обновляют статус у обеих сразу (фильтр только по
  // order_id+employee_id), так что для статуса неважно, какую из них найдёт .find().
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

  const canEditSchedulePriceNow = canManage || (canEditSchedulePrice && Boolean(myCrew));

  // Раньше время/сумму сохраняла отдельная кнопка в блоке редактирования, а
  // «Готово» просто закрывало карточку без сохранения — можно было
  // случайно потерять правки. Теперь один и тот же чек-марк снизу справа и
  // сохраняет (если есть что сохранять), и закрывает карточку (доработки 3,
  // п.9). Если сохранить не получилось, карточка не закрывается — ошибка
  // уже показана через updateSchedulePrice.error.
  const handleDone = async () => {
    if (order && canEditSchedulePriceNow && editDate && editStart && editEnd) {
      try {
        await updateSchedulePrice.mutateAsync({
          orderId: order.id,
          scheduledStart: combine(editDate, editStart),
          scheduledEnd: combine(editDate, editEnd),
          actualPrice: editPriceText.trim() ? Number(editPriceText.trim().replace(',', '.')) : null,
        });
      } catch {
        return;
      }
    }
    router.back();
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
  const clientPhoneDisplay = clientPhone ? formatPhone(clientPhone) : null;
  // tel: должен звонить, а не показывать текст — берём чистое +7XXXXXXXXXX,
  // не «красивую» строку со скобками и дефисами.
  const clientPhoneCore = normalizePhone(clientPhone);
  const clientPhoneDial = clientPhoneCore?.length === 10 ? `+7${clientPhoneCore}` : clientPhone;
  const showAmount = canViewOrderAmount(employee, order);
  const cancelled = order.status === 'cancelled';

  // Сводим возможные две строки order_crew одного сотрудника (водитель,
  // совмещающий функции грузчика) в одну запись для списка.
  const mergedCrew: { employeeId: string; name: string; isDriver: boolean; isLoader: boolean; status: CrewStatus }[] =
    [];
  for (const c of order.order_crew) {
    const existing = mergedCrew.find((m) => m.employeeId === c.employee_id);
    if (existing) {
      if (c.role === 'driver') existing.isDriver = true;
      else existing.isLoader = true;
      existing.status = c.status;
    } else {
      mergedCrew.push({
        employeeId: c.employee_id,
        name: c.employees?.name ?? 'Сотрудник',
        isDriver: c.role === 'driver',
        isLoader: c.role === 'loader',
        status: c.status,
      });
    }
  }

  return (
    <View style={styles.screen}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: 88 + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={Keyboard.dismiss}
    >
      <View style={styles.clientSection}>
        <FieldLabel>Клиент</FieldLabel>
        <View style={styles.clientRow}>
          <Avatar.Text size={36} label={(order.clients?.name ?? '?').trim().charAt(0).toUpperCase() || '?'} />
          <View style={styles.flex}>
            <Text variant="bodyLarge" numberOfLines={1}>
              {order.clients?.name ?? 'Без клиента'}
            </Text>
            {order.clients?.discount_percent ? (
              <Text variant="bodySmall" style={styles.discount}>
                Скидка {order.clients.discount_percent}%
              </Text>
            ) : clientPhoneDisplay ? (
              <Text variant="bodySmall" style={styles.muted}>
                {clientPhoneDisplay}
              </Text>
            ) : null}
          </View>
          {clientPhoneDisplay && (
            <IconButton
              icon="phone"
              mode="contained-tonal"
              accessibilityLabel={`Позвонить клиенту: ${clientPhoneDisplay}`}
              onPress={() => Linking.openURL(`tel:${clientPhoneDial}`)}
            />
          )}
        </View>
      </View>
      <FadeHighlight active={changedFields.has('time')}>
        <Text variant="bodyMedium" style={styles.when}>
          {formatDayLabel(start)}, {formatTime(start)}–{formatTime(end)}
        </Text>
      </FadeHighlight>

      {showFullStatusUI ? (
        <Chip
          compact
          icon={cancelled ? 'refresh' : 'cancel'}
          disabled={!canManage || updateStatus.isPending}
          style={cancelled ? styles.cancelledChip : undefined}
          textStyle={cancelled ? styles.cancelledChipText : undefined}
          onPress={() =>
            updateStatus.mutate({ orderId: order.id, status: cancelled ? ACTIVE_ORDER_STATUS : 'cancelled' })
          }
        >
          {cancelled ? 'Восстановить заказ' : 'Отменить заказ'}
        </Chip>
      ) : (
        <>
          {cancelled && (
            <Chip style={styles.cancelledChip} textStyle={styles.cancelledChipText} compact>
              Заказ отменён
            </Chip>
          )}
          {!cancelled && myCrew && myCrew.status !== 'confirmed' && (
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
          {!cancelled && myCrew?.status === 'confirmed' && (
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

      {/* Раньше этот блок показывался только бригаде (водителю на своём
          заказе) — у диспетчера/админа не было способа перенести заказ,
          хотя RLS это уже разрешала (миграция 0006, "orders update").
          Теперь блок открыт и canManage, даже когда сам не в бригаде. */}
      {(canManage || (canEditSchedulePrice && myCrew)) && editDate && editStart && editEnd && (
        <View style={styles.editBlock}>
          <Divider style={styles.divider} />
          <Text variant="labelLarge">Изменить время и сумму</Text>
          {canManage && (
            <Text variant="bodySmall" style={styles.muted}>
              Перенос заказа — просто измените дату или время ниже и сохраните.
            </Text>
          )}
          <View style={styles.bleed}>
            <DateRow value={editDate} onChange={setEditDate} />
            <TimeRangeRow start={editStart} end={editEnd} onChangeStart={setEditStart} onChangeEnd={setEditEnd} />
            {showAmount && (
              <CompactField label="Доход" icon="cash" iconColor="#16a34a">
                <View style={styles.inlineRow}>
                  <RNTextInput
                    style={styles.inlineText}
                    accessibilityLabel="Сумма заказа"
                    placeholder="Например: 14500"
                    placeholderTextColor="#9ca3af"
                    value={editPriceText}
                    onChangeText={setEditPriceText}
                    keyboardType="numeric"
                  />
                  {editPriceText.trim() ? (
                    <Text variant="bodyLarge" style={styles.muted}>
                      ₽
                    </Text>
                  ) : null}
                </View>
              </CompactField>
            )}
          </View>
          {updateSchedulePrice.error && (
            <HelperText type="error">{updateSchedulePrice.error.message}</HelperText>
          )}
        </View>
      )}

      <List.Section title="Маршрут" style={styles.section} titleStyle={styles.sectionTitle}>
        {primaryStops.map((stop) => (
          <List.Item
            key={stop.id}
            title={stop.address}
            titleNumberOfLines={3}
            description={stop.type === 'pickup' ? 'Загрузка' : 'Выгрузка'}
            left={(props) => (
              <List.Icon {...props} icon={stop.type === 'pickup' ? 'package-up' : 'package-down'} />
            )}
            style={styles.compactItem}
            containerStyle={styles.compactRow}
            titleStyle={styles.compactTitle}
            descriptionStyle={styles.compactDescription}
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
              style={styles.compactItem}
              containerStyle={styles.compactRow}
              titleStyle={styles.compactTitle}
              descriptionStyle={styles.compactDescription}
            />
          ))}
        {sortedStops.length > 0 && (
          <Button
            mode="outlined"
            icon="navigation-variant"
            style={styles.route}
            onPress={() => openYandexRoute(sortedStops.map((s) => s.address))}
          >
            Маршрут в Яндекс.Картах
          </Button>
        )}
      </List.Section>
      <Divider />

      <List.Section title="Экипаж" style={styles.section} titleStyle={styles.sectionTitle}>
        {order.order_crew.length === 0 && <List.Item title="Никто не назначен" />}
        {/* Водитель, совмещающий функции грузчика, даёт две строки order_crew
            (role='driver' и role='loader') с одинаковым employee_id — сводим
            их в одну строку, иначе список показал бы человека дважды. */}
        {mergedCrew.map((crew) => (
          <View key={crew.employeeId}>
            <List.Item
              title={crew.name}
              description={`${crewRoleLabel(crew)} · ${CREW_STATUS_LABELS[crew.status]}`}
              left={(props) => <List.Icon {...props} icon={crew.isDriver ? 'truck' : 'account-hard-hat'} />}
              right={(props) =>
                crew.status === 'confirmed' ? <List.Icon {...props} icon="check-circle" color="#22c55e" /> : null
              }
              style={styles.compactItem}
              containerStyle={styles.compactRow}
              titleStyle={styles.compactTitle}
              descriptionStyle={styles.compactDescription}
            />
            {crew.isDriver && order.vehicles && (
              <FadeHighlight active={changedFields.has('vehicle')}>
                <Text variant="bodySmall" style={styles.vehiclePlate}>
                  {order.vehicles.plate}
                </Text>
              </FadeHighlight>
            )}
          </View>
        ))}
        {canManage && (
          <Button
            mode="text"
            icon="account-edit-outline"
            style={styles.action}
            onPress={() => setCrewDialogOpen(true)}
          >
            Изменить экипаж
          </Button>
        )}
      </List.Section>
      <Divider />

      <List.Section title="Детали" style={styles.section} titleStyle={styles.sectionTitle}>
        {order.order_services.map((item, index) => (
          <List.Item
            key={item.services?.id ?? index}
            title={item.services?.name ?? 'Услуга'}
            description={item.qty > 1 ? `Услуга · ${item.qty} шт.` : 'Услуга'}
            left={() => (
              <View style={[styles.serviceBar, { backgroundColor: item.services?.color ?? '#8E24AA' }]} />
            )}
            style={styles.compactItem}
            containerStyle={styles.compactRow}
            titleStyle={styles.compactTitle}
            descriptionStyle={styles.compactDescription}
          />
        ))}
        <FadeHighlight active={changedFields.has('cargo')}>
          <List.Item
            title={order.cargo_description || '—'}
            titleNumberOfLines={4}
            description="Груз"
            style={styles.compactItem}
            containerStyle={styles.compactRow}
            titleStyle={styles.compactTitle}
            descriptionStyle={styles.compactDescription}
          />
        </FadeHighlight>
        {/* Сумму редактирующим (canEditSchedulePriceNow) уже показывает поле
            выше, в «Изменить время и сумму» — второй раз здесь только для
            тех, кто это поле не видит (например, грузчик), иначе одно и то
            же число дублировалось бы на экране. */}
        {showAmount && !canEditSchedulePriceNow && (
          <FadeHighlight active={changedFields.has('price')}>
            <List.Item
              title={order.actual_price != null ? `${order.actual_price} ₽` : '—'}
              description="Сумма"
              style={styles.compactItem}
              containerStyle={styles.compactRow}
              titleStyle={styles.compactTitle}
              descriptionStyle={styles.compactDescription}
            />
          </FadeHighlight>
        )}
        {order.comment ? (
          <FadeHighlight active={changedFields.has('comment')}>
            <List.Item
              title={order.comment}
              titleNumberOfLines={6}
              description="Комментарий"
              style={styles.compactItem}
              containerStyle={styles.compactRow}
              titleStyle={styles.compactTitle}
              descriptionStyle={styles.compactDescription}
            />
          </FadeHighlight>
        ) : null}
      </List.Section>

      {canDuplicate && (
        <Button
          mode="outlined"
          icon="content-copy"
          style={styles.action}
          onPress={() => router.push({ pathname: '/order/new', params: { duplicateFrom: order.id } })}
        >
          Копировать заказ
        </Button>
      )}
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
      {crewDialogOpen && <CrewDialog order={order} onClose={() => setCrewDialogOpen(false)} />}
    </ScrollView>
    <FAB
      icon="check"
      style={[styles.doneFab, { bottom: 16 + insets.bottom }]}
      accessibilityLabel="Сохранить и закрыть заказ"
      onPress={handleDone}
      loading={updateSchedulePrice.isPending}
      disabled={updateSchedulePrice.isPending}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginTop: 32,
  },
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 12,
    paddingBottom: 88,
  },
  flex: {
    flex: 1,
  },
  // Отступы экрана — padding:12 (content ниже), а компактные строки поля
  // (CompactField, components/form/CompactField.tsx) сами дают 16 слева и
  // справа — bleed гасит отступ экрана, чтобы плашка-подпись и строка со
  // значением шли от истинного края, как в референсе Максима.
  bleed: {
    marginHorizontal: -12,
  },
  clientSection: {
    marginHorizontal: -12,
    marginBottom: 4,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 46,
    backgroundColor: '#ffffff',
  },
  discount: {
    color: '#16a34a',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineText: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
    paddingVertical: 0,
  },
  doneFab: {
    position: 'absolute',
    right: 16,
  },
  when: {
    textTransform: 'capitalize',
    marginTop: 2,
    marginBottom: 8,
  },
  cancelledChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#fee2e2',
  },
  cancelledChipText: {
    color: '#ef4444',
  },
  action: {
    marginTop: 6,
  },
  accepted: {
    marginTop: 6,
    color: '#15803d',
  },
  editBlock: {
    gap: 6,
    marginTop: 8,
  },
  muted: {
    opacity: 0.6,
  },
  divider: {
    marginBottom: 2,
  },
  route: {
    marginHorizontal: 16,
    marginTop: 4,
  },
  moreStops: {
    alignSelf: 'flex-start',
    marginLeft: 8,
  },
  // Компактные строки списков (Максим, 2026-09-29: «сожми, сделай более
  // мелким» по образцу референса) — react-native-paper даёт List.Item
  // щедрые отступы по умолчанию (containerV3.paddingVertical=8 +
  // rowV3.marginVertical=6 + title 16sp/description 14sp), вдвое больше,
  // чем нужно для плотного списка «Маршрут»/«Экипаж»/«Детали».
  section: {
    marginVertical: 2,
  },
  sectionTitle: {
    fontSize: 12,
    marginBottom: -6,
  },
  compactItem: {
    paddingVertical: 2,
  },
  compactRow: {
    marginVertical: 0,
  },
  compactTitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  compactDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  serviceBar: {
    width: 4,
    marginLeft: 16,
    borderRadius: 2,
  },
  vehiclePlate: {
    marginLeft: 56,
    marginTop: -6,
    marginBottom: 2,
    opacity: 0.6,
  },
  deleteButton: {
    marginTop: 16,
    borderColor: '#b91c1c',
  },
});
