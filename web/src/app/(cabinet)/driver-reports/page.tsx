'use client';

import { useMemo, useState } from 'react';
import { Alert, Badge, Box, Loader, Paper, SegmentedControl, Table, Tabs, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDriverReports, type DriverReport } from '@/api/driverReports';
import { useAllAccounts } from '@/api/accounts';
import { useSession } from '@/providers/SessionProvider';
import { DRIVER_REPORT_STATUS_COLORS, DRIVER_REPORT_STATUS_LABELS } from '@/lib/labels';
import { dayjs, formatDate, formatMoney } from '@/lib/dates';
import { PageHeader } from '@/components/common/PageHeader';
import { ComingSoon } from '@/components/common/ComingSoon';
import { DriverReportDetailModal } from '@/components/driverReports/DriverReportDetailModal';

type Period = 'week' | 'month' | 'year' | 'all' | 'custom';

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

// Отчёты водителей (касса, расходы, топливо, подтверждение) — админская
// сторона запроса Максима от 2026-09-25. Мобильный тред владеет схемой,
// фото одометра и напоминанием 21:00; здесь только чтение/подтверждение.
// Схема (driver_reports и связанные) ещё не пришла — до тех пор страница
// показывает ComingSoon, см. api/driverReports.ts.
export default function DriverReportsPage() {
  const { employee } = useSession();
  const [period, setPeriod] = useState<Period>('month');
  const [custom, setCustom] = useState<[string | null, string | null]>([null, null]);
  const [openReportId, setOpenReportId] = useState<string | null>(null);

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

  if (employee?.role !== 'admin') {
    return (
      <Box p="lg">
        <Alert>Отчёты водителей доступны только администратору.</Alert>
      </Box>
    );
  }

  const reports = reportsQuery.data?.reports ?? [];
  const missing = reportsQuery.data?.missingTable ?? false;
  const namesById = new Map((accountsQuery.data ?? []).map((a) => [a.id, a.name]));
  const openReport = reports.find((r) => r.id === openReportId) ?? null;
  const monthlyRows = buildMonthlyRollup(reports, namesById);

  return (
    <Box p="lg">
      <PageHeader title="Отчёты водителей" subtitle="Касса, расходы, топливо и подтверждение сдачи">
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

      {missing ? (
        <ComingSoon text="Отчёты появятся здесь, как только водители начнут их заполнять в мобильном приложении." />
      ) : (
        <>
          {reportsQuery.isError && <Alert color="red">Не удалось загрузить отчёты</Alert>}
          {reportsQuery.isLoading && <Loader />}
          <Tabs defaultValue="reports">
            <Tabs.List mb="md">
              <Tabs.Tab value="reports">
                Отчёты
                {reports.some((r) => r.status === 'submitted') && (
                  <Badge ml={6} size="xs" color="yellow" circle>
                    {reports.filter((r) => r.status === 'submitted').length}
                  </Badge>
                )}
              </Tabs.Tab>
              <Tabs.Tab value="monthly">Помесячно</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="reports">
              <Paper withBorder>
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
                    {reports.map((r) => (
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
              </Paper>
            </Tabs.Panel>

            <Tabs.Panel value="monthly">
              <Paper withBorder>
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
                              ({row.unconfirmedCount} не подтв.)
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
              </Paper>
            </Tabs.Panel>
          </Tabs>
        </>
      )}

      {openReport && employee && (
        <DriverReportDetailModal
          report={openReport}
          employeeName={namesById.get(openReport.employee_id) ?? '—'}
          confirmedByName={openReport.confirmed_by ? namesById.get(openReport.confirmed_by) ?? null : null}
          currentEmployeeId={employee.id}
          onClose={() => setOpenReportId(null)}
        />
      )}
    </Box>
  );
}
