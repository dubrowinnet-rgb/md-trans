import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isMissingTableError } from './companies';

// driver_reports/driver_report_orders/driver_report_expenses ещё не в
// types/database.ts — предложенная схема, миграция мобильного треда ещё не
// пришла (память payroll-and-driver-reports-feature). Тот же нетипизированный
// клиент и isMissingTableError, что и в api/companies.ts.
const db = supabase as unknown as SupabaseClient;

export type DriverReportStatus = 'draft' | 'submitted' | 'confirmed';
export type FuelPaymentMethod = 'cash' | 'cashless';

interface DriverReportOrderRow {
  id: string;
  order_id: string;
  paid_by_transfer: boolean;
  orders: { id: string; scheduled_start: string; cargo_description: string | null; actual_price: number | null } | null;
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
  driver_report_orders: DriverReportOrderRow[];
  driver_report_expenses: DriverReportExpenseRow[];
}

export interface DriverReport extends DriverReportRow {
  // Собрано наличными: заказы с суммой > 0, не отмеченные водителем как
  // «перевод/QR» (см. память — 0/пусто в заказе уже значит безнал).
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
  '*, driver_report_orders(id, order_id, paid_by_transfer, orders(id, scheduled_start, cargo_description, actual_price)), driver_report_expenses(id, description, amount)';

function withTotals(row: DriverReportRow): DriverReport {
  const cashCollected = row.driver_report_orders.reduce((sum, line) => {
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
    queryFn: async (): Promise<{ reports: DriverReport[]; missingTable: boolean }> => {
      let query = db.from('driver_reports').select(REPORT_SELECT).order('report_date', { ascending: false });
      if (period) query = query.gte('report_date', period.from).lt('report_date', period.to);
      const { data, error } = await query;
      if (error) {
        if (isMissingTableError(error)) return { reports: [], missingTable: true };
        throw error;
      }
      return { reports: (data as unknown as DriverReportRow[]).map(withTotals), missingTable: false };
    },
  });
}

// Подтверждение отчёта и сданной кассы администратором — после этого он
// считается зафиксированным в финансовых отчётах (Максим); дальше отчёт
// нигде не редактируется.
export function useConfirmDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, confirmedBy }: { id: string; confirmedBy: string }) => {
      const { error } = await db
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
