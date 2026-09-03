import {
  addDays,
  addMinutes,
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';

export const CALENDAR_START_HOUR = 7;
export const CALENDAR_END_HOUR = 21;
export const PIXELS_PER_MINUTE = 1.2;

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end: addDays(start, 6) });
}

export function dayBounds(date: Date) {
  const start = addMinutes(startOfDay(date), CALENDAR_START_HOUR * 60);
  const end = addMinutes(startOfDay(date), CALENDAR_END_HOUR * 60);
  return { start, end };
}

export function minutesFromCalendarStart(date: Date) {
  const { start } = dayBounds(date);
  return differenceInMinutes(date, start);
}

export function formatDayLabel(date: Date) {
  return format(date, 'd MMM, EEEEEE', { locale: ru });
}

export function formatHeaderDate(date: Date) {
  return format(date, 'LLLL yyyy', { locale: ru });
}

export function formatTime(date: Date) {
  return format(date, 'HH:mm');
}

export { addDays, endOfDay, isSameDay, startOfDay, startOfWeek };
