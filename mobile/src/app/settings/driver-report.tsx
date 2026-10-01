import { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { addDays, format, startOfMonth } from 'date-fns';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Checkbox,
  Divider,
  HelperText,
  IconButton,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import {
  canAuthorEditReport,
  driverReportEditDeadline,
  useDriverReport,
  useReportDayOrders,
  useSaveDriverReport,
  uploadOdometerPhoto,
} from '../../api/driverReports';
import { DriverReportCard, formatMoment, rub } from '../../components/driverReports/DriverReportCard';
import { useSession } from '../../providers/SessionProvider';
import type { FuelPaymentMethod } from '../../types/database';
import { formatDayLabel } from '../../utils/date';

// Написать или исправить отчёт за день — только у роли driver. Отчёт
// полуавтоматический: заказы дня подставляются сами (useReportDayOrders),
// водитель отмечает перевод/QR, добавляет расходы, топливо, фото одометра и
// сколько сдал в кассу. Отправленный отчёт попадает в общую ленту
// (driver-feed.tsx); исправить его можно 24 часа после отправки, а
// несогласованный — пока не отправит заново. Согласованный или старше
// 24 часов показывается только для просмотра (миграция 0019 проверяет то
// же самое в базе).
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

const toKey = (d: Date) => format(d, 'yyyy-MM-dd');

function parseAmount(text: string) {
  return Number(text.replace(',', '.').replace(/\s/g, '')) || 0;
}

function DriverReportContent({ employeeId }: { employeeId: string }) {
  const params = useLocalSearchParams<{ date?: string }>();
  const today = new Date();
  const todayKey = toKey(today);
  // Новый отчёт — за текущий месяц, а 1-го числа ещё и за вчера (вечерний
  // отчёт за последний день прошлого месяца).
  const minDate = toKey(new Date(Math.min(startOfMonth(today).getTime(), addDays(today, -1).getTime())));
  const [date, setDate] = useState(() => (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayKey));

  const dayOrdersQuery = useReportDayOrders(employeeId, date);
  const reportQuery = useDriverReport(employeeId, date);
  const saveReport = useSaveDriverReport();

  const [transferByOrder, setTransferByOrder] = useState<Record<string, boolean>>({});
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [fuelAmountText, setFuelAmountText] = useState('');
  const [fuelMethod, setFuelMethod] = useState<FuelPaymentMethod>('cash');
  const [odometerUrl, setOdometerUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [cashText, setCashText] = useState('');
  const [cashSectionOpen, setCashSectionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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
    // Сдача кассы — не каждый день (Правки 6, п.16): свёрнуто за кнопкой,
    // кроме случая, когда в отчёте уже есть сумма — тогда сразу видна.
    setCashSectionOpen(report?.cash_handed_in != null);
    setError(null);
    hydratedForRef.current = date;
  }, [date, dayOrdersQuery.isLoading, dayOrdersQuery.data, reportQuery.isLoading, reportQuery.data]);

  const report = reportQuery.data;
  const isSent = report != null && report.status !== 'draft';
  const editable = report == null || canAuthorEditReport(report);
  const dayOrders = dayOrdersQuery.data ?? [];

  const cashCollected = dayOrders
    .filter((o) => !transferByOrder[o.id] && (o.actual_price ?? 0) > 0)
    .reduce((sum, o) => sum + (o.actual_price ?? 0), 0);
  const expensesTotal = expenses.reduce((sum, e) => sum + parseAmount(e.amount), 0);
  const fuelAmount = parseAmount(fuelAmountText);
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

  // Кнопку «Сохранить черновик» убрали (Правки 6, п.18) — форма всегда
  // отправляет отчёт целиком; submit=true в save_driver_report остаётся
  // отдельным параметром базы, но вызывается отсюда только так.
  const save = async () => {
    setError(null);
    try {
      await saveReport.mutateAsync({
        report_date: date,
        submit: true,
        fuel_amount: fuelAmountText.trim() ? fuelAmount : null,
        fuel_payment_method: fuelAmountText.trim() ? fuelMethod : null,
        odometer_photo_url: odometerUrl,
        cash_handed_in: cashText.trim() ? parseAmount(cashText) : null,
        orders: dayOrders.map((o) => ({ order_id: o.id, paid_by_transfer: Boolean(transferByOrder[o.id]) })),
        expenses: expenses
          .filter((e) => e.description.trim() && e.amount.trim())
          .map((e) => ({ description: e.description.trim(), amount: parseAmount(e.amount) })),
      });
      if (router.canGoBack()) router.back();
      else router.replace('/settings/driver-feed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить отчёт');
    }
  };

  const loading = dayOrdersQuery.isLoading || reportQuery.isLoading;
  const deadline = report ? driverReportEditDeadline(report) : null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={isSent ? 'Исправить отчёт' : 'Отчёт за день'} />
      </Appbar.Header>

      <View style={styles.dateRow}>
        <IconButton
          icon="chevron-left"
          accessibilityLabel="Предыдущий день"
          disabled={date <= minDate}
          onPress={() => setDate((d) => toKey(addDays(new Date(`${d}T00:00:00`), -1)))}
        />
        <Text variant="titleMedium" style={styles.dateLabel}>
          {formatDayLabel(new Date(`${date}T00:00:00`))}
        </Text>
        <IconButton
          icon="chevron-right"
          accessibilityLabel="Следующий день"
          disabled={date >= todayKey}
          onPress={() => setDate((d) => toKey(addDays(new Date(`${d}T00:00:00`), 1)))}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : report && !editable ? (
        <ScrollView contentContainerStyle={styles.content}>
          <HelperText type="info">
            {report.status === 'confirmed'
              ? 'Отчёт согласован — изменить его нельзя.'
              : 'Прошло больше 24 часов после отправки — изменить отчёт нельзя.'}
          </HelperText>
          <DriverReportCard report={report} runningBalance={report.runningBalance ?? undefined} />
        </ScrollView>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {report?.status === 'rejected' && (
            <View style={styles.rejectedBox}>
              <Text variant="labelMedium" style={styles.rejectedTitle}>
                {`Не согласован${report.rejected_at ? ` ${formatMoment(report.rejected_at)}` : ''}${report.reviewer ? ` · ${report.reviewer.name}` : ''}`}
              </Text>
              <Text variant="bodyMedium">{report.rejection_comment}</Text>
              <Text variant="bodySmall" style={styles.muted}>
                Исправьте отчёт и отправьте заново.
              </Text>
            </View>
          )}
          {report?.status === 'submitted' && deadline && (
            <HelperText type="info">
              {`Отчёт отправлен ${report.submitted_at ? formatMoment(report.submitted_at) : ''}. Исправить можно до ${formatMoment(deadline.toISOString())} — время правки увидят администратор и диспетчер.`}
            </HelperText>
          )}

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
                onPress={() => setTransferByOrder((prev) => ({ ...prev, [o.id]: !prev[o.id] }))}
              />
              <View style={styles.flex}>
                <Text variant="bodyMedium">{o.cargo_description || 'Без описания'}</Text>
                <Text variant="bodySmall" style={styles.muted}>
                  {`${format(new Date(o.scheduled_start), 'HH:mm')} · ${rub(o.actual_price ?? 0)} · ${transferByOrder[o.id] ? 'перевод/QR' : 'наличные'}`}
                </Text>
              </View>
            </View>
          ))}
          {dayOrders.length > 0 && (
            <Text variant="bodySmall" style={styles.muted}>
              Отметьте заказы, оплаченные переводом или по QR.
            </Text>
          )}

          <Divider style={styles.divider} />
          <View style={styles.rowBetween}>
            <Text variant="labelLarge">Расходы</Text>
            <IconButton icon="plus" accessibilityLabel="Добавить расход" onPress={() => setExpenses((prev) => [...prev, { description: '', amount: '' }])} />
          </View>
          {expenses.map((exp, idx) => (
            <View key={idx} style={styles.expenseRow}>
              <TextInput
                mode="outlined"
                dense
                label="Описание"
                value={exp.description}
                onChangeText={(text) => setExpenses((prev) => prev.map((e, i) => (i === idx ? { ...e, description: text } : e)))}
                style={styles.flex}
              />
              <TextInput
                mode="outlined"
                dense
                label="Сумма"
                keyboardType="numeric"
                value={exp.amount}
                onChangeText={(text) => setExpenses((prev) => prev.map((e, i) => (i === idx ? { ...e, amount: text } : e)))}
                style={styles.expenseAmount}
              />
              <IconButton icon="close" accessibilityLabel="Удалить расход" onPress={() => setExpenses((prev) => prev.filter((_, i) => i !== idx))} />
            </View>
          ))}

          <Divider style={styles.divider} />
          <Text variant="labelLarge">Топливо</Text>
          <TextInput mode="outlined" label="Сумма, ₽" keyboardType="numeric" value={fuelAmountText} onChangeText={setFuelAmountText} />
          <SegmentedButtons
            value={fuelMethod}
            onValueChange={(value) => {
              setFuelMethod(value as FuelPaymentMethod);
              Keyboard.dismiss();
            }}
            buttons={[
              { value: 'cash', label: 'Наличные' },
              { value: 'cashless', label: 'Безнал' },
            ]}
          />

          <Divider style={styles.divider} />
          <Text variant="labelLarge">Фото одометра</Text>
          {odometerUrl && <Image source={{ uri: odometerUrl }} style={styles.odometerPhoto} />}
          <Button mode="outlined" icon="camera" onPress={takePhoto} loading={uploadingPhoto} disabled={uploadingPhoto}>
            {odometerUrl ? 'Переснять' : 'Сфотографировать'}
          </Button>

          <Divider style={styles.divider} />
          <Text variant="labelLarge">Касса</Text>
          {cashSectionOpen ? (
            <>
              <Text variant="bodySmall" style={styles.muted}>
                {`Наличные по заказам ${rub(cashCollected)} − расходы ${rub(expensesTotal)} − топливо наличными ${rub(fuelCash)} = к сдаче ${rub(expectedHandIn)}`}
              </Text>
              <TextInput
                mode="outlined"
                label="Сдано в кассу, ₽"
                keyboardType="numeric"
                value={cashText}
                onChangeText={setCashText}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)}
              />
            </>
          ) : (
            <Button mode="outlined" icon="cash-register" onPress={() => setCashSectionOpen(true)}>
              Сдать кассу
            </Button>
          )}

          {error && <HelperText type="error">{error}</HelperText>}

          <Button mode="contained" style={styles.saveSingle} onPress={() => save()} loading={saveReport.isPending} disabled={saveReport.isPending}>
            {report?.status === 'rejected' ? 'Отправить исправленный отчёт' : isSent ? 'Сохранить исправление' : 'Отправить'}
          </Button>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
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
  rejectedBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 10,
    gap: 2,
    marginBottom: 8,
  },
  rejectedTitle: {
    color: '#b91c1c',
  },
  saveSingle: {
    marginTop: 8,
  },
  noAccess: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
