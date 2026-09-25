'use client';

import { useState } from 'react';
import { Alert, Badge, Box, Button, Group, Loader, Paper, Table, Tabs, Text, Tooltip } from '@mantine/core';
import { IconCreditCard, IconPlus, IconTools, IconUser } from '@tabler/icons-react';
import { useServices, useDeleteService, type Service } from '@/api/services';
import { useSession } from '@/providers/SessionProvider';
import { ACCOUNT_STATUS_COLORS, ACCOUNT_STATUS_LABELS } from '@/lib/labels';
import { errorMessage } from '@/lib/errors';
import { formatPhone } from '@/lib/phone';
import { notifications } from '@mantine/notifications';
import { PageHeader } from '@/components/common/PageHeader';
import { ServiceModal } from '@/components/settings/ServiceModal';
import { AccountModal } from '@/components/team/AccountModal';

// Настройки (открывается кликом по имени/роли в сайдбаре) — только для
// администратора. Шаблоны SMS и напоминания по умолчанию сюда пока не
// входят: это часть автоматических SMS клиентам (миграция ещё не пришла
// из мобильного треда, см. память web-pending-mobile-sync).
export default function SettingsPage() {
  const { employee } = useSession();
  const servicesQuery = useServices();
  const deleteService = useDeleteService();
  const [editingService, setEditingService] = useState<Service | 'new' | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  if (employee?.role !== 'admin') {
    return (
      <Box p="lg">
        <Alert>Настройки доступны только администратору.</Alert>
      </Box>
    );
  }

  const removeService = async (s: Service) => {
    if (!confirm(`Удалить услугу «${s.name}»?`)) return;
    try {
      await deleteService.mutateAsync(s.id);
      notifications.show({ message: 'Услуга удалена', color: 'green' });
    } catch (err) {
      notifications.show({ message: errorMessage(err, 'Не удалось удалить услугу'), color: 'red' });
    }
  };

  return (
    <Box p="lg">
      <PageHeader title="Настройки" subtitle="Услуги, ваш профиль и оплата кабинета" />
      <Tabs defaultValue="services">
        <Tabs.List mb="md">
          <Tabs.Tab value="services" leftSection={<IconTools size={16} />}>
            Услуги
          </Tabs.Tab>
          <Tabs.Tab value="profile" leftSection={<IconUser size={16} />}>
            Мои данные
          </Tabs.Tab>
          <Tabs.Tab value="billing" leftSection={<IconCreditCard size={16} />}>
            Оплата
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="services">
          <Group justify="flex-end" mb="sm">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditingService('new')}>
              Добавить услугу
            </Button>
          </Group>
          {servicesQuery.isError && <Alert color="red">{servicesQuery.error.message}</Alert>}
          {servicesQuery.isLoading && <Loader />}
          <Paper withBorder>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Услуга</Table.Th>
                  <Table.Th>Категория</Table.Th>
                  <Table.Th ta="right">Длительность</Table.Th>
                  <Table.Th ta="right">Цена по умолчанию</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(servicesQuery.data ?? []).map((s) => (
                  <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setEditingService(s)}>
                    <Table.Td>
                      <Group gap={8} wrap="nowrap">
                        <Box w={4} h={18} style={{ background: s.color, borderRadius: 2, flexShrink: 0 }} />
                        <Text fw={500}>{s.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>{s.category || '—'}</Table.Td>
                    <Table.Td ta="right">
                      {s.base_duration_minutes ? `${s.base_duration_minutes} мин` : '—'}
                    </Table.Td>
                    <Table.Td ta="right">{s.base_price ? `${s.base_price} ₽` : '—'}</Table.Td>
                    <Table.Td ta="right">
                      <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeService(s);
                        }}
                      >
                        Удалить
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {servicesQuery.data?.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text c="dimmed" ta="center" py="lg">
                        Услуг пока нет
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="profile">
          <Paper withBorder p="md" maw={480}>
            <Text fw={500} mb={4}>
              {employee.name}
            </Text>
            <Text size="sm" c="dimmed" mb="md">
              Логин {employee.login ?? '—'} · {employee.phone ? formatPhone(employee.phone) : 'телефон не указан'}
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              «Логин» — это то, чем вы входите в кабинет и приложение (настоящей почты и SMTP в системе нет). Здесь
              же можно сменить пароль.
            </Text>
            <Button onClick={() => setEditingProfile(true)}>Изменить мои данные</Button>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="billing">
          <Paper withBorder p="md" maw={480}>
            <Group justify="space-between" mb="xs">
              <Text fw={500}>Статус кабинета</Text>
              <Badge color={ACCOUNT_STATUS_COLORS[employee.account_status]}>
                {ACCOUNT_STATUS_LABELS[employee.account_status]}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed" mb="md">
              Учёт даты, до которой оплачен доступ, и автоматическое продление скоро появятся здесь.
            </Text>
            <Tooltip label="Скоро">
              <Button disabled>Продлить</Button>
            </Tooltip>
          </Paper>
        </Tabs.Panel>
      </Tabs>

      {editingService && (
        <ServiceModal service={editingService === 'new' ? null : editingService} onClose={() => setEditingService(null)} />
      )}
      {editingProfile && <AccountModal account={employee} onClose={() => setEditingProfile(false)} />}
    </Box>
  );
}
