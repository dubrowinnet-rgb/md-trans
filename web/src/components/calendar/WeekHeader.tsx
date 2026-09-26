'use client';

import { useState } from 'react';
import { ActionIcon, Button, Group, Popover, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { DatePicker, MonthPicker } from '@mantine/dates';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { dayjs, fromDateKey, toDateKey } from '@/lib/dates';

type Picker = 'day' | 'month' | 'year' | null;

// Шапка календаря: стрелки по неделям и кликабельные день, месяц и год.
// Клик по дню — выбрать конкретную дату, по месяцу — месяц, по году —
// год и затем месяц, чтобы не листать туда по неделе.
export function WeekHeader({
  anchor,
  onChange,
}: {
  anchor: Date;
  onChange: (date: Date) => void;
}) {
  const [open, setOpen] = useState<Picker>(null);
  const a = dayjs(anchor);

  const pick = (value: string | null) => {
    if (!value) return;
    setOpen(null);
    onChange(fromDateKey(value));
  };

  const part = (key: Exclude<Picker, null>, label: string, tooltip: string) => (
    <Tooltip label={tooltip} openDelay={400}>
      <UnstyledButton
        onClick={() => setOpen(open === key ? null : key)}
        px={6}
        py={2}
        style={{
          borderRadius: 6,
          background: open === key ? 'var(--mantine-color-violet-1)' : undefined,
        }}
        className="header-part"
        aria-label={tooltip}
      >
        <Text fw={700} fz={22} span>
          {label}
        </Text>
      </UnstyledButton>
    </Tooltip>
  );

  return (
    <Group gap="xs" wrap="nowrap">
      <ActionIcon variant="default" size="lg" aria-label="Предыдущая неделя" onClick={() => onChange(a.subtract(7, 'day').toDate())}>
        <IconChevronLeft size={18} />
      </ActionIcon>
      <ActionIcon variant="default" size="lg" aria-label="Следующая неделя" onClick={() => onChange(a.add(7, 'day').toDate())}>
        <IconChevronRight size={18} />
      </ActionIcon>
      <Button variant="default" onClick={() => onChange(new Date())}>
        Сегодня
      </Button>

      <Popover
        opened={open !== null}
        onChange={(o) => !o && setOpen(null)}
        position="bottom-start"
        shadow="md"
        withArrow
      >
        <Popover.Target>
          <Group gap={0} ml="sm" wrap="nowrap">
            {part('day', a.format('D'), 'Выбрать дату')}
            {/* «23 сентября»: месяц в родительном падеже, как его склоняет dayjs после числа */}
            {part('month', a.format('D MMMM').replace(/^\d+\s/, ''), 'Выбрать месяц')}
            {part('year', a.format('YYYY'), 'Выбрать год')}
          </Group>
        </Popover.Target>
        <Popover.Dropdown>
          {open === 'day' && (
            <DatePicker key="day" value={toDateKey(anchor)} defaultDate={toDateKey(anchor)} onChange={pick} />
          )}
          {open === 'month' && (
            <MonthPicker
              key="month"
              value={a.startOf('month').format('YYYY-MM-DD')}
              defaultDate={toDateKey(anchor)}
              onChange={pick}
            />
          )}
          {open === 'year' && (
            <MonthPicker
              key="year"
              defaultLevel="decade"
              value={a.startOf('month').format('YYYY-MM-DD')}
              defaultDate={toDateKey(anchor)}
              onChange={pick}
            />
          )}
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
