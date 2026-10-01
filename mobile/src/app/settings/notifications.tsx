import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ActivityIndicator, Appbar, HelperText, List, Text } from 'react-native-paper';
import { useMarkAllNotificationsRead, useNotifications, type AppNotification } from '../../api/notifications';
import { FadeHighlight } from '../../components/common/FadeHighlight';
import { formatMoment } from '../../components/driverReports/DriverReportCard';
import type { NotificationKind } from '../../types/database';

const KIND_ICON: Record<NotificationKind, string> = {
  order_assigned: 'calendar-plus-outline',
  order_changed: 'calendar-edit-outline',
  order_cancelled: 'calendar-remove-outline',
  order_confirmed: 'check-circle-outline',
  report_approved: 'check-circle-outline',
  report_rejected: 'alert-circle-outline',
  report_submitted: 'file-document-outline',
  report_reopened: 'lock-open-outline',
  support_reply: 'headset',
};

function openNotification(item: AppNotification) {
  if (item.order_id) router.push(`/order/${item.order_id}`);
  else if (item.driver_report_id) router.push('/settings/driver-feed');
  else if (item.support_ticket_id) router.push('/settings/employee-support');
}

// Лента уведомлений сотрудника (Максим, 30.09, «Правки 3», п.5) — изменения
// заказа и решения по отчётам, см. миграцию 0024. Открыли экран — вся лента
// отмечена прочитанной разом (как колокольчик администратора), поэтому
// список не различает прочитанное/непрочитанное построчно: бейдж в меню
// уже погас, а сам факт «я это увидел» дальше не нужен.
export default function NotificationsScreen() {
  const query = useNotifications();
  const markRead = useMarkAllNotificationsRead();
  const items = query.data ?? [];

  // Правки 6, п.7: непрочитанные подсвечены зелёным 5 секунд и гаснут —
  // но экран отмечает всю ленту прочитанной сразу при открытии (ниже), а
  // read_at тогда уже не отличит, что было новым. Поэтому список id,
  // которые были непрочитанными, запоминаем ОТДЕЛЬНО, один раз, как
  // только список впервые загрузился — именно эти id подсвечиваем,
  // независимо от того, что read_at уже обновился в базе.
  const capturedRef = useRef(false);
  const [newlyReadIds, setNewlyReadIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (capturedRef.current || query.isLoading) return;
    capturedRef.current = true;
    setNewlyReadIds(new Set(items.filter((n) => !n.read_at).map((n) => n.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isLoading]);

  useEffect(() => {
    markRead.mutate();
    // Отмечаем прочитанным один раз при открытии экрана, не при каждом
    // обновлении списка (иначе новое уведомление, пришедшее пока экран уже
    // открыт, гасло бы раньше, чем его увидели).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Уведомления" />
      </Appbar.Header>

      {query.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {query.isError && <HelperText type="error">{query.error.message}</HelperText>}
          {items.length === 0 && !query.isError && <Text style={styles.empty}>Уведомлений пока нет.</Text>}
          {items.map((item) => (
            <FadeHighlight key={item.id} active={newlyReadIds.has(item.id)}>
              <List.Item
                title={item.title}
                description={`${item.body}\n${formatMoment(item.created_at)}`}
                descriptionNumberOfLines={3}
                left={(props) => <List.Icon {...props} icon={KIND_ICON[item.kind]} />}
                onPress={() => openNotification(item)}
              />
            </FadeHighlight>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    marginTop: 32,
  },
  list: {
    paddingBottom: 24,
  },
  empty: {
    textAlign: 'center',
    marginTop: 24,
    opacity: 0.7,
  },
});
