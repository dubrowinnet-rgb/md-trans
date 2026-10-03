import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

export type SmsTemplate = Database['public']['Tables']['sms_templates']['Row'];

// Шаблоны смс клиентам (доработки 1, п.2) — редактирует администратор в
// Настройках. key стабильный (задан миграцией 0011), меняется только body.
export function useSmsTemplates() {
  return useQuery({
    queryKey: ['sms-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sms_templates').select('*').order('key', { ascending: true });
      if (error) throw error;
      return data as SmsTemplate[];
    },
  });
}

export function useUpdateSmsTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, body }: { key: string; body: string }) => {
      const { error } = await supabase.from('sms_templates').update({ body }).eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sms-templates'] }),
  });
}
