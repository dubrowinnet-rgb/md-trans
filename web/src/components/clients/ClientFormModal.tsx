'use client';

import { useState } from 'react';
import { Alert, Button, Group, Modal, NumberInput, Stack, TextInput, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { formatPhone } from '@/lib/phone';
import { useCreateClient, useUpdateClient, type Client } from '@/api/clients';

// Создание и правка клиента (имя, телефон, скидка, заметки).
export function ClientFormModal({
  client,
  zIndex = 400,
  onClose,
  onSaved,
}: {
  client: Client | null;
  zIndex?: number;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}) {
  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [discount, setDiscount] = useState<number | string>(client?.discount_percent ?? 0);
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError('Укажите имя клиента');
    const input = {
      name: name.trim(),
      phone: phone.trim() ? formatPhone(phone.trim()) : '',
      discount_percent: Number(discount) || 0,
      notes: notes.trim(),
    };
    try {
      if (client) {
        await updateClient.mutateAsync({ id: client.id, ...input });
        onSaved?.({ ...client, ...input, phone: input.phone || null, notes: input.notes || null });
      } else {
        const created = await createClient.mutateAsync(input);
        onSaved?.(created);
      }
      notifications.show({ message: 'Клиент сохранён', color: 'green' });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить клиента'));
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      zIndex={zIndex}
      title={<Title order={4}>{client ? 'Изменить клиента' : 'Новый клиент'}</Title>}
    >
      <Stack>
        <TextInput label="Имя *" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
        <TextInput
          label="Телефон"
          value={phone}
          onChange={(e) => setPhone(e.currentTarget.value)}
          onBlur={() => phone.trim() && setPhone(formatPhone(phone.trim()))}
        />
        <NumberInput label="Скидка" suffix=" %" min={0} max={100} value={discount} onChange={setDiscount} />
        <Textarea
          label="Заметки"
          autosize
          minRows={2}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={createClient.isPending || updateClient.isPending}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
