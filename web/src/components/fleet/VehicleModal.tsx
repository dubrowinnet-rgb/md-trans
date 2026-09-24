'use client';

import { useState } from 'react';
import { Alert, Button, Checkbox, Group, Modal, NumberInput, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { useCreateVehicle, useDeleteVehicle, useUpdateVehicle, type Vehicle } from '@/api/vehicles';

// Размер кузова хранится одной строкой («Д 400 х Ш 200 х В 180 см», в
// сантиметрах — маска по просьбе Максима вместо свободного текста).
// Старое значение в старом формате (метры, без букв Д/Ш/В) не
// разбираем на три поля: перепутать метры с сантиметрами хуже, чем
// попросить ввести заново.
const DIMENSIONS_RE = /Д\s*(\d+)\s*х\s*Ш\s*(\d+)\s*х\s*В\s*(\d+)\s*см/i;

function parseBodyDimensions(text: string): { l: number | string; w: number | string; h: number | string } {
  const m = text.match(DIMENSIONS_RE);
  return m ? { l: Number(m[1]), w: Number(m[2]), h: Number(m[3]) } : { l: '', w: '', h: '' };
}

function composeBodyDimensions(l: number | string, w: number | string, h: number | string) {
  const parts: string[] = [];
  if (l !== '') parts.push(`Д ${l}`);
  if (w !== '') parts.push(`Ш ${w}`);
  if (h !== '') parts.push(`В ${h}`);
  return parts.length ? `${parts.join(' х ')} см` : '';
}

// Машина автопарка: название и гос номер обязательны, остальное — по желанию.
export function VehicleModal({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const [name, setName] = useState(vehicle?.name ?? '');
  const [plate, setPlate] = useState(vehicle?.plate ?? '');
  const [capacity, setCapacity] = useState<number | string>(vehicle?.capacity_kg ?? '');
  const initialDims = parseBodyDimensions(vehicle?.body_dimensions ?? '');
  const [length, setLength] = useState<number | string>(initialDims.l);
  const [width, setWidth] = useState<number | string>(initialDims.w);
  const [height, setHeight] = useState<number | string>(initialDims.h);
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
      body_dimensions: composeBodyDimensions(length, width, height),
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
          <NumberInput label="Европаллет" min={0} value={pallets} onChange={setPallets} />
        </SimpleGrid>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Размер кузова, см
          </Text>
          <SimpleGrid cols={3} spacing="xs">
            <NumberInput label="Д" placeholder="__" min={0} value={length} onChange={setLength} />
            <NumberInput label="Ш" placeholder="__" min={0} value={width} onChange={setWidth} />
            <NumberInput label="В" placeholder="__" min={0} value={height} onChange={setHeight} />
          </SimpleGrid>
        </div>
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
