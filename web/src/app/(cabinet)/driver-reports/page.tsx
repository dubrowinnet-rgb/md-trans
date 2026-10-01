'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Box, Group, Loader, Pagination, Paper, SegmentedControl, Table, Tabs, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDriverReports, type DriverReport } from '@/api/driverReports';
import { useAllAccounts } from '@/api/accounts';
import { isOfficeRole, useSession } from '@/providers/SessionProvider';
import { DRIVER_REPORT_STATUS_COLORS, DRIVER_REPORT_STATUS_LABELS } from '@/lib/labels';
import { dayjs, formatDate, formatMoney } from '@/lib/dates';
import { PageHeader } from '@/components/common/PageHeader';
import { DriverReportDetailModal } from '@/components/driverReports/DriverReportDetailModal';
import { DriverReportFeed } from '@/components/driverReports/DriverReportFeed';

type Period = 'week' | 'month' | 'year' | 'all' | 'custom';

// Строк таблицы за раз: у крупной компании отчётов за месяц больше тысячи.
const TABLE_PAGE = 100;

interface MonthlyRow {
  key: string;
  sortKey: string;
  month: string;
  employeeName: string;
  reportsCount: number;
  unconfirmedCount: number;
  cashCollected: number;
  expectedHandIn: number;
  handedIn: number;
  discrepancy: number;
}

function buildMonthlyRollup(reports: DriverReport[], namesById: Map<string, string>): MonthlyRow[] {
  const map = new Map<string, MonthlyRow>();
  for (const r of reports) {
    const sortKey = dayjs(r.report_date).format('YYYY-MM');
    const key = `${r.employee_id}:${sortKey}`;
    const row = map.get(key) ?? {
      key,
      sortKey,
      month: dayjs(r.report_date).format('MMMM YYYY'),
      employeeName: namesById.get(r.employee_id) ?? '—',
      reportsCount: 0,
      unconfirmedCount: 0,
      cashCollected: 0,
      expectedHandIn: 0,
      handedIn: 0,
      discrepancy: 0,
    };
    row.reportsCount += 1;
    if (r.status !== 'confirmed') row.unconfirmedCount += 1;
    row.cashCollected += r.cashCollected;
    row.expectedHandIn += r.expectedHandIn;
    row.handedIn += r.cash_handed_in ?? 0;
    row.discrepancy += r.discrepancy;
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.sortKey === b.sortKey ? a.employeeName.localeCompare(b.employeeName) : b.sortKey.localeCompare(a.sortKey)
  );
}

// Отчёты водителей (касса, расходы, топливо, согласование) — сторона
// администратора и диспетчера (запросы Максима 2026-09-25 и 2026-09-28).
// Мобильный тред владеет схемой (0014, 0019), фото одометра и напоминанием
// 21:00; здесь только чтение, «согласовать» и «не согласовать» с
// комментарием. Основной вид — лента, таблица и помесячный итог остались
// соседними вкладками. Диспетчер проверяет отчёты наравне с
// администратором (0019, can_review_driver_reports()).
export default function DriverReportsPage() {
  const { employee } = useSession();
  const [period, setPeriod] = useState<Period>('month');
  const [custom, setCustom] = useState<[string | null, string | null]>([null, null]);
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [tablePage, setTablePage] = useState(1);

  const range = useMemo(() => {
    const now = dayjs();
    if (period === 'week') {
      const start = now.startOf('day').subtract((now.day() + 6) % 7, 'day');
      return { from: start.format('YYYY-MM-DD'), to: start.add(7, 'day').format('YYYY-MM-DD') };
    }
    if (period === 'month') {
      return { from: now.startOf('month').format('YYYY-MM-DD'), to: now.startOf('month').add(1, 'month').format('YYYY-MM-DD') };
    }
    if (period === 'year') {
      return { from: now.startOf('year').format('YYYY-MM-DD'), to: now.startOf('year').add(1, 'year').format('YYYY-MM-DD') };
    }
    if (period === 'custom' && custom[0] && custom[1]) {
      return { from: custom[0], to: dayjs(custom[1]).add(1, 'day').format('YYYY-MM-DD') };
    }
    return null;
  }, [period, custom]);

  const reportsQuery = useDriverReports(range);
  const accountsQuery = useAllAccounts();

  if (!isOfficeRole(employee)) {
    return (
      <Box p={{ base: 'sm', sm: 'lg' }}>
        <Alert>Отчёты водителей доступны администратору и диспетчеру.</Alert>
      </Box>
    );
  }

  const reports = reportsQuery.data?.reports ?? [];
  const accounts = accountsQuery.data ?? [];
  const namesById = new Map(accounts.map((a) => [a.id, [a.name, a.last_name].filter(Boolean).join(' ')]));
  const pendingCount = reports.filter((r) => r.status === 'submitted').length;
  const openReport = reports.find((r) => r.id === openReportId) ?? null;
  const monthlyRows = buildMonthlyRollup(reports, namesById);
  const tablePages = Math.max(1, Math.ceil(reports.length / TABLE_PAGE));
  const currentTablePage = Math.min(tablePage, tablePages);
  const tableRows = reports.slice((currentTablePage - 1) * TABLE_PAGE, currentTablePage * TABLE_PAGE);

  return (
    <Box p={{ base: 'sm', sm: 'lg' }}>
      <PageHeader title="Отчёты водителей" subtitle="Лента отчётов: заказы, касса, расходы, топливо и проверка">
        <SegmentedControl
          value={period}
          onChange={(v) => {
            setPeriod(v as Period);
            setTablePage(1);
          }}
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
            onChange={(v) => {
              setCustom(v as [string | null, string | null]);
              setTablePage(1);
            }}
            valueFormat="D MMM YYYY"
            w={240}
          />
        )}
      </PageHeader>

      {reportsQuery.isError && <Alert color="red">Не удалось загрузить отчёты</Alert>}
      <Tabs defaultValue="feed" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab
            value="feed"
            rightSection={
              pendingCount > 0 ? (
                <Badge size="sm" color="yellow" circle={pendingCount < 10}>
                  {pendingCount}
                </Badge>
              ) : undefined
            }
          >
            Лента
          </Tabs.Tab>
          <Tabs.Tab value="reports">Таблица</Tabs.Tab>
          <Tabs.Tab value="monthly">Помесячно</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="feed">
          <DriverReportFeed
            reports={reports}
            accounts={accounts}
            namesById={namesById}
            loading={reportsQuery.isLoading}
          />
        </Tabs.Panel>

        <Tabs.Panel value="reports">
          {reportsQuery.isLoading && <Loader mb="md" />}
          <Paper withBorder>
            <Table.ScrollContainer minWidth={700}>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Дата</Table.Th>
                  <Table.Th>Сотрудник</Table.Th>
                  <Table.Th>Статус</Table.Th>
                  <Table.Th ta="right">Должен сдать</Table.Th>
                  <Table.Th ta="right">Сдал</Table.Th>
                  <Table.Th ta="right">Расхождение</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tableRows.map((r) => (
                  <Table.Tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setOpenReportId(r.id)}>
                    <Table.Td>{formatDate(r.report_date)}</Table.Td>
                    <Table.Td>{namesById.get(r.employee_id) ?? '—'}</Table.Td>
                    <Table.Td>
                      <Badge color={DRIVER_REPORT_STATUS_COLORS[r.status]}>{DRIVER_REPORT_STATUS_LABELS[r.status]}</Badge>
                    </Table.Td>
                    <Table.Td ta="right">{formatMoney(r.expectedHandIn)}</Table.Td>
                    <Table.Td ta="right">{formatMoney(r.cash_handed_in)}</Table.Td>
                    <Table.Td ta="right" c={r.discrepancy === 0 ? undefined : 'red'}>
                      {r.discrepancy > 0 ? '+' : ''}
                      {formatMoney(r.discrepancy)}
                    </Table.Td>
                  </Table.Tr>
                ))}
                {reports.length === 0 && !reportsQuery.isLoading && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text c="dimmed" ta="center" py="lg">
                        За этот период отчётов нет
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
            </Table.ScrollContainer>
          </Paper>
          {tablePages > 1 && (
            <Group justify="center" mt="md">
              <Pagination value={currentTablePage} onChange={setTablePage} total={tablePages} />
            </Group>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="monthly">
          <Paper withBorder>
            <Table.ScrollContainer minWidth={800}>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Месяц</Table.Th>
                  <Table.Th>Сотрудник</Table.Th>
                  <Table.Th ta="right">Отчётов</Table.Th>
                  <Table.Th ta="right">Собрано нал.</Table.Th>
                  <Table.Th ta="right">Должен сдать</Table.Th>
                  <Table.Th ta="right">Сдал</Table.Th>
                  <Table.Th ta="right">Расхождение</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {monthlyRows.map((row) => (
                  <Table.Tr key={row.key}>
                    <Table.Td style={{ textTransform: 'capitalize' }}>{row.month}</Table.Td>
                    <Table.Td>{row.employeeName}</Table.Td>
                    <Table.Td ta="right">
                      {row.reportsCount}
                      {row.unconfirmedCount > 0 && (
                        <Text span size="xs" c="yellow.8" ml={4}>
                          ({row.unconfirmedCount} не согл.)
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">{formatMoney(row.cashCollected)}</Table.Td>
                    <Table.Td ta="right">{formatMoney(row.expectedHandIn)}</Table.Td>
                    <Table.Td ta="right">{formatMoney(row.handedIn)}</Table.Td>
                    <Table.Td ta="right" c={row.discrepancy === 0 ? undefined : 'red'}>
                      {row.discrepancy > 0 ? '+' : ''}
                      {formatMoney(row.discrepancy)}
                    </Table.Td>
                  </Table.Tr>
                ))}
                {monthlyRows.length === 0 && !reportsQuery.isLoading && (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Text c="dimmed" ta="center" py="lg">
                        За этот период данных нет
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
            </Table.ScrollContainer>
          </Paper>
        </Tabs.Panel>
      </Tabs>

      {openReport && (
        <DriverReportDetailModal
          report={openReport}
          namesById={namesById}
          onClose={() => setOpenReportId(null)}
        />
      )}
    </Box>
  );
}
