'use client';

import { useState } from 'react';
import { Alert, Badge, Box, Button, Group, Loader, Paper, Table, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useVehicles, type Vehicle } from '@/api/vehicles';
import { useAllAccounts } from '@/api/accounts';
import { useSession } from '@/providers/SessionProvider';
import { canManageOrders } from '@/lib/permissions';
import { PageHeader } from '@/components/common/PageHeader';
import { VehicleModal } from '@/components/fleet/VehicleModal';

export default function FleetPage() {
  const { employee } = useSession();
  const canEdit = canManageOrders(employee);
  const vehiclesQuery = useVehicles();
  const drivers = (useAllAccounts().data ?? []).filter((a) => a.role === 'driver');
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);

  return (
    <Box p="lg">
      <PageHeader title="Автопарк" subtitle="Машины компании и закреплённые за ними водители">
        {canEdit && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing('new')}>
            Добавить машину
          </Button>
        )}
      </PageHeader>
      {vehiclesQuery.isError && <Alert color="red">{vehiclesQuery.error.message}</Alert>}
      {vehiclesQuery.isLoading && <Loader />}
      <Paper withBorder>
        <Table highlightOnHover striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Машина</Table.Th>
              <Table.Th>Гос номер</Table.Th>
              <Table.Th ta="right">Грузоподъёмность</Table.Th>
              <Table.Th>Кузов</Table.Th>
              <Table.Th ta="right">Европаллет</Table.Th>
              <Table.Th>Особенности</Table.Th>
              <Table.Th>Водитель по умолчанию</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(vehiclesQuery.data ?? []).map((v) => (
              <Table.Tr
                key={v.id}
                style={{ cursor: canEdit ? 'pointer' : 'default' }}
                onClick={() => canEdit && setEditing(v)}
              >
                <Table.Td fw={500}>{v.name}</Table.Td>
                <Table.Td>
                  <Badge variant="outline" color="dark" radius="sm" style={{ textTransform: 'none' }}>
                    {v.plate}
                  </Badge>
                </Table.Td>
                <Table.Td ta="right">{v.capacity_kg != null ? `${v.capacity_kg} кг` : '—'}</Table.Td>
                <Table.Td>{v.body_dimensions || '—'}</Table.Td>
                <Table.Td ta="right">{v.europallet_count ?? '—'}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {v.top_loading && <Badge variant="light">верхняя загрузка</Badge>}
                    {v.side_loading && <Badge variant="light">боковая загрузка</Badge>}
                    {v.moscow_center_pass && (
                      <Badge variant="light" color="green">
                        пропуск в центр
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  {drivers
                    .filter((d) => d.default_vehicle_id === v.id)
                    .map((d) => d.name)
                    .join(', ') || '—'}
                </Table.Td>
              </Table.Tr>
            ))}
            {vehiclesQuery.data?.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed" ta="center" py="lg">
                    Автопарк пуст
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>
      <Text size="xs" c="dimmed" mt="sm">
        Машину по умолчанию водителю назначает администратор в разделе «Команда».
      </Text>
      {editing && <VehicleModal vehicle={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Box>
  );
}
