'use client';

import { Indicator, Menu, ScrollArea, Text, UnstyledButton } from '@mantine/core';
import { IconBell, IconCake, IconCreditCardOff } from '@tabler/icons-react';
import { useAllAccounts } from '@/api/accounts';
import { dayjs } from '@/lib/dates';

interface AdminNotification {
  id: string;
  kind: 'birthday' | 'subscription';
  text: string;
  daysLeft: number;
}

type NotifiableAccount = { id: string; name: string; birth_date: string | null; paid_until: string | null };

// Дни рождения (за 7 и 1 день) и окончание оплаченной подписки (за 3 дня) —
// доработки 2, п.6. Считается на лету из уже имеющихся employees.birth_date/
// paid_until, отдельная таблица не нужна. Список открыт для расширения:
// новый вид уведомления — ещё один проход по accounts здесь.
function buildNotifications(accounts: NotifiableAccount[]): AdminNotification[] {
  const today = dayjs().startOf('day');
  const items: AdminNotification[] = [];
  for (const a of accounts) {
    if (a.birth_date) {
      let next = dayjs(a.birth_date).year(today.year()).startOf('day');
      if (next.isBefore(today)) next = next.add(1, 'year');
      const daysLeft = next.diff(today, 'day');
      if (daysLeft === 1 || daysLeft === 7) {
        items.push({
          id: `birthday-${a.id}`,
          kind: 'birthday',
          text: daysLeft === 1 ? `День рождения у ${a.name} — завтра` : `День рождения у ${a.name} — через 7 дней`,
          daysLeft,
        });
      }
    }
    if (a.paid_until) {
      const daysLeft = dayjs(a.paid_until).startOf('day').diff(today, 'day');
      if (daysLeft === 3) {
        items.push({
          id: `subscription-${a.id}`,
          kind: 'subscription',
          text: `Подписка ${a.name} заканчивается через 3 дня`,
          daysLeft,
        });
      }
    }
  }
  return items.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function NotificationBell() {
  const accounts = useAllAccounts().data ?? [];
  const items = buildNotifications(accounts);

  return (
    <Menu position="bottom-end" withArrow width={320} shadow="md">
      <Menu.Target>
        <UnstyledButton style={{ borderRadius: 8, lineHeight: 0 }} p={6} aria-label="Уведомления">
          <Indicator disabled={items.length === 0} label={items.length} size={16} color="red" offset={2}>
            <IconBell size={20} stroke={1.6} />
          </Indicator>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Уведомления</Menu.Label>
        {items.length === 0 && (
          <Text size="sm" c="dimmed" px="sm" py="xs">
            Нет новых уведомлений
          </Text>
        )}
        <ScrollArea.Autosize mah={320}>
          {items.map((item) => (
            <Menu.Item
              key={item.id}
              leftSection={item.kind === 'birthday' ? <IconCake size={16} /> : <IconCreditCardOff size={16} />}
            >
              <Text size="sm">{item.text}</Text>
            </Menu.Item>
          ))}
        </ScrollArea.Autosize>
      </Menu.Dropdown>
    </Menu>
  );
}
