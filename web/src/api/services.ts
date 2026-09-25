import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export interface ServiceInput {
  name: string;
  category?: string | null;
  base_duration_minutes?: number | null;
  base_price?: number | null;
  color: string;
}

// Каталог услуг — настраивает администратор в разделе «Настройки». Тот
// же список цветов и цена/длительность по умолчанию используются на
// форме заказа (services.ts подставляет их при выборе услуги).
export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ServiceInput) => {
      const { error } = await supabase.from('services').insert({
        name: input.name,
        category: input.category || null,
        base_duration_minutes: input.base_duration_minutes ?? null,
        base_price: input.base_price ?? null,
        color: input.color,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ServiceInput & { id: string }) => {
      const { error } = await supabase
        .from('services')
        .update({
          name: input.name,
          category: input.category || null,
          base_duration_minutes: input.base_duration_minutes ?? null,
          base_price: input.base_price ?? null,
          color: input.color,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

// Удалить можно только услугу, которой ни разу не пользовались: у заказа
// на неё есть ссылка без каскада, и терять историю заказов мы не хотим.
export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count, error: countError } = await supabase
        .from('order_services')
        .select('order_id', { count: 'exact', head: true })
        .eq('service_id', id);
      if (countError) throw countError;
      if (count && count > 0) {
        throw new Error(`Эта услуга есть в ${count} заказ(ах) — удалить её нельзя, чтобы не потерять историю.`);
      }
      const { error } = await supabase.from('services').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
}
