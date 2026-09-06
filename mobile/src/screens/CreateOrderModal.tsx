import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Employee } from '../api/employees';
import { useClients, useCreateClient } from '../api/clients';
import { useBusyEmployeeIds, useCreateOrder, type CreateOrderStopInput } from '../api/orders';
import { DateTimeField } from '../components/DateTimeField';

interface ExtraStop {
  key: string;
  type: 'pickup' | 'dropoff';
  address: string;
}

function combine(date: Date, time: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes());
}

export function CreateOrderModal({
  employees,
  defaultDate,
  onClose,
}: {
  employees: Employee[];
  defaultDate: Date;
  onClose: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(() => {
    const d = new Date(defaultDate);
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [endTime, setEndTime] = useState(() => {
    const d = new Date(defaultDate);
    d.setHours(11, 0, 0, 0);
    return d;
  });

  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  const [pickupAddress, setPickupAddress] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [extraStops, setExtraStops] = useState<ExtraStop[]>([]);

  const [cargoDescription, setCargoDescription] = useState('');
  const [driverId, setDriverId] = useState<string | null>(null);
  const [loaderIds, setLoaderIds] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [priceText, setPriceText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const scheduledStart = useMemo(() => combine(date, startTime), [date, startTime]);
  const scheduledEnd = useMemo(() => combine(date, endTime), [date, endTime]);

  const clientsQuery = useClients(clientSearch);
  const createClient = useCreateClient();
  const busyQuery = useBusyEmployeeIds(scheduledStart, scheduledEnd);
  const busyIds = busyQuery.data ?? new Set<string>();
  const createOrder = useCreateOrder();

  const drivers = employees.filter((e) => e.role === 'driver');
  const loaders = employees.filter((e) => e.role === 'loader');

  const toggleLoader = (id: string) => {
    setLoaderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const addExtraStop = (type: 'pickup' | 'dropoff') => {
    setExtraStops((prev) => [...prev, { key: `${Date.now()}`, type, address: '' }]);
  };

  const updateExtraStop = (key: string, address: string) => {
    setExtraStops((prev) => prev.map((s) => (s.key === key ? { ...s, address } : s)));
  };

  const removeExtraStop = (key: string) => {
    setExtraStops((prev) => prev.filter((s) => s.key !== key));
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    const client = await createClient.mutateAsync({
      name: newClientName.trim(),
      phone: newClientPhone.trim() || undefined,
    });
    setSelectedClientId(client.id);
    setNewClientName('');
    setNewClientPhone('');
  };

  const canSubmit =
    pickupAddress.trim().length > 0 &&
    dropoffAddress.trim().length > 0 &&
    scheduledEnd > scheduledStart &&
    !createOrder.isPending;

  const handleSubmit = async () => {
    setFormError(null);
    if (!canSubmit) {
      setFormError('Заполните точки маршрута и убедитесь, что время окончания позже начала.');
      return;
    }

    const stops: CreateOrderStopInput[] = [
      { type: 'pickup', address: pickupAddress.trim(), order_index: 0, is_primary: true },
      { type: 'dropoff', address: dropoffAddress.trim(), order_index: 1, is_primary: true },
      ...extraStops
        .filter((s) => s.address.trim().length > 0)
        .map((s, i) => ({
          type: s.type,
          address: s.address.trim(),
          order_index: 2 + i,
          is_primary: false,
        })),
    ];

    const crew = [
      ...(driverId ? [{ employee_id: driverId, role: 'driver' as const }] : []),
      ...loaderIds.map((id) => ({ employee_id: id, role: 'loader' as const })),
    ];

    try {
      await createOrder.mutateAsync({
        client_id: selectedClientId,
        cargo_description: cargoDescription,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        actual_price: priceText.trim() ? Number(priceText.trim().replace(',', '.')) : null,
        comment,
        stops,
        crew,
      });
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось создать заказ');
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Новый заказ</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.close}>Отмена</Text>
            </Pressable>
          </View>

          <Section title="Дата и время">
            <View style={styles.row}>
              <DateTimeField label="Дата" value={date} mode="date" onChange={setDate} />
            </View>
            <View style={styles.row}>
              <DateTimeField label="Начало" value={startTime} mode="time" onChange={setStartTime} />
              <DateTimeField label="Окончание" value={endTime} mode="time" onChange={setEndTime} />
            </View>
          </Section>

          <Section title="Клиент">
            {selectedClientId ? (
              <View style={styles.selectedRow}>
                <Text style={styles.text}>
                  {clientsQuery.data?.find((c) => c.id === selectedClientId)?.name ?? 'Клиент выбран'}
                </Text>
                <Pressable onPress={() => setSelectedClientId(null)}>
                  <Text style={styles.link}>Изменить</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Поиск клиента по имени"
                  value={clientSearch}
                  onChangeText={setClientSearch}
                />
                {clientsQuery.isError && (
                  <Text style={styles.error}>Ошибка загрузки клиентов: {clientsQuery.error.message}</Text>
                )}
                {clientsQuery.data?.map((client) => (
                  <Pressable
                    key={client.id}
                    style={styles.optionRow}
                    onPress={() => setSelectedClientId(client.id)}
                  >
                    <Text style={styles.text}>{client.name}</Text>
                    {!!client.discount_percent && (
                      <Text style={styles.textMuted}>скидка {client.discount_percent}%</Text>
                    )}
                  </Pressable>
                ))}
                <View style={styles.newClientBox}>
                  <Text style={styles.textMuted}>Новый клиент</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Имя"
                    value={newClientName}
                    onChangeText={setNewClientName}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Телефон"
                    value={newClientPhone}
                    onChangeText={setNewClientPhone}
                    keyboardType="phone-pad"
                  />
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={handleCreateClient}
                    disabled={!newClientName.trim() || createClient.isPending}
                  >
                    <Text style={styles.secondaryButtonText}>Добавить клиента</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Section>

          <Section title="Точки маршрута">
            <TextInput
              style={styles.input}
              placeholder="Адрес загрузки"
              value={pickupAddress}
              onChangeText={setPickupAddress}
            />
            <TextInput
              style={styles.input}
              placeholder="Адрес выгрузки"
              value={dropoffAddress}
              onChangeText={setDropoffAddress}
            />
            {extraStops.map((stop) => (
              <View key={stop.key} style={styles.row}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  placeholder={stop.type === 'pickup' ? 'Доп. точка загрузки' : 'Доп. точка выгрузки'}
                  value={stop.address}
                  onChangeText={(text) => updateExtraStop(stop.key, text)}
                />
                <Pressable onPress={() => removeExtraStop(stop.key)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => addExtraStop('pickup')}>
                <Text style={styles.secondaryButtonText}>+ точка загрузки</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => addExtraStop('dropoff')}>
                <Text style={styles.secondaryButtonText}>+ точка выгрузки</Text>
              </Pressable>
            </View>
          </Section>

          <Section title="Детали груза">
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Например: диван, два шкафа, 20 коробок"
              value={cargoDescription}
              onChangeText={setCargoDescription}
              multiline
            />
          </Section>

          <Section title="Водитель">
            {busyQuery.isLoading && <ActivityIndicator size="small" />}
            {busyQuery.isError && (
              <Text style={styles.error}>Ошибка проверки занятости: {busyQuery.error.message}</Text>
            )}
            {drivers.length === 0 && <Text style={styles.textMuted}>Нет ни одного водителя</Text>}
            {drivers.map((driver) => {
              const busy = busyIds.has(driver.id);
              const selected = driverId === driver.id;
              return (
                <Pressable
                  key={driver.id}
                  disabled={busy}
                  onPress={() => setDriverId(selected ? null : driver.id)}
                  style={[styles.optionRow, selected && styles.optionRowSelected, busy && styles.optionRowDisabled]}
                >
                  <Text style={[styles.text, busy && styles.textMuted]}>{driver.name}</Text>
                  {busy && <Text style={styles.busyLabel}>занят в это время</Text>}
                </Pressable>
              );
            })}
          </Section>

          <Section title="Грузчики">
            {loaders.length === 0 && <Text style={styles.textMuted}>Нет ни одного грузчика</Text>}
            {loaders.map((loader) => {
              const busy = busyIds.has(loader.id);
              const selected = loaderIds.includes(loader.id);
              return (
                <Pressable
                  key={loader.id}
                  disabled={busy}
                  onPress={() => toggleLoader(loader.id)}
                  style={[styles.optionRow, selected && styles.optionRowSelected, busy && styles.optionRowDisabled]}
                >
                  <Text style={[styles.text, busy && styles.textMuted]}>{loader.name}</Text>
                  {busy && <Text style={styles.busyLabel}>занят в это время</Text>}
                </Pressable>
              );
            })}
          </Section>

          <Section title="Сумма (вручную)">
            <TextInput
              style={styles.input}
              placeholder="Например: 14500"
              value={priceText}
              onChangeText={setPriceText}
              keyboardType="numeric"
            />
          </Section>

          <Section title="Комментарий">
            <TextInput
              style={[styles.input, styles.multiline]}
              value={comment}
              onChangeText={setComment}
              multiline
            />
          </Section>

          {formError && <Text style={styles.error}>{formError}</Text>}

          <Pressable
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {createOrder.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Создать заказ</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
    paddingTop: 48,
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  close: {
    color: '#c0392b',
    fontSize: 14,
  },
  section: {
    marginBottom: 18,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multiline: {
    minHeight: 60,
    textAlignVertical: 'top',
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
  },
  selectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  optionRowSelected: {
    borderColor: '#5b21b6',
    backgroundColor: '#f3e8ff',
  },
  optionRowDisabled: {
    backgroundColor: '#f9fafb',
    opacity: 0.6,
  },
  busyLabel: {
    fontSize: 11,
    color: '#c0392b',
  },
  newClientBox: {
    gap: 8,
    marginTop: 4,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#5b21b6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#5b21b6',
    fontSize: 13,
    fontWeight: '600',
  },
  removeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    fontSize: 20,
    color: '#c0392b',
  },
  error: {
    color: '#c0392b',
    fontSize: 13,
    marginBottom: 8,
  },
  submitButton: {
    backgroundColor: '#5b21b6',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
