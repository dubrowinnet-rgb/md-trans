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

export interface ClientInput {
  name: string;
  phone?: string;
  discount_percent?: number;
  notes?: string;
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClientInput) => {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          name: input.name,
          phone: input.phone || null,
          discount_percent: input.discount_percent ?? 0,
          notes: input.notes || null,
        })
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

// Простая статистика по клиенту (раздел «смотреть историю и статистику по
// клиентам»): число заказов и сумма по тем, где она указана. Публикуется
// только при can_view_client_stats — см. ClientDialog.
export function useClientOrderStats(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-stats', clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('status, actual_price')
        .eq('client_id', clientId as string);
      if (error) throw error;
      const rows = data as { status: string; actual_price: number | null }[];
      const completed = rows.filter((r) => r.status === 'completed');
      return {
        totalOrders: rows.length,
        completedOrders: completed.length,
        totalAmount: completed.reduce((sum, r) => sum + (r.actual_price ?? 0), 0),
      };
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ClientInput & { id: string }) => {
      const { error } = await supabase
        .from('clients')
        .update({
          name: input.name,
          phone: input.phone || null,
          discount_percent: input.discount_percent ?? 0,
          notes: input.notes || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
