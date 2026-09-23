import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Divider, HelperText, List, Text } from 'react-native-paper';
import { useEmployees } from '../../api/employees';
import type { AccountStatus } from '../../types/database';

const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'активен',
  pending_payment: 'ждёт оплаты',
  suspended: 'приостановлен',
};

export default function EmployeesScreen() {
  const employeesQuery = useEmployees();

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
          ListHeaderComponent={
            <HelperText type="error" visible={employeesQuery.isError}>
              {employeesQuery.error?.message}
            </HelperText>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Сотрудников пока нет.</Text>
          }
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    marginTop: 32,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
  },
});
