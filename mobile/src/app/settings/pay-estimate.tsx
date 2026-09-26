import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { addMonths, format, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ActivityIndicator, Appbar, Divider, IconButton, List, Text } from 'react-native-paper';
import { useState } from 'react';
import { useEmployeePayEstimate } from '../../api/payroll';
import { useSession } from '../../providers/SessionProvider';
import { formatHeaderDate, formatShortMonth } from '../../utils/date';

// «Моя зарплата» (Максим, «Зарплата и отчёты водителей») — сотрудник только
// просматривает калькуляцию часы × ставка, менять ставку может только
// администратор (AccountDialog). Видна водителям и грузчикам — обеим ролям
// задаётся почасовая ставка.
export default function PayEstimateScreen() {
  const { employee } = useSession();

  if (!employee || (employee.role !== 'driver' && employee.role !== 'loader')) {
    return (
      <View style={styles.noAccess}>
        <Text variant="bodyMedium">Раздел доступен только водителям и грузчикам.</Text>
      </View>
    );
  }

  return <PayEstimateContent employeeId={employee.id} rates={employee} />;
}

function PayEstimateContent({
  employeeId,
  rates,
}: {
  employeeId: string;
  rates: { hourly_rate: number | null; driving_hourly_rate: number | null; loading_hourly_rate: number | null; rate_mode: 'combined' | 'split' };
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const periodEnd = addMonths(month, 1);
  const estimateQuery = useEmployeePayEstimate(employeeId, rates, month, periodEnd);

  const hasRate =
    rates.rate_mode === 'combined' ? Boolean(rates.hourly_rate) : Boolean(rates.driving_hourly_rate || rates.loading_hourly_rate);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Моя зарплата" />
      </Appbar.Header>

      <View style={styles.monthRow}>
        <IconButton icon="chevron-left" accessibilityLabel="Предыдущий месяц" onPress={() => setMonth((m) => addMonths(m, -1))} />
        <Text variant="titleMedium" style={styles.monthLabel}>
          {formatHeaderDate(month)}
        </Text>
        <IconButton icon="chevron-right" accessibilityLabel="Следующий месяц" onPress={() => setMonth((m) => addMonths(m, 1))} />
      </View>

      {!hasRate && (
        <Text variant="bodySmall" style={styles.warning}>
          Администратор ещё не задал вам ставку — калькуляция будет нулевой.
        </Text>
      )}

      {estimateQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <>
          <View style={styles.totals}>
            <View style={styles.totalField}>
              <Text variant="headlineSmall">{(estimateQuery.data?.totalHours ?? 0).toFixed(1)}</Text>
              <Text variant="bodySmall" style={styles.muted}>
                часов за {formatShortMonth(month)}
              </Text>
            </View>
            <View style={styles.totalField}>
              <Text variant="headlineSmall">{Math.round(estimateQuery.data?.totalAmount ?? 0)} ₽</Text>
              <Text variant="bodySmall" style={styles.muted}>
                к начислению
              </Text>
            </View>
          </View>
          <Divider />
          <List.Section>
            {(estimateQuery.data?.lines.length ?? 0) === 0 && <List.Item title="Завершённых заказов пока нет." />}
            {estimateQuery.data?.lines.map((line) => (
              <List.Item
                key={line.orderId}
                title={`${format(new Date(line.scheduledStart), 'd MMMM, HH:mm', { locale: ru })}`}
                description={`${line.hours.toFixed(1)} ч × ${line.rate} ₽`}
                right={() => (
                  <Text variant="bodyMedium" style={styles.lineAmount}>
                    {Math.round(line.amount)} ₽
                  </Text>
                )}
              />
            ))}
          </List.Section>
        </>
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
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    textTransform: 'capitalize',
    minWidth: 160,
    textAlign: 'center',
  },
  warning: {
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  totals: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
  },
  totalField: {
    alignItems: 'center',
  },
  muted: {
    opacity: 0.6,
  },
  lineAmount: {
    alignSelf: 'center',
  },
  noAccess: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
