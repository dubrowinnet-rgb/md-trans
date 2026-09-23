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
import { useBusyEmployeeIds, useCreateOrder, type CreateOrderStopInput } from '../../api/orders';
import { useServices } from '../../api/services';
import { ServicePicker, formatServiceMeta } from '../../components/form/ServicePicker';
import { DateTimeField } from '../../components/form/DateTimeField';
import { FormSection } from '../../components/form/FormSection';
import { useSession } from '../../providers/SessionProvider';
import { canManageOrders, canViewClientPhone } from '../../lib/permissions';

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

// Создание заказа: клиент, точки маршрута (2 основные + дополнительные),
// экипаж с проверкой занятости по времени, сумма вручную (разделы 4 и 9.1 ТЗ).
export default function NewOrderScreen() {
  const { start, employeeId } = useLocalSearchParams<{ start?: string; employeeId?: string }>();
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

  // Заказ создан из колонки/вкладки сотрудника — сразу назначаем его.
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current || !employeeId) return;
    const preset = employees.find((e) => e.id === employeeId);
    if (!preset) return;
    presetApplied.current = true;
    if (preset.role === 'driver') setDriverId(preset.id);
    else setLoaderIds([preset.id]);
  }, [employeeId, employees]);

  const { employee } = useSession();
  const canManage = canManageOrders(employee);
  const canViewContacts = canViewClientPhone(employee);

  const clientsQuery = useClients(clientSearch);
  const busyQuery = useBusyEmployeeIds(scheduledStart, scheduledEnd);
  const busyIds = busyQuery.data ?? new Set<string>();
  const createOrder = useCreateOrder();
  const servicesQuery = useServices();
  const services = servicesQuery.data ?? [];
  const selectedServices = serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

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
      ...loaderIds.map((id) => ({ employee_id: id, role: 'loader' as const })),
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
                    : selectedClient.phone ?? undefined
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
              <Button mode="outlined" icon="account-plus" onPress={newClient.start} loading={newClient.picking}>
                Добавить клиента
              </Button>
            </>
          )}
        </FormSection>

        {newClient.draft && (
          <ClientDialog
            client={null}
            initial={newClient.draft}
            notice={newClient.notice}
            onClose={newClient.close}
            onSaved={setSelectedClient}
          />
        )}

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
          {busyQuery.isLoading && <ActivityIndicator size="small" />}
          {busyQuery.isError && (
            <HelperText type="error">{`Ошибка проверки занятости: ${busyQuery.error.message}`}</HelperText>
          )}
          {drivers.length === 0 && <Text variant="bodySmall">Нет ни одного водителя</Text>}
          <View style={styles.chips}>
            {drivers.map((driver) => {
              const busy = busyIds.has(driver.id);
              return (
                <Chip
                  key={driver.id}
                  icon={busy ? 'clock-alert-outline' : 'truck'}
                  selected={driverId === driver.id}
                  showSelectedOverlay
                  disabled={busy}
                  onPress={() => setDriverId(driverId === driver.id ? null : driver.id)}
                >
                  {busy ? `${driver.name} · занят` : driver.name}
                </Chip>
              );
            })}
          </View>
        </FormSection>

        <FormSection title="Грузчики">
          {loaders.length === 0 && <Text variant="bodySmall">Нет ни одного грузчика</Text>}
          <View style={styles.chips}>
            {loaders.map((loader) => {
              const busy = busyIds.has(loader.id);
              return (
                <Chip
                  key={loader.id}
                  icon={busy ? 'clock-alert-outline' : 'account-hard-hat'}
                  selected={loaderIds.includes(loader.id)}
                  showSelectedOverlay
                  disabled={busy}
                  onPress={() => toggleLoader(loader.id)}
                >
                  {busy ? `${loader.name} · занят` : loader.name}
                </Chip>
              );
            })}
          </View>
        </FormSection>

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
