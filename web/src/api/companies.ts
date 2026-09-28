import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabaseQuery';
import type { AccountStatus, Database } from '@/types/database';

// Компания = «подключённый администратор» (клиент сервиса) в терминах
// Максима — тенант, у которого свои сотрудники/клиенты/заказы. Статус
// подписки — та же форма, что и AccountStatus, которым уже пользуется
// вкладка «Оплата» в Настройках, для единообразия терминологии.
export type Company = Database['public']['Tables']['companies']['Row'];

export interface CompanyWithStats extends Company {
  employeeCount: number;
}

// Видно только владельцу сервиса (RLS "companies select by owner"), число
// сотрудников считает сама база: employees(count) — владельцу сотрудники
// всех компаний открыты веткой is_service_owner() политики "employees
// select". Раньше кабинет скачивал company_id всех сотрудников сервиса, а
// PostgREST отдавал только первую 1000 — при 4000 сотрудниках счёт был
// неверным. Компаний тоже может быть больше 1000 — страницами.
export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompanyWithStats[]> => {
      const rows = await fetchAllPages<Company & { employees: { count: number }[] }>((from, to) =>
        supabase
          .from('companies')
          .select('*, employees(count)')
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
      );
      return rows.map(({ employees, ...c }) => ({ ...c, employeeCount: employees[0]?.count ?? 0 }));
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
