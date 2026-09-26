import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Database, DriverReportStatus, FuelPaymentMethod } from '../types/database';

export type DriverReportOrderRow = Database['public']['Tables']['driver_report_orders']['Row'];
export type DriverReportExpenseRow = Database['public']['Tables']['driver_report_expenses']['Row'];

export interface DriverReportOrderLine extends Pick<DriverReportOrderRow, 'id' | 'order_id' | 'paid_by_transfer'> {
  orders: { id: string; scheduled_start: string; cargo_description: string | null; actual_price: number | null } | null;
}

export type DriverReportExpenseLine = Pick<DriverReportExpenseRow, 'id' | 'description' | 'amount'>;

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
  created_at: string;
  updated_at: string;
  driver_report_orders: DriverReportOrderLine[];
  driver_report_expenses: DriverReportExpenseLine[];
  // Сверка кассы — та же формула, что уже в веб-кабинете
  // (web/src/api/driverReports.ts, withTotals), намеренно продублирована
  // здесь 1-в-1, а не вынесена в общий пакет (мобильное и веб-приложение —
  // раздельные проекты без общего кода).
  cashCollected: number;
  expensesTotal: number;
  fuelCash: number;
  expectedHandIn: number;
  discrepancy: number | null;
}

interface DriverReportWithEmployee extends DriverReport {
  employees: { id: string; name: string; last_name: string | null } | null;
}

const REPORT_SELECT =
  '*, driver_report_orders(id, order_id, paid_by_transfer, orders(id, scheduled_start, cargo_description, actual_price)), driver_report_expenses(id, description, amount)';

function withTotals<T extends DriverReport>(raw: T): T {
  const cashCollected = raw.driver_report_orders
    .filter((o) => !o.paid_by_transfer && (o.orders?.actual_price ?? 0) > 0)
    .reduce((sum, o) => sum + (o.orders?.actual_price ?? 0), 0);
  const expensesTotal = raw.driver_report_expenses.reduce((sum, e) => sum + e.amount, 0);
  const fuelCash = raw.fuel_payment_method === 'cash' ? (raw.fuel_amount ?? 0) : 0;
  const expectedHandIn = cashCollected - expensesTotal - fuelCash;
  return {
    ...raw,
    cashCollected,
    expensesTotal,
    fuelCash,
    expectedHandIn,
    discrepancy: raw.cash_handed_in != null ? raw.cash_handed_in - expectedHandIn : null,
  };
}

// Отчёт конкретного водителя за один день — форма «Мой отчёт».
export function useDriverReport(employeeId: string | undefined, reportDate: string) {
  return useQuery({
    queryKey: ['driver-report', employeeId, reportDate],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_reports')
        .select(REPORT_SELECT)
        .eq('employee_id', employeeId as string)
        .eq('report_date', reportDate)
        .maybeSingle();
      if (error) throw error;
      return data ? withTotals(data as unknown as DriverReport) : null;
    },
  });
}

// Все отчёты компании — экран подтверждения у администратора. Статус не
// фильтруем (видит и черновики), как и веб-кабинет.
export function useDriverReports(companyId: string | undefined) {
  return useQuery({
    queryKey: ['driver-reports', companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_reports')
        .select(`${REPORT_SELECT}, employees!employee_id(id, name, last_name)`)
        .eq('company_id', companyId as string)
        .order('report_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => withTotals(r as unknown as DriverReportWithEmployee));
    },
  });
}

// Заказы дня, где сотрудник в бригаде (любой ролью) — для автозаполнения
// формы отчёта списком заказов на выбор перевод/QR.
export function useReportDayOrders(employeeId: string | undefined, reportDate: string) {
  const dayStart = `${reportDate}T00:00:00+03:00`;
  const dayEnd = `${reportDate}T23:59:59+03:00`;
  return useQuery({
    queryKey: ['report-day-orders', employeeId, reportDate],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_crew')
        .select('order_id, orders!inner(id, scheduled_start, cargo_description, actual_price)')
        .eq('employee_id', employeeId as string)
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
  employee_id: string;
  report_date: string;
  status: 'draft' | 'submitted';
  fuel_amount: number | null;
  fuel_payment_method: FuelPaymentMethod | null;
  odometer_photo_url: string | null;
  orders: { order_id: string; paid_by_transfer: boolean }[];
  expenses: { description: string; amount: number }[];
}

// Сохраняет форму отчёта целиком: сам отчёт (upsert по employee_id+report_date
// — уникальный ключ, один отчёт на сотрудника на день) и обе дочерние
// таблицы — удалить всё и вставить заново, форма всегда отправляет полный
// список заказов/расходов, а не отдельные правки строк.
export function useSaveDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDriverReportInput) => {
      const { orders, expenses, ...core } = input;
      const { data: report, error } = await supabase
        .from('driver_reports')
        .upsert(core, { onConflict: 'employee_id,report_date' })
        .select('id')
        .single();
      if (error) throw error;
      const reportId = report.id as string;

      const { error: delOrdersError } = await supabase.from('driver_report_orders').delete().eq('report_id', reportId);
      if (delOrdersError) throw delOrdersError;
      if (orders.length > 0) {
        const { error: insOrdersError } = await supabase
          .from('driver_report_orders')
          .insert(orders.map((o) => ({ report_id: reportId, ...o })));
        if (insOrdersError) throw insOrdersError;
      }

      const { error: delExpError } = await supabase.from('driver_report_expenses').delete().eq('report_id', reportId);
      if (delExpError) throw delExpError;
      if (expenses.length > 0) {
        const { error: insExpError } = await supabase
          .from('driver_report_expenses')
          .insert(expenses.map((e) => ({ report_id: reportId, ...e })));
        if (insExpError) throw insExpError;
      }

      return reportId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-report'] });
      queryClient.invalidateQueries({ queryKey: ['driver-reports'] });
    },
  });
}

// «Сдать кассу» — отдельная кнопка с ручным вводом суммы (Максим, п. «отчёты
// водителей»), не часть формы отчёта.
export function useHandInCash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, amount }: { reportId: string; amount: number }) => {
      const { error } = await supabase.from('driver_reports').update({ cash_handed_in: amount }).eq('id', reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-report'] });
      queryClient.invalidateQueries({ queryKey: ['driver-reports'] });
    },
  });
}

// Подтверждение отчёта администратором — фиксирует его в финансовых отчётах
// (Максим). RLS разрешает только администратору своей компании.
export function useConfirmDriverReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, confirmedBy }: { reportId: string; confirmedBy: string }) => {
      const { error } = await supabase
        .from('driver_reports')
        .update({ status: 'confirmed', confirmed_by: confirmedBy, confirmed_at: new Date().toISOString() })
        .eq('id', reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-report'] });
      queryClient.invalidateQueries({ queryKey: ['driver-reports'] });
    },
  });
}

// Заливка фото одометра в публичный бакет (миграция 0014) — обычная
// функция, а не мутация: вызывается сразу после выбора фото, результат
// (URL) живёт в состоянии формы до сохранения всего отчёта.
export async function uploadOdometerPhoto(employeeId: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = uri.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
  const path = `${employeeId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('odometer-photos').upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
  });
  if (error) throw error;
  const { data } = supabase.storage.from('odometer-photos').getPublicUrl(path);
  return data.publicUrl;
}
