'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { IconFileSpreadsheet, IconFileTypeCsv } from '@tabler/icons-react';
import { fetchClientsWithStats, type ClientWithStats } from '@/api/clients';
import { fetchOrdersList, type OrderWithDetails } from '@/api/orders';
import { useSession } from '@/providers/SessionProvider';
import { canViewClientPhone, canViewClientStats, canViewOrderAmount } from '@/lib/permissions';
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '@/lib/labels';
import { dayjs, fromDateKey, toDateKey } from '@/lib/dates';
import {
  CLIENT_COLUMNS,
  ORDER_COLUMNS,
  downloadCsv,
  downloadXlsx,
  type ColumnGuard,
  type ExportColumn,
} from '@/lib/exportData';
import type { OrderStatus } from '@/types/database';
import { PageHeader } from '@/components/common/PageHeader';

type Dataset = 'clients' | 'orders';
type ClientSegment = 'all' | 'with-orders' | 'no-orders' | 'discount';

const STORAGE_KEY = 'export-settings-v1';

interface SavedSettings {
  clients: string[];
  orders: string[];
}

function loadSaved(): SavedSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSettings) : null;
  } catch {
    return null;
  }
}

function defaults<T>(cols: ExportColumn<T>[]) {
  return cols.filter((c) => c.defaultOn).map((c) => c.key);
}

// Настраиваемая выгрузка: что выгружать (клиенты или заказы), какие
// колонки, за какой период и в каком формате. Выбор колонок запоминается
// в этом браузере. Закрытые правами поля (телефоны, суммы) выгрузить
// нельзя тому, кому их не видно и в кабинете.
export default function ExportPage() {
  const { employee } = useSession();
  const allowed: Record<ColumnGuard, boolean> = {
    phone: canViewClientPhone(employee),
    amount: canViewOrderAmount(employee),
    stats: canViewClientStats(employee),
  };
  const [dataset, setDataset] = useState<Dataset>('clients');
  const [clientCols, setClientCols] = useState<string[]>(defaults(CLIENT_COLUMNS));
  const [orderCols, setOrderCols] = useState<string[]>(defaults(ORDER_COLUMNS));
  const [segment, setSegment] = useState<ClientSegment>('all');
  const [range, setRange] = useState<[string | null, string | null]>([
    toDateKey(dayjs().startOf('month').toDate()),
    toDateKey(dayjs().endOf('month').toDate()),
  ]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      setClientCols(saved.clients);
      setOrderCols(saved.orders);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ clients: clientCols, orders: orderCols }));
    } catch {
      // без localStorage просто не запомним выбор
    }
  }, [clientCols, orderCols]);

  const from = range[0] ? fromDateKey(range[0]) : dayjs().startOf('month').toDate();
  const to = dayjs(range[1] ? fromDateKey(range[1]) : from).add(1, 'day').toDate();

  const clientsQuery = useQuery({
    queryKey: ['clients', 'with-stats'],
    queryFn: fetchClientsWithStats,
    enabled: dataset === 'clients',
  });
  const ordersQuery = useQuery({
    queryKey: ['orders', 'list', from.toISOString(), to.toISOString(), statuses.join(',')],
    queryFn: () => fetchOrdersList({ from, to, statuses: statuses as OrderStatus[] }),
    enabled: dataset === 'orders',
  });

  const clientRows = useMemo(
    () =>
      (clientsQuery.data ?? []).filter((c: ClientWithStats) => {
        if (segment === 'with-orders') return c.ordersCount > 0;
        if (segment === 'no-orders') return c.ordersCount === 0;
        if (segment === 'discount') return c.discount_percent > 0;
        return true;
      }),
    [clientsQuery.data, segment]
  );

  const isAllowed = <T,>(c: ExportColumn<T>) => !c.guard || allowed[c.guard];
  const activeClientCols = CLIENT_COLUMNS.filter((c) => clientCols.includes(c.key) && isAllowed(c));
  const activeOrderCols = ORDER_COLUMNS.filter((c) => orderCols.includes(c.key) && isAllowed(c));
  const rowsCount = dataset === 'clients' ? clientRows.length : (ordersQuery.data ?? []).length;
  const loading = dataset === 'clients' ? clientsQuery.isLoading : ordersQuery.isLoading;
  const error = dataset === 'clients' ? clientsQuery.error : ordersQuery.error;

  const fileBase =
    dataset === 'clients'
      ? `clients_${dayjs().format('YYYY-MM-DD')}`
      : `orders_${dayjs(from).format('YYYY-MM-DD')}_${dayjs(to).subtract(1, 'day').format('YYYY-MM-DD')}`;

  const run = async (format: 'xlsx' | 'csv') => {
    setBusy(true);
    try {
      if (dataset === 'clients') {
        if (format === 'csv') downloadCsv(clientRows, activeClientCols, `${fileBase}.csv`);
        else await downloadXlsx(clientRows, activeClientCols, `${fileBase}.xlsx`);
      } else {
        const rows = ordersQuery.data ?? [];
        if (format === 'csv') downloadCsv(rows, activeOrderCols, `${fileBase}.csv`);
        else await downloadXlsx(rows, activeOrderCols, `${fileBase}.xlsx`);
      }
      notifications.show({ message: `Файл выгружен: ${rowsCount} строк`, color: 'green' });
    } catch (err) {
      notifications.show({ message: (err as Error).message, color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const columnPicker = <T,>(cols: ExportColumn<T>[], value: string[], onChange: (v: string[]) => void) => (
    <Checkbox.Group value={value} onChange={onChange}>
      <SimpleGrid cols={2} spacing={6}>
        {cols.map((c) => (
          <Checkbox
            key={c.key}
            value={c.key}
            label={c.label}
            disabled={!isAllowed(c)}
            description={!isAllowed(c) ? 'Нет прав' : undefined}
          />
        ))}
      </SimpleGrid>
    </Checkbox.Group>
  );

  const previewCols: ExportColumn<unknown>[] = (dataset === 'clients' ? activeClientCols : activeOrderCols) as ExportColumn<unknown>[];
  const previewRows: unknown[] = (dataset === 'clients' ? clientRows : (ordersQuery.data ?? [])).slice(0, 8) as (
    | ClientWithStats
    | OrderWithDetails
  )[];

  return (
    <Box p="lg">
      <PageHeader title="Выгрузка базы" subtitle="Excel или CSV с нужными колонками" />
      <SimpleGrid cols={2} spacing="lg" style={{ alignItems: 'start' }}>
        <Paper withBorder p="md">
          <Stack>
            <div>
              <Text fw={600} mb={6}>
                1. Что выгружаем
              </Text>
              <SegmentedControl
                value={dataset}
                onChange={(v) => setDataset(v as Dataset)}
                data={[
                  { value: 'clients', label: 'Базу клиентов' },
                  { value: 'orders', label: 'Заказы за период' },
                ]}
              />
            </div>
            <div>
              <Text fw={600} mb={6}>
                2. Какие записи
              </Text>
              {dataset === 'clients' ? (
                <SegmentedControl
                  value={segment}
                  onChange={(v) => setSegment(v as ClientSegment)}
                  data={[
                    { value: 'all', label: 'Все' },
                    { value: 'with-orders', label: 'С заказами' },
                    { value: 'no-orders', label: 'Без заказов' },
                    { value: 'discount', label: 'Со скидкой' },
                  ]}
                />
              ) : (
                <Group align="flex-end">
                  <DatePickerInput
                    type="range"
                    label="Период"
                    value={range}
                    onChange={(v) => setRange(v as [string | null, string | null])}
                    valueFormat="D MMM YYYY"
                    w={250}
                  />
                  <MultiSelect
                    label="Статусы"
                    placeholder={statuses.length ? undefined : 'Любые'}
                    data={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))}
                    value={statuses}
                    onChange={setStatuses}
                    style={{ flex: 1 }}
                  />
                </Group>
              )}
            </div>
            <div>
              <Group justify="space-between" mb={6}>
                <Text fw={600}>3. Колонки</Text>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  onClick={() =>
                    dataset === 'clients' ? setClientCols(defaults(CLIENT_COLUMNS)) : setOrderCols(defaults(ORDER_COLUMNS))
                  }
                >
                  По умолчанию
                </Button>
              </Group>
              {dataset === 'clients'
                ? columnPicker(CLIENT_COLUMNS, clientCols, setClientCols)
                : columnPicker(ORDER_COLUMNS, orderCols, setOrderCols)}
            </div>
            <div>
              <Text fw={600} mb={6}>
                4. Скачать
              </Text>
              <Group>
                <Button
                  leftSection={<IconFileSpreadsheet size={18} />}
                  onClick={() => run('xlsx')}
                  loading={busy}
                  disabled={loading || rowsCount === 0 || previewCols.length === 0}
                >
                  Excel (.xlsx)
                </Button>
                <Button
                  variant="light"
                  leftSection={<IconFileTypeCsv size={18} />}
                  onClick={() => run('csv')}
                  disabled={busy || loading || rowsCount === 0 || previewCols.length === 0}
                >
                  CSV
                </Button>
                <Text size="sm" c="dimmed">
                  {loading ? 'Загружаю…' : `Строк: ${rowsCount}`}
                </Text>
              </Group>
            </div>
            {error && <Alert color="red">{error.message}</Alert>}
          </Stack>
        </Paper>

        <Paper withBorder p="md">
          <Title order={5} mb="sm">
            Предпросмотр (первые строки)
          </Title>
          <ScrollArea>
            <Table striped withTableBorder fz="xs">
              <Table.Thead>
                <Table.Tr>
                  {previewCols.map((c) => (
                    <Table.Th key={c.key} style={{ whiteSpace: 'nowrap' }}>
                      {c.label}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {previewRows.map((r, i) => (
                  <Table.Tr key={i}>
                    {previewCols.map((c) => {
                      const v = c.value(r);
                      return (
                        <Table.Td key={c.key} style={{ whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {v instanceof Date ? dayjs(v).format('DD.MM.YYYY') : v == null ? '' : String(v)}
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
          {previewRows.length === 0 && !loading && (
            <Text c="dimmed" size="sm" mt="sm">
              Нет записей по выбранным условиям
            </Text>
          )}
        </Paper>
      </SimpleGrid>
    </Box>
  );
}
