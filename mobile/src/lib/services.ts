// «Грузчики выбираются только в услугах, где есть слово „грузчики“ в
// названии» — проверяем подстроку в имени услуги без учёта регистра,
// чтобы захватить любые словоформы («грузчик», «грузчика», «грузчиков»).
export function serviceNeedsLoaders(name: string) {
  return name.toLowerCase().includes('грузчик');
}

// Длительность услуги хранится в базе в минутах (base_duration_minutes) —
// не меняем схему, только ввод и показ в часах (Максим, «Правки 4», п.1:
// просил для веб-кабинета, но правим и здесь для единообразия — «проверь
// везде»).
export function minutesToHoursText(minutes: number | null): string {
  if (minutes == null) return '';
  return String(Math.round((minutes / 60) * 100) / 100);
}

export function hoursTextToMinutes(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const hours = Number(trimmed);
  if (!Number.isFinite(hours) || hours < 0) return null;
  return Math.round(hours * 60);
}

export function formatDurationHours(minutes: number | null | undefined): string {
  if (!minutes) return '';
  return `${Math.round((minutes / 60) * 100) / 100} ч`;
}
