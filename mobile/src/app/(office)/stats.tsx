import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Divider, HelperText, List, Text } from 'react-native-paper';
import { useStatsOverview } from '../../api/stats';
import { AccountMenu } from '../../components/layout/AccountMenu';
import { NotificationBell } from '../../components/layout/NotificationBell';
import { ACCOUNT_ROLE_LABELS, ORDER_STATUS_LABELS } from '../../theme';
import type { OrderStatus } from '../../types/database';

const STATUS_ORDER: OrderStatus[] = ['new', 'confirmed', 'in_progress', 'completed', 'cancelled'];

// Статистика администратора: по компании и по каждому сотруднику (раздел
// «права и доступы»). Видна только роли admin — см. (office)/_layout.tsx.
export default function StatsScreen() {
  const statsQuery = useStatsOverview();
  const stats = statsQuery.data;

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Статистика" />
        <NotificationBell />
        <AccountMenu />
      </Appbar.Header>

      {statsQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : statsQuery.isError ? (
        <HelperText type="error" style={styles.padded}>
          {statsQuery.error.message}
        </HelperText>
      ) : stats ? (
        <List.Section>
          <List.Subheader>По компании</List.Subheader>
          <View style={styles.fields}>
            <View style={styles.field}>
              <Text variant="headlineSmall">{stats.totalOrders}</Text>
              <Text variant="bodySmall" style={styles.muted}>
                заказов всего
              </Text>
            </View>
            <View style={styles.field}>
              <Text variant="headlineSmall">{stats.totalRevenue} ₽</Text>
              <Text variant="bodySmall" style={styles.muted}>
                выручка по завершённым
              </Text>
            </View>
          </View>
          <View style={styles.statusRow}>
            {STATUS_ORDER.map((status) => (
              <View key={status} style={styles.statusItem}>
                <Text variant="bodyMedium">{stats.ordersByStatus[status] ?? 0}</Text>
                <Text variant="bodySmall" style={styles.muted}>
                  {ORDER_STATUS_LABELS[status]}
                </Text>
              </View>
            ))}
          </View>

          <Divider style={styles.divider} />
          <List.Subheader>По сотрудникам</List.Subheader>
          {stats.employees.length === 0 && <List.Item title="Пока никого нет." />}
          {stats.employees.map((item) => (
            <List.Item
              key={item.id}
              title={item.name}
              description={`${ACCOUNT_ROLE_LABELS[item.role]} · ${item.ordersCount} заказ(ов) · ${item.revenue} ₽`}
            />
          ))}
        </List.Section>
      ) : null}
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
  padded: {
    padding: 16,
  },
  fields: {
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  field: {
    gap: 2,
  },
  muted: {
    opacity: 0.6,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statusItem: {
    gap: 2,
    minWidth: 64,
  },
  divider: {
    marginTop: 12,
  },
});
