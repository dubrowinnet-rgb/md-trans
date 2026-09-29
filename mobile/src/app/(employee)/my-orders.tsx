import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Appbar, Banner, ProgressBar, Text } from 'react-native-paper';
import { useCalendarOrders, type CalendarOrder } from '../../api/orders';
import { useSession } from '../../providers/SessionProvider';
import { useCalendarNav } from '../../hooks/useCalendarNav';
import { PagedCalendar } from '../../components/calendar/PagedCalendar';
import { CalendarToolbar } from '../../components/calendar/CalendarToolbar';
import { AccountMenu } from '../../components/layout/AccountMenu';
import { formatHeaderDate, startOfMonth } from '../../utils/date';

const NO_PAGES: Date[] = [];

// Календарь водителя/грузчика: та же сетка, только собственные заказы и без
// создания. minAnchor — назад можно листать только в пределах текущего
// календарного месяца (доработки 2, п.1); у диспетчера/админа (calendar.tsx)
// такого ограничения нет.
export default function EmployeeCalendarScreen() {
  const { employee } = useSession();
  const nav = useCalendarNav({ minAnchor: startOfMonth(new Date()) });

  // Сервер отдаёт только заказы, где он в бригаде (раньше грузились заказы
  // всей компании и фильтровались уже на телефоне).
  const ordersQuery = useCalendarOrders(employee ? nav.pageStarts : NO_PAGES, nav.mode, employee?.id);
  const orders = ordersQuery.orders;
  const openOrder = useCallback((order: CalendarOrder) => router.push(`/order/${order.id}`), []);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content
          title={
            <View>
              <Text variant="titleMedium">{employee?.name ?? ''}</Text>
              <Text variant="bodySmall" style={styles.subtitle}>
                {`${employee?.role === 'driver' ? 'Водитель' : 'Грузчик'} · ${formatHeaderDate(nav.anchor)}`}
              </Text>
            </View>
          }
        />
        <Appbar.Action icon="calendar-today" onPress={nav.goToday} accessibilityLabel="Сегодня" />
        <Appbar.Action icon="calendar-remove-outline" onPress={() => router.push('/my-schedule')} accessibilityLabel="Мой график" />
        {employee?.role === 'driver' && (
          <Appbar.Action icon="clipboard-text-outline" onPress={() => router.push('/settings/driver-feed')} accessibilityLabel="Мои отчёты" />
        )}
        <AccountMenu />
      </Appbar.Header>

      <CalendarToolbar mode={nav.mode} onPrev={nav.goPrev} onNext={nav.goNext} onSetMode={nav.setMode} disablePrev={nav.atMinAnchor} />

      <Banner visible={Boolean(ordersQuery.error)} icon="alert-circle-outline">
        {`Ошибка загрузки заказов: ${ordersQuery.error?.message ?? ''}`}
      </Banner>
      {/* Обёртка с фиксированной высотой: в браузере ProgressBar растягивается на 100%. */}
      <View style={styles.progress}>
        <ProgressBar indeterminate visible={ordersQuery.isFetching} />
      </View>

      <PagedCalendar
        mode={nav.mode}
        anchor={nav.anchor}
        onAnchorChange={nav.setAnchor}
        orders={orders}
        onPressOrder={openOrder}
        scrollToNowSignal={nav.nowSignal}
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
