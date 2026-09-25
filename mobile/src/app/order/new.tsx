import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Button,
  Chip,
  HelperText,
  IconButton,
  List,
  Searchbar,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import { useEmployees } from '../../api/employees';
import { useClients, type Client } from '../../api/clients';
import { ClientDialog } from '../../components/clients/ClientDialog';
import { useNewClientFromContacts } from '../../hooks/useNewClientFromContacts';
import { useBusyEmployeeIds, useCreateOrder, useOrder, type CreateOrderStopInput } from '../../api/orders';
import { useServices } from '../../api/services';
import { useVehicles } from '../../api/vehicles';
import { toDateKey, useScheduleDaysOn, type ScheduleDay } from '../../api/schedule';
import { ServicePicker, formatServiceMeta } from '../../components/form/ServicePicker';
import { DateTimeField } from '../../components/form/DateTimeField';
import { FormSection } from '../../components/form/FormSection';
import { DismissKeyboardView } from '../../components/form/DismissKeyboardView';
import { useSession } from '../../providers/SessionProvider';
import { canManageOrders, canViewClientPhone, canViewOrderAmount } from '../../lib/permissions';
import {
  evaluateAvailability,
  sortByAvailability,
  TIER_COLOR,
  type AvailabilityTier,
} from '../../lib/crewAvailability';
import { serviceNeedsLoaders } from '../../lib/services';

interface ExtraStop {
  key: string;
  type: 'pickup' | 'dropoff';
  address: string;
}

function combine(date: Date, time: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes());
}

function atHour(base: Date, hour: number) {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function dotIcon(color: string) {
  return () => <View style={[styles.dot, { backgroundColor: color }]} />;
}

// Создание заказа: клиент, точки маршрута (2 основные + дополнительные),
// экипаж с проверкой занятости по времени, сумма вручную (разделы 4 и 9.1 ТЗ).
export default function NewOrderScreen() {
  const { start, employeeId, duplicateFrom } = useLocalSearchParams<{
    start?: string;
    employeeId?: string;
    duplicateFrom?: string;
  }>();
  const slotStart = start ? new Date(start) : null;

  const [date, setDate] = useState(() => slotStart ?? new Date());
  const [startTime, setStartTime] = useState(() => slotStart ?? atHour(new Date(), 9));
  const [endTime, setEndTime] = useState(() =>
    slotStart ? new Date(slotStart.getTime() + 2 * 60 * 60 * 1000) : atHour(new Date(), 11)
  );

  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const newClient = useNewClientFromContacts();

  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [extraStops, setExtraStops] = useState<ExtraStop[]>([]);

  const [cargoDescription, setCargoDescription] = useState('');
  const [driverId, setDriverId] = useState<string | null>(null);
  const [loaderIds, setLoaderIds] = useState<string[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  // Машина, подставленная за водителем по умолчанию: как и с суммой
  // (autoPrice ниже) — если диспетчер не менял её руками, следующая смена
  // водителя подставит его машину заново.
  const autoVehicleId = useRef<string | null>(null);
  const [priceText, setPriceText] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  // Сумма, которую мы сами подставили из услуг: её можно перезаписать при смене
  // услуг, а сумму, вписанную диспетчером вручную, — нет.
  const autoPrice = useRef('');
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const scheduledStart = useMemo(() => combine(date, startTime), [date, startTime]);
  const scheduledEnd = useMemo(() => combine(date, endTime), [date, endTime]);

  const employees = useEmployees().data ?? [];
  const drivers = employees.filter((e) => e.role === 'driver');
  const loaders = employees.filter((e) => e.role === 'loader');
  const vehiclesQuery = useVehicles();

  const servicesQuery = useServices();
  const services = servicesQuery.data ?? [];
  const selectedServices = serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  // «Грузчики выбираются только в услугах, где есть слово „грузчики“ в
  // названии» (репорт с реального устройства) — пока такая услуга не
  // выбрана, раздел «Грузчики» скрыт и водитель не подставляется в него
  // автоматически.
  const needsLoaders = selectedServices.some((s) => serviceNeedsLoaders(s.name));

  // Водитель на заказе по умолчанию значится и в списке грузчиков — он же
  // часто и есть напарник («совмещает функции», раздел «рабочий график»).
  // Диспетчер может убрать его оттуда отдельной галочкой. Раздел
  // «Грузчики» ниже рисует его первым в списке кандидатов, даже если его
  // роль в системе — «водитель», а не «грузчик».
  const selectedDriver = drivers.find((d) => d.id === driverId) ?? null;
  const loaderCandidates = selectedDriver ? [selectedDriver, ...loaders] : loaders;

  // При выборе водителя подставляем его в список грузчиков (только если
  // услуга вообще предполагает грузчиков) и его машину по умолчанию —
  // машину не трогаем, если диспетчер уже выбрал другую руками.
  const selectDriver = (id: string | null) => {
    if (needsLoaders) {
      setLoaderIds((prev) => {
        let next = prev;
        if (driverId && next.includes(driverId)) next = next.filter((x) => x !== driverId);
        if (id && !next.includes(id)) next = [...next, id];
        return next;
      });
    }
    const fallbackVehicle = drivers.find((d) => d.id === id)?.default_vehicle_id ?? null;
    if (vehicleId === null || vehicleId === autoVehicleId.current) {
      autoVehicleId.current = fallbackVehicle;
      setVehicleId(fallbackVehicle);
    }
    setDriverId(id);
  };

  // Заказ создан из колонки/вкладки сотрудника — сразу назначаем его.
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current || !employeeId) return;
    const preset = employees.find((e) => e.id === employeeId);
    if (!preset) return;
    presetApplied.current = true;
    if (preset.role === 'driver') selectDriver(preset.id);
    else setLoaderIds([preset.id]);
  }, [employeeId, employees]);

  // «Копировать» заказ (раздел «график» — «записи копировать и переносить,
  // это касается и заказов»): форма новой заявки, предзаполненная данными
  // исходного заказа — дата и время тоже, диспетчер просто поправит их.
  const sourceOrderQuery = useOrder(duplicateFrom);
  const duplicateApplied = useRef(false);
  useEffect(() => {
    const src = sourceOrderQuery.data;
    if (duplicateApplied.current || !duplicateFrom || !src) return;
    duplicateApplied.current = true;

    setDate(new Date(src.scheduled_start));
    setStartTime(new Date(src.scheduled_start));
    setEndTime(new Date(src.scheduled_end));

    if (src.clients) setSelectedClient({ ...src.clients, notes: null, created_at: '' });

    const stops = [...src.order_stops].sort((a, b) => a.order_index - b.order_index);
    const primary = stops.filter((s) => s.is_primary);
    const extra = stops.filter((s) => !s.is_primary);
    setPickupAddress(primary.find((s) => s.type === 'pickup')?.address ?? '');
    setDropoffAddress(primary.find((s) => s.type === 'dropoff')?.address ?? '');
    setExtraStops(extra.map((s) => ({ key: s.id, type: s.type, address: s.address })));

    setCargoDescription(src.cargo_description ?? '');

    const srcDriver = src.order_crew.find((c) => c.role === 'driver');
    if (srcDriver) selectDriver(srcDriver.employee_id);
    setLoaderIds(src.order_crew.filter((c) => c.role === 'loader').map((c) => c.employee_id));
    // Машина исходного заказа — уже осознанный выбор, не машина водителя по
    // умолчанию, поэтому не считаем её "авто" (не заменится при смене водителя).
    setVehicleId(src.vehicle_id);
    autoVehicleId.current = null;

    setServiceIds(src.order_services.map((s) => s.services?.id).filter((id): id is string => Boolean(id)));
    autoPrice.current = '';
    setPriceText(src.actual_price != null ? String(src.actual_price) : '');
    setComment(src.comment ?? '');
  }, [duplicateFrom, sourceOrderQuery.data]);

  const { employee } = useSession();
  const canManage = canManageOrders(employee);
  const canViewContacts = canViewClientPhone(employee);
  const showAmount = canViewOrderAmount(employee);

  const clientsQuery = useClients(clientSearch);
  const busyQuery = useBusyEmployeeIds(scheduledStart, scheduledEnd);
  const busyIds = busyQuery.data ?? new Set<string>();
  const scheduleOnQuery = useScheduleDaysOn(toDateKey(scheduledStart));
  const scheduleOn = scheduleOnQuery.data ?? new Map<string, ScheduleDay>();
  const availability = new Map(
    employees.map((e) => [e.id, evaluateAvailability(e, busyIds, scheduleOn, scheduledStart, scheduledEnd)])
  );
  const createOrder = useCreateOrder();

  // Как в Bumpix: выбранные услуги задают длительность и подставляют сумму.
  const applyServices = (ids: string[]) => {
    setServiceIds(ids);
    setServicePickerOpen(false);
    const picked = ids.map((id) => services.find((s) => s.id === id)).filter(Boolean);
    const minutes = picked.reduce((sum, s) => sum + (s?.base_duration_minutes ?? 0), 0);
    const price = picked.reduce((sum, s) => sum + Number(s?.base_price ?? 0), 0);
    if (minutes > 0) setEndTime(new Date(startTime.getTime() + minutes * 60000));
    if (priceText.trim() === '' || priceText === autoPrice.current) {
      const next = price > 0 ? String(price) : '';
      autoPrice.current = next;
      setPriceText(next);
    }
  };

  const toggleLoader = (id: string) =>
    setLoaderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addExtraStop = (type: 'pickup' | 'dropoff') =>
    setExtraStops((prev) => [...prev, { key: `${Date.now()}`, type, address: '' }]);

  const timeValid = scheduledEnd > scheduledStart;
  const canSubmit =
    selectedClient !== null &&
    pickupAddress.trim().length > 0 &&
    dropoffAddress.trim().length > 0 &&
    timeValid &&
    !createOrder.isPending;

  const handleSubmit = async () => {
    setFormError(null);
    if (!selectedClient) {
      setFormError('Выберите или добавьте клиента: заказ без клиента создать нельзя.');
      return;
    }
    if (!canSubmit) {
      setFormError('Заполните адреса загрузки и выгрузки и проверьте, что окончание позже начала.');
      return;
    }

    const stops: CreateOrderStopInput[] = [
      { type: 'pickup', address: pickupAddress.trim(), order_index: 0, is_primary: true },
      { type: 'dropoff', address: dropoffAddress.trim(), order_index: 1, is_primary: true },
      ...extraStops
        .filter((s) => s.address.trim().length > 0)
        .map((s, i) => ({ type: s.type, address: s.address.trim(), order_index: 2 + i, is_primary: false })),
    ];

    const crew = [
      ...(driverId ? [{ employee_id: driverId, role: 'driver' as const }] : []),
      ...(needsLoaders ? loaderIds.map((id) => ({ employee_id: id, role: 'loader' as const })) : []),
    ];

    try {
      await createOrder.mutateAsync({
        client_id: selectedClient.id,
        cargo_description: cargoDescription,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        actual_price: priceText.trim() ? Number(priceText.trim().replace(',', '.')) : null,
        comment,
        stops,
        crew,
        services: serviceIds.map((id) => ({ service_id: id, qty: 1 })),
        vehicle_id: vehicleId,
      });
      router.back();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось создать заказ');
    }
  };

  if (!canManage) {
    return (
      <View style={styles.noAccess}>
        <Text variant="bodyMedium">Недостаточно прав для создания заказа.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DismissKeyboardView>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {duplicateFrom && (
          <HelperText type="info" visible>
            {sourceOrderQuery.isLoading ? 'Загружаем исходный заказ…' : 'Копия заказа — проверьте дату и данные перед сохранением.'}
          </HelperText>
        )}
        <FormSection title="Дата и время">
          <DateTimeField label="Дата" value={date} mode="date" onChange={setDate} />
          <View style={styles.row}>
            <DateTimeField label="Начало" value={startTime} mode="time" onChange={setStartTime} />
            <DateTimeField label="Окончание" value={endTime} mode="time" onChange={setEndTime} />
          </View>
          {!timeValid && <HelperText type="error">Окончание должно быть позже начала</HelperText>}
        </FormSection>

        <FormSection title="Клиент *">
          {selectedClient ? (
            <Surface style={styles.selected} elevation={1}>
              <List.Item
                title={selectedClient.name}
                description={
                  selectedClient.discount_percent
                    ? `Скидка ${selectedClient.discount_percent}%`
                    : (canViewContacts ? selectedClient.phone : null) ?? undefined
                }
                right={() => <Button onPress={() => setSelectedClient(null)}>Изменить</Button>}
              />
            </Surface>
          ) : (
            <>
              <Text variant="bodySmall" style={styles.muted}>
                Заказ без клиента создать нельзя: выберите клиента или добавьте нового.
              </Text>
              <Searchbar placeholder="Поиск клиента по имени" value={clientSearch} onChangeText={setClientSearch} />
              {clientsQuery.isError && (
                <HelperText type="error">{`Ошибка загрузки клиентов: ${clientsQuery.error.message}`}</HelperText>
              )}
              {clientsQuery.data?.map((client) => (
                <List.Item
                  key={client.id}
                  title={client.name}
                  description={
                    client.discount_percent
                      ? `Скидка ${client.discount_percent}%`
                      : (canViewContacts ? client.phone : null) ?? undefined
                  }
                  left={(props) => <List.Icon {...props} icon="account-outline" />}
                  onPress={() => setSelectedClient(client)}
                />
              ))}
              <Button mode="outlined" icon="account-plus" onPress={newClient.start}>
                Добавить клиента
              </Button>
            </>
          )}
        </FormSection>

        {newClient.open && <ClientDialog client={null} onClose={newClient.close} onSaved={setSelectedClient} />}

        <FormSection title="Услуги">
          {selectedServices.map((service) => (
            <View key={service.id} style={styles.serviceRow}>
              <View style={[styles.serviceBar, { backgroundColor: service.color }]} />
              <View style={styles.flex}>
                <Text variant="bodyLarge">{service.name}</Text>
                <Text variant="bodySmall" style={styles.muted}>
                  {formatServiceMeta(service)}
                </Text>
              </View>
            </View>
          ))}
          <Button
            mode="outlined"
            icon={selectedServices.length ? 'pencil' : 'plus'}
            onPress={() => setServicePickerOpen(true)}
          >
            {selectedServices.length ? 'Изменить услуги' : 'Выбрать услуги'}
          </Button>
          {servicePickerOpen && (
            <ServicePicker
              visible
              services={services}
              selectedIds={serviceIds}
              loadError={servicesQuery.error?.message}
              onDismiss={() => setServicePickerOpen(false)}
              onSave={applyServices}
            />
          )}
        </FormSection>

        <FormSection title="Точки маршрута">
          <TextInput
            mode="outlined"
            label="Адрес загрузки"
            accessibilityLabel="Адрес загрузки"
            left={<TextInput.Icon icon="package-up" />}
            value={pickupAddress}
            onChangeText={setPickupAddress}
          />
          <TextInput
            mode="outlined"
            label="Адрес выгрузки"
            accessibilityLabel="Адрес выгрузки"
            left={<TextInput.Icon icon="package-down" />}
            value={dropoffAddress}
            onChangeText={setDropoffAddress}
          />
          {extraStops.map((stop) => (
            <View key={stop.key} style={styles.row}>
              <TextInput
                mode="outlined"
                dense
                style={styles.flex}
                label={stop.type === 'pickup' ? 'Доп. точка загрузки' : 'Доп. точка выгрузки'}
                accessibilityLabel={stop.type === 'pickup' ? 'Доп. точка загрузки' : 'Доп. точка выгрузки'}
                value={stop.address}
                onChangeText={(text) =>
                  setExtraStops((prev) => prev.map((s) => (s.key === stop.key ? { ...s, address: text } : s)))
                }
              />
              <IconButton
                icon="close"
                accessibilityLabel="Удалить точку"
                onPress={() => setExtraStops((prev) => prev.filter((s) => s.key !== stop.key))}
              />
            </View>
          ))}
          <View style={styles.row}>
            <Button compact icon="plus" onPress={() => addExtraStop('pickup')}>
              Точка загрузки
            </Button>
            <Button compact icon="plus" onPress={() => addExtraStop('dropoff')}>
              Точка выгрузки
            </Button>
          </View>
        </FormSection>

        <FormSection title="Детали груза">
          <TextInput
            mode="outlined"
            multiline
            placeholder="Например: диван, два шкафа, 20 коробок"
            value={cargoDescription}
            onChangeText={setCargoDescription}
          />
        </FormSection>

        <FormSection title="Водитель">
          {(busyQuery.isLoading || scheduleOnQuery.isLoading) && <ActivityIndicator size="small" />}
          {busyQuery.isError && (
            <HelperText type="error">{`Ошибка проверки занятости: ${busyQuery.error.message}`}</HelperText>
          )}
          {drivers.length === 0 && <Text variant="bodySmall">Нет ни одного водителя</Text>}
          <Text variant="bodySmall" style={styles.muted}>
            Точка у имени: зелёная — свободен, жёлтая — другой заказ, красная — выходной или не по графику.
          </Text>
          <View style={styles.chips}>
            {sortByAvailability(drivers, availability).map((driver) => {
              const { tier, suffix } = availability.get(driver.id) ?? { tier: 'available' as const, suffix: '' };
              return (
                <Chip
                  key={driver.id}
                  icon={dotIcon(TIER_COLOR[tier])}
                  selected={driverId === driver.id}
                  showSelectedOverlay
                  onPress={() => selectDriver(driverId === driver.id ? null : driver.id)}
                >
                  {`${driver.name}${suffix}`}
                </Chip>
              );
            })}
          </View>
          {driverId && (
            <>
              <Text variant="labelMedium" style={styles.subLabel}>
                Машина
              </Text>
              {vehiclesQuery.data?.length === 0 ? (
                <Text variant="bodySmall" style={styles.muted}>
                  Автопарк пуст — добавьте машину на вкладке «Автопарк»
                </Text>
              ) : (
                <View style={styles.chips}>
                  {(vehiclesQuery.data ?? []).map((vehicle) => (
                    <Chip
                      key={vehicle.id}
                      selected={vehicleId === vehicle.id}
                      showSelectedOverlay
                      onPress={() => setVehicleId(vehicleId === vehicle.id ? null : vehicle.id)}
                    >
                      {`${vehicle.name} · ${vehicle.plate}`}
                    </Chip>
                  ))}
                </View>
              )}
            </>
          )}
        </FormSection>

        {needsLoaders && (
          <FormSection title="Грузчики">
            {loaderCandidates.length === 0 && <Text variant="bodySmall">Нет ни одного грузчика</Text>}
            <View style={styles.chips}>
              {sortByAvailability(loaderCandidates, availability).map((person) => {
                const { tier, suffix } = availability.get(person.id) ?? { tier: 'available' as const, suffix: '' };
                const isDriver = person.id === driverId;
                return (
                  <Chip
                    key={person.id}
                    icon={dotIcon(TIER_COLOR[tier])}
                    selected={loaderIds.includes(person.id)}
                    showSelectedOverlay
                    disabled={tier === 'busy'}
                    onPress={() => toggleLoader(person.id)}
                  >
                    {`${person.name}${isDriver ? ' (водитель)' : ''}${suffix}`}
                  </Chip>
                );
              })}
            </View>
          </FormSection>
        )}

        {showAmount && (
          <FormSection title="Сумма (вручную)">
            <TextInput
              mode="outlined"
              placeholder="Например: 14500"
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="numeric"
              right={<TextInput.Affix text="₽" />}
            />
            {selectedClient?.discount_percent ? (
              <HelperText type="info">Скидка клиента {selectedClient.discount_percent}%</HelperText>
            ) : null}
          </FormSection>
        )}

        <FormSection title="Комментарий">
          <TextInput mode="outlined" multiline value={comment} onChangeText={setComment} />
        </FormSection>

        {formError && <HelperText type="error">{formError}</HelperText>}
        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={createOrder.isPending}
          disabled={createOrder.isPending}
          style={styles.submit}
        >
          Создать заказ
        </Button>
      </ScrollView>
      </DismissKeyboardView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  selected: {
    borderRadius: 12,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serviceBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  muted: {
    opacity: 0.6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subLabel: {
    marginTop: 8,
    marginBottom: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  submit: {
    marginTop: 8,
  },
  noAccess: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
