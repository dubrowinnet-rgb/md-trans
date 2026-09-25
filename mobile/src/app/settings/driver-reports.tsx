import { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ActivityIndicator, Appbar, Button, Divider, HelperText, List, Text } from 'react-native-paper';
import { useConfirmDriverReport, useDriverReports, type DriverReport } from '../../api/driverReports';
import { useSession } from '../../providers/SessionProvider';
import { DRIVER_REPORT_STATUS_COLORS, DRIVER_REPORT_STATUS_LABELS } from '../../theme';
import { formatHeaderDate } from '../../utils/date';

interface ReportWithEmployee extends DriverReport {
  employees: { id: string; name: string; last_name: string | null } | null;
}

// Подтверждение отчётов водителей у администратора (Максим, «отчёты
// водителей» — «отчеты и сданную кассу подтверждает у себя в аккаунте
// администратор, после этого она фиксируется в финансовых отчетах»).
// Список сгруппирован по месяцу — «калькулируются в таблице помесячно»;
// подробный помесячный свод по суммам уже есть в веб-кабинете.
export default function DriverReportsScreen() {
  const { employee } = useSession();

  if (!employee || employee.role !== 'admin') {
    return (
      <View style={styles.noAccess}>
        <Text variant="bodyMedium">Раздел доступен только администратору.</Text>
      </View>
    );
  }

  return <DriverReportsContent companyId={employee.company_id as string} adminId={employee.id} />;
}

function DriverReportsContent({ companyId, adminId }: { companyId: string; adminId: string }) {
  const reportsQuery = useDriverReports(companyId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byMonth = new Map<string, ReportWithEmployee[]>();
    for (const report of (reportsQuery.data ?? []) as ReportWithEmployee[]) {
      const key = format(new Date(report.report_date), 'yyyy-MM');
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key)!.push(report);
    }
    return [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [reportsQuery.data]);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Отчёты водителей" />
      </Appbar.Header>

      {reportsQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <ScrollView>
          {groups.length === 0 && <Text style={styles.empty}>Отчётов пока нет.</Text>}
          {groups.map(([monthKey, reports]) => (
            <List.Section key={monthKey}>
              <List.Subheader style={styles.monthHeader}>
                {formatHeaderDate(new Date(`${monthKey}-01`))} · сдано {Math.round(reports.reduce((sum, r) => sum + (r.cash_handed_in ?? 0), 0))} ₽
              </List.Subheader>
              {reports.map((report) => (
                <List.Accordion
                  key={report.id}
                  title={`${report.employees?.name ?? '—'} ${report.employees?.last_name ?? ''}`.trim()}
                  description={`${format(new Date(report.report_date), 'd MMMM')} · ${DRIVER_REPORT_STATUS_LABELS[report.status]}`}
                  expanded={expandedId === report.id}
                  onPress={() => setExpandedId(expandedId === report.id ? null : report.id)}
                  left={() => <View style={[styles.statusDot, { backgroundColor: DRIVER_REPORT_STATUS_COLORS[report.status] }]} />}
                >
                  <ReportDetail report={report} adminId={adminId} />
                </List.Accordion>
              ))}
            </List.Section>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function ReportDetail({ report, adminId }: { report: ReportWithEmployee; adminId: string }) {
  const confirmReport = useConfirmDriverReport();

  return (
    <View style={styles.detail}>
      <Text variant="labelLarge">Заказы</Text>
      {report.driver_report_orders.length === 0 && (
        <Text variant="bodySmall" style={styles.muted}>
          Нет заказов за этот день.
        </Text>
      )}
      {report.driver_report_orders.map((o) => (
        <Text key={o.id} variant="bodySmall">
          {o.orders?.cargo_description || 'Без описания'} · {o.orders?.actual_price ?? 0} ₽ · {o.paid_by_transfer ? 'перевод/QR' : 'наличные'}
        </Text>
      ))}

      {report.driver_report_expenses.length > 0 && (
        <>
          <Divider style={styles.divider} />
          <Text variant="labelLarge">Расходы</Text>
          {report.driver_report_expenses.map((e) => (
            <Text key={e.id} variant="bodySmall">
              {e.description} · {e.amount} ₽
            </Text>
          ))}
        </>
      )}

      <Divider style={styles.divider} />
      <Text variant="bodySmall">Топливо: {report.fuel_amount ?? 0} ₽ ({report.fuel_payment_method === 'cash' ? 'наличные' : report.fuel_payment_method === 'cashless' ? 'безнал' : '—'})</Text>
      <Text variant="bodySmall">Наличные по заказам: {Math.round(report.cashCollected)} ₽</Text>
      <Text variant="bodySmall">К сдаче: {Math.round(report.expectedHandIn)} ₽</Text>
      <Text variant="bodySmall">Сдано: {report.cash_handed_in != null ? `${report.cash_handed_in} ₽` : 'не указано'}</Text>
      {report.discrepancy != null && Math.abs(report.discrepancy) > 0.01 && (
        <Text variant="bodySmall" style={styles.discrepancy}>
          Расхождение: {report.discrepancy > 0 ? '+' : ''}{Math.round(report.discrepancy)} ₽
        </Text>
      )}

      {report.odometer_photo_url && (
        <>
          <Divider style={styles.divider} />
          <Text variant="labelLarge">Фото одометра</Text>
          <Image source={{ uri: report.odometer_photo_url }} style={styles.odometerPhoto} />
        </>
      )}

      {report.status === 'submitted' && (
        <Button
          mode="contained"
          style={styles.confirmButton}
          onPress={() => confirmReport.mutate({ reportId: report.id, confirmedBy: adminId })}
          loading={confirmReport.isPending}
          disabled={confirmReport.isPending}
        >
          Подтвердить
        </Button>
      )}
      {report.status === 'draft' && (
        <HelperText type="info">Водитель ещё не отправил отчёт.</HelperText>
      )}
      {report.status === 'confirmed' && (
        <HelperText type="info">
          Подтверждён {report.confirmed_at ? format(new Date(report.confirmed_at), 'd MMMM, HH:mm') : ''}
        </HelperText>
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
  monthHeader: {
    textTransform: 'capitalize',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 16,
    marginTop: 20,
  },
  detail: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 4,
  },
  muted: {
    opacity: 0.6,
  },
  divider: {
    marginVertical: 8,
  },
  discrepancy: {
    color: '#ef4444',
  },
  odometerPhoto: {
    width: '100%',
    height: 180,
    borderRadius: 8,
  },
  confirmButton: {
    marginTop: 12,
  },
  noAccess: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
