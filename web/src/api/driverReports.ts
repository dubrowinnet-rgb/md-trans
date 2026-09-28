import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { notifyEmployees } from '@/lib/push';
import { dayjs } from '@/lib/dates';
import type { DriverReportStatus, FuelPaymentMethod } from '@/types/database';

export type { DriverReportStatus, FuelPaymentMethod };

interface DriverReportOrderRow {
  id: string;
  order_id: string;
  paid_by_transfer: boolean;
  orders: {
    id: string;
    scheduled_start: string;
    cargo_description: string | null;
    actual_price: number | null;
    status: string;
  } | null;
}

interface DriverReportExpenseRow {
  id: string;
  description: string;
  amount: number;
}

interface DriverReportRow {
  id: string;
  employee_id: string;
  report_date: string;
  status: DriverReportStatus;
  cash_handed_in: number | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  fuel_amount: number | null;
  fuel_payment_method: FuelPaymentMethod | null;
  odometer_photo_url: string | null;
  created_at: string;
  // Лента отчётов (миграция 0019): когда отправлен, когда водитель правил
  // его после отправки, и последнее несогласование (кто, когда, что
  // исправить) — после повторной отправки оно остаётся как история.
  submitted_at: string | null;
  edited_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_comment: string | null;
  driver_report_orders: DriverReportOrderRow[];
  driver_report_expenses: DriverReportExpenseRow[];
}

export interface DriverReport extends DriverReportRow {
  // Собрано наличными: неотменённые заказы с суммой > 0, не отмеченные
  // водителем как «перевод/QR» (0/пусто в заказе уже значит безнал). Заказ,
  // отменённый уже после отчёта, в кассу не идёт — как в мобильном.
  cashCollected: number;
  expensesTotal: number;
  fuelCash: number;
  // Сколько по расчёту должен сдать: собрано минус расходы минус топливо,
  // если оно оплачено наличными. Явно не описано Максимом — рабочее
  // предположение, см. память.
  expectedHandIn: number;
  discrepancy: number;
}

const REPORT_SELECT =
  '*, driver_report_orders(id, order_id, paid_by_transfer, orders(id, scheduled_start, cargo_description, actual_price, status)), driver_report_expenses(id, description, amount)';

function withTotals(row: DriverReportRow): DriverReport {
  const cashCollected = row.driver_report_orders.reduce((sum, line) => {
    if (line.orders?.status === 'cancelled') return sum;
    const price = line.orders?.actual_price ?? 0;
    return price > 0 && !line.paid_by_transfer ? sum + price : sum;
  }, 0);
  const expensesTotal = row.driver_report_expenses.reduce((sum, e) => sum + e.amount, 0);
  const fuelCash = row.fuel_payment_method === 'cash' ? row.fuel_amount ?? 0 : 0;
  const expectedHandIn = cashCollected - expensesTotal - fuelCash;
  const discrepancy = (row.cash_handed_in ?? 0) - expectedHandIn;
  return { ...row, cashCollected, expensesTotal, fuelCash, expectedHandIn, discrepancy };
}

// Все отчёты водителей за период — для ленты, таблицы и помесячного
// расчёта (группировка по месяцу считается на клиенте, см. компонент
// страницы). Черновики администратору/диспетчеру база не отдаёт (0019:
// неотправленный отчёт видит только сам водитель). employee_id,
// confirmed_by и rejected_by нарочно НЕ разворачиваем через embed
// employees(...) — на driver_reports три FK на employees, embed без
// уточнения неоднозначен; имена подставляет сама страница из уже
// загруженного useAllAccounts().
export function useDriverReports(period: { from: string; to: string } | null) {
  return useQuery({
    queryKey: ['driver-reports', period?.from, period?.to],
    queryFn: async (): Promise<{ reports: DriverReport[] }> => {
      let query = supabase.from('driver_reports').select(REPORT_SELECT).order('report_date', { ascending: false });
      if (period) query = query.gte('report_date', period.from).lt('report_date', period.to);
      const { data, error } = await query;
      if (error) throw error;
      return { reports: (data as unknown as DriverReportRow[]).map(withTotals) };
    },
  });
}

// Когда водитель отправил отчёт и, если было, когда правил его после
// отправки — Максим хочет видеть оба времени в ленте. Отчётам, отправленным
// до 0019, миграция проставила submitted_at из created_at.
export function reportWrittenAt(report: DriverReport): string {
  return report.submitted_at ?? report.created_at;
}

export function reportEditedAt(report: DriverReport): string | null {
  return report.edited_at;
}

// Согласовать отчёт (он же подтверждение сданной кассы) — после этого он
// окончательный: водитель не правит его даже в пределах 24 часов, и он
// считается зафиксированным в финансовых отчётах (Максим). С 0019 прямой
// записи в driver_reports нет — только функция базы, она же проверяет
// роль и что отчёт ждёт проверки; её ошибки уже по-русски.
export function useApproveDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase.rpc('approve_driver_report', { p_report_id: reportId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-reports'] });
    },
  });
}

// «Не согласовать» с комментарием: отчёт возвращается водителю, он
// исправляет и отправляет заново. Сам отчёт администратор/диспетчер не
// меняет (Максим, 2026-09-28). Водителю — push, как в мобильном: без
// текста комментария (152-ФЗ), комментарий он увидит в приложении.
export function useRejectDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ report, comment }: { report: DriverReport; comment: string }) => {
      const { error } = await supabase.rpc('reject_driver_report', { p_report_id: report.id, p_comment: comment });
      if (error) throw error;
      await notifyEmployees(
        [report.employee_id],
        'Отчёт не согласован',
        `Отчёт за ${dayjs(report.report_date).format('DD.MM')} не согласован. Откройте «Мои отчёты» и исправьте.`,
        { kind: 'driver-report', reportId: report.id }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-reports'] });
    },
  });
}
