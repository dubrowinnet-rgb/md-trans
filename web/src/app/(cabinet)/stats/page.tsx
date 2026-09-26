'use client';

import { useMemo, useState } from 'react';
import { Alert, Box, Group, Loader, Paper, SegmentedControl, SimpleGrid, Table, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useStatsOverview } from '@/api/stats';
import { useSession } from '@/providers/SessionProvider';
import { ACCOUNT_ROLE_LABELS, ORDER_STATUSES, ORDER_STATUS_LABELS } from '@/lib/labels';
import { dayjs, formatMoney, fromDateKey } from '@/lib/dates';
import { PageHeader } from '@/components/common/PageHeader';

type Period = 'week' | 'month' | 'year' | 'all' | 'custom';

// Одноцветная полоска рядом с числом: размер, а не категория, поэтому один
// оттенок; само число всегда подписано текстом.
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <Box h={8} bg="gray.1" style={{ borderRadius: 4, overflow: 'hidden', minWidth: 120 }}>
      <Box h={8} w={`${pct}%`} bg="violet.6" style={{ borderRadius: 4 }} />
    </Box>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} fz={28}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Paper>
  );
}

// Статистика администратора: по компании и по сотрудникам, за выбранный
// период (в мобильном приложении — только за всё время).
export default function StatsPage() {
  const { employee } = useSession();
  const [period, setPeriod] = useState<Period>('month');
  const [custom, setCustom] = useState<[string | null, string | null]>([null, null]);

  const range = useMemo(() => {
    const now = dayjs();
    if (period === 'week') {
      const start = now.startOf('day').subtract((now.day() + 6) % 7, 'day');
      return { from: start.toDate(), to: start.add(7, 'day').toDate() };
    }
    if (period === 'month') return { from: now.startOf('month').toDate(), to: now.startOf('month').add(1, 'month').toDate() };
    if (period === 'year') return { from: now.startOf('year').toDate(), to: now.startOf('year').add(1, 'year').toDate() };
    if (period === 'custom' && custom[0] && custom[1]) {
      return { from: fromDateKey(custom[0]), to: dayjs(fromDateKey(custom[1])).add(1, 'day').toDate() };
    }
    return null;
  }, [period, custom]);

  const statsQuery = useStatsOverview(range);
  const stats = statsQuery.data;

  if (employee?.role !== 'admin') {
    return (
      <Box p="lg">
        <Alert>Статистика доступна только администратору.</Alert>
      </Box>
    );
  }

  const completed = stats?.ordersByStatus.completed ?? 0;
  const maxStatus = Math.max(0, ...ORDER_STATUSES.map((s) => stats?.ordersByStatus[s] ?? 0));
  const maxRevenue = Math.max(0, ...(stats?.employees ?? []).map((e) => e.revenue));

  return (
    <Box p="lg">
      <PageHeader title="Статистика" subtitle="Заказы считаются по дате начала; выручка — по завершённым">
        <SegmentedControl
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          data={[
            { value: 'week', label: 'Неделя' },
            { value: 'month', label: 'Месяц' },
            { value: 'year', label: 'Год' },
            { value: 'all', label: 'Всё время' },
            { value: 'custom', label: 'Период' },
          ]}
        />
        {period === 'custom' && (
          <DatePickerInput
            type="range"
            placeholder="Выберите даты"
            value={custom}
            onChange={(v) => setCustom(v as [string | null, string | null])}
            valueFormat="D MMM YYYY"
            w={240}
          />
        )}
      </PageHeader>
      {statsQuery.isError && <Alert color="red">{statsQuery.error.message}</Alert>}
      {statsQuery.isLoading && <Loader />}
      {stats && (
        <>
          <SimpleGrid cols={4} mb="lg">
            <Tile label="Заказов" value={String(stats.totalOrders)} />
            <Tile label="Завершено" value={String(completed)} />
            <Tile label="Выручка" value={formatMoney(stats.totalRevenue)} />
            <Tile
              label="Средний чек"
              value={completed ? formatMoney(Math.round(stats.totalRevenue / completed)) : '—'}
              hint="по завершённым"
            />
          </SimpleGrid>

          <SimpleGrid cols={2} spacing="lg" style={{ alignItems: 'start' }}>
            <Paper withBorder p="md">
              <Text fw={600} mb="sm">
                Заказы по статусам
              </Text>
              <Table>
                <Table.Tbody>
                  {ORDER_STATUSES.map((s) => (
                    <Table.Tr key={s}>
                      <Table.Td w={140}>{ORDER_STATUS_LABELS[s]}</Table.Td>
                      <Table.Td>
                        <Bar value={stats.ordersByStatus[s] ?? 0} max={maxStatus} />
                      </Table.Td>
                      <Table.Td ta="right" w={60} fw={600}>
                        {stats.ordersByStatus[s] ?? 0}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>

            <Paper withBorder p="md">
              <Text fw={600} mb="sm">
                По сотрудникам
              </Text>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Сотрудник</Table.Th>
                    <Table.Th ta="right">Заказов</Table.Th>
                    <Table.Th>Выручка</Table.Th>
                    <Table.Th ta="right" />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {stats.employees.map((e) => (
                    <Table.Tr key={e.id}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {e.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {ACCOUNT_ROLE_LABELS[e.role]}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">{e.ordersCount}</Table.Td>
                      <Table.Td>
                        <Bar value={e.revenue} max={maxRevenue} />
                      </Table.Td>
                      <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                        {formatMoney(e.revenue)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Text size="xs" c="dimmed" mt="xs">
                Водителю и грузчику засчитываются заказы, где они в бригаде; диспетчеру и администратору — созданные
                ими.
              </Text>
            </Paper>
          </SimpleGrid>
        </>
      )}
    </Box>
  );
}
