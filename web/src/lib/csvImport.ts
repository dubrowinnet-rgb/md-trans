// Разбор CSV-файла для импорта клиентской базы (произвольный файл из
// другой CRM/Excel, не обязательно наша же выгрузка — см. downloadCsv в
// exportData.ts, чей формат тоже понимаем как частный случай).

// Строки и разделитель ";"/"," определяются по самому файлу, а не
// фиксированы, как в своей же выгрузке — на входе может быть файл из
// другой системы.
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
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  return semi >= comma ? ';' : ',';
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

// К единому виду без кода страны — чтобы «+7 916 000-00-02», «8 (916)
// 000 00 02» и «9160000002» считались одним и тем же номером при поиске
// уже существующего клиента.
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return digits.slice(1);
  return digits;
}

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
