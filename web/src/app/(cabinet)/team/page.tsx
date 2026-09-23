'use client';

import { useState } from 'react';
import { Alert, Badge, Box, Button, Group, Loader, Paper, Table, Text } from '@mantine/core';
import { IconCheck, IconPlus } from '@tabler/icons-react';
import { useAllAccounts, type Account } from '@/api/accounts';
import { useVehicles } from '@/api/vehicles';
import { useSession } from '@/providers/SessionProvider';
import { ACCOUNT_ROLE_LABELS } from '@/lib/labels';
import { PageHeader } from '@/components/common/PageHeader';
import { AccountModal } from '@/components/team/AccountModal';

const ROLE_COLOR = { admin: 'violet', dispatcher: 'blue', driver: 'teal', loader: 'orange' } as const;

function Tick({ on }: { on: boolean }) {
  return on ? <IconCheck size={16} color="var(--mantine-color-green-7)" /> : <Text c="dimmed">—</Text>;
}

// Аккаунты и права — только для администратора.
export default function TeamPage() {
  const { employee } = useSession();
  const accountsQuery = useAllAccounts();
  const vehicles = useVehicles().data ?? [];
  const [editing, setEditing] = useState<Account | 'new' | null>(null);

  if (employee?.role !== 'admin') {
    return (
      <Box p="lg">
        <Alert>Раздел «Команда» доступен только администратору.</Alert>
      </Box>
    );
  }

  return (
    <Box p="lg">
      <PageHeader title="Команда" subtitle="Логины, роли и права сотрудников">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
          Добавить аккаунт
        </Button>
      </PageHeader>
      {accountsQuery.isError && <Alert color="red">{accountsQuery.error.message}</Alert>}
      {accountsQuery.isLoading && <Loader />}
      <Paper withBorder>
        <Table highlightOnHover striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Имя</Table.Th>
              <Table.Th>Роль</Table.Th>
              <Table.Th>Логин</Table.Th>
              <Table.Th>Телефон</Table.Th>
              <Table.Th ta="center">Заказы</Table.Th>
              <Table.Th ta="center">Статистика клиентов</Table.Th>
              <Table.Th ta="center">Телефоны и суммы</Table.Th>
              <Table.Th ta="center">Свой график</Table.Th>
              <Table.Th>Машина</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(accountsQuery.data ?? []).map((a) => {
              const admin = a.role === 'admin';
              const vehicle = vehicles.find((v) => v.id === a.default_vehicle_id);
              return (
                <Table.Tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setEditing(a)}>
                  <Table.Td fw={500}>{a.name}</Table.Td>
                  <Table.Td>
                    <Badge color={ROLE_COLOR[a.role]} variant="light" style={{ textTransform: 'none' }}>
                      {ACCOUNT_ROLE_LABELS[a.role]}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{a.login ?? '—'}</Table.Td>
                  <Table.Td>{a.phone ?? '—'}</Table.Td>
                  <Table.Td ta="center">
                    <Group justify="center">
                      <Tick on={admin || a.can_manage_orders} />
                    </Group>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Group justify="center">
                      <Tick on={admin || a.can_view_client_stats} />
                    </Group>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Group justify="center">
                      <Tick on={admin || a.can_view_contacts_and_amounts} />
                    </Group>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Group justify="center">
                      <Tick on={a.can_manage_own_schedule} />
                    </Group>
                  </Table.Td>
                  <Table.Td>{vehicle ? `${vehicle.name} · ${vehicle.plate}` : '—'}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>
      {editing && <AccountModal account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Box>
  );
}
