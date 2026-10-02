// Длительность услуги в базе — всегда минуты (services.base_duration_minutes).
// Это только отображение и ввод в часах поверх того же поля, без смены
// хранения (минуты остаются удобной единицей для расчёта времени окончания
// заказа — см. OrderFormModal.applyServices).
export function minutesToHoursInput(minutes: number | null): number | '' {
  return minutes == null ? '' : minutes / 60;
}

export function hoursInputToMinutes(hours: number | string): number | null {
  if (hours === '' || hours == null) return null;
  return Math.round(Number(hours) * 60);
}

export function formatDurationHours(minutes: number | null): string {
  if (!minutes) return '—';
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${hours} ч`;
}
