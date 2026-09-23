import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// YYYY-MM-DD по локальной дате (не UTC — иначе вечером/ночью можно
// съехать на соседний день).
export function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Выходные конкретного сотрудника (экран «График»). По умолчанию все дни
// рабочие — выходной это явная строка в employee_days_off.
export function useEmployeeDaysOff(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['days-off', employeeId],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_days_off')
        .select('day')
        .eq('employee_id', employeeId as string);
      if (error) throw error;
      return new Set((data as { day: string }[]).map((r) => r.day));
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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['days-off', vars.employeeId] });
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
