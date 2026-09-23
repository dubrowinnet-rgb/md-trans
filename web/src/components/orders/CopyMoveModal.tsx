'use client';

import { useState } from 'react';
import { Alert, Button, Checkbox, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { TimeField } from '@/components/common/TimeField';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { useCopyOrder, useMoveOrder, type OrderWithDetails } from '@/api/orders';
import { combineDateTime, dayjs, toDateKey } from '@/lib/dates';

// Копирование заказа на другую дату/время или перенос. Длительность
// сохраняется: меняешь начало — окончание сдвигается вместе с ним.
export function CopyMoveModal({
  order,
  mode,
  onClose,
  onDone,
}: {
  order: OrderWithDetails;
  mode: 'copy' | 'move';
  onClose: () => void;
  onDone: (orderId: string) => void;
}) {
  const start = new Date(order.scheduled_start);
  const durationMin = dayjs(order.scheduled_end).diff(start, 'minute');
  const [dateKey, setDateKey] = useState(toDateKey(mode === 'copy' ? dayjs(start).add(1, 'day').toDate() : start));
  const [time, setTime] = useState(dayjs(start).format('HH:mm'));
  const [withCrew, setWithCrew] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const copyOrder = useCopyOrder();
  const moveOrder = useMoveOrder();

  const newStart = combineDateTime(dateKey, time);
  const newEnd = dayjs(newStart).add(durationMin, 'minute').toDate();

  const submit = async () => {
    setError(null);
    try {
      if (mode === 'copy') {
        const id = await copyOrder.mutateAsync({ order, start: newStart, end: newEnd, withCrew });
        notifications.show({ message: 'Копия заказа создана', color: 'green' });
        onDone(id);
      } else {
        await moveOrder.mutateAsync({ order, start: newStart, end: newEnd });
        notifications.show({ message: 'Заказ перенесён', color: 'green' });
        onDone(order.id);
      }
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить'));
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      zIndex={400}
      title={<Title order={4}>{mode === 'copy' ? 'Копировать заказ' : 'Перенести заказ'}</Title>}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {order.clients?.name}, сейчас: {dayjs(start).format('D MMMM, HH:mm')}–{dayjs(order.scheduled_end).format('HH:mm')}
        </Text>
        <Group grow>
          <DatePickerInput
            label="Новая дата"
            value={dateKey}
            onChange={(v) => v && setDateKey(v)}
            valueFormat="D MMMM YYYY, dd"
            popoverProps={{ zIndex: 500 }}
          />
          <TimeField label="Начало" value={time} onChange={setTime} />
        </Group>
        <Text size="sm">
          Будет: {dayjs(newStart).format('D MMMM, HH:mm')}–{dayjs(newEnd).format('HH:mm')}
        </Text>
        {mode === 'copy' && (
          <Checkbox
            checked={withCrew}
            onChange={(e) => setWithCrew(e.currentTarget.checked)}
            label="Скопировать бригаду и машину"
          />
        )}
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={copyOrder.isPending || moveOrder.isPending}>
            {mode === 'copy' ? 'Создать копию' : 'Перенести'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
