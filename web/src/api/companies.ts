import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AccountStatus, Database } from '@/types/database';

// companies приземлилась миграцией 0013 (мобильный тред) — типизированный
// клиент теперь можно использовать напрямую, как для любой другой таблицы.
// isMissingTableError остаётся экспортированной: её всё ещё использует
// api/driverReports.ts для ЕЩЁ не приземлившейся схемы (см. память
// payroll-and-driver-reports-feature) — тот же приём, другая таблица.
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: unknown }).code) : '';
  const message =
    'message' in err && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : '';
  // PGRST200 — отдельный код: его отдаёт запрос со встроенной связью
  // (напр. `select=*,companies(name)`), когда искомой таблицы ещё нет —
  // PostgREST в этом случае жалуется на отсутствие связи, а не таблицы.
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST200' ||
    /does not exist|Could not find the table|Could not find a relationship/i.test(message)
  );
}

// Компания = «подключённый администратор» (клиент сервиса) в терминах
// Максима — тенант, у которого свои сотрудники/клиенты/заказы. Статус
// подписки — та же форма, что и AccountStatus, которым уже пользуется
// вкладка «Оплата» в Настройках, для единообразия терминологии.
export type Company = Database['public']['Tables']['companies']['Row'];

export interface CompanyWithStats extends Company {
  employeeCount: number;
}

// Видно только владельцу сервиса (RLS "companies select by owner") —
// вторая часть запроса (все employees.company_id, для подсчёта по
// компаниям) владельцу тоже открыта отдельной веткой политики "employees
// select" (is_service_owner()).
export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompanyWithStats[]> => {
      const [companiesRes, employeesRes] = await Promise.all([
        supabase.from('companies').select('*').order('name', { ascending: true }),
        supabase.from('employees').select('company_id'),
      ]);
      if (companiesRes.error) throw companiesRes.error;
      if (employeesRes.error) throw employeesRes.error;
      const counts = new Map<string, number>();
      for (const row of employeesRes.data as { company_id: string | null }[]) {
        if (!row.company_id) continue;
        counts.set(row.company_id, (counts.get(row.company_id) ?? 0) + 1);
      }
      return (companiesRes.data as Company[]).map((c) => ({
        ...c,
        employeeCount: counts.get(c.id) ?? 0,
      }));
    },
  });
}

export interface CompanyInput {
  name: string;
  subscription_plan?: string | null;
  subscription_price?: number | null;
  subscription_expires_at?: string | null;
}

// Ручное добавление клиента сервиса (пункт Максима «возможность вручную
// добавлять клиентов сервиса»). Заводит только запись компании — учётку
// администратора для неё заводят отдельно, тем же способом, что и любого
// сотрудника (см. api/accounts.ts), выбрав эту компанию.
export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompanyInput) => {
      const { data, error } = await supabase
        .from('companies')
        .insert({
          name: input.name,
          subscription_plan: input.subscription_plan || null,
          subscription_price: input.subscription_price ?? null,
          subscription_expires_at: input.subscription_expires_at || null,
          subscription_status: 'pending_payment',
        })
        .select()
        .single();
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useUpdateCompanySubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      subscription_status: AccountStatus;
      subscription_expires_at?: string | null;
      subscription_plan?: string | null;
      subscription_price?: number | null;
    }) => {
      const { error } = await supabase.from('companies').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
