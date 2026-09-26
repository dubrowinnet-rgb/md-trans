// Разбор CSV/TXT-файла для импорта клиентской базы (произвольный файл из
// другой CRM/Excel, не обязательно наша же выгрузка — см. downloadCsv в
// exportData.ts, чей формат тоже понимаем как частный случай).

// Файл читаем как байты (не через File.text(), который всегда считает
// UTF-8) — выгрузки из 1С/старого Excel часто в windows-1251, и тогда
// «Имя» в заголовке превращается в нечитаемые байты и колонка не находится.
// UTF-8 с fatal:true бросает исключение на первом же байте, который не
// складывается в валидную UTF-8-последовательность — а строка в cp1251
// почти всегда содержит такие байты, так что эта проверка на практике
// надёжно отличает одну кодировку от другой.
export function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1251').decode(buffer);
  }
}

// Строки и разделитель ";" / "," / таб определяются по самому файлу, а не
// фиксированы, как в своей же выгрузке — на входе может быть файл из
// другой системы (в т.ч. .txt, выгруженный табуляцией из Excel).
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = clean.length;
  while (i < n) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: [string, number][] = [
    ['\t', (firstLine.match(/\t/g) ?? []).length],
    [';', (firstLine.match(/;/g) ?? []).length],
    [',', (firstLine.match(/,/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

export type ClientField = 'name' | 'phone' | 'discount' | 'notes';

export const CLIENT_FIELD_LABELS: Record<ClientField, string> = {
  name: 'Имя',
  phone: 'Телефон',
  discount: 'Скидка',
  notes: 'Заметки',
};

const FIELD_SYNONYMS: Record<ClientField, string[]> = {
  name: ['клиент', 'имя', 'название', 'наименование', 'фио', 'name'],
  phone: ['телефон', 'тел', 'номер', 'номер телефона', 'phone'],
  discount: ['скидка', 'скидка %', 'discount'],
  notes: ['заметки', 'примечание', 'примечания', 'комментарий', 'notes'],
};

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/[.,%]/g, '').replace(/\s+/g, ' ').trim();
}

// Определяем колонку под каждое поле клиента по заголовку — по названию,
// без привязки к порядку колонок в файле.
export function detectColumns(headerRow: string[]): Partial<Record<ClientField, number>> {
  const map: Partial<Record<ClientField, number>> = {};
  const fields = Object.keys(FIELD_SYNONYMS) as ClientField[];
  headerRow.forEach((raw, idx) => {
    const h = normalizeHeader(raw);
    const field = fields.find((f) => map[f] === undefined && FIELD_SYNONYMS[f].includes(h));
    if (field) map[field] = idx;
  });
  return map;
}

// «Похоже на телефон»: 10-12 цифр после чистки от всего, что не цифра —
// покрывает российские номера с кодом страны и без, городские и мобильные.
function looksLikePhone(cell: string): boolean {
  const digits = cell.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 12;
}

// «Похоже на имя/название»: есть буквы, они — большая часть содержимого
// (не «12 шт.» и не число), и сама ячейка не похожа на телефон.
function looksLikeName(cell: string): boolean {
  const t = cell.trim();
  if (!t || looksLikePhone(t)) return false;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  return letters >= 2 && letters >= t.length * 0.5;
}

const CONTENT_SAMPLE_ROWS = 30;
const CONTENT_MIN_SCORE = 0.5;

// Когда в файле нет узнаваемых заголовков — «база совершенно разной
// структуры» — ищем имя и телефон по содержимому, а не по названию
// колонки: колонка с наибольшей долей похожих на телефон ячеек — телефон,
// а среди оставшихся колонка с наибольшей долей «текстовых» ячеек — имя.
// exclude — индексы колонок, уже занятых полями, найденными по заголовку
// (например «Скидка»), чтобы контент-поиск их не перезанял.
export function detectColumnsByContent(
  rows: string[][],
  exclude: Set<number> = new Set()
): Partial<Record<'name' | 'phone', number>> {
  const sample = rows.slice(0, CONTENT_SAMPLE_ROWS);
  const colCount = sample.reduce((max, r) => Math.max(max, r.length), 0);
  const result: Partial<Record<'name' | 'phone', number>> = {};

  let bestPhoneCol = -1;
  let bestPhoneScore = 0;
  for (let c = 0; c < colCount; c++) {
    if (exclude.has(c)) continue;
    let hits = 0;
    let total = 0;
    for (const row of sample) {
      const cell = (row[c] ?? '').trim();
      if (!cell) continue;
      total++;
      if (looksLikePhone(cell)) hits++;
    }
    if (total > 0 && hits / total > bestPhoneScore) {
      bestPhoneScore = hits / total;
      bestPhoneCol = c;
    }
  }
  if (bestPhoneScore >= CONTENT_MIN_SCORE) result.phone = bestPhoneCol;

  let bestNameCol = -1;
  let bestNameScore = 0;
  for (let c = 0; c < colCount; c++) {
    if (exclude.has(c) || c === result.phone) continue;
    let hits = 0;
    let total = 0;
    for (const row of sample) {
      const cell = (row[c] ?? '').trim();
      if (!cell) continue;
      total++;
      if (looksLikeName(cell)) hits++;
    }
    if (total > 0 && hits / total > bestNameScore) {
      bestNameScore = hits / total;
      bestNameCol = c;
    }
  }
  if (bestNameScore >= CONTENT_MIN_SCORE) result.name = bestNameCol;

  return result;
}

export interface ColumnDetection {
  columns: Partial<Record<ClientField, number>>;
  hasHeader: boolean;
  // Какие поля определились не по заголовку, а по содержимому данных —
  // чтобы в предпросмотре честно показать «найдено по содержимому», а не
  // выдумывать для них название колонки.
  contentFields: ('name' | 'phone')[];
}

// Итоговое определение колонок: сперва по заголовку первой строки (как
// раньше), а для имени/телефона, которые так не нашлись, — по содержимому
// данных. Если по заголовку не нашлось вообще ничего, значит заголовка,
// скорее всего, и нет — тогда первую строку тоже считаем данными.
export function detectColumnsSmart(rows: string[][]): ColumnDetection {
  if (rows.length === 0) return { columns: {}, hasHeader: false, contentFields: [] };

  const headerColumns = detectColumns(rows[0]);
  const hasHeader = Object.keys(headerColumns).length > 0;
  const body = hasHeader ? rows.slice(1) : rows;

  const columns: Partial<Record<ClientField, number>> = { ...headerColumns };
  const contentFields: ('name' | 'phone')[] = [];

  if (columns.name === undefined || columns.phone === undefined) {
    const claimed = new Set(Object.values(headerColumns));
    const guess = detectColumnsByContent(body, claimed);
    if (columns.name === undefined && guess.name !== undefined) {
      columns.name = guess.name;
      contentFields.push('name');
    }
    if (columns.phone === undefined && guess.phone !== undefined) {
      columns.phone = guess.phone;
      contentFields.push('phone');
    }
  }

  return { columns, hasHeader, contentFields };
}

export { normalizePhone } from './phone';

export function parseDiscount(raw: string): number {
  const n = Number(raw.replace(',', '.').replace('%', '').trim());
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
}

// «1 клиент», «2 клиента», «5 клиентов» — русское согласование числительных.
export function pluralClients(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} клиент`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} клиента`;
  return `${n} клиентов`;
}
