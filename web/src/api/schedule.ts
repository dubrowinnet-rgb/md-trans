import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Выходные сотрудников за период (экран «График»): по умолчанию все дни
// рабочие, выходной — явная строка в employee_days_off (миграция 0007).
// Мобильное приложение сейчас переделывает график (рабочие или выходные
// дни на выбор, часы работы) — когда это появится в базе, этот файл
// нужно будет обновить вслед за mobile/src/api/schedule.ts.
export function useDaysOffInRange(fromKey: string, toKey: string) {
  return useQuery({
    queryKey: ['days-off-range', fromKey, toKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_days_off')
        .select('employee_id, day')
        .gte('day', fromKey)
        .lte('day', toKey);
      if (error) throw error;
      return new Set((data as { employee_id: string; day: string }[]).map((r) => `${r.employee_id}:${r.day}`));
    },
  });
}

export function useToggleDayOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, day, isOff }: { employeeId: string; day: string; isOff: boolean }) => {
      if (isOff) {
        const { error } = await supabase.from('employee_days_off').insert({ employee_id: employeeId, day });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employee_days_off')
          .delete()
          .eq('employee_id', employeeId)
          .eq('day', day);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['days-off-range'] });
      queryClient.invalidateQueries({ queryKey: ['days-off-on'] });
    },
  });
}

// Кто выходной в конкретный день — для доступности бригады в форме заказа.
export function useDaysOffOn(day: string | null) {
  return useQuery({
    queryKey: ['days-off-on', day],
    enabled: Boolean(day),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_days_off')
        .select('employee_id')
        .eq('day', day as string);
      if (error) throw error;
      return new Set((data as { employee_id: string }[]).map((r) => r.employee_id));
    },
  });
}
