'use client';

import { useState } from 'react';
import { Alert, Button, Checkbox, Group, Modal, NumberInput, SimpleGrid, Stack, TextInput, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { useCreateVehicle, useDeleteVehicle, useUpdateVehicle, type Vehicle } from '@/api/vehicles';

// Машина автопарка: название и гос номер обязательны, остальное — по желанию.
export function VehicleModal({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const [name, setName] = useState(vehicle?.name ?? '');
  const [plate, setPlate] = useState(vehicle?.plate ?? '');
  const [capacity, setCapacity] = useState<number | string>(vehicle?.capacity_kg ?? '');
  const [body, setBody] = useState(vehicle?.body_dimensions ?? '');
  const [pallets, setPallets] = useState<number | string>(vehicle?.europallet_count ?? '');
  const [top, setTop] = useState(vehicle?.top_loading ?? false);
  const [side, setSide] = useState(vehicle?.side_loading ?? false);
  const [pass, setPass] = useState(vehicle?.moscow_center_pass ?? false);
  const [error, setError] = useState<string | null>(null);
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();

  const save = async () => {
    setError(null);
    if (!name.trim() || !plate.trim()) return setError('Укажите название и гос номер');
    const input = {
      name: name.trim(),
      plate: plate.trim(),
      capacity_kg: capacity === '' ? null : Number(capacity),
      body_dimensions: body.trim(),
      europallet_count: pallets === '' ? null : Number(pallets),
      top_loading: top,
      side_loading: side,
      moscow_center_pass: pass,
    };
    try {
      if (vehicle) await updateVehicle.mutateAsync({ id: vehicle.id, ...input });
      else await createVehicle.mutateAsync(input);
      notifications.show({ message: 'Машина сохранена', color: 'green' });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить'));
    }
  };

  const remove = () =>
    modals.openConfirmModal({
      title: 'Удалить машину?',
      zIndex: 500,
      labels: { confirm: 'Удалить', cancel: 'Отмена' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await deleteVehicle.mutateAsync(vehicle!.id);
          onClose();
        } catch (err) {
          setError((err as Error).message);
        }
      },
    });

  return (
    <Modal opened onClose={onClose} size="lg" title={<Title order={4}>{vehicle ? vehicle.name : 'Новая машина'}</Title>}>
      <Stack>
        <SimpleGrid cols={2}>
          <TextInput label="Название *" placeholder="Газель" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <TextInput label="Гос номер *" placeholder="А123БВ777" value={plate} onChange={(e) => setPlate(e.currentTarget.value)} />
          <NumberInput label="Грузоподъёмность" suffix=" кг" min={0} thousandSeparator=" " value={capacity} onChange={setCapacity} />
          <TextInput label="Размер кузова" placeholder="3 × 2 × 2 м" value={body} onChange={(e) => setBody(e.currentTarget.value)} />
          <NumberInput label="Европаллет" min={0} value={pallets} onChange={setPallets} />
        </SimpleGrid>
        <Group>
          <Checkbox label="Верхняя загрузка" checked={top} onChange={(e) => setTop(e.currentTarget.checked)} />
          <Checkbox label="Боковая загрузка" checked={side} onChange={(e) => setSide(e.currentTarget.checked)} />
          <Checkbox label="Пропуск в центр Москвы" checked={pass} onChange={(e) => setPass(e.currentTarget.checked)} />
        </Group>
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="space-between">
          {vehicle ? (
            <Button variant="subtle" color="red" onClick={remove}>
              Удалить
            </Button>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={save} loading={createVehicle.isPending || updateVehicle.isPending}>
              Сохранить
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
