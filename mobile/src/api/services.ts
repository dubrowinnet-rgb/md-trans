import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

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
  base_duration_minutes: number | null;
  base_price: number | null;
  color: string;
}

// Каталог услуг — добавляет/меняет администратор в Настройках
// (доработки 1, п.2). Удаления нарочно нет: Максим просил только
// «добавлять/изменять», а услуга может быть уже использована в заказах.
export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ServiceInput) => {
      const { error } = await supabase.from('services').insert(input);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ServiceInput & { id: string }) => {
      const { error } = await supabase.from('services').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });
}
