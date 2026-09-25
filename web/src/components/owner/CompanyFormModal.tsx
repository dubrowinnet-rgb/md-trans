'use client';

import { useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Stack, TextInput, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { useCreateCompany } from '@/api/companies';

// Ручное добавление клиента сервиса (Максим: «возможность вручную
// добавлять клиентов сервиса»). Заводит только запись компании — логин
// администратора для неё заводят отдельно в «Команде» (api/accounts.ts),
// как и любого сотрудника, указав ему эту компанию.
export function CompanyFormModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('');
  const [price, setPrice] = useState<number | string>('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const createCompany = useCreateCompany();

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Укажите название компании');
    try {
      await createCompany.mutateAsync({
        name: name.trim(),
        subscription_plan: plan.trim() || null,
        subscription_price: price === '' ? null : Number(price),
        subscription_expires_at: expiresAt,
      });
      notifications.show({ message: 'Компания добавлена', color: 'green' });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось добавить компанию'));
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Title order={4}>Новый клиент сервиса</Title>}>
      <Stack>
        <TextInput label="Название компании *" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
        <TextInput label="Тариф" placeholder="Например, «Стандарт»" value={plan} onChange={(e) => setPlan(e.currentTarget.value)} />
        <NumberInput label="Стоимость, ₽/мес" min={0} value={price} onChange={setPrice} />
        <DatePickerInput
          label="Оплачено до"
          placeholder="Не указано"
          value={expiresAt}
          onChange={setExpiresAt}
          valueFormat="D MMMM YYYY"
          clearable
          popoverProps={{ zIndex: 500 }}
        />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={createCompany.isPending}>
            Добавить
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
