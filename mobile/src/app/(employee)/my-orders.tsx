import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Appbar, Banner } from 'react-native-paper';
import { useOrdersForRange } from '../../api/orders';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/SessionProvider';
import { useCalendarNav } from '../../hooks/useCalendarNav';
import { CalendarGrid } from '../../components/calendar/CalendarGrid';
import { CalendarToolbar } from '../../components/calendar/CalendarToolbar';

// Календарь водителя/грузчика: та же сетка, только собственные заказы и без создания.
export default function EmployeeCalendarScreen() {
  const { employee } = useSession();
  const nav = useCalendarNav();

  const ordersQuery = useOrdersForRange(nav.rangeStart, nav.rangeEnd);
  const orders = (ordersQuery.data ?? []).filter((o) =>
    o.order_crew.some((c) => c.employee_id === employee?.id)
  );

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content
          title={employee?.name ?? ''}
          subtitle={employee?.role === 'driver' ? 'Водитель' : 'Грузчик'}
        />
        <Appbar.Action icon="logout" onPress={() => supabase.auth.signOut()} accessibilityLabel="Выйти" />
      </Appbar.Header>

      <CalendarToolbar
        anchorDate={nav.anchorDate}
        viewMode={nav.viewMode}
        onPrev={nav.goPrev}
        onNext={nav.goNext}
        onToday={nav.goToday}
        onSetViewMode={nav.setViewMode}
      />

      <Banner visible={ordersQuery.isError} icon="alert-circle-outline">
        {`Ошибка загрузки заказов: ${ordersQuery.error?.message ?? ''}`}
      </Banner>

      <CalendarGrid
        days={nav.days}
        orders={orders}
        viewMode={nav.viewMode}
        isLoading={ordersQuery.isLoading}
        onPressOrder={(order) => router.push(`/order/${order.id}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
