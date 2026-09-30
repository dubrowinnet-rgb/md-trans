import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface WorkingHours {
  startMinutes: number;
  endMinutes: number;
}

// '08:00:00' / '08:00' → минуты от начала суток.
function parseTime(value: string): number {
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m ?? 0);
}

export const DEFAULT_WORKING_HOURS: WorkingHours = { startMinutes: 8 * 60, endMinutes: 21 * 60 };

// Рабочее время компании (Максим, 30.09, «Правки 3», п.1) — красит сетку
// календаря и задаёт точку, откуда она открывается на 3/7-дневном виде
// (см. PagedCalendar). Строка есть не у каждой компании (новые заводятся
// без неё — см. миграцию 0023) — maybeSingle + дефолт 8:00–21:00 в коде,
// без зависимости от момента создания компании.
export function useWorkingHours() {
  return useQuery({
    queryKey: ['company-settings', 'working-hours'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('working_hours_start, working_hours_end')
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_WORKING_HOURS;
      return {
        startMinutes: parseTime(data.working_hours_start),
        endMinutes: parseTime(data.working_hours_end),
      } satisfies WorkingHours;
    },
    // Меняется редко — нет смысла перезапрашивать на каждый фокус экрана.
    staleTime: 5 * 60_000,
  });
}

// Только администратор — RLS (миграция 0023) отклонит попытку от кого-то
// ещё. upsert, а не update: у компании может ещё не быть строки настроек.
export function useSetWorkingHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ startMinutes, endMinutes }: WorkingHours) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const toTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
      const { error } = await supabase.from('company_settings').upsert(
        {
          working_hours_start: toTime(startMinutes),
          working_hours_end: toTime(endMinutes),
        },
        { onConflict: 'company_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-settings', 'working-hours'] }),
  });
}
