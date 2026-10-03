import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

export type Employee = Database['public']['Tables']['employees']['Row'];

export function useCurrentEmployee(authUserId: string | undefined) {
  return useQuery({
    queryKey: ['current-employee', authUserId],
    enabled: Boolean(authUserId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_user_id', authUserId as string)
        .maybeSingle();
      if (error) throw error;
      return data as Employee | null;
    },
  });
}

// Только водители и грузчики — для выбора экипажа и фильтра календаря.
// Администраторов и диспетчеров показывает отдельный экран «Команда»
// (api/accounts.ts), туда они не годятся, экипажем не назначаются.
// Уволенного (account_status = 'suspended') в экипаж больше не назначить,
// но его прошлые заказы по-прежнему показывают его имя (это читает
// order_crew.employees напрямую, не через этот хук).
export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .in('role', ['driver', 'loader'])
        .neq('account_status', 'suspended')
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Employee[];
    },
  });
}
