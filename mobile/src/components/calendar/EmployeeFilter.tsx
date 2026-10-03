import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';
import type { Employee } from '../../api/employees';

export const ALL_EMPLOYEES = 'all';

export function EmployeeFilter({
  employees,
  activeId,
  onSelect,
}: {
  employees: Employee[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Chip
        selected={activeId === ALL_EMPLOYEES}
        showSelectedOverlay
        onPress={() => onSelect(ALL_EMPLOYEES)}
      >
        Все
      </Chip>
      {employees.map((employee) => (
        <Chip
          key={employee.id}
          icon={employee.role === 'driver' ? 'truck' : 'account-hard-hat'}
          selected={employee.id === activeId}
          showSelectedOverlay
          onPress={() => onSelect(employee.id)}
        >
          {employee.name}
        </Chip>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
    flexShrink: 0,
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
});
