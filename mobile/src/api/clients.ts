import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

export type Client = Database['public']['Tables']['clients']['Row'];

export function useClients(search: string) {
  return useQuery({
    queryKey: ['clients', search],
    queryFn: async () => {
      let query = supabase.from('clients').select('*').order('name', { ascending: true }).limit(30);
      if (search.trim()) {
        query = query.ilike('name', `%${search.trim()}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; phone?: string }) => {
      const { data, error } = await supabase
        .from('clients')
        .insert({ name: input.name, phone: input.phone || null })
        .select()
        .single();
      if (error) throw error;
      return data as Client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
