'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Box, Button, Group, Loader, Pagination, Paper, Select, Table, Text, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useOrdersList } from '@/api/orders';
import { useEmployees } from '@/api/employees';
import { useSession } from '@/providers/SessionProvider';
import { canManageOrders, canViewClientPhone, canViewOrderAmount } from '@/lib/permissions';
import { dayjs, formatMoney, fromDateKey, toDateKey } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { ORDER_BUCKETS, ORDER_BUCKET_BADGES, ORDER_BUCKET_LABELS } from '@/lib/labels';
import { orderBucket, type OrderBucket } from '@/lib/orderCompletion';
import { PageHeader } from '@/components/common/PageHeader';
import { useOrderUI } from '@/components/orders/OrderUIProvider';
import { mergeCrew } from '@/components/orders/OrderDrawer';

// Сколько строк рисуем за раз: у крупной компании за месяц заказов тысячи,
// и таблица на все сразу подвешивает браузер.
const PAGE_SIZE = 100;

const ORDER_FILTER_OPTIONS = [
  { value: 'all', label: 'Все' },
  ...ORDER_BUCKETS.map((b) => ({ value: b, label: ORDER_BUCKET_LABELS[b] })),
];

// Все заказы за период одной таблицей — удобно искать, сверять суммы и
// статусы, чего на телефоне не сделать.
export default function OrdersPage() {
  const [range, setRange] = useState<[string | null, string | null]>([
    toDateKey(dayjs().startOf('month').toDate()),
    toDateKey(dayjs().endOf('month').toDate()),
  ]);
  const [statusFilter, setStatusFilter] = useState<'all' | OrderBucket>('all');
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { employee } = useSession();
  const showAmount = canViewOrderAmount(employee);
  const showPhone = canViewClientPhone(employee);
  const ui = useOrderUI();
  const employees = useEmployees().data ?? [];

  const from = range[0] ? fromDateKey(range[0]) : dayjs().startOf('month').toDate();
  const to = dayjs(range[1] ? fromDateKey(range[1]) : from).add(1, 'day').toDate();
  const query = useOrdersList({ from, to });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    return (query.data ?? []).filter((o) => {
      if (statusFilter !== 'all' && orderBucket(o, now) !== statusFilter) return false;
      if (employeeId && !o.order_crew.some((c) => c.employee_id === employeeId)) return false;
      if (!q) return true;
      const hay = [
        o.clients?.name,
        showPhone ? o.clients?.phone : '',
        o.cargo_description,
        o.comment,
        ...o.order_stops.map((s) => s.address),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [query.data, search, employeeId, showPhone, statusFilter]);

  const total = rows.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + Number(o.actual_price ?? 0), 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // Сменили фильтр — строк стало меньше, текущая страница могла исчезнуть.
  const currentPage = Math.min(page, pages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <Box p={{ base: 'sm', sm: 'lg' }}>
      <PageHeader title="Заказы" subtitle="Все заказы за выбранный период">
        {canManageOrders(employee) && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => ui.openNewOrder()}>
            Новый заказ
          </Button>
        )}
      </PageHeader>
      <Paper withBorder p="sm" mb="md">
        <Group align="flex-end">
          <DatePickerInput
            type="range"
            label="Период"
            value={range}
            onChange={(v) => {
              setRange(v as [string | null, string | null]);
              setPage(1);
            }}
            valueFormat="D MMM YYYY"
            w={260}
          />
          <Select
            label="Статус"
            data={ORDER_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter((v as typeof statusFilter) ?? 'all');
              setPage(1);
            }}
            w={200}
            allowDeselect={false}
          />
          <Select
            label="Сотрудник"
            placeholder="Все"
            data={employees.map((e) => ({ value: e.id, label: e.name }))}
            value={employeeId}
            onChange={(v) => {
              setEmployeeId(v);
              setPage(1);
            }}
            clearable
            searchable
            w={200}
          />
          <TextInput
            label="Поиск"
            placeholder="Клиент, адрес, груз…"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            style={{ flex: 1 }}
          />
        </Group>
      </Paper>

      {query.isError && <Alert color="red">{query.error.message}</Alert>}
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed">
          Найдено: {rows.length}
          {showAmount ? ` · сумма без отменённых: ${formatMoney(total)}` : ''}
        </Text>
        {query.isFetching && <Loader size="xs" />}
      </Group>
      <Paper withBorder>
        <Table.ScrollContainer minWidth={900}>
        <Table highlightOnHover striped stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Дата и время</Table.Th>
              <Table.Th>Клиент</Table.Th>
              <Table.Th>Услуги</Table.Th>
              <Table.Th>Маршрут</Table.Th>
              <Table.Th>Бригада</Table.Th>
              <Table.Th>Статус</Table.Th>
              {showAmount && <Table.Th ta="right">Сумма</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pageRows.map((o) => {
              const stops = [...o.order_stops].sort((a, b) => a.order_index - b.order_index);
              const crew = mergeCrew(o);
              const badge = ORDER_BUCKET_BADGES[orderBucket(o)];
              return (
                <Table.Tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => ui.openOrder(o.id)}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    {dayjs(o.scheduled_start).format('dd, DD.MM.YY')}
                    <Text size="xs" c="dimmed">
                      {dayjs(o.scheduled_start).format('HH:mm')}–{dayjs(o.scheduled_end).format('HH:mm')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {o.clients?.name ?? '—'}
                    </Text>
                    {showPhone && o.clients?.phone && (
                      <Text size="xs" c="dimmed">
                        {formatPhone(o.clients.phone)}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {o.order_services.map((s, i) => (
                        <Badge
                          key={i}
                          size="sm"
                          style={{ background: s.services?.color, textTransform: 'none' }}
                        >
                          {s.services?.name}
                        </Badge>
                      ))}
                    </Group>
                  </Table.Td>
                  <Table.Td maw={320}>
                    <Text size="sm" lineClamp={2}>
                      {stops.map((s) => s.address).join(' → ')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {crew.map((c) => `${c.name}${c.status === 'confirmed' ? ' ✓' : ''}`).join(', ') || '—'}
                    </Text>
                    {o.vehicles && (
                      <Text size="xs" c="dimmed">
                        {o.vehicles.plate}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={badge.color} variant="light" style={{ textTransform: 'none' }}>
                      {badge.label}
                    </Badge>
                  </Table.Td>
                  {showAmount && (
                    <Table.Td ta="right" style={{ whiteSpace: 'nowrap' }}>
                      {formatMoney(o.actual_price)}
                    </Table.Td>
                  )}
                </Table.Tr>
              );
            })}
            {rows.length === 0 && !query.isLoading && (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text c="dimmed" ta="center" py="lg">
                    Заказов не найдено
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
        </Table.ScrollContainer>
      </Paper>
      {pages > 1 && (
        <Group justify="center" mt="md">
          <Pagination value={currentPage} onChange={setPage} total={pages} />
        </Group>
      )}
    </Box>
  );
}
