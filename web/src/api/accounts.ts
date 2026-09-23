import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AccountRole, Database } from '@/types/database';

export type Account = Database['public']['Tables']['employees']['Row'];

export interface AccountPermissions {
  can_manage_orders: boolean;
  can_view_client_stats: boolean;
  can_view_contacts_and_amounts: boolean;
  can_manage_own_schedule: boolean;
}

// Права по умолчанию при создании аккаунта — те же, что в мобильном
// приложении (mobile/src/components/accounts/AccountDialog.tsx).
export const ROLE_DEFAULT_PERMISSIONS: Record<AccountRole, AccountPermissions> = {
  admin: {
    can_manage_orders: true,
    can_view_client_stats: true,
    can_view_contacts_and_amounts: true,
    can_manage_own_schedule: true,
  },
  dispatcher: {
    can_manage_orders: true,
    can_view_client_stats: true,
    can_view_contacts_and_amounts: true,
    can_manage_own_schedule: false,
  },
  driver: {
    can_manage_orders: false,
    can_view_client_stats: false,
    can_view_contacts_and_amounts: true,
    can_manage_own_schedule: false,
  },
  loader: {
    can_manage_orders: false,
    can_view_client_stats: false,
    can_view_contacts_and_amounts: false,
    can_manage_own_schedule: false,
  },
};

// Все аккаунты (админы, диспетчеры, водители, грузчики) — для экрана
// «Команда», который видит только администратор.
export function useAllAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Account[];
    },
  });
}

export interface CreateAccountInput {
  login: string;
  password: string;
  name: string;
  phone?: string;
  role: AccountRole;
  permissions: AccountPermissions;
  default_vehicle_id?: string | null;
}

// Заводит логин и пароль через Edge Function (supabase/functions/create-account)
// — с anon-ключом из браузера нельзя создать пользователя с паролем
// напрямую, для этого на сервере нужен service role key.
export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateAccountInput) => {
      const { data, error } = await supabase.functions.invoke<{ employee: Account; error?: string }>(
        'create-account',
        { body: input }
      );
      if (error) {
        // supabase-js кладёт тело ответа функции (с нашим русским текстом
        // ошибки) в error.context — error.message у FunctionsHttpError
        // всегда общая английская фраза, без него сообщение будет
        // нечитаемым для администратора.
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null);
          throw new Error(body?.error || error.message);
        }
        throw new Error(error.message);
      }
      if (data && 'error' in data && data.error) throw new Error(data.error);
      return data!.employee;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

// Смена роли и прав уже существующего аккаунта — обычный UPDATE, его
// разрешает RLS только администратору (миграция 0005).
export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      role,
      permissions,
      default_vehicle_id,
    }: {
      id: string;
      role: AccountRole;
      permissions: AccountPermissions;
      default_vehicle_id?: string | null;
    }) => {
      const { error } = await supabase
        .from('employees')
        .update({ role, ...permissions, ...(default_vehicle_id !== undefined ? { default_vehicle_id } : {}) })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}
