import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appbar, Banner, FAB, ProgressBar } from 'react-native-paper';
import { useWorkingHours } from '../../api/companySettings';
import { useEmployees } from '../../api/employees';
import { useCalendarOrders, type CalendarOrder } from '../../api/orders';
import { AccountMenu } from '../../components/layout/AccountMenu';
import { NotificationBell } from '../../components/layout/NotificationBell';
import { useSession } from '../../providers/SessionProvider';
import { canCreateOrders } from '../../lib/permissions';
import { useCalendarNav } from '../../hooks/useCalendarNav';
import { PagedCalendar } from '../../components/calendar/PagedCalendar';
import { CalendarToolbar } from '../../components/calendar/CalendarToolbar';
import { ALL_EMPLOYEES, EmployeeFilter } from '../../components/calendar/EmployeeFilter';
import { formatHeaderDate } from '../../utils/date';

export default function DispatcherCalendarScreen() {
  const insets = useSafeAreaInsets();
  const nav = useCalendarNav();
  const { employee } = useSession();
  const canManage = canCreateOrders(employee);
  const [activeEmployeeId, setActiveEmployeeId] = useState<string>(ALL_EMPLOYEES);

  const employeesQuery = useEmployees();
  const employees = employeesQuery.data ?? [];
  const workingHoursQuery = useWorkingHours();

  const ordersQuery = useCalendarOrders(nav.pageStarts, nav.mode);
  const allOrders = ordersQuery.orders;
  const orders =
    activeEmployeeId === ALL_EMPLOYEES
      ? allOrders
      : allOrders.filter((o) => o.order_crew.some((c) => c.employee_id === activeEmployeeId));

  const loadError = employeesQuery.error ?? ordersQuery.error;
  const noEmployees = employees.length === 0 && !employeesQuery.isLoading && !employeesQuery.isError;

  const openNewOrder = useCallback(
    (start?: Date) => {
      if (!canManage) return;
      const preset = activeEmployeeId === ALL_EMPLOYEES ? undefined : activeEmployeeId;
      router.push({
        pathname: '/order/new',
        params: {
          ...(start ? { start: start.toISOString() } : {}),
          ...(preset ? { employeeId: preset } : {}),
        },
      });
    },
    [activeEmployeeId, canManage]
  );
  const openOrder = useCallback((order: CalendarOrder) => router.push(`/order/${order.id}`), []);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title={formatHeaderDate(nav.anchor)} titleStyle={styles.title} />
        <Appbar.Action icon="calendar-today" onPress={nav.goToday} accessibilityLabel="Сегодня" />
        <NotificationBell />
        <AccountMenu />
      </Appbar.Header>

      <EmployeeFilter employees={employees} activeId={activeEmployeeId} onSelect={setActiveEmployeeId} />
      <CalendarToolbar mode={nav.mode} onPrev={nav.goPrev} onNext={nav.goNext} onSetMode={nav.setMode} />

      <Banner visible={Boolean(loadError)} icon="alert-circle-outline">
        {`Ошибка загрузки данных: ${loadError?.message ?? ''}`}
      </Banner>
      <Banner
        visible={noEmployees}
        icon="account-plus-outline"
        actions={
          employee?.role === 'admin' ? [{ label: 'К команде', onPress: () => router.push('/team') }] : undefined
        }
      >
        Нет ни одного сотрудника. Добавьте водителя или грузчика, чтобы назначать их на заказы.
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
        onPressSlot={canManage ? openNewOrder : undefined}
        scrollToNowSignal={nav.nowSignal}
        workingHours={workingHoursQuery.data}
      />

      {canManage && (
        <FAB
          icon="plus"
          style={[styles.fab, { bottom: 16 + insets.bottom }]}
          onPress={() => openNewOrder()}
          accessibilityLabel="Новый заказ"
        />
      )}
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
  title: {
    textTransform: 'capitalize',
  },
  fab: {
    position: 'absolute',
    right: 16,
  },
});
