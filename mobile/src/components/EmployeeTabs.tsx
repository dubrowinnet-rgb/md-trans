import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { Employee } from '../api/employees';

export function EmployeeTabs({
  employees,
  activeId,
  onSelect,
}: {
  employees: Employee[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {employees.map((employee) => {
        const active = employee.id === activeId;
        return (
          <Pressable
            key={employee.id}
            onPress={() => onSelect(employee.id)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
              {employee.name}
            </Text>
            <Text style={[styles.tabRole, active && styles.tabTextActive]}>
              {employee.role === 'driver' ? 'водитель' : 'грузчик'}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#5b21b6',
  },
  content: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    color: '#e9d8fd',
    fontSize: 13,
    fontWeight: '600',
  },
  tabRole: {
    color: '#e9d8fd',
    fontSize: 10,
  },
  tabTextActive: {
    color: '#5b21b6',
  },
});
