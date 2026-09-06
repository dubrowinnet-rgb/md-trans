import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCreateEmployee, useEmployees, type Employee } from '../api/employees';
import type { EmployeeRole } from '../types/database';

const STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  pending_payment: 'Ожидает оплаты',
  suspended: 'Заблокирован',
};

function EmployeeRow({ employee }: { employee: Employee }) {
  return (
    <View style={styles.row}>
      <View>
        <Text style={styles.rowName}>{employee.name}</Text>
        {employee.phone && <Text style={styles.rowMuted}>{employee.phone}</Text>}
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowRole}>{employee.role === 'driver' ? 'Водитель' : 'Грузчик'}</Text>
        <Text style={styles.rowMuted}>{STATUS_LABELS[employee.account_status]}</Text>
      </View>
    </View>
  );
}

export function EmployeesScreen({ onClose }: { onClose: () => void }) {
  const employeesQuery = useEmployees();
  const createEmployee = useCreateEmployee();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<EmployeeRole>('driver');
  const [error, setError] = useState<string | null>(null);

  const employees = employeesQuery.data ?? [];

  const handleAdd = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Укажите имя сотрудника');
      return;
    }
    try {
      await createEmployee.mutateAsync({ name: name.trim(), phone: phone.trim(), role });
      setName('');
      setPhone('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить сотрудника');
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Сотрудники</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Закрыть</Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Имя" value={name} onChangeText={setName} />
          <TextInput
            style={styles.input}
            placeholder="Телефон (необязательно)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <View style={styles.roleRow}>
            {(['driver', 'loader'] as EmployeeRole[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                style={[styles.roleChip, role === r && styles.roleChipActive]}
              >
                <Text style={[styles.roleChipText, role === r && styles.roleChipTextActive]}>
                  {r === 'driver' ? 'Водитель' : 'Грузчик'}
                </Text>
              </Pressable>
            ))}
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={styles.addButton} onPress={handleAdd} disabled={createEmployee.isPending}>
            {createEmployee.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addButtonText}>Добавить сотрудника</Text>
            )}
          </Pressable>
        </View>

        {employeesQuery.isLoading ? (
          <ActivityIndicator style={styles.listLoading} />
        ) : (
          <FlatList
            data={employees}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => <EmployeeRow employee={item} />}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.emptyText}>Сотрудников пока нет</Text>}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 48,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  close: {
    color: '#5b21b6',
    fontSize: 14,
  },
  form: {
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  roleChipActive: {
    backgroundColor: '#5b21b6',
    borderColor: '#5b21b6',
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  roleChipTextActive: {
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#5b21b6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: '#c0392b',
    fontSize: 13,
  },
  listLoading: {
    marginTop: 20,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowRole: {
    fontSize: 13,
    color: '#374151',
  },
  rowMuted: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 24,
  },
});
