import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ScheduleDayStatus, ScheduleMode } from '@/types/database';

// График сотрудников (миграция 0008, та же модель, что в
// mobile/src/api/schedule.ts). У каждого свой режим employees.schedule_mode:
// mark_off — отмечает выходные (день без отметки рабочий), mark_on —
// отмечает рабочие дни (день без отметки нерабочий). Явная отметка дня —
// строка employee_schedule_days со статусом on/off и, для рабочего дня,
// необязательными часами.

export interface ScheduleDay {
  status: ScheduleDayStatus;
  start_time: string | null;
  end_time: string | null;
}

interface ScheduleRow extends ScheduleDay {
  employee_id: string;
  day: string;
}

export function formatTimeShort(time: string) {
  return time.slice(0, 5);
}

// Все отметки за период (экран «График»); ключ карты — `${employee_id}:${day}`.
export function useScheduleDaysInRange(fromKey: string, toKey: string) {
  return useQuery({
    queryKey: ['schedule-days-range', fromKey, toKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_schedule_days')
        .select('employee_id, day, status, start_time, end_time')
        .gte('day', fromKey)
        .lte('day', toKey);
      if (error) throw error;
      const map = new Map<string, ScheduleDay>();
      for (const r of data as ScheduleRow[]) {
        map.set(`${r.employee_id}:${r.day}`, { status: r.status, start_time: r.start_time, end_time: r.end_time });
      }
      return map;
    },
  });
}

function invalidateSchedule(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['schedule-days-range'] });
  queryClient.invalidateQueries({ queryKey: ['schedule-days-on'] });
}

export function useSetScheduleDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      employeeId,
      day,
      status,
      startTime,
      endTime,
    }: {
      employeeId: string;
      day: string;
      status: ScheduleDayStatus;
      startTime?: string | null;
      endTime?: string | null;
    }) => {
      const { error } = await supabase.from('employee_schedule_days').upsert(
        {
          employee_id: employeeId,
          day,
          status,
          start_time: status === 'on' ? startTime ?? null : null,
          end_time: status === 'on' ? endTime ?? null : null,
        },
        { onConflict: 'employee_id,day' }
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateSchedule(queryClient),
  });
}

// Сброс дня к значению по умолчанию для режима сотрудника.
export function useClearScheduleDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, day }: { employeeId: string; day: string }) => {
      const { error } = await supabase
        .from('employee_schedule_days')
        .delete()
        .eq('employee_id', employeeId)
        .eq('day', day);
      if (error) throw error;
    },
    onSuccess: () => invalidateSchedule(queryClient),
  });
}

// Явные отметки на конкретный день — для доступности бригады в форме заказа.
export function useScheduleDaysOn(day: string | null) {
  return useQuery({
    queryKey: ['schedule-days-on', day],
    enabled: Boolean(day),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_schedule_days')
        .select('employee_id, status, start_time, end_time')
        .eq('day', day as string);
      if (error) throw error;
      const map = new Map<string, ScheduleDay>();
      for (const r of data as Omit<ScheduleRow, 'day'>[]) {
        map.set(r.employee_id, { status: r.status, start_time: r.start_time, end_time: r.end_time });
      }
      return map;
    },
  });
}

export function effectiveScheduleStatus(mode: ScheduleMode, row: ScheduleDay | undefined): ScheduleDayStatus {
  if (row) return row.status;
  return mode === 'mark_on' ? 'off' : 'on';
}

// Доступен ли сотрудник на интервал [start, end) в этот день. Часы в
// отметке — окно доступности; без часов рабочий день значит весь день.
// Это подсказка в форме заказа, база такое не проверяет.
export function isWorkingAt(mode: ScheduleMode, row: ScheduleDay | undefined, start: Date, end: Date): boolean {
  if (effectiveScheduleStatus(mode, row) === 'off') return false;
  if (!row?.start_time || !row?.end_time) return true;
  const toMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const [wStart, wEnd] = [row.start_time, row.end_time].map((t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  });
  return toMinutes(start) >= wStart && toMinutes(end) <= wEnd;
}
