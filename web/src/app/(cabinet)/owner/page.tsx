'use client';

import { useState } from 'react';
import { Accordion, Alert, Badge, Box, Button, Group, Loader, Paper, Select, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconBuildingStore, IconHeadset, IconPlus } from '@tabler/icons-react';
import { useCompanies } from '@/api/companies';
import { useAllTickets, useUpdateTicketStatus, type TicketStatus } from '@/api/supportTickets';
import { useSession } from '@/providers/SessionProvider';
import { isServiceOwner } from '@/lib/ownerAccess';
import { ACCOUNT_STATUS_COLORS, ACCOUNT_STATUS_LABELS, TICKET_STATUS_COLORS, TICKET_STATUS_LABELS } from '@/lib/labels';
import { dayjs } from '@/lib/dates';
import { PageHeader } from '@/components/common/PageHeader';
import { CompanyFormModal } from '@/components/owner/CompanyFormModal';
import { TicketThread } from '@/components/support/TicketThread';

const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved'];

// Кабинет владельца сервиса (Максим Дубровин) — список подключённых
// компаний (клиентов сервиса) и очередь обращений в поддержку по всем
// компаниям сразу. Доступ — настоящая роль 'owner' (миграция 0013, см.
// lib/ownerAccess.ts).
export default function OwnerPage() {
  const { employee } = useSession();
  const companiesQuery = useCompanies();
  const ticketsQuery = useAllTickets();
  const updateStatus = useUpdateTicketStatus();
  const [addingCompany, setAddingCompany] = useState(false);

  if (!isServiceOwner(employee)) {
    return (
      <Box p="lg">
        <Alert>Этот раздел доступен только владельцу сервиса.</Alert>
      </Box>
    );
  }

  const companies = companiesQuery.data ?? [];
  const tickets = ticketsQuery.data ?? [];

  return (
    <Box p="lg">
      <PageHeader title="Кабинет владельца" subtitle="Компании сервиса и обращения в поддержку" />
      <Tabs defaultValue="companies">
        <Tabs.List mb="md">
          <Tabs.Tab value="companies" leftSection={<IconBuildingStore size={16} />}>
            Компании
          </Tabs.Tab>
          <Tabs.Tab value="tickets" leftSection={<IconHeadset size={16} />}>
            Обращения
            {tickets.some((t) => t.status === 'open') && (
              <Badge ml={6} size="xs" color="red" circle>
                {tickets.filter((t) => t.status === 'open').length}
              </Badge>
            )}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="companies">
          <Group justify="flex-end" mb="sm">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setAddingCompany(true)}>
              Добавить компанию
            </Button>
          </Group>
          {companiesQuery.isLoading && <Loader />}
          {companiesQuery.isError && <Alert color="red">Не удалось загрузить компании</Alert>}
          <Paper withBorder>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Компания</Table.Th>
                  <Table.Th ta="right">Сотрудников</Table.Th>
                  <Table.Th>Тариф</Table.Th>
                  <Table.Th ta="right">Стоимость</Table.Th>
                  <Table.Th>Статус</Table.Th>
                  <Table.Th>Оплачено до</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {companies.map((c) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      <Text fw={500}>{c.name}</Text>
                    </Table.Td>
                    <Table.Td ta="right">{c.employeeCount}</Table.Td>
                    <Table.Td>{c.subscription_plan || '—'}</Table.Td>
                    <Table.Td ta="right">{c.subscription_price ? `${c.subscription_price} ₽` : '—'}</Table.Td>
                    <Table.Td>
                      <Badge color={ACCOUNT_STATUS_COLORS[c.subscription_status]}>
                        {ACCOUNT_STATUS_LABELS[c.subscription_status]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {c.subscription_expires_at ? dayjs(c.subscription_expires_at).format('D MMMM YYYY') : '—'}
                    </Table.Td>
                  </Table.Tr>
                ))}
                {companies.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text c="dimmed" ta="center" py="lg">
                        Компаний пока нет
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="tickets">
          {ticketsQuery.isLoading && <Loader />}
          {ticketsQuery.isError && <Alert color="red">Не удалось загрузить обращения</Alert>}
          <Paper withBorder>
            {tickets.length === 0 ? (
              <Text c="dimmed" ta="center" py="lg">
                Обращений пока нет
              </Text>
            ) : (
              <Accordion>
                {tickets.map((t) => (
                  <Accordion.Item key={t.id} value={t.id}>
                    <Accordion.Control>
                      <Group justify="space-between" wrap="nowrap" pr="sm">
                        <Stack gap={0}>
                          <Text size="sm" fw={500}>
                            {t.subject}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {t.companyName} · {dayjs(t.updated_at).format('D MMMM YYYY, HH:mm')}
                          </Text>
                        </Stack>
                        <Badge color={TICKET_STATUS_COLORS[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="sm">
                        <Select
                          label="Статус обращения"
                          data={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABELS[s] }))}
                          value={t.status}
                          onChange={(v) => v && updateStatus.mutate({ id: t.id, status: v as TicketStatus })}
                          w={220}
                        />
                        {employee && <TicketThread ticket={t} currentEmployeeId={employee.id} />}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            )}
          </Paper>
        </Tabs.Panel>
      </Tabs>

      {addingCompany && <CompanyFormModal onClose={() => setAddingCompany(false)} />}
    </Box>
  );
}
