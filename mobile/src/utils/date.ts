import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  differenceInMinutes,
  endOfDay,
  format,
  isSameDay,
  setYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ru } from 'date-fns/locale';

// Сетка календаря — целые сутки, чтобы линия текущего времени была видна всегда.
export const PIXELS_PER_MINUTE = 1.2;
export const HOUR_HEIGHT = 60 * PIXELS_PER_MINUTE;
export const GRID_HEIGHT = 24 * HOUR_HEIGHT;

export function minutesFromDayStart(date: Date) {
  return differenceInMinutes(date, startOfDay(date));
}

export function formatDayLabel(date: Date) {
  return format(date, 'd MMM, EEEEEE', { locale: ru });
}

// Полная дата для компактных строк карточки заказа: «19 апреля 2026 г. (Вс)».
export function formatFullDayLabel(date: Date) {
  const base = format(date, "d MMMM yyyy 'г.'", { locale: ru });
  const weekday = format(date, 'EEEEEE', { locale: ru });
  return `${base} (${weekday.charAt(0).toUpperCase()}${weekday.slice(1)})`;
}

export function formatHeaderDate(date: Date) {
  return format(date, 'LLLL yyyy', { locale: ru });
}

export function formatTime(date: Date) {
  return format(date, 'HH:mm');
}

export function formatShortMonth(date: Date) {
  return format(date, 'LLL', { locale: ru }).replace('.', '');
}

export function formatWeekday(date: Date) {
  return format(date, 'EEEEEE', { locale: ru });
}

export {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  endOfDay,
  isSameDay,
  setYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
};
