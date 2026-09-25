import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AccountStatus } from '@/types/database';

// companies и employees.company_id ещё не в сгенерированных типах
// (types/database.ts) — их добавит миграция мобильного треда. До тех пор
// обращаемся к ним через нетипизированный клиент; уберётся вместе с
// isMissingTableError, когда типы синхронизируют с реальной схемой.
const db = supabase as unknown as SupabaseClient;

// Таблица companies ещё не существует в боевой базе — её добавляет миграция
// мобильного треда (предложенная форма в памяти owner-console-feature).
// Запросы к ней до этого момента возвращают «таблицы нет», а не данные —
// isMissingTableError() отличает это от настоящей ошибки, чтобы кабинет
// владельца показывал «скоро появится», а не падал с ошибкой.
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
export interface Company {
  id: string;
  name: string;
  subscription_status: AccountStatus;
  subscription_plan: string | null;
  subscription_price: number | null;
  subscription_expires_at: string | null;
  created_at: string;
}

export interface CompanyWithStats extends Company {
  employeeCount: number;
}

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<{ companies: CompanyWithStats[]; missingTable: boolean }> => {
      const [companiesRes, employeesRes] = await Promise.all([
        db.from('companies').select('*').order('name', { ascending: true }),
        db.from('employees').select('company_id'),
      ]);
      if (companiesRes.error) {
        if (isMissingTableError(companiesRes.error)) return { companies: [], missingTable: true };
        throw companiesRes.error;
      }
      if (employeesRes.error) throw employeesRes.error;
      const counts = new Map<string, number>();
      for (const row of employeesRes.data as { company_id: string | null }[]) {
        if (!row.company_id) continue;
        counts.set(row.company_id, (counts.get(row.company_id) ?? 0) + 1);
      }
      const companies = (companiesRes.data as Company[]).map((c) => ({
        ...c,
        employeeCount: counts.get(c.id) ?? 0,
      }));
      return { companies, missingTable: false };
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
      const { data, error } = await db
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
      const { error } = await db.from('companies').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
