import { useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { addDays, format } from 'date-fns';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Checkbox,
  Chip,
  Divider,
  HelperText,
  IconButton,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import {
  useDriverReport,
  useHandInCash,
  useReportDayOrders,
  useSaveDriverReport,
  uploadOdometerPhoto,
} from '../../api/driverReports';
import { useSession } from '../../providers/SessionProvider';
import { DRIVER_REPORT_STATUS_COLORS, DRIVER_REPORT_STATUS_LABELS } from '../../theme';
import type { FuelPaymentMethod } from '../../types/database';
import { formatDayLabel } from '../../utils/date';

// «Мой отчёт» (Максим, «отчёты водителей») — только у роли driver. Отчёт
// полуавтоматический: заказы дня подставляются сами (useReportDayOrders),
// водитель отмечает перевод/QR, добавляет расходы, топливо, фото одометра,
// затем отдельной кнопкой «сдаёт кассу». После подтверждения
// администратором форма становится нередактируемой (тем же не даёт RLS).
export default function DriverReportScreen() {
  const { employee } = useSession();

  if (!employee || employee.role !== 'driver') {
    return (
      <View style={styles.noAccess}>
        <Text variant="bodyMedium">Раздел доступен только водителям.</Text>
      </View>
    );
  }

  return <DriverReportContent employeeId={employee.id} />;
}

interface ExpenseRow {
  description: string;
  amount: string;
}

function DriverReportContent({ employeeId }: { employeeId: string }) {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const dayOrdersQuery = useReportDayOrders(employeeId, date);
  const reportQuery = useDriverReport(employeeId, date);
  const saveReport = useSaveDriverReport();
  const handInCash = useHandInCash();

  const [transferByOrder, setTransferByOrder] = useState<Record<string, boolean>>({});
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [fuelAmountText, setFuelAmountText] = useState('');
  const [fuelMethod, setFuelMethod] = useState<FuelPaymentMethod>('cash');
  const [odometerUrl, setOdometerUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cashText, setCashText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const hydratedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedForRef.current === date) return;
    if (dayOrdersQuery.isLoading || reportQuery.isLoading) return;
    const report = reportQuery.data;
    const byOrderId = new Map(report?.driver_report_orders.map((o) => [o.order_id, o.paid_by_transfer]));
    setTransferByOrder(Object.fromEntries((dayOrdersQuery.data ?? []).map((o) => [o.id, byOrderId.get(o.id) ?? false])));
    setExpenses((report?.driver_report_expenses ?? []).map((e) => ({ description: e.description, amount: String(e.amount) })));
    setFuelAmountText(report?.fuel_amount != null ? String(report.fuel_amount) : '');
    setFuelMethod(report?.fuel_payment_method ?? 'cash');
    setOdometerUrl(report?.odometer_photo_url ?? null);
    setCashText(report?.cash_handed_in != null ? String(report.cash_handed_in) : '');
    hydratedForRef.current = date;
  }, [date, dayOrdersQuery.isLoading, dayOrdersQuery.data, reportQuery.isLoading, reportQuery.data]);

  const report = reportQuery.data;
  const locked = report?.status === 'confirmed';
  const dayOrders = dayOrdersQuery.data ?? [];

  const cashCollected = dayOrders
    .filter((o) => !transferByOrder[o.id] && (o.actual_price ?? 0) > 0)
    .reduce((sum, o) => sum + (o.actual_price ?? 0), 0);
  const expensesTotal = expenses.reduce((sum, e) => sum + (Number(e.amount.replace(',', '.')) || 0), 0);
  const fuelAmount = Number(fuelAmountText.replace(',', '.')) || 0;
  const fuelCash = fuelMethod === 'cash' ? fuelAmount : 0;
  const expectedHandIn = cashCollected - expensesTotal - fuelCash;

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Нужен доступ к камере, чтобы сфотографировать одометр');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets[0]) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const url = await uploadOdometerPhoto(employeeId, result.assets[0].uri);
      setOdometerUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить фото');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const save = async (status: 'draft' | 'submitted') => {
    setError(null);
    try {
      await saveReport.mutateAsync({
        employee_id: employeeId,
        report_date: date,
        status,
        fuel_amount: fuelAmountText.trim() ? fuelAmount : null,
        fuel_payment_method: fuelAmountText.trim() ? fuelMethod : null,
        odometer_photo_url: odometerUrl,
        orders: dayOrders.map((o) => ({ order_id: o.id, paid_by_transfer: Boolean(transferByOrder[o.id]) })),
        expenses: expenses
          .filter((e) => e.description.trim() && e.amount.trim())
          .map((e) => ({ description: e.description.trim(), amount: Number(e.amount.replace(',', '.')) || 0 })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить отчёт');
    }
  };

  const submitCash = async () => {
    if (!report) return;
    setError(null);
    try {
      await handInCash.mutateAsync({ reportId: report.id, amount: Number(cashText.replace(',', '.')) || 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сдать кассу');
    }
  };

  const loading = dayOrdersQuery.isLoading || reportQuery.isLoading;

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Мой отчёт" />
      </Appbar.Header>

      <View style={styles.dateRow}>
        <IconButton icon="chevron-left" accessibilityLabel="Предыдущий день" onPress={() => setDate((d) => format(addDays(new Date(d), -1), 'yyyy-MM-dd'))} />
        <Text variant="titleMedium" style={styles.dateLabel}>
          {formatDayLabel(new Date(date))}
        </Text>
        <IconButton icon="chevron-right" accessibilityLabel="Следующий день" onPress={() => setDate((d) => format(addDays(new Date(d), 1), 'yyyy-MM-dd'))} />
      </View>
      {report && (
        <Chip style={[styles.statusChip, { borderColor: DRIVER_REPORT_STATUS_COLORS[report.status] }]} textStyle={{ color: DRIVER_REPORT_STATUS_COLORS[report.status] }}>
          {DRIVER_REPORT_STATUS_LABELS[report.status]}
        </Chip>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text variant="labelLarge">Заказы дня</Text>
          {dayOrders.length === 0 && (
            <Text variant="bodySmall" style={styles.muted}>
              Заказов за этот день нет.
            </Text>
          )}
          {dayOrders.map((o) => (
            <View key={o.id} style={styles.orderRow}>
              <Checkbox.Android
                status={transferByOrder[o.id] ? 'checked' : 'unchecked'}
                disabled={locked}
                onPress={() => setTransferByOrder((prev) => ({ ...prev, [o.id]: !prev[o.id] }))}
              />
              <View style={styles.flex}>
                <Text variant="bodyMedium">{o.cargo_description || 'Без описания'}</Text>
                <Text variant="bodySmall" style={styles.muted}>
                  {format(new Date(o.scheduled_start), 'HH:mm')} · {o.actual_price ?? 0} ₽
                  {transferByOrder[o.id] ? ' · перевод/QR' : ' · наличные'}
                </Text>
              </View>
            </View>
          ))}

          <Divider style={styles.divider} />
          <View style={styles.rowBetween}>
            <Text variant="labelLarge">Расходы</Text>
            {!locked && (
              <IconButton icon="plus" accessibilityLabel="Добавить расход" onPress={() => setExpenses((prev) => [...prev, { description: '', amount: '' }])} />
            )}
          </View>
          {expenses.map((exp, idx) => (
            <View key={idx} style={styles.expenseRow}>
              <TextInput
                mode="outlined"
                dense
                label="Описание"
                value={exp.description}
                editable={!locked}
                onChangeText={(text) => setExpenses((prev) => prev.map((e, i) => (i === idx ? { ...e, description: text } : e)))}
                style={styles.flex}
              />
              <TextInput
                mode="outlined"
                dense
                label="Сумма"
                keyboardType="numeric"
                value={exp.amount}
                editable={!locked}
                onChangeText={(text) => setExpenses((prev) => prev.map((e, i) => (i === idx ? { ...e, amount: text } : e)))}
                style={styles.expenseAmount}
              />
              {!locked && (
                <IconButton icon="close" accessibilityLabel="Удалить расход" onPress={() => setExpenses((prev) => prev.filter((_, i) => i !== idx))} />
              )}
            </View>
          ))}

          <Divider style={styles.divider} />
          <Text variant="labelLarge">Топливо</Text>
          <TextInput
            mode="outlined"
            label="Сумма, ₽"
            keyboardType="numeric"
            value={fuelAmountText}
            editable={!locked}
            onChangeText={setFuelAmountText}
          />
          <SegmentedButtons
            value={fuelMethod}
            onValueChange={(value) => setFuelMethod(value as FuelPaymentMethod)}
            buttons={[
              { value: 'cash', label: 'Наличные' },
              { value: 'cashless', label: 'Безнал' },
            ]}
          />

          <Divider style={styles.divider} />
          <Text variant="labelLarge">Фото одометра</Text>
          {odometerUrl && <Image source={{ uri: odometerUrl }} style={styles.odometerPhoto} />}
          <Button mode="outlined" icon="camera" onPress={takePhoto} loading={uploadingPhoto} disabled={locked || uploadingPhoto}>
            {odometerUrl ? 'Переснять' : 'Сфотографировать'}
          </Button>

          <Divider style={styles.divider} />
          <Text variant="labelLarge">Касса</Text>
          <Text variant="bodySmall" style={styles.muted}>
            Наличные по заказам {Math.round(cashCollected)} ₽ − расходы {Math.round(expensesTotal)} ₽ − топливо наличными {Math.round(fuelCash)} ₽ = к сдаче {Math.round(expectedHandIn)} ₽
          </Text>
          <TextInput mode="outlined" label="Сдано, ₽" keyboardType="numeric" value={cashText} editable={!locked} onChangeText={setCashText} />
          <Button mode="outlined" onPress={submitCash} loading={handInCash.isPending} disabled={locked || !report || handInCash.isPending}>
            Сдать кассу
          </Button>
          {!report && (
            <HelperText type="info">Сначала сохраните отчёт — тогда появится возможность сдать кассу.</HelperText>
          )}

          {error && <HelperText type="error">{error}</HelperText>}

          {!locked && (
            <View style={styles.saveRow}>
              <Button mode="outlined" onPress={() => save('draft')} loading={saveReport.isPending} disabled={saveReport.isPending} style={styles.flex}>
                Сохранить черновик
              </Button>
              <Button mode="contained" onPress={() => save('submitted')} loading={saveReport.isPending} disabled={saveReport.isPending} style={styles.flex}>
                Отправить
              </Button>
            </View>
          )}
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
  content: {
    padding: 16,
    gap: 8,
    paddingBottom: 32,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    textTransform: 'capitalize',
    minWidth: 200,
    textAlign: 'center',
  },
  statusChip: {
    alignSelf: 'center',
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  muted: {
    opacity: 0.6,
  },
  flex: {
    flex: 1,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    marginVertical: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expenseAmount: {
    width: 100,
  },
  odometerPhoto: {
    width: '100%',
    height: 180,
    borderRadius: 8,
    marginBottom: 8,
  },
  saveRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  noAccess: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
