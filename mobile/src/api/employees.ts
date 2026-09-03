import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

export type Employee = Database['public']['Tables']['employees']['Row'];

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
