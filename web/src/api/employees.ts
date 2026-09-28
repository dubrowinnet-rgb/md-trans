import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { REFERENCE_STALE_TIME } from '@/lib/supabaseQuery';
import { useCompanyId } from '@/providers/SessionProvider';
import type { Database } from '@/types/database';

export type Employee = Database['public']['Tables']['employees']['Row'];

// Только водители и грузчики — для выбора экипажа и фильтра календаря.
// Администраторов и диспетчеров показывает отдельный экран «Команда»
// (api/accounts.ts), туда они не годятся, экипажем не назначаются.
export function useEmployees() {
  const companyId = useCompanyId();
  return useQuery({
    queryKey: ['employees', companyId],
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async () => {
      let query = supabase.from('employees').select('*').in('role', ['driver', 'loader']);
      if (companyId) query = query.eq('company_id', companyId);
      const { data, error } = await query
        .order('role', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as Employee[];
    },
  });
}
