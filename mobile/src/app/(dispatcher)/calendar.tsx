import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Appbar, Banner, FAB } from 'react-native-paper';
import { useEmployees } from '../../api/employees';
import { useOrdersForRange } from '../../api/orders';
import { supabase } from '../../lib/supabase';
import { useCalendarNav } from '../../hooks/useCalendarNav';
import { CalendarGrid } from '../../components/calendar/CalendarGrid';
import { CalendarToolbar } from '../../components/calendar/CalendarToolbar';
import { ALL_EMPLOYEES, EmployeeFilter } from '../../components/calendar/EmployeeFilter';

export default function DispatcherCalendarScreen() {
  const nav = useCalendarNav();
  const [activeEmployeeId, setActiveEmployeeId] = useState<string>(ALL_EMPLOYEES);

  const employeesQuery = useEmployees();
  const employees = employeesQuery.data ?? [];

  const ordersQuery = useOrdersForRange(nav.rangeStart, nav.rangeEnd);
  const allOrders = ordersQuery.data ?? [];
  const orders =
    activeEmployeeId === ALL_EMPLOYEES
      ? allOrders
      : allOrders.filter((o) => o.order_crew.some((c) => c.employee_id === activeEmployeeId));

  const loadError = employeesQuery.error ?? ordersQuery.error;
  const noEmployees = employees.length === 0 && !employeesQuery.isLoading && !employeesQuery.isError;

  const openNewOrder = (start?: Date) =>
    router.push({ pathname: '/order/new', params: start ? { start: start.toISOString() } : {} });

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Календарь" />
        <Appbar.Action icon="calendar-today" onPress={nav.goToday} accessibilityLabel="Сегодня" />
        <Appbar.Action icon="logout" onPress={() => supabase.auth.signOut()} accessibilityLabel="Выйти" />
      </Appbar.Header>

      <EmployeeFilter employees={employees} activeId={activeEmployeeId} onSelect={setActiveEmployeeId} />

      <CalendarToolbar
        anchorDate={nav.anchorDate}
        viewMode={nav.viewMode}
        onPrev={nav.goPrev}
        onNext={nav.goNext}
        onToday={nav.goToday}
        onSetViewMode={nav.setViewMode}
      />

      <Banner visible={Boolean(loadError)} icon="alert-circle-outline">
        {`Ошибка загрузки данных: ${loadError?.message ?? ''}`}
      </Banner>
      <Banner
        visible={noEmployees}
        icon="account-plus-outline"
        actions={[{ label: 'К сотрудникам', onPress: () => router.push('/employees') }]}
      >
        Нет ни одного сотрудника. Добавьте водителя или грузчика, чтобы назначать их на заказы.
      </Banner>

      <CalendarGrid
        days={nav.days}
        orders={orders}
        viewMode={nav.viewMode}
        isLoading={ordersQuery.isLoading || employeesQuery.isLoading}
        onPressOrder={(order) => router.push(`/order/${order.id}`)}
        onPressSlot={openNewOrder}
      />

      <FAB icon="plus" style={styles.fab} onPress={() => openNewOrder()} accessibilityLabel="Новый заказ" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
