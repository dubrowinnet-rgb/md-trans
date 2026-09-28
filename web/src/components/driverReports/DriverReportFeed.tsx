'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Badge, Box, Button, Center, Grid, Group, Loader, NavLink, Paper, ScrollArea, Select, Stack, Text } from '@mantine/core';
import { useViewportSize } from '@mantine/hooks';
import { IconUsers } from '@tabler/icons-react';
import { dayjs } from '@/lib/dates';
import { DRIVER_REPORT_STATUS_COLORS, DRIVER_REPORT_STATUS_LABELS } from '@/lib/labels';
import { reportWrittenAt, type DriverReport, type DriverReportStatus } from '@/api/driverReports';
import type { Account } from '@/api/accounts';
import { DriverReportCash, DriverReportDetails } from '@/components/driverReports/DriverReportBody';
import { DriverReportTimes } from '@/components/driverReports/DriverReportTimes';
import { DriverReportReview } from '@/components/driverReports/DriverReportReview';

const ALL = 'all';

// Сколько карточек ленты рисуем сразу: у крупной компании отчётов за месяц
// больше тысячи, а каждая карточка — с таблицами. Более ранние
// открываются кнопкой сверху, по столько же.
const FEED_STEP = 30;

const STATUS_STRIPE: Record<DriverReportStatus, string> = {
  draft: 'var(--mantine-color-gray-4)',
  submitted: 'var(--mantine-color-yellow-5)',
  confirmed: 'var(--mantine-color-green-6)',
  rejected: 'var(--mantine-color-red-6)',
};

// «1 отчёт», «3 отчёта», «12 отчётов».
function pluralReports(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} отчёт`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} отчёта`;
  return `${n} отчётов`;
}

interface DriverEntry {
  id: string;
  name: string;
  total: number;
  pending: number;
  rejected: number;
}

// Лента отчётов водителей — как Максим ведёт их сейчас в личных сообщениях
// соцсети: только отчёты, по порядку от начала месяца до сегодня, одна и та
// же у водителя и у администратора/диспетчера (доработка 2026-09-28).
// Слева водители (как список чатов), справа лента выбранного: старые
// сверху, последний отчёт снизу, прокрутка сразу стоит на нём. Черновиков
// здесь нет — неотправленный отчёт база показывает только водителю (0019);
// фильтр ниже — на случай старой базы без этой миграции.
export function DriverReportFeed({
  reports,
  accounts,
  namesById,
  loading,
}: {
  reports: DriverReport[];
  accounts: Account[];
  namesById: Map<string, string>;
  loading: boolean;
}) {
  const [selected, setSelected] = useState<string>(ALL);

  const sent = useMemo(
    () =>
      reports
        .filter((r) => r.status !== 'draft')
        .sort(
          (a, b) =>
            a.report_date.localeCompare(b.report_date) ||
            new Date(reportWrittenAt(a)).getTime() - new Date(reportWrittenAt(b)).getTime()
        ),
    [reports]
  );

  const drivers = useMemo<DriverEntry[]>(() => {
    const counts = new Map<string, { total: number; pending: number; rejected: number }>();
    for (const r of sent) {
      const entry = counts.get(r.employee_id) ?? { total: 0, pending: 0, rejected: 0 };
      entry.total += 1;
      if (r.status === 'submitted') entry.pending += 1;
      if (r.status === 'rejected') entry.rejected += 1;
      counts.set(r.employee_id, entry);
    }
    const ids = new Set(accounts.filter((a) => a.role === 'driver' && a.account_status === 'active').map((a) => a.id));
    for (const id of counts.keys()) ids.add(id);
    return [...ids]
      .map((id) => ({
        id,
        name: namesById.get(id) ?? '—',
        ...(counts.get(id) ?? { total: 0, pending: 0, rejected: 0 }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [accounts, sent, namesById]);

  const feed = selected === ALL ? sent : sent.filter((r) => r.employee_id === selected);
  const pendingInFeed = feed.filter((r) => r.status === 'submitted');
  const pendingTotal = sent.filter((r) => r.status === 'submitted').length;
  const selectedName = selected === ALL ? 'Все водители' : namesById.get(selected) ?? '—';

  // Другой водитель или период — снова последние FEED_STEP карточек.
  const feedKey = `${selected}|${feed[0]?.id ?? ''}|${feed.length}`;
  const [shown, setShown] = useState({ key: '', count: FEED_STEP });
  const shownCount = shown.key === feedKey ? shown.count : FEED_STEP;
  const visible = feed.slice(Math.max(0, feed.length - shownCount));
  const hiddenCount = feed.length - visible.length;

  // Высота ленты — до низа окна, чтобы она листалась сама по себе, как
  // переписка, а список водителей слева оставался на месте.
  const paneRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { height: windowHeight } = useViewportSize();
  const [paneTop, setPaneTop] = useState(0);
  useLayoutEffect(() => {
    if (paneRef.current) setPaneTop(paneRef.current.getBoundingClientRect().top + window.scrollY);
  }, [windowHeight, loading]);
  const paneHeight = Math.max(440, windowHeight - paneTop - 24);
  const feedHeight = paneHeight - 58;

  // Открыли ленту / сменили водителя или период — показываем последний отчёт.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
    return () => cancelAnimationFrame(frame);
  }, [selected, feed.length, loading, feedHeight]);

  // Раскрыли более ранние карточки сверху — оставляем на экране то же, что
  // было (иначе новые карточки сдвинут ленту вниз), или едем к нужной.
  const keepFromBottomRef = useRef<number | null>(null);
  const scrollToIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (scrollToIdRef.current) {
      document.getElementById(`report-${scrollToIdRef.current}`)?.scrollIntoView({ block: 'start' });
      scrollToIdRef.current = null;
    } else if (el && keepFromBottomRef.current !== null) {
      el.scrollTop = el.scrollHeight - keepFromBottomRef.current;
    }
    keepFromBottomRef.current = null;
  }, [shownCount]);

  const showEarlier = () => {
    const el = viewportRef.current;
    keepFromBottomRef.current = el ? el.scrollHeight - el.scrollTop : null;
    setShown({ key: feedKey, count: shownCount + FEED_STEP });
  };

  const showFirstPending = () => {
    const first = pendingInFeed[0];
    if (!first) return;
    const needed = feed.length - feed.indexOf(first);
    if (needed > shownCount) {
      scrollToIdRef.current = first.id;
      setShown({ key: feedKey, count: needed });
      return;
    }
    document.getElementById(`report-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Grid gap="md">
      <Grid.Col span={{ md: 4, lg: 3 }} visibleFrom="md">
        <Paper withBorder h={paneHeight}>
          <ScrollArea h="100%" p={4}>
            <NavLink
              component="button"
              active={selected === ALL}
              label="Все водители"
              leftSection={<IconUsers size={16} />}
              rightSection={
                pendingTotal > 0 ? (
                  <Badge size="sm" color="yellow" circle={pendingTotal < 10}>
                    {pendingTotal}
                  </Badge>
                ) : undefined
              }
              onClick={() => setSelected(ALL)}
            />
            {drivers.map((d) => (
              <NavLink
                component="button"
                key={d.id}
                active={selected === d.id}
                label={d.name}
                description={
                  d.total === 0
                    ? 'Отчётов нет'
                    : `${pluralReports(d.total)}${d.rejected > 0 ? ` · не согласовано: ${d.rejected}` : ''}`
                }
                rightSection={
                  d.pending > 0 ? (
                    <Badge size="sm" color="yellow" circle={d.pending < 10}>
                      {d.pending}
                    </Badge>
                  ) : undefined
                }
                onClick={() => setSelected(d.id)}
              />
            ))}
          </ScrollArea>
        </Paper>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
        <Select
          hiddenFrom="md"
          mb="sm"
          label="Водитель"
          allowDeselect={false}
          value={selected}
          onChange={(v) => setSelected(v ?? ALL)}
          data={[
            { value: ALL, label: pendingTotal > 0 ? `Все водители (ждут проверки: ${pendingTotal})` : 'Все водители' },
            ...drivers.map((d) => ({
              value: d.id,
              label: d.pending > 0 ? `${d.name} (ждут проверки: ${d.pending})` : d.name,
            })),
          ]}
        />
        <Paper withBorder ref={paneRef} h={paneHeight}>
          <Group justify="space-between" px="md" h={57} wrap="nowrap" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <div>
              <Text fw={600} lh={1.2}>
                {selectedName}
              </Text>
              <Text size="xs" c="dimmed">
                {feed.length === 0 ? 'Отчётов за период нет' : `${pluralReports(feed.length)} за период`}
              </Text>
            </div>
            {pendingInFeed.length > 0 && (
              <Button size="xs" variant="light" color="yellow" onClick={showFirstPending}>
                Ждут проверки: {pendingInFeed.length}
              </Button>
            )}
          </Group>
          <ScrollArea h={feedHeight} viewportRef={viewportRef} bg="gray.0">
            {loading ? (
              <Center h={feedHeight}>
                <Loader />
              </Center>
            ) : feed.length === 0 ? (
              <Center h={feedHeight}>
                <Text c="dimmed">За этот период отчётов нет</Text>
              </Center>
            ) : (
              <Stack gap="md" p="md">
                {hiddenCount > 0 && (
                  <Center>
                    <Button variant="subtle" size="xs" onClick={showEarlier}>
                      Показать более ранние ({hiddenCount})
                    </Button>
                  </Center>
                )}
                {visible.map((report) => (
                  <FeedCard
                    key={report.id}
                    report={report}
                    driverName={selected === ALL ? namesById.get(report.employee_id) ?? '—' : null}
                    namesById={namesById}
                  />
                ))}
              </Stack>
            )}
          </ScrollArea>
        </Paper>
      </Grid.Col>
    </Grid>
  );
}

function FeedCard({
  report,
  driverName,
  namesById,
}: {
  report: DriverReport;
  driverName: string | null;
  namesById: Map<string, string>;
}) {
  const day = dayjs(report.report_date);
  return (
    <Paper
      id={`report-${report.id}`}
      withBorder
      radius="md"
      p="md"
      style={{ borderLeft: `4px solid ${STATUS_STRIPE[report.status]}`, scrollMarginTop: 8 }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="sm">
        <Box>
          <Text fw={600}>
            {driverName ? `${driverName} · ` : ''}Отчёт за {day.format('D MMMM')}
            <Text span c="dimmed" fw={400}>
              , {day.format('dddd')}
            </Text>
          </Text>
          <DriverReportTimes report={report} />
        </Box>
        <Badge variant="light" color={DRIVER_REPORT_STATUS_COLORS[report.status]} style={{ flexShrink: 0 }}>
          {DRIVER_REPORT_STATUS_LABELS[report.status]}
        </Badge>
      </Group>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <DriverReportDetails report={report} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Text size="sm" fw={500} mb={4}>
            Касса
          </Text>
          <DriverReportCash report={report} />
        </Grid.Col>
      </Grid>
      <Box mt="md">
        <DriverReportReview report={report} namesById={namesById} />
      </Box>
    </Paper>
  );
}
