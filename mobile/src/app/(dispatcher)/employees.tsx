import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Dialog,
  Divider,
  FAB,
  HelperText,
  List,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import { useCreateEmployee, useEmployees } from '../../api/employees';
import type { AccountStatus, EmployeeRole } from '../../types/database';

const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'активен',
  pending_payment: 'ждёт оплаты',
  suspended: 'приостановлен',
};

export default function EmployeesScreen() {
  const employeesQuery = useEmployees();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Сотрудники" />
      </Appbar.Header>
      {employeesQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={employeesQuery.data ?? []}
          keyExtractor={(e) => e.id}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            employeesQuery.isError ? <HelperText type="error">{employeesQuery.error.message}</HelperText> : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Сотрудников пока нет.</Text>}
          renderItem={({ item }) => (
            <List.Item
              title={item.name}
              description={`${item.role === 'driver' ? 'Водитель' : 'Грузчик'} · ${ACCOUNT_STATUS_LABELS[item.account_status]}${item.phone ? ` · ${item.phone}` : ''}`}
              left={(props) => (
                <List.Icon {...props} icon={item.role === 'driver' ? 'truck' : 'account-hard-hat'} />
              )}
            />
          )}
        />
      )}
      <FAB
        icon="account-plus"
        label="Добавить"
        style={styles.fab}
        onPress={() => setDialogOpen(true)}
      />
      <AddEmployeeDialog visible={dialogOpen} onClose={() => setDialogOpen(false)} />
    </View>
  );
}

function AddEmployeeDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const createEmployee = useCreateEmployee();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<EmployeeRole>('driver');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName('');
    setPhone('');
    setError(null);
    onClose();
  };

  const handleAdd = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Укажите имя сотрудника');
      return;
    }
    try {
      await createEmployee.mutateAsync({ name: name.trim(), phone: phone.trim(), role });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить сотрудника');
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={close}>
        <Dialog.Title>Новый сотрудник</Dialog.Title>
        <Dialog.Content style={styles.dialogContent}>
          <SegmentedButtons
            value={role}
            onValueChange={(value) => setRole(value as EmployeeRole)}
            buttons={[
              { value: 'driver', label: 'Водитель', icon: 'truck' },
              { value: 'loader', label: 'Грузчик', icon: 'account-hard-hat' },
            ]}
          />
          <TextInput mode="outlined" label="Имя" accessibilityLabel="Имя" value={name} onChangeText={setName} />
          <TextInput
            mode="outlined"
            label="Телефон (необязательно)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          {error && <HelperText type="error">{error}</HelperText>}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={close}>Отмена</Button>
          <Button
            mode="contained"
            onPress={handleAdd}
            loading={createEmployee.isPending}
            disabled={createEmployee.isPending}
          >
            Добавить
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    marginTop: 32,
  },
  list: {
    paddingBottom: 96,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  dialogContent: {
    gap: 12,
  },
});
