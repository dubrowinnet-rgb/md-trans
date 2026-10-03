import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Appbar, Banner, ProgressBar, Text } from 'react-native-paper';
import { useWorkingHours } from '../../api/companySettings';
import { useCalendarOrders, type CalendarOrder } from '../../api/orders';
import { useSession } from '../../providers/SessionProvider';
import { useCalendarNav } from '../../hooks/useCalendarNav';
import { PagedCalendar } from '../../components/calendar/PagedCalendar';
import { CalendarToolbar } from '../../components/calendar/CalendarToolbar';
import { EmployeeMenu } from '../../components/layout/EmployeeMenu';
import { ACCOUNT_ROLE_LABELS } from '../../theme';
import { formatHeaderDate, startOfMonth, subMonths } from '../../utils/date';

const NO_PAGES: Date[] = [];

// Календарь водителя/грузчика: та же сетка, только собственные заказы и без
// создания. minAnchor — назад можно листать только в пределах текущего и
// предыдущего календарного месяца (доработки 2, п.1; расширено до
// предыдущего месяца — Правки 6, п.23, та же граница, что у отчётов
// водителя, см. миграцию 0029); у диспетчера/админа (calendar.tsx) такого
// ограничения нет.
export default function EmployeeCalendarScreen() {
  const { employee } = useSession();
  const nav = useCalendarNav({ minAnchor: startOfMonth(subMonths(new Date(), 1)) });
  const queryClient = useQueryClient();
  const [forcedSyncing, setForcedSyncing] = useState(false);

  // Сервер отдаёт только заказы, где он в бригаде (раньше грузились заказы
  // всей компании и фильтровались уже на телефоне).
  const ordersQuery = useCalendarOrders(employee ? nav.pageStarts : NO_PAGES, nav.mode, employee?.id);
  const orders = ordersQuery.orders;
  const workingHoursQuery = useWorkingHours();
  const openOrder = useCallback((order: CalendarOrder) => router.push(`/order/${order.id}`), []);

  const handleSync = useCallback(async () => {
    setForcedSyncing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    } finally {
      setForcedSyncing(false);
    }
  }, [queryClient]);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        {employee && (
          <EmployeeMenu
            employee={employee}
            lastSyncedAt={ordersQuery.dataUpdatedAt ? new Date(ordersQuery.dataUpdatedAt) : null}
            syncing={forcedSyncing || ordersQuery.isFetching}
            onSync={handleSync}
          />
        )}
        <Appbar.Content
          title={
            <View>
              <Text variant="titleSmall" numberOfLines={1} ellipsizeMode="tail">
                {`${employee?.name ?? ''} · ${employee ? ACCOUNT_ROLE_LABELS[employee.role] : ''}`}
              </Text>
              <Text variant="bodySmall" style={styles.subtitle}>
                {formatHeaderDate(nav.anchor)}
              </Text>
            </View>
          }
        />
        <Appbar.Action icon="calendar-today" onPress={nav.goToday} accessibilityLabel="Сегодня" />
      </Appbar.Header>

      <CalendarToolbar mode={nav.mode} onPrev={nav.goPrev} onNext={nav.goNext} onSetMode={nav.setMode} disablePrev={nav.atMinAnchor} />

      <Banner visible={Boolean(ordersQuery.error)} icon="alert-circle-outline">
        {`Ошибка загрузки заказов: ${ordersQuery.error?.message ?? ''}`}
      </Banner>
      {/* Обёртка с фиксированной высотой: в браузере ProgressBar растягивается на 100%. */}
      {/* isLoading, а не isFetching (Правки 6, п.9) — иначе линия мигала бы
          каждую минуту на тихом автообновлении, когда данные уже есть;
          isFetching для спиннера в EmployeeMenu (выше) оставлен как был. */}
      <View style={styles.progress}>
        <ProgressBar indeterminate visible={ordersQuery.isLoading} />
      </View>

      <PagedCalendar
        mode={nav.mode}
        anchor={nav.anchor}
        onAnchorChange={nav.setAnchor}
        minAnchor={nav.minAnchor}
        orders={orders}
        onPressOrder={openOrder}
        scrollToNowSignal={nav.nowSignal}
        workingHours={workingHoursQuery.data}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  progress: {
    height: 4,
  },
  subtitle: {
    opacity: 0.7,
  },
});
