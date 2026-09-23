import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Chip, Text } from 'react-native-paper';
import { useState } from 'react';
import { useEmployees } from '../../api/employees';
import { useSession } from '../../providers/SessionProvider';
import { canManageOrders } from '../../lib/permissions';
import { ScheduleCalendar } from '../../components/schedule/ScheduleCalendar';

// «Рабочий график» (раздел «рабочий график»): диспетчер/админ проставляет
// водителям и грузчикам выходные дни на месяц вперёд. Без права
// «создавать/редактировать заказы» — только просмотр (тот же принцип, что
// и у остальных экранов диспетчера).
export default function OfficeScheduleScreen() {
  const { employee } = useSession();
  const canEdit = canManageOrders(employee);
  const employees = useEmployees().data ?? [];
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const selected = employeeId ?? employees[0]?.id ?? null;
  const selectedEmployee = employees.find((e) => e.id === selected);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="График" />
      </Appbar.Header>

      {employees.length === 0 ? (
        <Text style={styles.empty}>Нет ни одного водителя или грузчика.</Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {employees.map((e) => (
              <Chip
                key={e.id}
                selected={selected === e.id}
                showSelectedOverlay
                icon={e.role === 'driver' ? 'truck' : 'account-hard-hat'}
                onPress={() => setEmployeeId(e.id)}
                style={styles.chip}
              >
                {e.name}
              </Chip>
            ))}
          </ScrollView>
          {!canEdit && (
            <Text variant="bodySmall" style={styles.notice}>
              Только просмотр — нет права редактировать заказы.
            </Text>
          )}
          {selectedEmployee && (
            <ScrollView contentContainerStyle={styles.content}>
              <ScheduleCalendar
                employeeId={selectedEmployee.id}
                mode={selectedEmployee.schedule_mode}
                canEdit={canEdit}
              />
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chips: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    marginRight: 0,
  },
  notice: {
    paddingHorizontal: 16,
    opacity: 0.6,
  },
  content: {
    padding: 16,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
  },
});
