import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { formatPhone } from '../lib/phone';
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
          phone: formatPhone(input.phone) || null,
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
// клиентам»): число заказов и сумма по выполненным. Публикуется только при
// can_view_client_stats — см. ClientDialog; то же право проверяет и база.
// Считает база (client_stats, миграция 0020) по правилу «выполнен» из
// lib/orderCompletion.ts, а не приложение по скачанным заказам: у
// постоянного клиента их может быть больше 1000 — столько API отдаёт за раз.
export function useClientOrderStats(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-stats', clientId],
    enabled: Boolean(clientId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('client_stats', { p_client_id: clientId as string });
      if (error) throw error;
      const row = data?.[0];
      return {
        totalOrders: Number(row?.orders_count ?? 0),
        completedOrders: Number(row?.completed_count ?? 0),
        totalAmount: Number(row?.revenue ?? 0),
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
          phone: formatPhone(input.phone) || null,
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
