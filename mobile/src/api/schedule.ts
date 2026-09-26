import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ScheduleDayStatus, ScheduleMode } from '../types/database';

// YYYY-MM-DD по локальной дате (не UTC — иначе вечером/ночью можно
// съехать на соседний день).
export function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// "09:00:00" (колонка time из Postgres) <-> Date только с точки зрения часов
// и минут — используется полями времени в диалоге дня (DateTimeField).
export function timeStringToDate(time: string) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}
export function dateToTimeString(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
}
export function formatTimeShort(time: string) {
  return time.slice(0, 5);
}

export interface ScheduleDay {
  status: ScheduleDayStatus;
  start_time: string | null;
  end_time: string | null;
}

// Отметки дней одного сотрудника (экран «График» / «Мой график»). День без
// строки — статус по умолчанию из employees.schedule_mode (см.
// effectiveScheduleStatus); он же определяет, что предлагать при первой
// отметке ранее не тронутого дня.
export function useEmployeeScheduleDays(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['schedule-days', employeeId],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_schedule_days')
        .select('day, status, start_time, end_time')
        .eq('employee_id', employeeId as string);
      if (error) throw error;
      const map = new Map<string, ScheduleDay>();
      for (const row of data as { day: string; status: ScheduleDayStatus; start_time: string | null; end_time: string | null }[]) {
        map.set(row.day, { status: row.status, start_time: row.start_time, end_time: row.end_time });
      }
      return map;
    },
  });
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
      const { error } = await supabase
        .from('employee_schedule_days')
        .upsert(
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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['schedule-days', vars.employeeId] });
      queryClient.invalidateQueries({ queryKey: ['schedule-days-on'] });
    },
  });
}

// Сброс дня к значению по умолчанию (по режиму) — просто убирает явную
// строку, а не подставляет статус, противоположный текущему.
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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['schedule-days', vars.employeeId] });
      queryClient.invalidateQueries({ queryKey: ['schedule-days-on'] });
    },
  });
}

// Режим меняет только сам сотрудник на «Моём графике» (RLS: auth_user_id =
// auth.uid(), миграция 0005) — само поле лежит на employees.
export function useSetScheduleMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, mode }: { employeeId: string; mode: ScheduleMode }) => {
      const { error } = await supabase.from('employees').update({ schedule_mode: mode }).eq('id', employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['current-employee'] });
    },
  });
}

// Чьи отметки есть на конкретный день — для доступности бригады в форме
// заказа. Без отметки статус по умолчанию решает employees.schedule_mode
// (effectiveScheduleStatus), поэтому здесь только явные строки.
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
      for (const row of data as {
        employee_id: string;
        status: ScheduleDayStatus;
        start_time: string | null;
        end_time: string | null;
      }[]) {
        map.set(row.employee_id, { status: row.status, start_time: row.start_time, end_time: row.end_time });
      }
      return map;
    },
  });
}

// Статус дня без явной строки — задаёт режим сотрудника: mark_off
// (отмечает выходные) — по умолчанию рабочий, mark_on (отмечает рабочие) —
// по умолчанию недоступен.
export function effectiveScheduleStatus(mode: ScheduleMode, row: ScheduleDay | undefined): ScheduleDayStatus {
  if (row) return row.status;
  return mode === 'mark_on' ? 'off' : 'on';
}

// Доступен ли сотрудник на интервал [start, end) в день, для которого дана
// его отметка (или её отсутствие). Часы в отметке — это окно доступности
// в этот день, одинаково в обоих режимах; без часов «рабочий» значит весь
// день. Используется как подсказка в форме заказа, не как жёсткий запрет
// (см. fleet-and-schedule-feature: в БД это не проверяется).
export function isWorkingAt(mode: ScheduleMode, row: ScheduleDay | undefined, start: Date, end: Date): boolean {
  const status = effectiveScheduleStatus(mode, row);
  if (status === 'off') return false;
  if (!row?.start_time || !row?.end_time) return true;
  const toMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
  const [wStart, wEnd] = [row.start_time, row.end_time].map((t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  });
  return toMinutes(start) >= wStart && toMinutes(end) <= wEnd;
}
