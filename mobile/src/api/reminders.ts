import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

export type ReminderRule = Database['public']['Tables']['reminder_rules']['Row'];

// Правила пуш-напоминаний экипажу о предстоящем заказе (доработки 1,
// п.1) — «за сколько минут напомнить», список редактирует администратор.
// Отправку каждые 5 минут по этим правилам делает Edge Function
// send-crew-reminders через pg_cron (миграция 0011), список тут — только
// настройка «когда», без самой отправки.
export function useReminderRules() {
  return useQuery({
    queryKey: ['reminder-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminder_rules')
        .select('*')
        .order('offset_minutes', { ascending: true });
      if (error) throw error;
      return data as ReminderRule[];
    },
  });
}

export function useCreateReminderRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offsetMinutes: number) => {
      const { error } = await supabase.from('reminder_rules').insert({ offset_minutes: offsetMinutes });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminder-rules'] }),
  });
}

export function useDeleteReminderRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reminder_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminder-rules'] }),
  });
}
