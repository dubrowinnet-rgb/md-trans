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

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Employee[];
    },
  });
}
