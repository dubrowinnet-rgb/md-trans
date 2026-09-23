import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type Service = Database['public']['Tables']['services']['Row'];

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('created_at', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Service[];
    },
  });
}
