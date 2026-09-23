'use client';

import { useMemo, useState } from 'react';
import { ActionIcon, Alert, Box, Group, Paper, ScrollArea, Text, Tooltip } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useEmployees } from '@/api/employees';
import { useDaysOffInRange, useToggleDayOff } from '@/api/schedule';
import { useOrdersForRange } from '@/api/orders';
import { useSession } from '@/providers/SessionProvider';
import { canManageOrders } from '@/lib/permissions';
import { dayjs, toDateKey } from '@/lib/dates';
import { PageHeader } from '@/components/common/PageHeader';

// График на месяц сразу по всем водителям и грузчикам: строка —
// сотрудник, колонка — день. Клик по клетке ставит или снимает выходной.
// Цифра в клетке — сколько у человека заказов в этот день.
export default function SchedulePage() {
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const { employee } = useSession();
  const canEdit = canManageOrders(employee);
  const employees = useEmployees().data ?? [];
  const days = useMemo(
    () => Array.from({ length: month.daysInMonth() }, (_, i) => month.add(i, 'day')),
    [month]
  );
  const fromKey = toDateKey(month.toDate());
  const toKey = toDateKey(month.endOf('month').toDate());
  const daysOffQuery = useDaysOffInRange(fromKey, toKey);
  const daysOff = daysOffQuery.data ?? new Set<string>();
  const ordersQuery = useOrdersForRange(month.toDate(), month.add(1, 'month').toDate());
  const toggle = useToggleDayOff();

  const ordersCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of ordersQuery.data ?? []) {
      if (o.status === 'cancelled') continue;
      const day = toDateKey(new Date(o.scheduled_start));
      for (const id of new Set(o.order_crew.map((c) => c.employee_id))) {
        map.set(`${id}:${day}`, (map.get(`${id}:${day}`) ?? 0) + 1);
      }
    }
    return map;
  }, [ordersQuery.data]);

  const onCell = (employeeId: string, day: string) => {
    if (!canEdit) return;
    const isOff = !daysOff.has(`${employeeId}:${day}`);
    toggle.mutate(
      { employeeId, day, isOff },
      { onError: (err) => notifications.show({ message: err.message, color: 'red' }) }
    );
  };

  const today = toDateKey(new Date());

  return (
    <Box p="lg">
      <PageHeader title="График" subtitle="Клик по клетке — поставить или снять выходной">
        <ActionIcon variant="default" size="lg" aria-label="Предыдущий месяц" onClick={() => setMonth((m) => m.subtract(1, 'month'))}>
          <IconChevronLeft size={18} />
        </ActionIcon>
        <MonthPickerInput
          value={fromKey}
          onChange={(v) => v && setMonth(dayjs(v).startOf('month'))}
          valueFormat="MMMM YYYY"
          w={180}
        />
        <ActionIcon variant="default" size="lg" aria-label="Следующий месяц" onClick={() => setMonth((m) => m.add(1, 'month'))}>
          <IconChevronRight size={18} />
        </ActionIcon>
      </PageHeader>
      {daysOffQuery.isError && <Alert color="red">{daysOffQuery.error.message}</Alert>}
      <Paper withBorder>
        <ScrollArea>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 10px', minWidth: 160, position: 'sticky', left: 0, background: 'white' }}>
                  Сотрудник
                </th>
                {days.map((d) => {
                  const weekend = d.day() === 0 || d.day() === 6;
                  const key = toDateKey(d.toDate());
                  return (
                    <th
                      key={key}
                      style={{
                        padding: '4px 0',
                        minWidth: 30,
                        color: weekend ? '#c92a2a' : undefined,
                        background: key === today ? 'var(--mantine-color-violet-1)' : undefined,
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 500 }}>{d.format('dd')}</div>
                      <div>{d.date()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
                  <td style={{ padding: '6px 10px', position: 'sticky', left: 0, background: 'white' }}>
                    <Text size="sm" fw={500}>
                      {e.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {e.role === 'driver' ? 'Водитель' : 'Грузчик'}
                      {e.can_manage_own_schedule ? ' · ведёт график сам' : ''}
                    </Text>
                  </td>
                  {days.map((d) => {
                    const key = toDateKey(d.toDate());
                    const off = daysOff.has(`${e.id}:${key}`);
                    const count = ordersCount.get(`${e.id}:${key}`) ?? 0;
                    return (
                      <td key={key} style={{ padding: 2 }}>
                        <Tooltip
                          label={`${d.format('D MMMM')}: ${off ? 'выходной' : 'рабочий'}${count ? `, заказов: ${count}` : ''}`}
                          openDelay={300}
                        >
                          <Box
                            onClick={() => onCell(e.id, key)}
                            data-testid={`cell-${e.id}-${key}`}
                            style={{
                              height: 30,
                              borderRadius: 4,
                              cursor: canEdit ? 'pointer' : 'default',
                              background: off ? '#ffe3e3' : '#ebfbee',
                              border: `1px solid ${off ? '#ffa8a8' : '#b2f2bb'}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              color: off ? '#c92a2a' : '#2b8a3e',
                              fontSize: 12,
                            }}
                          >
                            {off ? 'в' : count || ''}
                          </Box>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </Paper>
      <Group gap="lg" mt="sm">
        <Group gap={6}>
          <Box w={16} h={16} style={{ background: '#ebfbee', border: '1px solid #b2f2bb', borderRadius: 3 }} />
          <Text size="xs">рабочий день (цифра — заказов)</Text>
        </Group>
        <Group gap={6}>
          <Box w={16} h={16} style={{ background: '#ffe3e3', border: '1px solid #ffa8a8', borderRadius: 3 }} />
          <Text size="xs">выходной</Text>
        </Group>
      </Group>
    </Box>
  );
}
