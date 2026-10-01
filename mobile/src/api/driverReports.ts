import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { sendPushNotifications } from '../lib/pushNotifications';
import { shrinkPhoto } from '../lib/shrinkPhoto';
import { unionPay } from './payroll';
import type { Database, DriverReportStatus, FuelPaymentMethod } from '../types/database';

export type DriverReportOrderRow = Database['public']['Tables']['driver_report_orders']['Row'];
export type DriverReportExpenseRow = Database['public']['Tables']['driver_report_expenses']['Row'];

export interface DriverReportOrderLine extends Pick<DriverReportOrderRow, 'id' | 'order_id' | 'paid_by_transfer'> {
  orders: {
    id: string;
    scheduled_start: string;
    scheduled_end: string;
    cargo_description: string | null;
    actual_price: number | null;
    status: string;
  } | null;
}

export type DriverReportExpenseLine = Pick<DriverReportExpenseRow, 'id' | 'description' | 'amount'>;

interface PersonRef {
  id: string;
  name: string;
  last_name: string | null;
}

export interface DriverReport {
  id: string;
  company_id: string;
  employee_id: string;
  report_date: string;
  status: DriverReportStatus;
  cash_handed_in: number | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  fuel_amount: number | null;
  fuel_payment_method: FuelPaymentMethod | null;
  odometer_photo_url: string | null;
  submitted_at: string | null;
  edited_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_comment: string | null;
  created_at: string;
  updated_at: string;
  driver_report_orders: DriverReportOrderLine[];
  driver_report_expenses: DriverReportExpenseLine[];
  // Кто не согласовал / согласовал — для строки замечания в ленте.
  reviewer: PersonRef | null;
  approver: PersonRef | null;
  // Сверка кассы — та же формула, что уже в веб-кабинете
  // (web/src/api/driverReports.ts, withTotals), намеренно продублирована
  // здесь 1-в-1, а не вынесена в общий пакет (мобильное и веб-приложение —
  // раздельные проекты без общего кода).
  cashCollected: number;
  expensesTotal: number;
  fuelCash: number;
  expectedHandIn: number;
  discrepancy: number | null;
  // Отработано за день (Правки 6) — сумма часов заказов отчёта, пересечения
  // по времени не задваиваются (тот же unionPay, что и в payroll.ts, —
  // Максим явно попросил совпадение с «Моя зарплата»).
  hoursWorked: number;
}

// Три связи с employees (автор, согласовавший, не согласовавший) — PostgREST
// требует указать, по какой из них подтягивать имя.
const REPORT_SELECT =
  '*, driver_report_orders(id, order_id, paid_by_transfer, orders(id, scheduled_start, scheduled_end, cargo_description, actual_price, status)), driver_report_expenses(id, description, amount), reviewer:employees!rejected_by(id, name, last_name), approver:employees!confirmed_by(id, name, last_name)';

function withTotals<T extends DriverReport>(raw: T): T {
  // В наличные идут неотменённые заказы, оплаченные не переводом (ревью,
  // задача 3): если заказ отменили уже после добавления в отчёт, он не должен
  // раздувать «К сдаче».
  const cashCollected = raw.driver_report_orders
    .filter((o) => o.orders?.status !== 'cancelled' && !o.paid_by_transfer && (o.orders?.actual_price ?? 0) > 0)
    .reduce((sum, o) => sum + (o.orders?.actual_price ?? 0), 0);
  const expensesTotal = raw.driver_report_expenses.reduce((sum, e) => sum + e.amount, 0);
  const fuelCash = raw.fuel_payment_method === 'cash' ? (raw.fuel_amount ?? 0) : 0;
  const expectedHandIn = cashCollected - expensesTotal - fuelCash;
  const hoursWorked = unionPay(
    raw.driver_report_orders
      .filter((o) => o.orders && o.orders.status !== 'cancelled')
      .map((o) => ({ start: new Date(o.orders!.scheduled_start).getTime(), end: new Date(o.orders!.scheduled_end).getTime(), rate: 0 }))
  ).hours;
  return {
    ...raw,
    cashCollected,
    expensesTotal,
    fuelCash,
    expectedHandIn,
    discrepancy: raw.cash_handed_in != null ? raw.cash_handed_in - expectedHandIn : null,
    hoursWorked,
  };
}

// Правила из миграции 0019 — здесь только чтобы показать кнопку «Исправить»
// и срок; проверяет их всё равно база (save_driver_report).
export const DRIVER_REPORT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function driverReportEditDeadline(report: Pick<DriverReport, 'submitted_at'>): Date | null {
  return report.submitted_at ? new Date(new Date(report.submitted_at).getTime() + DRIVER_REPORT_EDIT_WINDOW_MS) : null;
}

export function canAuthorEditReport(report: Pick<DriverReport, 'status' | 'submitted_at'>, now = new Date()): boolean {
  if (report.status === 'draft' || report.status === 'rejected') return true;
  if (report.status !== 'submitted') return false;
  const deadline = driverReportEditDeadline(report);
  return deadline != null && now < deadline;
}

// Остаток у водителя нарастающим итогом (Правки 6, п.19) — не расхождение
// одного дня, а сумма "к сдаче − сдано" по всем отправленным/согласованным
// отчётам до указанной даты включительно. Считает функция в базе
// (миграция 0029, driver_report_running_balance) в обход RLS: водителю
// видно только 2 последних месяца (см. ниже), а остаток должен быть верным
// и за более старую историю.
async function fetchRunningBalanceAsOf(employeeId: string, asOfDate: string): Promise<number> {
  const { data, error } = await supabase.rpc('driver_report_running_balance', {
    p_employee_id: employeeId,
    p_as_of_date: asOfDate,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export type DriverReportWithBalance = DriverReport & { runningBalance: number | null };

// Отчёт водителя за один день — форма «Написать / исправить отчёт».
export function useDriverReport(employeeId: string | undefined, reportDate: string) {
  return useQuery({
    queryKey: ['driver-report', employeeId, reportDate],
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<DriverReportWithBalance | null> => {
      const { data, error } = await supabase
        .from('driver_reports')
        .select(REPORT_SELECT)
        .eq('employee_id', employeeId as string)
        .eq('report_date', reportDate)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const report = withTotals(data as unknown as DriverReport);
      const runningBalance = report.status === 'draft' ? null : await fetchRunningBalanceAsOf(employeeId as string, reportDate);
      return { ...report, runningBalance };
    },
  });
}

// Лента отчётов одного водителя — одна и та же у него самого и у
// администратора/диспетчера (Максим, 2026-09-28): по дате отчёта, с начала
// месяца вниз к сегодняшнему дню. Какие месяцы видно, решает база: водителю
// — только текущий (плюс ещё открытые отчёты, см. миграцию 0019), поэтому
// для него month не передаётся; проверяющий листает любой месяц. Черновики
// приходят только самому водителю — в ленту они не входят, экран
// показывает их отдельно, как неотправленное сообщение.
export function useDriverReportFeed(employeeId: string | undefined, month?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['driver-report-feed', employeeId, month?.start ?? null, month?.end ?? null],
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<DriverReportWithBalance[]> => {
      let query = supabase
        .from('driver_reports')
        .select(REPORT_SELECT)
        .eq('employee_id', employeeId as string)
        .order('report_date', { ascending: true });
      if (month) query = query.gte('report_date', month.start).lt('report_date', month.end);
      const { data, error } = await query;
      if (error) throw error;
      const reports = (data ?? []).map((r) => withTotals(r as unknown as DriverReport));
      if (reports.length === 0) return [];

      // Один запрос за "остатком на начало" вместо одного на каждый отчёт:
      // дальше идём по уже загруженным отчётам сами (та же формула, что и
      // в самой функции базы — submitted/confirmed, остальное не меняет
      // остаток).
      const dayBefore = format(addDays(new Date(`${reports[0].report_date}T00:00:00`), -1), 'yyyy-MM-dd');
      let running = await fetchRunningBalanceAsOf(employeeId as string, dayBefore);

      return reports.map((r) => {
        if (r.status === 'submitted' || r.status === 'confirmed') {
          running += r.expectedHandIn - (r.cash_handed_in ?? 0);
        }
        return { ...r, runningBalance: r.status === 'draft' ? null : running };
      });
    },
  });
}

// Итог «отработано за месяц» (Правки 6) — Максим попросил, чтобы эта сумма
// совпадала с тем, что покажет «Моя зарплата» (settings/pay-estimate.tsx,
// useEmployeePayEstimate). Поэтому считаем НЕ суммой дневных hoursWorked
// (это завязало бы итог на то, сдал ли водитель отчёт за каждый день), а
// тем же способом, что и зарплата: напрямую по order_crew за период,
// только часы без ставки — одной функцией unionPay, чтобы не разойтись.
export function useMonthlyWorkedHours(employeeId: string | undefined, periodStart: Date, periodEnd: Date) {
  const startIso = periodStart.toISOString();
  const endIso = periodEnd.toISOString();
  return useQuery({
    queryKey: ['driver-report-monthly-hours', employeeId, startIso, endIso],
    enabled: Boolean(employeeId),
    queryFn: async (): Promise<number> => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('order_crew')
        .select('order_id, orders!inner(id, scheduled_start, scheduled_end, status)')
        .eq('employee_id', employeeId as string)
        .eq('role', 'driver')
        .neq('orders.status', 'cancelled')
        .lte('orders.scheduled_end', nowIso)
        .gte('orders.scheduled_start', startIso)
        .lt('orders.scheduled_start', endIso);
      if (error) throw error;

      const byOrder = new Map<string, { start: string; end: string }>();
      for (const row of (data ?? []) as unknown as { order_id: string; orders: { scheduled_start: string; scheduled_end: string } | null }[]) {
        if (row.orders) byOrder.set(row.order_id, { start: row.orders.scheduled_start, end: row.orders.scheduled_end });
      }
      return unionPay(
        [...byOrder.values()].map((o) => ({ start: new Date(o.start).getTime(), end: new Date(o.end).getTime(), rate: 0 }))
      ).hours;
    },
  });
}

export interface ReportDriver {
  id: string;
  name: string;
  last_name: string | null;
  pending: number;
}

// Список водителей для проверяющего — с числом отчётов «на проверке».
export function useReportDrivers() {
  return useQuery({
    queryKey: ['driver-report-drivers'],
    queryFn: async (): Promise<ReportDriver[]> => {
      // Число «на проверке» считает база (driver_reports_pending, миграция
      // 0020): список отчётов целиком у большой компании упирался в лимит
      // API в 1000 строк, и счётчики выходили меньше настоящих.
      const [driversRes, pendingRes] = await Promise.all([
        supabase.from('employees').select('id, name, last_name').eq('role', 'driver').order('name'),
        supabase.rpc('driver_reports_pending', {}),
      ]);
      if (driversRes.error) throw driversRes.error;
      if (pendingRes.error) throw pendingRes.error;
      const pendingBy = new Map<string, number>();
      for (const r of pendingRes.data ?? []) pendingBy.set(r.employee_id, Number(r.pending));
      return (driversRes.data ?? []).map((d) => ({ ...d, pending: pendingBy.get(d.id) ?? 0 }));
    },
  });
}

// Заказы дня, где сотрудник был ВОДИТЕЛЕМ (не грузчиком на чужой машине) и
// заказ не отменён — для автозаполнения формы отчёта о наличных (ревью,
// задача 3). Раньше сюда попадали любые роли и отменённые заказы, отчего
// «К сдаче» завышалась, а у администратора появлялось ложное «Расхождение».
// То же условие, что и у напоминания remind-driver-report.
export function useReportDayOrders(employeeId: string | undefined, reportDate: string) {
  const dayStart = `${reportDate}T00:00:00+03:00`;
  const dayEnd = `${reportDate}T23:59:59+03:00`;
  return useQuery({
    queryKey: ['report-day-orders', employeeId, reportDate],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_crew')
        .select('order_id, orders!inner(id, scheduled_start, cargo_description, actual_price, status)')
        .eq('employee_id', employeeId as string)
        .eq('role', 'driver')
        .neq('orders.status', 'cancelled')
        .gte('orders.scheduled_start', dayStart)
        .lte('orders.scheduled_start', dayEnd);
      if (error) throw error;
      const byId = new Map<string, { id: string; scheduled_start: string; cargo_description: string | null; actual_price: number | null }>();
      for (const row of (data ?? []) as unknown as { order_id: string; orders: { id: string; scheduled_start: string; cargo_description: string | null; actual_price: number | null } | null }[]) {
        if (row.orders) byId.set(row.order_id, row.orders);
      }
      return [...byId.values()].sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
    },
  });
}

export interface SaveDriverReportInput {
  report_date: string;
  submit: boolean;
  fuel_amount: number | null;
  fuel_payment_method: FuelPaymentMethod | null;
  odometer_photo_url: string | null;
  cash_handed_in: number | null;
  orders: { order_id: string; paid_by_transfer: boolean }[];
  expenses: { description: string; amount: number }[];
}

function invalidateReports(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['driver-report'] });
  queryClient.invalidateQueries({ queryKey: ['driver-report-feed'] });
  queryClient.invalidateQueries({ queryKey: ['driver-report-drivers'] });
}

// Отчёт целиком одной функцией базы (миграция 0019): она же проверяет
// 24 часа, «согласованный не меняется» и ставит время отправки/правки —
// напрямую в таблицы отчётов приложение больше не пишет. «Сдано» теперь
// часть отчёта: сданную позже кассу водитель вписывает исправлением.
export function useSaveDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDriverReportInput) => {
      const { data, error } = await supabase.rpc('save_driver_report', {
        p_report_date: input.report_date,
        p_submit: input.submit,
        p_orders: input.orders,
        p_expenses: input.expenses,
        p_fuel_amount: input.fuel_amount,
        p_fuel_payment_method: input.fuel_payment_method,
        p_odometer_photo_url: input.odometer_photo_url,
        p_cash_handed_in: input.cash_handed_in,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateReports(queryClient),
  });
}

// Проверка администратором или диспетчером: отчёт они не правят, только
// согласуют или не согласуют с комментарием (Максим, 2026-09-28).
export function useApproveDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase.rpc('approve_driver_report', { p_report_id: reportId });
      if (error) throw error;
    },
    onSuccess: () => invalidateReports(queryClient),
  });
}

export function useRejectDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ report, comment }: { report: Pick<DriverReport, 'id' | 'employee_id' | 'report_date'>; comment: string }) => {
      const { error } = await supabase.rpc('reject_driver_report', { p_report_id: report.id, p_comment: comment });
      if (error) throw error;

      // Пуш водителю — без текста замечания: пуши идут через серверы за
      // пределами России (152-ФЗ), само замечание он прочитает в ленте.
      const { data: driver } = await supabase.from('employees').select('expo_push_token').eq('id', report.employee_id).maybeSingle();
      const day = format(new Date(`${report.report_date}T00:00:00`), 'dd.MM');
      await sendPushNotifications(
        driver?.expo_push_token ? [driver.expo_push_token] : [],
        'Отчёт не согласован',
        `Отчёт за ${day} не согласован. Откройте «Мои отчёты» и исправьте.`,
        { kind: 'driver-report', reportId: report.id }
      );
    },
    onSuccess: () => invalidateReports(queryClient),
  });
}

// Открыть согласованный отчёт для исправления (Правки 6, п.25) — водитель
// ошибся, а отчёт уже согласован; проверяющий разрешает одно исправление,
// отчёт возвращается на проверку (save_driver_report отработает как обычно
// для статуса 'submitted').
export function useReopenDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase.rpc('reopen_driver_report', { p_report_id: reportId });
      if (error) throw error;
    },
    onSuccess: () => invalidateReports(queryClient),
  });
}

// Заливка фото одометра в публичный бакет (миграция 0014) — обычная
// функция, а не мутация: вызывается сразу после выбора фото, результат
// (URL) живёт в состоянии формы до сохранения всего отчёта. Перед заливкой
// снимок уменьшается (lib/shrinkPhoto.ts) и всегда сохраняется в JPEG.
export async function uploadOdometerPhoto(employeeId: string, uri: string): Promise<string> {
  const response = await fetch(await shrinkPhoto(uri));
  const blob = await response.blob();
  const path = `${employeeId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('odometer-photos').upload(path, blob, {
    contentType: 'image/jpeg',
  });
  if (error) throw error;
  const { data } = supabase.storage.from('odometer-photos').getPublicUrl(path);
  return data.publicUrl;
}
