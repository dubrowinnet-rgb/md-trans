'use client';

import { useState } from 'react';
import { Button, Group, Paper, ScrollArea, Stack, Text, Textarea } from '@mantine/core';
import { useSendTicketMessage, useTicketMessages, type SupportTicket } from '@/api/supportTickets';
import { dayjs } from '@/lib/dates';

// Переписка по одному обращению — общий компонент для страницы
// администратора («Техподдержка») и очереди владельца.
export function TicketThread({ ticket, currentEmployeeId }: { ticket: SupportTicket; currentEmployeeId: string }) {
  const messagesQuery = useTicketMessages(ticket.id);
  const sendMessage = useSendTicketMessage();
  const [draft, setDraft] = useState('');

  const send = async () => {
    if (!draft.trim()) return;
    await sendMessage.mutateAsync({ ticketId: ticket.id, senderId: currentEmployeeId, body: draft.trim() });
    setDraft('');
  };

  return (
    <Stack gap="sm">
      <ScrollArea.Autosize mah={320}>
        <Stack gap="xs">
          {(messagesQuery.data ?? []).map((m) => (
            <Paper
              key={m.id}
              withBorder
              p="xs"
              bg={m.sender_id === currentEmployeeId ? 'var(--mantine-color-violet-0)' : undefined}
            >
              <Text size="xs" c="dimmed">
                {dayjs(m.created_at).format('D MMMM, HH:mm')}
              </Text>
              <Text size="sm">{m.body}</Text>
            </Paper>
          ))}
          {messagesQuery.data?.length === 0 && (
            <Text c="dimmed" size="sm">
              Сообщений пока нет
            </Text>
          )}
        </Stack>
      </ScrollArea.Autosize>
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <Textarea
          placeholder="Ответить..."
          autosize
          minRows={1}
          maxRows={4}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button onClick={send} loading={sendMessage.isPending} disabled={!draft.trim()}>
          Отправить
        </Button>
      </Group>
    </Stack>
  );
}
