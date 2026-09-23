import dayjs from 'dayjs';
import 'dayjs/locale/ru';

dayjs.locale('ru');

export { dayjs };

// YYYY-MM-DD по локальной дате (не UTC — иначе вечером можно съехать на
// соседний день). Тот же формат, что у Mantine-пикеров и employee_days_off.
export function toDateKey(date: Date) {
  return dayjs(date).format('YYYY-MM-DD');
}

export function fromDateKey(key: string) {
  return dayjs(key).toDate();
}

export function startOfWeek(date: Date) {
  const d = dayjs(date).startOf('day');
  // Неделя с понедельника.
  const shift = (d.day() + 6) % 7;
  return d.subtract(shift, 'day').toDate();
}

export function formatTime(date: Date | string) {
  return dayjs(date).format('HH:mm');
}

export function formatDate(date: Date | string) {
  return dayjs(date).format('D MMMM YYYY');
}

export function formatDateShort(date: Date | string) {
  return dayjs(date).format('DD.MM.YYYY');
}

export function formatDateTime(date: Date | string) {
  return dayjs(date).format('DD.MM.YYYY HH:mm');
}

// Дата + время "HH:mm" → Date.
export function combineDateTime(dateKey: string, time: string) {
  const [h, m] = time.split(':').map(Number);
  return dayjs(dateKey).hour(h || 0).minute(m || 0).second(0).millisecond(0).toDate();
}

export function formatMoney(value: number | null | undefined) {
  if (value == null) return '—';
  return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
}
