import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ActivityIndicator, Appbar, Badge, HelperText, List, Text } from 'react-native-paper';
import { useReportDrivers } from '../../api/driverReports';
import { useSession } from '../../providers/SessionProvider';

// Отчёты водителей у администратора и диспетчера: сначала водитель, потом
// его лента — та же, что видит он сам (driver-feed.tsx). Число рядом с
// именем — отчёты, которые ждут проверки.
export default function DriverReportsScreen() {
  const { employee } = useSession();

  if (!employee || (employee.role !== 'admin' && employee.role !== 'dispatcher')) {
    return (
      <View style={styles.noAccess}>
        <Text variant="bodyMedium">Раздел доступен администратору и диспетчеру.</Text>
      </View>
    );
  }

  return <DriverList />;
}

function DriverList() {
  const driversQuery = useReportDrivers();
  const drivers = driversQuery.data ?? [];
  const pendingTotal = drivers.reduce((sum, d) => sum + d.pending, 0);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Отчёты водителей" />
      </Appbar.Header>

      {driversQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <ScrollView>
          {driversQuery.isError && <HelperText type="error">{driversQuery.error.message}</HelperText>}
          <Text variant="bodySmall" style={styles.caption}>
            {pendingTotal > 0 ? `Ждут проверки: ${pendingTotal}` : 'Все отправленные отчёты проверены.'}
          </Text>
          {drivers.length === 0 && !driversQuery.isError && <Text style={styles.empty}>Водителей пока нет.</Text>}
          {drivers.map((driver) => {
            const fullName = `${driver.name} ${driver.last_name ?? ''}`.trim();
            return (
              <List.Item
                key={driver.id}
                title={fullName}
                description={driver.pending > 0 ? 'Есть отчёты на проверке' : 'Лента отчётов'}
                left={(props) => <List.Icon {...props} icon="account-outline" />}
                right={() => (
                  <View style={styles.right}>
                    {driver.pending > 0 && <Badge style={styles.badge}>{driver.pending}</Badge>}
                    <List.Icon icon="chevron-right" />
                  </View>
                )}
                onPress={() =>
                  router.push({ pathname: '/settings/driver-feed', params: { employeeId: driver.id, name: fullName } })
                }
              />
            );
          })}
        </ScrollView>
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
  caption: {
    opacity: 0.7,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#f59e0b',
    alignSelf: 'center',
  },
  noAccess: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
