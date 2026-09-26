'use client';

import { useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft, IconChevronRight, IconClipboardCopy, IconArrowsExchange, IconX } from '@tabler/icons-react';
import { useEmployees, type Employee } from '@/api/employees';
import {
  effectiveScheduleStatus,
  formatTimeShort,
  useClearScheduleDay,
  useScheduleDaysInRange,
  useSetScheduleDay,
  type ScheduleDay,
} from '@/api/schedule';
import { useOrdersForRange } from '@/api/orders';
import { useSession } from '@/providers/SessionProvider';
import { canManageOrders } from '@/lib/permissions';
import { dayjs, fromDateKey, toDateKey } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { PageHeader } from '@/components/common/PageHeader';
import { TimeField } from '@/components/common/TimeField';
import type { ScheduleDayStatus, ScheduleMode } from '@/types/database';

const MODE_LABEL: Record<ScheduleMode, string> = {
  mark_off: 'отмечает выходные',
  mark_on: 'отмечает рабочие дни',
};

const STATUS_STYLE: Record<ScheduleDayStatus, { bg: string; border: string; color: string }> = {
  on: { bg: '#d3f9d8', border: '#69db7c', color: '#2b8a3e' },
  off: { bg: '#ffe3e3', border: '#ff8787', color: '#c92a2a' },
};

interface CellRef {
  employee: Employee;
  day: string;
}

interface Clipboard {
  op: 'copy' | 'move';
  from: CellRef;
  status: ScheduleDayStatus;
  start_time: string | null;
  end_time: string | null;
}

const shortHours = (row: ScheduleDay | undefined) =>
  row?.start_time && row?.end_time
    ? `${Number(row.start_time.slice(0, 2))}–${Number(row.end_time.slice(0, 2))}`
    : '';

// График на месяц сразу по всем водителям и грузчикам: строка —
// сотрудник, колонка — день. У каждого свой режим (миграция 0008): кто-то
// отмечает выходные, кто-то рабочие дни; день без отметки считается по
// режиму. Клик по клетке открывает день: рабочий/выходной, часы работы,
// сброс, копирование и перенос на другие дни или другим сотрудникам.
export default function SchedulePage() {
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const { employee: me } = useSession();
  const canEdit = canManageOrders(me);
  const employees = useEmployees().data ?? [];
  const days = useMemo(
    () => Array.from({ length: month.daysInMonth() }, (_, i) => month.add(i, 'day')),
    [month]
  );
  const fromKey = toDateKey(month.toDate());
  const toKey = toDateKey(month.endOf('month').toDate());
  const scheduleQuery = useScheduleDaysInRange(fromKey, toKey);
  const schedule = scheduleQuery.data ?? new Map<string, ScheduleDay>();
  const ordersQuery = useOrdersForRange(month.toDate(), month.add(1, 'month').toDate());
  const setDay = useSetScheduleDay();
  const clearDay = useClearScheduleDay();

  const [active, setActive] = useState<CellRef | null>(null);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

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

  const onError = (err: unknown) => notifications.show({ message: errorMessage(err, 'Не удалось сохранить график'), color: 'red' });

  // Записать день так, чтобы отметка была только там, где день отличается
  // от режима сотрудника: совпадающий с режимом день без часов — просто
  // без строки.
  const writeDay = async (
    target: CellRef,
    status: ScheduleDayStatus,
    startTime: string | null = null,
    endTime: string | null = null
  ) => {
    const isDefault = effectiveScheduleStatus(target.employee.schedule_mode, undefined) === status;
    const hasHours = status === 'on' && startTime && endTime;
    if (isDefault && !hasHours) {
      if (schedule.has(`${target.employee.id}:${target.day}`)) {
        await clearDay.mutateAsync({ employeeId: target.employee.id, day: target.day });
      }
    } else {
      await setDay.mutateAsync({ employeeId: target.employee.id, day: target.day, status, startTime, endTime });
    }
  };

  const paste = async (target: CellRef) => {
    if (!clipboard) return;
    const { from, op } = clipboard;
    if (from.employee.id === target.employee.id && from.day === target.day) {
      setClipboard(null);
      return;
    }
    try {
      await writeDay(target, clipboard.status, clipboard.start_time, clipboard.end_time);
      if (op === 'move') {
        if (schedule.has(`${from.employee.id}:${from.day}`)) {
          await clearDay.mutateAsync({ employeeId: from.employee.id, day: from.day });
        }
        setClipboard(null);
        notifications.show({ message: 'День перенесён', color: 'green' });
      }
    } catch (err) {
      onError(err);
    }
  };

  const onCell = (target: CellRef) => {
    if (!canEdit) return;
    if (clipboard) void paste(target);
    else setActive(target);
  };

  const today = toDateKey(new Date());

  return (
    <Box p="lg">
      <PageHeader
        title="График"
        subtitle={canEdit ? 'Клик по дню — отметить, задать часы, скопировать или перенести' : 'Только просмотр'}
      >
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
      {scheduleQuery.isError && (
        <Alert color="red" mb="sm">
          {errorMessage(scheduleQuery.error, 'Не удалось загрузить график')}
        </Alert>
      )}
      {clipboard && (
        <Alert
          color="violet"
          mb="sm"
          icon={clipboard.op === 'move' ? <IconArrowsExchange size={18} /> : <IconClipboardCopy size={18} />}
          title={clipboard.op === 'move' ? 'Перенос дня' : 'Копирование дня'}
          withCloseButton
          onClose={() => setClipboard(null)}
        >
          {clipboard.from.employee.name}, {dayjs(fromDateKey(clipboard.from.day)).format('D MMMM')}:{' '}
          {clipboard.status === 'on' ? 'рабочий' : 'выходной'}
          {clipboard.start_time && clipboard.end_time
            ? ` ${formatTimeShort(clipboard.start_time)}–${formatTimeShort(clipboard.end_time)}`
            : ''}
          .{' '}
          {clipboard.op === 'move'
            ? 'Кликните по дню, куда перенести (можно в строке другого сотрудника).'
            : 'Кликайте по дням, куда вставить, в любых строках. Закончили — нажмите крестик.'}
        </Alert>
      )}
      <Paper withBorder>
        <ScrollArea>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 10px', minWidth: 180, position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>
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
                        minWidth: 34,
                        color: weekend ? '#c92a2a' : undefined,
                        backgroundColor: key === today ? 'var(--mantine-color-violet-1)' : undefined,
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
                  <td style={{ padding: '6px 10px', position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>
                    <Text size="sm" fw={500}>
                      {e.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {e.role === 'driver' ? 'Водитель' : 'Грузчик'} · {MODE_LABEL[e.schedule_mode]}
                      {e.can_manage_own_schedule ? ' · ведёт сам' : ''}
                    </Text>
                  </td>
                  {days.map((d) => {
                    const key = toDateKey(d.toDate());
                    const row = schedule.get(`${e.id}:${key}`);
                    const status = effectiveScheduleStatus(e.schedule_mode, row);
                    const st = STATUS_STYLE[status];
                    const count = ordersCount.get(`${e.id}:${key}`) ?? 0;
                    const hours = shortHours(row);
                    const isSource = clipboard?.from.employee.id === e.id && clipboard.from.day === key;
                    const tooltip =
                      `${d.format('D MMMM')}: ${status === 'on' ? 'рабочий' : 'выходной'}` +
                      (row?.start_time && row?.end_time
                        ? `, ${formatTimeShort(row.start_time)}–${formatTimeShort(row.end_time)}`
                        : '') +
                      (row ? '' : ' (по умолчанию)') +
                      (count ? `, заказов: ${count}` : '');
                    return (
                      <td key={key} style={{ padding: 2 }}>
                        <Tooltip label={tooltip} openDelay={300}>
                          <Box
                            onClick={() => onCell({ employee: e, day: key })}
                            data-testid={`cell-${e.id}-${key}`}
                            data-status={status}
                            style={{
                              height: 34,
                              borderRadius: 4,
                              cursor: canEdit ? (clipboard ? 'copy' : 'pointer') : 'default',
                              backgroundColor: row ? st.bg : 'white',
                              border: `1px ${row ? 'solid' : 'dashed'} ${st.border}`,
                              outline: isSource ? '2px solid var(--mantine-color-violet-6)' : undefined,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: st.color,
                              lineHeight: 1.1,
                            }}
                          >
                            <span style={{ fontWeight: 700, fontSize: 12 }}>
                              {status === 'off' ? 'в' : count || ''}
                            </span>
                            {hours && <span style={{ fontSize: 9, fontWeight: 600 }}>{hours}</span>}
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
        <Legend bg={STATUS_STYLE.on.bg} border={`1px solid ${STATUS_STYLE.on.border}`} text="рабочий (отмечен)" />
        <Legend bg="white" border={`1px dashed ${STATUS_STYLE.on.border}`} text="рабочий по умолчанию" />
        <Legend bg={STATUS_STYLE.off.bg} border={`1px solid ${STATUS_STYLE.off.border}`} text="выходной (отмечен)" />
        <Legend bg="white" border={`1px dashed ${STATUS_STYLE.off.border}`} text="выходной по умолчанию" />
        <Text size="xs" c="dimmed">
          Цифра — заказов в этот день, «9–18» — часы работы
        </Text>
      </Group>

      {active && (
        <DayModal
          cell={active}
          row={schedule.get(`${active.employee.id}:${active.day}`)}
          onClose={() => setActive(null)}
          onSave={async (status, startTime, endTime) => {
            try {
              await writeDay(active, status, startTime, endTime);
              setActive(null);
            } catch (err) {
              onError(err);
            }
          }}
          onReset={async () => {
            try {
              await clearDay.mutateAsync({ employeeId: active.employee.id, day: active.day });
              setActive(null);
            } catch (err) {
              onError(err);
            }
          }}
          onClipboard={(op) => {
            const row = schedule.get(`${active.employee.id}:${active.day}`);
            setClipboard({
              op,
              from: active,
              status: effectiveScheduleStatus(active.employee.schedule_mode, row),
              start_time: row?.start_time ?? null,
              end_time: row?.end_time ?? null,
            });
            setActive(null);
          }}
          saving={setDay.isPending || clearDay.isPending}
        />
      )}
    </Box>
  );
}

function Legend({ bg, border, text }: { bg: string; border: string; text: string }) {
  return (
    <Group gap={6}>
      <Box w={16} h={16} style={{ backgroundColor: bg, border, borderRadius: 3 }} />
      <Text size="xs">{text}</Text>
    </Group>
  );
}

function DayModal({
  cell,
  row,
  onClose,
  onSave,
  onReset,
  onClipboard,
  saving,
}: {
  cell: CellRef;
  row: ScheduleDay | undefined;
  onClose: () => void;
  onSave: (status: ScheduleDayStatus, startTime: string | null, endTime: string | null) => void;
  onReset: () => void;
  onClipboard: (op: 'copy' | 'move') => void;
  saving: boolean;
}) {
  const mode = cell.employee.schedule_mode;
  const status = effectiveScheduleStatus(mode, row);
  const defaultStatus = effectiveScheduleStatus(mode, undefined);
  const [start, setStart] = useState(row?.start_time ? formatTimeShort(row.start_time) : '09:00');
  const [end, setEnd] = useState(row?.end_time ? formatTimeShort(row.end_time) : '18:00');
  const hoursValid = end > start;

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        <span>
          <Text span fw={600}>
            {cell.employee.name}
          </Text>
          <br />
          <Text span size="sm" c="dimmed">
            {dayjs(fromDateKey(cell.day)).format('dddd, D MMMM')}
          </Text>
        </span>
      }
      size="sm"
    >
      <Stack>
        <Text size="sm">
          Сейчас: <b>{status === 'on' ? 'рабочий' : 'выходной'}</b>
          {row?.start_time && row?.end_time
            ? `, ${formatTimeShort(row.start_time)}–${formatTimeShort(row.end_time)}`
            : ''}
          {row ? '' : ' (по умолчанию: сотрудник ' + MODE_LABEL[mode] + ')'}
        </Text>
        <Group grow>
          <Button color="green" variant={status === 'on' ? 'filled' : 'light'} onClick={() => onSave('on', null, null)} loading={saving}>
            Рабочий
          </Button>
          <Button color="red" variant={status === 'off' ? 'filled' : 'light'} onClick={() => onSave('off', null, null)} loading={saving}>
            Выходной
          </Button>
        </Group>
        <Divider label="или рабочий в часы" labelPosition="center" />
        <Group grow align="flex-start">
          <TimeField label="С" value={start} onChange={setStart} />
          <TimeField label="До" value={end} onChange={setEnd} error={hoursValid ? undefined : 'Позже начала'} />
        </Group>
        <Button variant="light" disabled={!hoursValid} onClick={() => onSave('on', `${start}:00`, `${end}:00`)} loading={saving}>
          Сохранить часы {start}–{end}
        </Button>
        <Divider />
        <Group justify="space-between">
          <Group gap="xs">
            <Button variant="default" size="xs" leftSection={<IconClipboardCopy size={14} />} onClick={() => onClipboard('copy')}>
              Копировать
            </Button>
            <Button variant="default" size="xs" leftSection={<IconArrowsExchange size={14} />} onClick={() => onClipboard('move')}>
              Перенести
            </Button>
          </Group>
          {row && (
            <Button variant="subtle" color="gray" size="xs" leftSection={<IconX size={14} />} onClick={onReset} loading={saving}>
              Сбросить ({defaultStatus === 'on' ? 'рабочий' : 'выходной'})
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
