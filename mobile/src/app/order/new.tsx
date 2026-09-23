import { useMemo, useState } from 'react';
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
import { useClients, useCreateClient, type Client } from '../../api/clients';
import { useBusyEmployeeIds, useCreateOrder, type CreateOrderStopInput } from '../../api/orders';
import { DateTimeField } from '../../components/form/DateTimeField';
import { FormSection } from '../../components/form/FormSection';

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
  const { start } = useLocalSearchParams<{ start?: string }>();
  const slotStart = start ? new Date(start) : null;

  const [date, setDate] = useState(() => slotStart ?? new Date());
  const [startTime, setStartTime] = useState(() => slotStart ?? atHour(new Date(), 9));
  const [endTime, setEndTime] = useState(() =>
    slotStart ? new Date(slotStart.getTime() + 2 * 60 * 60 * 1000) : atHour(new Date(), 11)
  );

  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [extraStops, setExtraStops] = useState<ExtraStop[]>([]);

  const [cargoDescription, setCargoDescription] = useState('');
  const [driverId, setDriverId] = useState<string | null>(null);
  const [loaderIds, setLoaderIds] = useState<string[]>([]);
  const [priceText, setPriceText] = useState('');
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const scheduledStart = useMemo(() => combine(date, startTime), [date, startTime]);
  const scheduledEnd = useMemo(() => combine(date, endTime), [date, endTime]);

  const employees = useEmployees().data ?? [];
  const drivers = employees.filter((e) => e.role === 'driver');
  const loaders = employees.filter((e) => e.role === 'loader');

  const clientsQuery = useClients(clientSearch);
  const createClient = useCreateClient();
  const busyQuery = useBusyEmployeeIds(scheduledStart, scheduledEnd);
  const busyIds = busyQuery.data ?? new Set<string>();
  const createOrder = useCreateOrder();

  const toggleLoader = (id: string) =>
    setLoaderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addExtraStop = (type: 'pickup' | 'dropoff') =>
    setExtraStops((prev) => [...prev, { key: `${Date.now()}`, type, address: '' }]);

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    try {
      const client = await createClient.mutateAsync({
        name: newClientName.trim(),
        phone: newClientPhone.trim() || undefined,
      });
      setSelectedClient(client);
      setNewClientName('');
      setNewClientPhone('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось добавить клиента');
    }
  };

  const timeValid = scheduledEnd > scheduledStart;
  const canSubmit =
    pickupAddress.trim().length > 0 &&
    dropoffAddress.trim().length > 0 &&
    timeValid &&
    !createOrder.isPending;

  const handleSubmit = async () => {
    setFormError(null);
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
        client_id: selectedClient?.id ?? null,
        cargo_description: cargoDescription,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        actual_price: priceText.trim() ? Number(priceText.trim().replace(',', '.')) : null,
        comment,
        stops,
        crew,
      });
      router.back();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось создать заказ');
    }
  };

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

        <FormSection title="Клиент">
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
              <Searchbar placeholder="Поиск клиента по имени" value={clientSearch} onChangeText={setClientSearch} />
              {clientsQuery.isError && (
                <HelperText type="error">{`Ошибка загрузки клиентов: ${clientsQuery.error.message}`}</HelperText>
              )}
              {clientsQuery.data?.map((client) => (
                <List.Item
                  key={client.id}
                  title={client.name}
                  description={client.discount_percent ? `Скидка ${client.discount_percent}%` : client.phone ?? undefined}
                  left={(props) => <List.Icon {...props} icon="account-outline" />}
                  onPress={() => setSelectedClient(client)}
                />
              ))}
              <Text variant="labelMedium">Новый клиент</Text>
              <TextInput mode="outlined" dense label="Имя" value={newClientName} onChangeText={setNewClientName} />
              <TextInput
                mode="outlined"
                dense
                label="Телефон"
                value={newClientPhone}
                onChangeText={setNewClientPhone}
                keyboardType="phone-pad"
              />
              <Button
                mode="outlined"
                icon="account-plus"
                onPress={handleCreateClient}
                loading={createClient.isPending}
                disabled={!newClientName.trim() || createClient.isPending}
              >
                Добавить клиента
              </Button>
            </>
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
          disabled={!canSubmit}
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  submit: {
    marginTop: 8,
  },
});
