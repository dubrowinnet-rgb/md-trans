import { ScrollView, StyleSheet, View } from 'react-native';
import { HelperText, Text } from 'react-native-paper';
import { useSession } from '../providers/SessionProvider';
import { ScheduleCalendar } from '../components/schedule/ScheduleCalendar';
import { useSetScheduleMode } from '../api/schedule';
import type { ScheduleMode } from '../types/database';

// Самообслуживание графика (раздел «рабочий график» — «предусмотреть
// возможность предоставления доступа к созданию расписания самому
// сотруднику», обычно грузчику на подработке). Доступен любому водителю/
// грузчику, но менять дни можно только при can_manage_own_schedule —
// иначе экран просто показывает текущие выходные, назначенные диспетчером.
export default function SelfScheduleScreen() {
  const { employee } = useSession();
  const setScheduleMode = useSetScheduleMode();

  if (!employee || (employee.role !== 'driver' && employee.role !== 'loader')) {
    return (
      <View style={styles.center}>
        <Text variant="bodyMedium">Этот экран только для водителей и грузчиков.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="titleMedium" style={styles.title}>
        Мой график
      </Text>
      <Text variant="bodySmall" style={styles.muted}>
        {employee.can_manage_own_schedule
          ? 'Отметьте дни, когда вы работаете или не готовы принимать заказы — как вам удобнее.'
          : 'Ваш график назначает диспетчер. Здесь можно только посмотреть.'}
      </Text>
      <ScheduleCalendar
        employeeId={employee.id}
        mode={employee.schedule_mode}
        canEdit={employee.can_manage_own_schedule}
        canEditMode={employee.can_manage_own_schedule}
        onSetMode={(mode: ScheduleMode) => setScheduleMode.mutate({ employeeId: employee.id, mode })}
      />
      {setScheduleMode.error && <HelperText type="error">{setScheduleMode.error.message}</HelperText>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    marginBottom: 4,
  },
  muted: {
    opacity: 0.7,
    marginBottom: 16,
  },
});
