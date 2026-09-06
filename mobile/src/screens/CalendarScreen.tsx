import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useEmployees } from '../api/employees';
import { useOrdersForRange, type OrderWithDetails } from '../api/orders';
import { supabase } from '../lib/supabase';
import { EmployeeTabs, ALL_EMPLOYEES } from '../components/EmployeeTabs';
import { DayColumn, HourAxis, GRID_HEIGHT } from '../components/DayColumn';
import { CreateOrderModal } from './CreateOrderModal';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { EmployeesScreen } from './EmployeesScreen';
import { addDays, dayBounds, isSameDay, startOfDay, weekDays, formatHeaderDate } from '../utils/date';

type ViewMode = 'day' | 'week';

export function CalendarScreen({ session }: { session: Session }) {
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [activeEmployeeId, setActiveEmployeeId] = useState<string>(ALL_EMPLOYEES);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [employeesModalOpen, setEmployeesModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);

  const employeesQuery = useEmployees();
  const employees = employeesQuery.data ?? [];

  const days = useMemo(
    () => (viewMode === 'day' ? [anchorDate] : weekDays(anchorDate)),
    [viewMode, anchorDate]
  );
  const rangeStart = dayBounds(days[0]).start;
  const rangeEnd = dayBounds(days[days.length - 1]).end;

  const ordersQuery = useOrdersForRange(rangeStart, rangeEnd);
  const allOrders = ordersQuery.data ?? [];
  const orders =
    activeEmployeeId === ALL_EMPLOYEES
      ? allOrders
      : allOrders.filter((o) => o.order_crew.some((c) => c.employee_id === activeEmployeeId));

  const columnWidth = viewMode === 'day' ? undefined : 130;

  const goToday = () => setAnchorDate(startOfDay(new Date()));
  const goPrev = () => setAnchorDate((d) => addDays(d, viewMode === 'day' ? -1 : -7));
  const goNext = () => setAnchorDate((d) => addDays(d, viewMode === 'day' ? 1 : 7));

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

      <View style={styles.controls}>
        <View style={styles.nav}>
          <Pressable onPress={goPrev} hitSlop={8}>
            <Text style={styles.navArrow}>‹</Text>
          </Pressable>
          <Pressable onPress={goToday}>
            <Text style={styles.dateLabel}>{formatHeaderDate(anchorDate)}</Text>
          </Pressable>
          <Pressable onPress={goNext} hitSlop={8}>
            <Text style={styles.navArrow}>›</Text>
          </Pressable>
        </View>
        <View style={styles.modeSwitch}>
          {(['day', 'week'] as ViewMode[]).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setViewMode(mode)}
              style={[styles.modeButton, viewMode === mode && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, viewMode === mode && styles.modeTextActive]}>
                {mode === 'day' ? 'День' : 'Неделя'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

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

      {ordersQuery.isLoading || employeesQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView style={styles.grid}>
          <View style={{ flexDirection: 'row', height: GRID_HEIGHT + 36 }}>
            <HourAxis />
            <ScrollView horizontal={viewMode === 'week'} showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row' }}>
                {days.map((date) => (
                  <DayColumn
                    key={date.toISOString()}
                    date={date}
                    orders={orders}
                    width={columnWidth ?? 340}
                    isToday={isSameDay(date, new Date())}
                    onPressOrder={setSelectedOrder}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      )}

      <Pressable style={styles.fab} onPress={() => setCreateModalOpen(true)}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      {createModalOpen && (
        <CreateOrderModal
          employees={employees}
          defaultDate={anchorDate}
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navArrow: {
    fontSize: 22,
    color: '#5b21b6',
    paddingHorizontal: 4,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 2,
  },
  modeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modeButtonActive: {
    backgroundColor: '#fff',
  },
  modeText: {
    fontSize: 12,
    color: '#6b7280',
  },
  modeTextActive: {
    color: '#111827',
    fontWeight: '600',
  },
  grid: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
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
