import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Divider, IconButton, Menu } from 'react-native-paper';
import { useAllAccounts, type Account } from '../../api/accounts';
import { useMarkNotificationsReadFor, useNotifications, type AppNotification } from '../../api/notifications';
import { useSession } from '../../providers/SessionProvider';
import { differenceInCalendarDays, setYear, startOfDay } from '../../utils/date';

interface AdminNotification {
  id: string;
  kind: 'birthday' | 'subscription' | 'order_confirmed' | 'report_submitted';
  text: string;
  daysLeft: number;
  source?: AppNotification;
}

// Заказ принят / новый отчёт водителя (Правки 6, п.13 и 21) — те же
// события, что уже пишутся в личную ленту (api/notifications.ts,
// миграция 0029) САМОМУ admin/dispatcher (report_reopened, наоборот,
// уходит водителю — сюда не попадает), здесь показываем только
// непрочитанные, вперемешку с днями рождения и подпиской. daysLeft=0 —
// свежее всех дата-напоминаний, которые всегда >= 1.
const REVIEW_KINDS: AppNotification['kind'][] = ['order_confirmed', 'report_submitted'];

function fromAppNotification(n: AppNotification): AdminNotification {
  return { id: n.id, kind: n.kind as AdminNotification['kind'], text: `${n.title}: ${n.body}`, daysLeft: 0, source: n };
}

const ITEM_ICON: Record<AdminNotification['kind'], string> = {
  birthday: 'cake-variant-outline',
  subscription: 'credit-card-off-outline',
  order_confirmed: 'check-circle-outline',
  report_submitted: 'file-document-outline',
};

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

// Колокольчик уведомлений у администратора и диспетчера — рядом с
// AccountMenu на каждом (office) экране. Самостоятельно скрывается для
// остальных ролей, как и AccountMenu. Правки 6, п.13/21: раньше дни
// рождения/подписка были единственным источником и видел только admin —
// теперь ещё и «заказ принят»/«новый отчёт водителя» из личной ленты
// (api/notifications.ts), и видит их также dispatcher.
export function NotificationBell() {
  const { employee } = useSession();
  const [visible, setVisible] = useState(false);
  const accounts = useAllAccounts().data ?? [];
  const notifications = useNotifications().data ?? [];
  const markRead = useMarkNotificationsReadFor();
  const isReviewer = employee?.role === 'admin' || employee?.role === 'dispatcher';
  if (!employee || !isReviewer) return null;

  const reviewItems = notifications
    .filter((n) => !n.read_at && REVIEW_KINDS.includes(n.kind))
    .map(fromAppNotification);
  const items = [...reviewItems, ...buildNotifications(accounts)];

  const openItem = (item: AdminNotification) => {
    setVisible(false);
    if (!item.source) return;
    if (item.source.order_id) {
      markRead.mutate({ orderId: item.source.order_id });
      router.push(`/order/${item.source.order_id}`);
    } else if (item.source.driver_report_id) {
      markRead.mutate({ driverReportId: item.source.driver_report_id });
      router.push('/settings/driver-reports');
    }
  };

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
          <Menu.Item key={item.id} leadingIcon={ITEM_ICON[item.kind]} title={item.text} onPress={() => openItem(item)} />
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
