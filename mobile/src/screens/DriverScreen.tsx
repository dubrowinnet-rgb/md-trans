import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import type { Employee } from '../api/employees';
import { useMyOrdersForDay } from '../api/orders';
import { supabase } from '../lib/supabase';
import { registerForPushNotifications } from '../lib/pushNotifications';
import { DriverOrderCard } from './DriverOrderCard';
import { formatHeaderDate } from '../utils/date';

export function DriverScreen({ session, employee }: { session: Session; employee: Employee }) {
  const today = new Date();
  const ordersQuery = useMyOrdersForDay(employee.id, today);
  const orders = ordersQuery.data ?? [];

  useEffect(() => {
    registerForPushNotifications(employee.id);
  }, [employee.id]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.name}>{employee.name}</Text>
          <Text style={styles.role}>
            {employee.role === 'driver' ? 'Водитель' : 'Грузчик'} · {session.user.email}
          </Text>
        </View>
        <Pressable onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOut}>Выйти</Text>
        </Pressable>
      </View>

      <Text style={styles.dateLabel}>Заказы на {formatHeaderDate(today)}</Text>

      {ordersQuery.isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Ошибка загрузки заказов: {ordersQuery.error.message}</Text>
        </View>
      ) : ordersQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>На сегодня заказов нет</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(order) => order.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <DriverOrderCard order={item} employeeId={employee.id} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  role: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  signOut: {
    color: '#c0392b',
    fontSize: 13,
  },
  dateLabel: {
    fontSize: 13,
    color: '#6b7280',
    textTransform: 'capitalize',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
  },
});
