'use client';

import { useState } from 'react';
import { Alert, Button, ColorInput, Group, Modal, NumberInput, Stack, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { useCreateService, useUpdateService, type Service } from '@/api/services';

const DEFAULT_COLOR = '#8E24AA';
const SWATCHES = ['#8E24AA', '#1976D2', '#43A047', '#FB8C00', '#E53935', '#00897B', '#6D4C41', '#546E7A'];

// Создание и правка услуги в каталоге (Настройки → Услуги): название,
// категория (не используется в фильтрах, просто заметка), стоимость и
// длительность по умолчанию (подставляются при выборе услуги на форме
// заказа) и цвет плашки в календаре.
export function ServiceModal({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const [name, setName] = useState(service?.name ?? '');
  const [category, setCategory] = useState(service?.category ?? '');
  const [duration, setDuration] = useState<number | string>(service?.base_duration_minutes ?? '');
  const [price, setPrice] = useState<number | string>(service?.base_price ?? '');
  const [color, setColor] = useState(service?.color ?? DEFAULT_COLOR);
  const [error, setError] = useState<string | null>(null);
  const createService = useCreateService();
  const updateService = useUpdateService();
  const saving = createService.isPending || updateService.isPending;

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Укажите название услуги');
    const input = {
      name: name.trim(),
      category: category.trim() || null,
      base_duration_minutes: duration === '' ? null : Number(duration),
      base_price: price === '' ? null : Number(price),
      color,
    };
    try {
      if (service) {
        await updateService.mutateAsync({ id: service.id, ...input });
      } else {
        await createService.mutateAsync(input);
      }
      notifications.show({ message: 'Услуга сохранена', color: 'green' });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить услугу'));
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Title order={4}>{service ? 'Изменить услугу' : 'Новая услуга'}</Title>}>
      <Stack>
        <TextInput label="Название *" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
        <TextInput label="Категория" value={category} onChange={(e) => setCategory(e.currentTarget.value)} />
        <Group grow>
          <NumberInput label="Длительность, мин" min={0} step={15} value={duration} onChange={setDuration} />
          <NumberInput label="Стоимость по умолчанию" suffix=" ₽" min={0} value={price} onChange={setPrice} />
        </Group>
        <ColorInput label="Цвет плашки" value={color} onChange={setColor} swatches={SWATCHES} format="hex" />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={saving}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
