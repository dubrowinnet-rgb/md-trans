import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Badge, Divider, IconButton, Menu } from 'react-native-paper';
import { useAllAccounts, type Account } from '../../api/accounts';
import { useSession } from '../../providers/SessionProvider';
import { differenceInCalendarDays, setYear, startOfDay } from '../../utils/date';

interface AdminNotification {
  id: string;
  kind: 'birthday' | 'subscription';
  text: string;
  daysLeft: number;
}

function parseDateOnly(value: string | null) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

// Дни рождения (за 7 и 1 день) и окончание оплаченной подписки сотрудника
// (за 3 дня) — доработки 2, п.6. Считается на лету из уже имеющихся
// employees.birth_date/paid_until (useAllAccounts, экран «Команда»),
// отдельная таблица не нужна — так же, как и в веб-кабинете
// (web/src/components/common/NotificationBell.tsx, коммит f2bf2d9), чтобы
// список совпадал в обоих приложениях. Список открыт для расширения:
// новый вид уведомления — ещё один проход по accounts здесь.
function buildNotifications(accounts: Account[]): AdminNotification[] {
  const today = startOfDay(new Date());
  const items: AdminNotification[] = [];
  for (const a of accounts) {
    const birthDate = parseDateOnly(a.birth_date);
    if (birthDate) {
      let next = startOfDay(setYear(birthDate, today.getFullYear()));
      if (next < today) next = startOfDay(setYear(birthDate, today.getFullYear() + 1));
      const daysLeft = differenceInCalendarDays(next, today);
      if (daysLeft === 1 || daysLeft === 7) {
        items.push({
          id: `birthday-${a.id}`,
          kind: 'birthday',
          text: daysLeft === 1 ? `День рождения у ${a.name} — завтра` : `День рождения у ${a.name} — через 7 дней`,
          daysLeft,
        });
      }
    }
    const paidUntil = parseDateOnly(a.paid_until);
    if (paidUntil) {
      const daysLeft = differenceInCalendarDays(startOfDay(paidUntil), today);
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

// Колокольчик уведомлений у администратора — рядом с AccountMenu на
// каждом (office) экране. Самостоятельно скрывается для остальных ролей,
// как и AccountMenu.
export function NotificationBell() {
  const { employee } = useSession();
  const [visible, setVisible] = useState(false);
  const accounts = useAllAccounts().data ?? [];
  if (!employee || employee.role !== 'admin') return null;

  const items = buildNotifications(accounts);

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <Pressable onPress={() => setVisible(true)} accessibilityLabel="Уведомления" style={styles.touch}>
          <View>
            <IconButton icon="bell-outline" size={22} style={styles.iconButton} />
            {items.length > 0 && (
              <Badge style={styles.badge} size={16}>
                {items.length}
              </Badge>
            )}
          </View>
        </Pressable>
      }
    >
      <Menu.Item title="Уведомления" disabled />
      <Divider />
      {items.length === 0 && <Menu.Item title="Нет новых уведомлений" disabled />}
      <ScrollView style={items.length > 6 ? styles.scroll : undefined}>
        {items.map((item) => (
          <Menu.Item
            key={item.id}
            leadingIcon={item.kind === 'birthday' ? 'cake-variant-outline' : 'credit-card-off-outline'}
            title={item.text}
            onPress={() => setVisible(false)}
          />
        ))}
      </ScrollView>
    </Menu>
  );
}

const styles = StyleSheet.create({
  touch: {
    marginRight: -4,
  },
  iconButton: {
    margin: 0,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  scroll: {
    maxHeight: 320,
  },
});
