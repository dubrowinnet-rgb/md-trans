'use client';

import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { useUpdateSmsTemplate, type SmsTemplate } from '@/api/smsTemplates';

export function SmsTemplateModal({ template, onClose }: { template: SmsTemplate; onClose: () => void }) {
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState<string | null>(null);
  const updateTemplate = useUpdateSmsTemplate();

  const submit = async () => {
    setError(null);
    try {
      await updateTemplate.mutateAsync({ key: template.key, body });
      notifications.show({ message: 'Шаблон сохранён', color: 'green' });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить шаблон'));
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Title order={4}>{template.label}</Title>}>
      <Stack>
        <Textarea
          label="Текст сообщения"
          autosize
          minRows={4}
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          data-autofocus
        />
        <Text size="xs" c="dimmed">
          Подставляются автоматически: [Name] [Day] [Date] [Time] [Cost] [Address]
        </Text>
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={updateTemplate.isPending}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
