'use client';

import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Textarea, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { useCreateTicket } from '@/api/supportTickets';

export function NewTicketModal({
  companyId,
  employeeId,
  onClose,
}: {
  companyId: string;
  employeeId: string;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createTicket = useCreateTicket();

  const submit = async () => {
    setError(null);
    if (!subject.trim()) return setError('Укажите тему обращения');
    if (!body.trim()) return setError('Опишите вопрос');
    try {
      await createTicket.mutateAsync({ companyId, employeeId, subject: subject.trim(), body: body.trim() });
      notifications.show({ message: 'Обращение отправлено', color: 'green' });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось отправить обращение'));
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Title order={4}>Новое обращение в поддержку</Title>}>
      <Stack>
        <TextInput label="Тема *" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} data-autofocus />
        <Textarea label="Вопрос *" autosize minRows={3} value={body} onChange={(e) => setBody(e.currentTarget.value)} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={createTicket.isPending}>
            Отправить
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
