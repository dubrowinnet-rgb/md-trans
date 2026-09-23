'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Checkbox,
  Grid,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { TimeField } from '@/components/common/TimeField';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { IconPlus, IconUserPlus, IconX } from '@tabler/icons-react';
import {
  orderToInput,
  useBusyEmployeeIds,
  useCreateOrder,
  useUpdateOrder,
  type OrderInput,
  type OrderStopInput,
  type OrderWithDetails,
} from '@/api/orders';
import { useEmployees, type Employee } from '@/api/employees';
import { useClient, useClientSearch, type Client } from '@/api/clients';
import { useServices } from '@/api/services';
import { useVehicles } from '@/api/vehicles';
import { useDaysOffOn } from '@/api/schedule';
import { combineDateTime, dayjs, toDateKey } from '@/lib/dates';
import { useSession } from '@/providers/SessionProvider';
import { canViewClientPhone } from '@/lib/permissions';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { AvailabilityDot, availabilityTier, sortByAvailability, TIER_SUFFIX } from './availability';

export interface OrderFormPreset {
  start?: Date;
  end?: Date;
  employeeId?: string;
  clientId?: string;
}

interface StopDraft {
  key: string;
  type: 'pickup' | 'dropoff';
  address: string;
}

let stopKey = 0;
const nextKey = () => `s${++stopKey}`;

// Форма заказа на большой экран: слева — когда, кто клиент, что и куда
// везём; справа — бригада и машина с доступностью на выбранное время.
// Одна форма и для нового заказа, и для правки существующего.
export function OrderFormModal({
  order,
  preset,
  onClose,
  onSaved,
}: {
  order: OrderWithDetails | null;
  preset: OrderFormPreset;
  onClose: () => void;
  onSaved: (orderId: string) => void;
}) {
  const initial: OrderInput | null = order ? orderToInput(order) : null;
  const presetStart = preset.start ?? dayjs().add(1, 'day').hour(9).minute(0).second(0).toDate();
  const presetEnd = preset.end ?? dayjs(presetStart).add(2, 'hour').toDate();
  const startInit = initial?.scheduled_start ?? presetStart;
  const endInit = initial?.scheduled_end ?? presetEnd;

  const [dateKey, setDateKey] = useState<string>(toDateKey(startInit));
  const [startTime, setStartTime] = useState(dayjs(startInit).format('HH:mm'));
  const [endTime, setEndTime] = useState(dayjs(endInit).format('HH:mm'));
  const [clientId, setClientId] = useState<string | null>(initial?.client_id || preset.clientId || null);
  const [clientSearch, setClientSearch] = useState('');
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [serviceIds, setServiceIds] = useState<string[]>(initial?.service_ids ?? []);
  const primaryPickup = initial?.stops.find((s) => s.is_primary && s.type === 'pickup');
  const primaryDropoff = initial?.stops.find((s) => s.is_primary && s.type === 'dropoff');
  const [pickup, setPickup] = useState(primaryPickup?.address ?? '');
  const [dropoff, setDropoff] = useState(primaryDropoff?.address ?? '');
  const [extraStops, setExtraStops] = useState<StopDraft[]>(
    (initial?.stops ?? [])
      .filter((s) => !s.is_primary)
      .map((s) => ({ key: nextKey(), type: s.type, address: s.address }))
  );
  const [cargo, setCargo] = useState(initial?.cargo_description ?? '');
  const [price, setPrice] = useState<number | string>(initial?.actual_price ?? '');
  const autoPrice = useRef<number | string>('');
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [driverId, setDriverId] = useState<string | null>(
    initial?.crew.find((c) => c.role === 'driver')?.employee_id ?? null
  );
  const [loaderIds, setLoaderIds] = useState<string[]>(
    initial?.crew.filter((c) => c.role === 'loader').map((c) => c.employee_id) ?? []
  );
  const [vehicleId, setVehicleId] = useState<string | null>(initial?.vehicle_id ?? null);
  const autoVehicleId = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { employee } = useSession();
  const showPhones = canViewClientPhone(employee);
  const employees = useEmployees().data ?? [];
  const drivers = employees.filter((e) => e.role === 'driver');
  const loaders = employees.filter((e) => e.role === 'loader');
  const services = useServices().data ?? [];
  const vehicles = useVehicles().data ?? [];
  const clientsQuery = useClientSearch(clientSearch);
  const selectedClientQuery = useClient(clientId);
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const saving = createOrder.isPending || updateOrder.isPending;

  const scheduledStart = useMemo(() => combineDateTime(dateKey, startTime), [dateKey, startTime]);
  const scheduledEnd = useMemo(() => combineDateTime(dateKey, endTime), [dateKey, endTime]);
  const timeValid = scheduledEnd > scheduledStart;
  const busyIds = useBusyEmployeeIds(scheduledStart, scheduledEnd, order?.id).data ?? new Set<string>();
  const dayOffIds = useDaysOffOn(dateKey).data ?? new Set<string>();

  // Сотрудник из колонки/фильтра календаря — сразу в бригаду.
  const presetApplied = useRef(false);
  useEffect(() => {
    if (order || presetApplied.current || !preset.employeeId) return;
    const person = employees.find((e) => e.id === preset.employeeId);
    if (!person) return;
    presetApplied.current = true;
    if (person.role === 'driver') selectDriver(person.id);
    else setLoaderIds([person.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, preset.employeeId, order]);

  // Как в мобильном приложении: выбранный водитель сразу числится и
  // грузчиком (можно снять), и подставляется его машина по умолчанию,
  // если диспетчер не выбрал другую руками.
  function selectDriver(id: string | null) {
    setLoaderIds((prev) => {
      let next = prev;
      if (driverId && next.includes(driverId)) next = next.filter((x) => x !== driverId);
      if (id && !next.includes(id)) next = [...next, id];
      return next;
    });
    const fallback = drivers.find((d) => d.id === id)?.default_vehicle_id ?? null;
    if (vehicleId === null || vehicleId === autoVehicleId.current) {
      autoVehicleId.current = fallback;
      setVehicleId(fallback);
    }
    setDriverId(id);
  }

  const applyServices = (ids: string[]) => {
    setServiceIds(ids);
    const picked = ids.map((id) => services.find((s) => s.id === id)).filter(Boolean);
    const minutes = picked.reduce((sum, s) => sum + (s?.base_duration_minutes ?? 0), 0);
    const total = picked.reduce((sum, s) => sum + Number(s?.base_price ?? 0), 0);
    if (minutes > 0) setEndTime(dayjs(scheduledStart).add(minutes, 'minute').format('HH:mm'));
    if (price === '' || price === autoPrice.current) {
      const next = total > 0 ? total : '';
      autoPrice.current = next;
      setPrice(next);
    }
  };

  const clientOptions = useMemo(() => {
    const list: Client[] = [...(clientsQuery.data ?? [])];
    const selected = selectedClientQuery.data;
    if (selected && !list.some((c) => c.id === selected.id)) list.unshift(selected);
    return list.map((c) => ({
      value: c.id,
      label: showPhones && c.phone ? `${c.name} · ${c.phone}` : c.name,
    }));
  }, [clientsQuery.data, selectedClientQuery.data, showPhones]);

  const loaderCandidates: Employee[] = useMemo(() => {
    const driver = drivers.find((d) => d.id === driverId);
    return driver ? [driver, ...loaders] : loaders;
  }, [drivers, loaders, driverId]);

  const handleSubmit = async () => {
    setError(null);
    if (!clientId) return setError('Выберите или добавьте клиента: заказ без клиента создать нельзя.');
    if (!pickup.trim() || !dropoff.trim()) return setError('Заполните адреса загрузки и выгрузки.');
    if (!timeValid) return setError('Окончание должно быть позже начала.');

    const stops: OrderStopInput[] = [
      { type: 'pickup', address: pickup.trim(), order_index: 0, is_primary: true },
      { type: 'dropoff', address: dropoff.trim(), order_index: 1, is_primary: true },
      ...extraStops
        .filter((s) => s.address.trim())
        .map((s, i) => ({ type: s.type, address: s.address.trim(), order_index: 2 + i, is_primary: false })),
    ];
    const input: OrderInput = {
      client_id: clientId,
      cargo_description: cargo,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      actual_price: price === '' ? null : Number(price),
      comment,
      stops,
      crew: [
        ...(driverId ? [{ employee_id: driverId, role: 'driver' as const }] : []),
        ...loaderIds.map((id) => ({ employee_id: id, role: 'loader' as const })),
      ],
      service_ids: serviceIds,
      vehicle_id: driverId ? vehicleId : null,
    };
    try {
      if (order) {
        await updateOrder.mutateAsync({ id: order.id, input, previous: order });
        notifications.show({ message: 'Заказ сохранён', color: 'green' });
        onSaved(order.id);
      } else {
        const id = await createOrder.mutateAsync(input);
        notifications.show({ message: 'Заказ создан', color: 'green' });
        onSaved(id);
      }
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить заказ'));
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      size={1100}
      zIndex={400}
      title={<Title order={4}>{order ? 'Изменить заказ' : 'Новый заказ'}</Title>}
    >
      <Grid gap="xl">
        <Grid.Col span={7}>
          <Stack gap="sm">
            <Group grow align="flex-start">
              <DatePickerInput
                label="Дата"
                value={dateKey}
                onChange={(v) => v && setDateKey(v)}
                valueFormat="D MMMM YYYY, dd"
                popoverProps={{ zIndex: 500 }}
              />
              <TimeField label="Начало" value={startTime} onChange={setStartTime} />
              <TimeField
                label="Окончание"
                value={endTime}
                onChange={setEndTime}
                error={!timeValid ? 'Позже начала' : undefined}
              />
            </Group>

            <Group align="flex-end" gap="xs" wrap="nowrap">
              <Select
                style={{ flex: 1 }}
                label="Клиент *"
                placeholder="Начните вводить имя или телефон"
                searchable
                data={clientOptions}
                value={clientId}
                onChange={setClientId}
                searchValue={clientSearch}
                onSearchChange={setClientSearch}
                filter={({ options }) => options}
                nothingFoundMessage="Не найдено — добавьте нового клиента"
                comboboxProps={{ zIndex: 500 }}
                clearable
              />
              <Button variant="light" leftSection={<IconUserPlus size={16} />} onClick={() => setNewClientOpen(true)}>
                Новый клиент
              </Button>
            </Group>
            {selectedClientQuery.data?.discount_percent ? (
              <Text size="xs" c="violet">
                Скидка клиента {selectedClientQuery.data.discount_percent}%
              </Text>
            ) : null}

            <MultiSelect
              label="Услуги"
              placeholder={serviceIds.length ? undefined : 'Выберите услуги'}
              data={services.map((s) => ({ value: s.id, label: s.name }))}
              value={serviceIds}
              onChange={applyServices}
              searchable
              comboboxProps={{ zIndex: 500 }}
              renderOption={({ option }) => {
                const s = services.find((x) => x.id === option.value);
                return (
                  <Group gap="xs" wrap="nowrap">
                    <Box w={4} h={18} style={{ background: s?.color, borderRadius: 2 }} />
                    <Text size="sm">{option.label}</Text>
                    <Text size="xs" c="dimmed">
                      {s?.base_duration_minutes ? `${s.base_duration_minutes / 60} ч · ` : ''}
                      {Number(s?.base_price ?? 0)} ₽
                    </Text>
                  </Group>
                );
              }}
            />

            <TextInput
              label="Адрес загрузки *"
              value={pickup}
              onChange={(e) => setPickup(e.currentTarget.value)}
            />
            <TextInput
              label="Адрес выгрузки *"
              value={dropoff}
              onChange={(e) => setDropoff(e.currentTarget.value)}
            />
            {extraStops.map((stop) => (
              <Group key={stop.key} gap="xs" wrap="nowrap" align="flex-end">
                <TextInput
                  style={{ flex: 1 }}
                  label={stop.type === 'pickup' ? 'Доп. точка загрузки' : 'Доп. точка выгрузки'}
                  value={stop.address}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setExtraStops((prev) => prev.map((s) => (s.key === stop.key ? { ...s, address: value } : s)));
                  }}
                />
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  aria-label="Удалить точку"
                  onClick={() => setExtraStops((prev) => prev.filter((s) => s.key !== stop.key))}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            ))}
            <Group gap="xs">
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={14} />}
                onClick={() => setExtraStops((p) => [...p, { key: nextKey(), type: 'pickup', address: '' }])}
              >
                Точка загрузки
              </Button>
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconPlus size={14} />}
                onClick={() => setExtraStops((p) => [...p, { key: nextKey(), type: 'dropoff', address: '' }])}
              >
                Точка выгрузки
              </Button>
            </Group>

            <Textarea
              label="Детали груза"
              placeholder="Например: диван, два шкафа, 20 коробок"
              autosize
              minRows={2}
              value={cargo}
              onChange={(e) => setCargo(e.currentTarget.value)}
            />
            <Group grow align="flex-start">
              <NumberInput
                label="Сумма"
                suffix=" ₽"
                thousandSeparator=" "
                min={0}
                value={price}
                onChange={setPrice}
              />
              <Textarea
                label="Комментарий"
                autosize
                minRows={1}
                value={comment}
                onChange={(e) => setComment(e.currentTarget.value)}
              />
            </Group>
          </Stack>
        </Grid.Col>

        <Grid.Col span={5}>
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              Точка у имени: зелёная — свободен, жёлтая — занят другим заказом, красная — выходной.
            </Text>
            <Paper withBorder p="sm">
              <Text fw={600} size="sm" mb={6}>
                Водитель
              </Text>
              {drivers.length === 0 && (
                <Text size="sm" c="dimmed">
                  Нет ни одного водителя
                </Text>
              )}
              <Stack gap={2}>
                {sortByAvailability(drivers, busyIds, dayOffIds).map((d) => {
                  const tier = availabilityTier(d.id, busyIds, dayOffIds);
                  const selected = driverId === d.id;
                  return (
                    <UnstyledButton
                      key={d.id}
                      onClick={() => selectDriver(selected ? null : d.id)}
                      px={8}
                      py={4}
                      style={{
                        borderRadius: 6,
                        background: selected ? 'var(--mantine-color-violet-1)' : undefined,
                      }}
                    >
                      <Group gap={8} wrap="nowrap">
                        <AvailabilityDot tier={tier} />
                        <Text size="sm" fw={selected ? 600 : 400}>
                          {d.name}
                          <Text span size="xs" c="dimmed">
                            {TIER_SUFFIX[tier]}
                          </Text>
                        </Text>
                      </Group>
                    </UnstyledButton>
                  );
                })}
              </Stack>
              {driverId && (
                <Select
                  mt="sm"
                  label="Машина"
                  placeholder={vehicles.length ? 'Выберите машину' : 'Автопарк пуст'}
                  data={vehicles.map((v) => ({ value: v.id, label: `${v.name} · ${v.plate}` }))}
                  value={vehicleId}
                  onChange={setVehicleId}
                  clearable
                  comboboxProps={{ zIndex: 500 }}
                />
              )}
            </Paper>

            <Paper withBorder p="sm">
              <Text fw={600} size="sm" mb={6}>
                Грузчики
              </Text>
              {loaderCandidates.length === 0 && (
                <Text size="sm" c="dimmed">
                  Нет ни одного грузчика
                </Text>
              )}
              <Stack gap={6}>
                {sortByAvailability(loaderCandidates, busyIds, dayOffIds).map((p) => {
                  const tier = availabilityTier(p.id, busyIds, dayOffIds);
                  const checked = loaderIds.includes(p.id);
                  return (
                    <Checkbox
                      key={p.id}
                      checked={checked}
                      // Грузчик не может быть на двух заказах одновременно —
                      // это запрещает и база; выходной — только подсказка.
                      disabled={tier === 'busy' && !checked}
                      onChange={() =>
                        setLoaderIds((prev) => (checked ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                      }
                      label={
                        <Group gap={8} wrap="nowrap">
                          <AvailabilityDot tier={tier} />
                          <Text size="sm">
                            {p.name}
                            {p.id === driverId ? ' (водитель)' : ''}
                            <Text span size="xs" c="dimmed">
                              {TIER_SUFFIX[tier]}
                            </Text>
                          </Text>
                        </Group>
                      }
                    />
                  );
                })}
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>

      {error && (
        <Alert color="red" mt="md">
          {error}
        </Alert>
      )}
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={handleSubmit} loading={saving}>
          {order ? 'Сохранить' : 'Создать заказ'}
        </Button>
      </Group>

      {newClientOpen && (
        <ClientFormModal
          client={null}
          zIndex={600}
          onClose={() => setNewClientOpen(false)}
          onSaved={(c) => {
            setNewClientOpen(false);
            setClientId(c.id);
          }}
        />
      )}
    </Modal>
  );
}
