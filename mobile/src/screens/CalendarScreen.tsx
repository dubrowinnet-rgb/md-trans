import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useEmployees } from '../api/employees';
import { useOrdersForRange, type OrderWithDetails } from '../api/orders';
import { supabase } from '../lib/supabase';
import { EmployeeTabs, ALL_EMPLOYEES } from '../components/EmployeeTabs';
import { CalendarNavBar } from '../components/CalendarNavBar';
import { CalendarGrid } from '../components/CalendarGrid';
import { CreateOrderModal } from './CreateOrderModal';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { EmployeesScreen } from './EmployeesScreen';
import { useCalendarNav } from '../hooks/useCalendarNav';

export function CalendarScreen({ session }: { session: Session }) {
  const nav = useCalendarNav();
  const [activeEmployeeId, setActiveEmployeeId] = useState<string>(ALL_EMPLOYEES);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createSlotStart, setCreateSlotStart] = useState<Date | undefined>(undefined);
  const [employeesModalOpen, setEmployeesModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);

  const employeesQuery = useEmployees();
  const employees = employeesQuery.data ?? [];

  const ordersQuery = useOrdersForRange(nav.rangeStart, nav.rangeEnd);
  const allOrders = ordersQuery.data ?? [];
  const orders =
    activeEmployeeId === ALL_EMPLOYEES
      ? allOrders
      : allOrders.filter((o) => o.order_crew.some((c) => c.employee_id === activeEmployeeId));

  const columnWidth = nav.viewMode === 'day' ? 340 : 130;

  const openCreateModal = (slotStart?: Date) => {
    setCreateSlotStart(slotStart);
    setCreateModalOpen(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>Грузоперевозки</Text>
          <Text style={styles.subtitle}>{session.user.email}</Text>
        </View>
        <View style={styles.topBarActions}>
          <Pressable onPress={() => setEmployeesModalOpen(true)}>
            <Text style={styles.link}>Сотрудники</Text>
          </Pressable>
          <Pressable onPress={() => supabase.auth.signOut()}>
            <Text style={styles.signOut}>Выйти</Text>
          </Pressable>
        </View>
      </View>

      <EmployeeTabs employees={employees} activeId={activeEmployeeId} onSelect={setActiveEmployeeId} />

      <CalendarNavBar
        anchorDate={nav.anchorDate}
        viewMode={nav.viewMode}
        onPrev={nav.goPrev}
        onNext={nav.goNext}
        onToday={nav.goToday}
        onSetViewMode={nav.setViewMode}
      />

      {(employeesQuery.isError || ordersQuery.isError) && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            Ошибка загрузки данных: {(employeesQuery.error ?? ordersQuery.error)?.message}
          </Text>
        </View>
      )}

      {employees.length === 0 && !employeesQuery.isLoading && !employeesQuery.isError && (
        <Pressable style={styles.noticeBanner} onPress={() => setEmployeesModalOpen(true)}>
          <Text style={styles.noticeText}>
            Нет ни одного сотрудника — нажмите, чтобы добавить водителя или грузчика
          </Text>
        </Pressable>
      )}

      <CalendarGrid
        days={nav.days}
        orders={orders}
        viewMode={nav.viewMode}
        columnWidth={columnWidth}
        isLoading={ordersQuery.isLoading || employeesQuery.isLoading}
        onPressOrder={setSelectedOrder}
        onPressSlot={openCreateModal}
      />

      <Pressable style={styles.fab} onPress={() => openCreateModal(undefined)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {createModalOpen && (
        <CreateOrderModal
          employees={employees}
          defaultDate={nav.anchorDate}
          defaultStartTime={createSlotStart}
          onClose={() => setCreateModalOpen(false)}
        />
      )}

      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}

      {employeesModalOpen && <EmployeesScreen onClose={() => setEmployeesModalOpen(false)} />}
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
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  link: {
    color: '#5b21b6',
    fontSize: 13,
    fontWeight: '600',
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
  noticeBanner: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  noticeText: {
    fontSize: 12,
    color: '#92400e',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#5b21b6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 30,
  },
});
