'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useClient, useDeleteClient } from '@/api/clients';
import { useClientOrders } from '@/api/orders';
import { useSession } from '@/providers/SessionProvider';
import { canManageOrders, canViewClientPhone, canViewClientStats, canViewOrderAmount } from '@/lib/permissions';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/lib/labels';
import { dayjs, formatMoney } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { useOrderUI } from '@/components/orders/OrderUIProvider';
import { ClientFormModal } from './ClientFormModal';

// Карточка клиента: контакты, заметки, сводка и вся история заказов.
export function ClientModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { employee } = useSession();
  const clientQuery = useClient(clientId);
  const ordersQuery = useClientOrders(clientId);
  const deleteClient = useDeleteClient();
  const ui = useOrderUI();
  const [editing, setEditing] = useState(false);
  const client = clientQuery.data;
  const orders = ordersQuery.data ?? [];
  const showStats = canViewClientStats(employee);
  const showAmount = canViewOrderAmount(employee);
  const canManage = canManageOrders(employee);

  const completed = orders.filter((o) => o.status === 'completed');
  const revenue = completed.reduce((sum, o) => sum + Number(o.actual_price ?? 0), 0);

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Удалить клиента?',
      zIndex: 400,
      children: <Text size="sm">Клиента без заказов можно удалить. Клиента с заказами удалить нельзя.</Text>,
      labels: { confirm: 'Удалить', cancel: 'Отмена' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await deleteClient.mutateAsync(clientId);
          notifications.show({ message: 'Клиент удалён', color: 'green' });
          onClose();
        } catch (err) {
          notifications.show({ message: (err as Error).message, color: 'red' });
        }
      },
    });

  return (
    <Modal opened onClose={onClose} size={900} title={<Title order={4} component="span">Клиент</Title>}>
      {clientQuery.isLoading && <Loader />}
      {clientQuery.isError && <Alert color="red">{clientQuery.error.message}</Alert>}
      {client && (
        <Stack>
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={3}>{client.name}</Title>
              <Text c="dimmed">
                {canViewClientPhone(employee) ? (client.phone && formatPhone(client.phone)) || 'Телефон не указан' : 'Телефон скрыт'}
                {client.discount_percent ? ` · скидка ${client.discount_percent}%` : ''}
              </Text>
              <Text size="xs" c="dimmed">
                В базе с {dayjs(client.created_at).format('D MMMM YYYY')}
              </Text>
            </div>
            <Group gap="xs">
              {canManage && (
                <Button
                  size="xs"
                  leftSection={<IconPlus size={16} />}
                  onClick={() => ui.openNewOrder({ clientId: client.id })}
                >
                  Новый заказ
                </Button>
              )}
              <Button size="xs" variant="light" leftSection={<IconPencil size={16} />} onClick={() => setEditing(true)}>
                Изменить
              </Button>
              <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete}>
                Удалить
              </Button>
            </Group>
          </Group>

          {client.notes && (
            <Paper withBorder p="sm" bg="yellow.0">
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {client.notes}
              </Text>
            </Paper>
          )}

          {showStats && (
            <SimpleGrid cols={showAmount ? 4 : 3}>
              <Stat label="Всего заказов" value={String(orders.length)} />
              <Stat label="Завершено" value={String(completed.length)} />
              {showAmount && <Stat label="Выручка" value={formatMoney(revenue)} />}
              <Stat
                label="Последний заказ"
                value={orders[0] ? dayjs(orders[0].scheduled_start).format('D MMM YYYY') : '—'}
              />
            </SimpleGrid>
          )}

          <Text fw={600}>История заказов</Text>
          {ordersQuery.isLoading && <Loader size="sm" />}
          {!ordersQuery.isLoading && orders.length === 0 && <Text c="dimmed">Заказов пока нет</Text>}
          {orders.length > 0 && (
            <ScrollArea.Autosize mah={360}>
              <Table highlightOnHover striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Дата</Table.Th>
                    <Table.Th>Услуги</Table.Th>
                    <Table.Th>Маршрут</Table.Th>
                    <Table.Th>Статус</Table.Th>
                    {showAmount && <Table.Th ta="right">Сумма</Table.Th>}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {orders.map((o) => {
                    const stops = [...o.order_stops].sort((a, b) => a.order_index - b.order_index);
                    return (
                      <Table.Tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => ui.openOrder(o.id)}>
                        <Table.Td>{dayjs(o.scheduled_start).format('DD.MM.YYYY HH:mm')}</Table.Td>
                        <Table.Td>{o.order_services.map((s) => s.services?.name).filter(Boolean).join(', ') || '—'}</Table.Td>
                        <Table.Td maw={260}>
                          <Text size="sm" truncate>
                            {stops.map((s) => s.address).join(' → ')}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            style={{ background: ORDER_STATUS_COLORS[o.status].bg, color: '#111', textTransform: 'none' }}
                          >
                            {ORDER_STATUS_LABELS[o.status]}
                          </Badge>
                        </Table.Td>
                        {showAmount && <Table.Td ta="right">{formatMoney(o.actual_price)}</Table.Td>}
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          )}
        </Stack>
      )}
      {editing && client && <ClientFormModal client={client} onClose={() => setEditing(false)} />}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="lg">
        {value}
      </Text>
    </Paper>
  );
}
