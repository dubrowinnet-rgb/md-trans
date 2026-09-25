'use client';

import { useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Stack, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { useCreateReminderRule } from '@/api/reminders';

export function ReminderRuleModal({ onClose }: { onClose: () => void }) {
  const [minutes, setMinutes] = useState<number | string>(30);
  const [error, setError] = useState<string | null>(null);
  const createRule = useCreateReminderRule();

  const submit = async () => {
    setError(null);
    const value = Number(minutes);
    if (!value || value <= 0) return setError('Укажите число минут больше нуля');
    try {
      await createRule.mutateAsync(value);
      notifications.show({ message: 'Напоминание добавлено', color: 'green' });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить'));
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Title order={4}>Новое напоминание</Title>}>
      <Stack>
        <NumberInput
          label="За сколько минут до начала заказа"
          min={1}
          value={minutes}
          onChange={setMinutes}
          data-autofocus
        />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={createRule.isPending}>
            Добавить
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
