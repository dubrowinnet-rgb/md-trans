'use client';

import { useState } from 'react';
import { Accordion, Alert, Badge, Box, Button, Group, Loader, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMyTickets } from '@/api/supportTickets';
import { useSession } from '@/providers/SessionProvider';
import { TICKET_STATUS_COLORS, TICKET_STATUS_LABELS } from '@/lib/labels';
import { dayjs } from '@/lib/dates';
import { PageHeader } from '@/components/common/PageHeader';
import { ComingSoon } from '@/components/common/ComingSoon';
import { NewTicketModal } from '@/components/support/NewTicketModal';
import { TicketThread } from '@/components/support/TicketThread';

// «Техподдержка» — свои обращения администратора к владельцу сервиса.
// Пункт доступен только администратору (см. layout.tsx), companyId у
// самого сотрудника пока нет в схеме (см. память owner-console-feature) —
// кнопка нового обращения отключена, пока это не так.
export default function SupportPage() {
  const { employee } = useSession();
  const companyId = (employee as { company_id?: string | null } | null)?.company_id ?? null;
  const ticketsQuery = useMyTickets(employee?.id);
  const [creating, setCreating] = useState(false);

  const tickets = ticketsQuery.data?.tickets ?? [];
  const missingTable = ticketsQuery.data?.missingTable ?? false;
  const canCreate = Boolean(companyId) && !missingTable;

  return (
    <Box p="lg">
      <PageHeader title="Техподдержка" subtitle="Обращения к владельцу сервиса">
        <Tooltip label={!canCreate ? 'Появится вместе с остальным кабинетом владельца' : ''} disabled={canCreate}>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)} disabled={!canCreate}>
            Новое обращение
          </Button>
        </Tooltip>
      </PageHeader>

      {missingTable && (
        <ComingSoon text="Раздел техподдержки скоро появится — сейчас достраивается база для него." />
      )}

      {!missingTable && ticketsQuery.isLoading && <Loader />}
      {!missingTable && ticketsQuery.isError && <Alert color="red">Не удалось загрузить обращения</Alert>}

      {!missingTable && !ticketsQuery.isLoading && (
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
                          {dayjs(t.updated_at).format('D MMMM YYYY, HH:mm')}
                        </Text>
                      </Stack>
                      <Badge color={TICKET_STATUS_COLORS[t.status]}>{TICKET_STATUS_LABELS[t.status]}</Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    {employee && <TicketThread ticket={t} currentEmployeeId={employee.id} />}
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}
        </Paper>
      )}

      {creating && companyId && employee && (
        <NewTicketModal companyId={companyId} employeeId={employee.id} onClose={() => setCreating(false)} />
      )}
    </Box>
  );
}
