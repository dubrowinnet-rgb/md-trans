import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import type { Employee } from '../api/employees';
import { useOrdersForRange, type OrderWithDetails } from '../api/orders';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/pushNotifications';
import { CalendarNavBar } from '../components/CalendarNavBar';
import { CalendarGrid } from '../components/CalendarGrid';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { useCalendarNav } from '../hooks/useCalendarNav';

export function EmployeeCalendarScreen({ session, employee }: { session: Session; employee: Employee }) {
  const nav = useCalendarNav();
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);

  const ordersQuery = useOrdersForRange(nav.rangeStart, nav.rangeEnd);
  const orders = (ordersQuery.data ?? []).filter((o) =>
    o.order_crew.some((c) => c.employee_id === employee.id)
  );

  const columnWidth = nav.viewMode === 'day' ? 340 : 130;

  useEffect(() => {
    registerForPushNotifications(employee.id);
  }, [employee.id]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>{employee.name}</Text>
          <Text style={styles.subtitle}>
            {employee.role === 'driver' ? 'Водитель' : 'Грузчик'} · {session.user.email}
          </Text>
        </View>
        <Pressable onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOut}>Выйти</Text>
        </Pressable>
      </View>

      <CalendarNavBar
        anchorDate={nav.anchorDate}
        viewMode={nav.viewMode}
        onPrev={nav.goPrev}
        onNext={nav.goNext}
        onToday={nav.goToday}
        onSetViewMode={nav.setViewMode}
      />

      {ordersQuery.isError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>Ошибка загрузки заказов: {ordersQuery.error.message}</Text>
        </View>
      )}

      <CalendarGrid
        days={nav.days}
        orders={orders}
        viewMode={nav.viewMode}
        columnWidth={columnWidth}
        isLoading={ordersQuery.isLoading}
        onPressOrder={setSelectedOrder}
      />

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          viewerEmployeeId={employee.id}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 11,
    color: '#6b7280',
  },
  signOut: {
    color: '#c0392b',
    fontSize: 13,
  },
  errorBanner: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#991b1b',
    textAlign: 'center',
  },
});
