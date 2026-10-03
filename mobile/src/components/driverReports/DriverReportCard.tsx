import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Divider, Surface, Text } from 'react-native-paper';
import type { DriverReport } from '../../api/driverReports';
import { DRIVER_REPORT_STATUS_COLORS, DRIVER_REPORT_STATUS_LABELS } from '../../theme';

export function rub(value: number) {
  return `${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;
}

export function formatReportDay(reportDate: string, withWeekday = true) {
  return format(new Date(`${reportDate}T00:00:00`), withWeekday ? 'd MMMM, EEEEEE' : 'd MMMM', { locale: ru });
}

export function formatMoment(iso: string) {
  return format(new Date(iso), "d MMMM 'в' HH:mm", { locale: ru });
}

function personName(person: { name: string; last_name: string | null } | null) {
  return person ? `${person.name} ${person.last_name ?? ''}`.trim() : '';
}

// Отчёт водителя как сообщение в ленте (Максим, 2026-09-28): дата и время
// отправки, отдельной строкой время правки водителем (если была), статус
// проверки с замечанием и сам отчёт. Одна и та же карточка у водителя и у
// администратора/диспетчера — отличаются только кнопки (actions).
//
// runningBalance (Правки 6, п.19) — сколько у водителя сейчас "на руках"
// нарастающим итогом (сдал меньше ожидаемого — остаток растёт, сдал
// больше — уменьшается или уходит в минус), а не расхождение одного дня.
// Считает вызывающий (список отчётов целиком, см. api/driverReports.ts
// useDriverReportFeed) — карточка сама знает только свой отчёт.
export function DriverReportCard({
  report,
  actions,
  runningBalance,
}: {
  report: DriverReport;
  actions?: ReactNode;
  runningBalance?: number;
}) {
  const statusColor = DRIVER_REPORT_STATUS_COLORS[report.status];
  const reviewer = personName(report.reviewer);
  const approver = personName(report.approver);

  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.headerRow}>
        <Text variant="titleMedium" style={styles.day}>
          {`Отчёт за ${formatReportDay(report.report_date)}`}
        </Text>
        <View style={[styles.statusPill, { borderColor: statusColor }]}>
          <Text variant="labelSmall" style={{ color: statusColor }}>
            {DRIVER_REPORT_STATUS_LABELS[report.status]}
          </Text>
        </View>
      </View>

      {report.submitted_at && (
        <Text variant="bodySmall" style={styles.meta}>
          {`Отправлен ${formatMoment(report.submitted_at)}`}
        </Text>
      )}
      {report.edited_at && (
        <Text variant="bodySmall" style={[styles.meta, styles.edited]}>
          {`Изменён водителем ${formatMoment(report.edited_at)}`}
        </Text>
      )}

      {report.status === 'rejected' && report.rejected_at && (
        <View style={[styles.remark, styles.remarkRejected]}>
          <Text variant="labelMedium" style={styles.remarkRejectedTitle}>
            {`Не согласован ${formatMoment(report.rejected_at)}${reviewer ? ` · ${reviewer}` : ''}`}
          </Text>
          <Text variant="bodyMedium">{report.rejection_comment}</Text>
        </View>
      )}
      {report.status !== 'rejected' && report.rejected_at && (
        <View style={[styles.remark, styles.remarkPast]}>
          <Text variant="labelMedium" style={styles.muted}>
            {`Был не согласован ${formatMoment(report.rejected_at)}${reviewer ? ` · ${reviewer}` : ''}`}
          </Text>
          <Text variant="bodySmall" style={styles.muted}>
            {report.rejection_comment}
          </Text>
        </View>
      )}
      {report.status === 'confirmed' && report.confirmed_at && (
        <Text variant="bodySmall" style={styles.approved}>
          {`Согласован ${formatMoment(report.confirmed_at)}${approver ? ` · ${approver}` : ''}`}
        </Text>
      )}

      <Divider style={styles.divider} />

      <Text variant="labelLarge">Заказы</Text>
      {report.driver_report_orders.length === 0 && (
        <Text variant="bodySmall" style={styles.muted}>
          Заказов нет.
        </Text>
      )}
      {[...report.driver_report_orders]
        .sort((a, b) => (a.orders?.scheduled_start ?? '').localeCompare(b.orders?.scheduled_start ?? ''))
        .map((o) => (
          <Text key={o.id} variant="bodySmall">
            {[
              o.orders ? format(new Date(o.orders.scheduled_start), 'HH:mm') : null,
              o.orders?.cargo_description || 'Без описания',
              rub(o.orders?.actual_price ?? 0),
              o.paid_by_transfer ? 'перевод/QR' : 'наличные',
              o.orders?.status === 'cancelled' ? 'заказ отменён' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ))}

      {report.driver_report_expenses.length > 0 && (
        <>
          <Text variant="labelLarge" style={styles.section}>
            Расходы
          </Text>
          {report.driver_report_expenses.map((e) => (
            <Text key={e.id} variant="bodySmall">
              {`${e.description} · ${rub(e.amount)}`}
            </Text>
          ))}
        </>
      )}

      {report.fuel_amount != null && (
        <Text variant="bodySmall" style={styles.section}>
          {`Топливо: ${rub(report.fuel_amount)} (${report.fuel_payment_method === 'cashless' ? 'безнал' : 'наличные'})`}
        </Text>
      )}
      <Text variant="bodySmall" style={styles.section}>
        {`Отработал: ${report.hoursWorked.toFixed(1)} ч`}
      </Text>

      {report.odometer_photo_url && (
        <>
          <Text variant="labelLarge" style={styles.section}>
            Фото одометра
          </Text>
          <Image source={{ uri: report.odometer_photo_url }} style={styles.photo} accessibilityLabel="Фото одометра" />
        </>
      )}

      <Text variant="labelLarge" style={styles.section}>
        Касса
      </Text>
      <Text variant="bodySmall" style={styles.muted}>
        {`Наличные по заказам ${rub(report.cashCollected)} − расходы ${rub(report.expensesTotal)} − топливо наличными ${rub(report.fuelCash)}`}
      </Text>
      <Text variant="bodyMedium">{`К сдаче: ${rub(report.expectedHandIn)}`}</Text>
      <Text variant="bodyMedium">{`Сдано: ${report.cash_handed_in != null ? rub(report.cash_handed_in) : 'не указано'}`}</Text>
      {runningBalance != null && (
        <Text variant="bodyMedium" style={styles.runningBalance}>
          {`Остаток у водителя: ${runningBalance < 0 ? '−' : ''}${rub(Math.abs(runningBalance))}`}
        </Text>
      )}

      {actions && <View style={styles.actions}>{actions}</View>}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  day: {
    flexShrink: 1,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  meta: {
    opacity: 0.7,
  },
  edited: {
    fontStyle: 'italic',
  },
  remark: {
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    gap: 2,
  },
  remarkRejected: {
    backgroundColor: '#fee2e2',
  },
  remarkRejectedTitle: {
    color: '#b91c1c',
  },
  remarkPast: {
    backgroundColor: '#f3f4f6',
  },
  approved: {
    color: '#15803d',
    marginTop: 4,
  },
  divider: {
    marginVertical: 10,
  },
  section: {
    marginTop: 8,
  },
  muted: {
    opacity: 0.65,
  },
  photo: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginTop: 4,
  },
  runningBalance: {
    color: '#15803d',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
});
