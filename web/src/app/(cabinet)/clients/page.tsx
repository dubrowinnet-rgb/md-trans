'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Pagination,
  Paper,
  SegmentedControl,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconDatabaseExport, IconSearch, IconUpload, IconUserPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { useClientsWithStats, type ClientWithStats } from '@/api/clients';
import { useSession } from '@/providers/SessionProvider';
import { canViewClientPhone, canViewClientStats, canViewOrderAmount } from '@/lib/permissions';
import { dayjs, formatMoney } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { PageHeader } from '@/components/common/PageHeader';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { ClientImportModal } from '@/components/clients/ClientImportModal';
import { useOrderUI } from '@/components/orders/OrderUIProvider';

type SortKey = 'name' | 'ordersCount' | 'revenue' | 'lastOrderAt' | 'created_at' | 'discount_percent';
type Segment = 'all' | 'with-orders' | 'no-orders' | 'discount' | 'sleeping';

const PAGE_SIZE = 50;

// База клиентов на весь экран: поиск по имени, телефону и заметкам,
// сортировка по любой колонке, быстрые срезы (без заказов, со скидкой,
// давно не заказывали) и переход в карточку клиента с историей.
export default function ClientsPage() {
  const { employee } = useSession();
  const showPhone = canViewClientPhone(employee);
  const showStats = canViewClientStats(employee);
  const showAmount = showStats && canViewOrderAmount(employee);
  const query = useClientsWithStats();
  const ui = useOrderUI();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'name', desc: false });
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sleepingBorder = dayjs().subtract(6, 'month').toISOString();
    const list = (query.data ?? []).filter((c) => {
      if (segment === 'with-orders' && c.ordersCount === 0) return false;
      if (segment === 'no-orders' && c.ordersCount > 0) return false;
      if (segment === 'discount' && !c.discount_percent) return false;
      if (segment === 'sleeping' && (!c.lastOrderAt || c.lastOrderAt > sleepingBorder)) return false;
      if (!q) return true;
      return [c.name, showPhone ? c.phone : '', c.notes].join(' ').toLowerCase().includes(q);
    });
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      const av = a[sort.key] ?? '';
      const bv = b[sort.key] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ru') * dir;
    });
  }, [query.data, search, segment, sort, showPhone]);

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const header = (key: SortKey, label: string, align?: 'right') => (
    <Table.Th ta={align}>
      <UnstyledButton
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}
        style={{ fontWeight: 700, fontSize: 14 }}
      >
        <Group gap={2} wrap="nowrap" justify={align === 'right' ? 'flex-end' : undefined}>
          {label}
          {sort.key === key && (sort.desc ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />)}
        </Group>
      </UnstyledButton>
    </Table.Th>
  );

  return (
    <Box p="lg">
      <PageHeader title="Клиенты" subtitle={query.data ? `В базе ${query.data.length} клиентов` : undefined}>
        <Button variant="default" component={Link} href="/export/" leftSection={<IconDatabaseExport size={16} />}>
          Выгрузить
        </Button>
        <Button variant="default" leftSection={<IconUpload size={16} />} onClick={() => setImporting(true)}>
          Импорт из CSV
        </Button>
        <Button leftSection={<IconUserPlus size={16} />} onClick={() => setCreating(true)}>
          Новый клиент
        </Button>
      </PageHeader>

      <Paper withBorder p="sm" mb="md">
        <Group>
          <TextInput
            placeholder={showPhone ? 'Поиск по имени, телефону, заметкам' : 'Поиск по имени и заметкам'}
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            style={{ flex: 1 }}
          />
          <SegmentedControl
            value={segment}
            onChange={(v) => {
              setSegment(v as Segment);
              setPage(1);
            }}
            data={[
              { value: 'all', label: 'Все' },
              { value: 'with-orders', label: 'С заказами' },
              { value: 'no-orders', label: 'Без заказов' },
              { value: 'discount', label: 'Со скидкой' },
              { value: 'sleeping', label: 'Не заказывали 6+ мес.' },
            ]}
          />
        </Group>
      </Paper>

      {query.isError && <Alert color="red">{query.error.message}</Alert>}
      {query.isLoading && <Loader />}
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed">
          Показано {rows.length}
        </Text>
      </Group>
      <Paper withBorder>
        <Table highlightOnHover striped>
          <Table.Thead>
            <Table.Tr>
              {header('name', 'Клиент')}
              {showPhone && <Table.Th>Телефон</Table.Th>}
              {header('discount_percent', 'Скидка', 'right')}
              {showStats && header('ordersCount', 'Заказов', 'right')}
              {showAmount && header('revenue', 'Выручка', 'right')}
              {showStats && header('lastOrderAt', 'Последний заказ')}
              {header('created_at', 'В базе с')}
              <Table.Th>Заметки</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pageRows.map((c: ClientWithStats) => (
              <Table.Tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => ui.openClient(c.id)}>
                <Table.Td fw={500}>{c.name}</Table.Td>
                {showPhone && <Table.Td>{c.phone ? formatPhone(c.phone) : '—'}</Table.Td>}
                <Table.Td ta="right">{c.discount_percent ? `${c.discount_percent}%` : '—'}</Table.Td>
                {showStats && (
                  <Table.Td ta="right">
                    {c.ordersCount}
                    {c.ordersCount > 0 && (
                      <Text span size="xs" c="dimmed">
                        {' '}
                        ({c.completedCount} зав.)
                      </Text>
                    )}
                  </Table.Td>
                )}
                {showAmount && <Table.Td ta="right">{c.revenue ? formatMoney(c.revenue) : '—'}</Table.Td>}
                {showStats && (
                  <Table.Td>{c.lastOrderAt ? dayjs(c.lastOrderAt).format('DD.MM.YYYY') : '—'}</Table.Td>
                )}
                <Table.Td>{dayjs(c.created_at).format('DD.MM.YYYY')}</Table.Td>
                <Table.Td maw={260}>
                  <Text size="sm" truncate c="dimmed">
                    {c.notes}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
            {!query.isLoading && rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <Text c="dimmed" ta="center" py="lg">
                    Никого не нашли
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>
      {pages > 1 && (
        <Group justify="center" mt="md">
          <Pagination value={page} onChange={setPage} total={pages} />
        </Group>
      )}
      {creating && (
        <ClientFormModal client={null} onClose={() => setCreating(false)} onSaved={(c) => ui.openClient(c.id)} />
      )}
      {importing && <ClientImportModal clients={query.data ?? []} onClose={() => setImporting(false)} />}
    </Box>
  );
}
