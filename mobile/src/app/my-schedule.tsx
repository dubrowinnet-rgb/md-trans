import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSession } from '../providers/SessionProvider';
import { DayOffCalendar } from '../components/schedule/DayOffCalendar';

// Самообслуживание графика (раздел «рабочий график» — «предусмотреть
// возможность предоставления доступа к созданию расписания самому
// сотруднику», обычно грузчику на подработке). Доступен любому водителю/
// грузчику, но менять дни можно только при can_manage_own_schedule —
// иначе экран просто показывает текущие выходные, назначенные диспетчером.
export default function SelfScheduleScreen() {
  const { employee } = useSession();

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
          ? 'Отметьте дни, когда вы не готовы принимать заказы.'
          : 'Ваши выходные назначает диспетчер. Здесь можно только посмотреть.'}
      </Text>
      <DayOffCalendar employeeId={employee.id} canEdit={employee.can_manage_own_schedule} />
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
