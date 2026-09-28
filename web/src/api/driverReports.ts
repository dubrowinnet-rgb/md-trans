import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
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
  // Доработка «лента отчётов» (Максим, 2026-09-28) — см. DriverReportStatus
  // в types/database.ts: колонок пока нет, select('*') их просто не вернёт.
  submitted_at?: string | null;
  driver_edited_at?: string | null;
  review_comment?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
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

// Все отчёты водителей за период — для таблицы администратора и
// помесячного расчёта (группировка по месяцу считается на клиенте, см.
// компонент страницы). employee_id/confirmed_by нарочно НЕ разворачиваем
// через embed employees(...) — на driver_reports будет два FK на employees
// сразу, embed станет неоднозначным; имена сотрудников подставляет сама
// страница из уже загруженного useAllAccounts().
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

// Когда водитель написал отчёт и когда (если было) правил его сам —
// Максим хочет видеть оба времени в ленте. Пока в базе нет времени
// отправки, «написан» — время создания отчёта.
export function reportWrittenAt(report: DriverReport): string {
  return report.submitted_at ?? report.created_at;
}

export function reportEditedAt(report: DriverReport): string | null {
  return report.driver_edited_at ?? null;
}

// «Не согласовать» появляется, только когда в базе уже есть колонки для
// комментария (миграция мобильного треда): существующая колонка приходит
// в ответе как null, отсутствующая — не приходит совсем.
export function canRejectReport(report: DriverReport): boolean {
  return 'review_comment' in report;
}

// Подтверждение отчёта и сданной кассы администратором — после этого он
// считается зафиксированным в финансовых отчётах (Максим); дальше отчёт
// нигде не редактируется.
export function useConfirmDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, confirmedBy }: { id: string; confirmedBy: string }) => {
      const { error } = await supabase
        .from('driver_reports')
        .update({ status: 'confirmed', confirmed_by: confirmedBy, confirmed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-reports'] });
    },
  });
}

// «Не согласовать» с комментарием: отчёт возвращается водителю, он
// исправляет и отправляет заново. Сам отчёт администратор/диспетчер не
// меняет — только статус и комментарий (Максим, 2026-09-28).
export function useRejectDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reviewedBy, comment }: { id: string; reviewedBy: string; comment: string }) => {
      const { error } = await supabase
        .from('driver_reports')
        .update({
          status: 'rejected',
          review_comment: comment,
          reviewed_by: reviewedBy,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-reports'] });
    },
  });
}
