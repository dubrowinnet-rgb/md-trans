import type { ClientWithStats } from '@/api/clients';
import type { OrderWithDetails } from '@/api/orders';
import { ORDER_STATUS_LABELS } from './labels';
import { dayjs } from './dates';

export type ExportCell = string | number | Date | null;

// Чья видимость нужна колонке: телефон клиента и суммы закрыты правами
// (can_view_contacts_and_amounts), сводка по клиенту — can_view_client_stats.
export type ColumnGuard = 'phone' | 'amount' | 'stats';

export interface ExportColumn<T> {
  key: string;
  label: string;
  width: number;
  guard?: ColumnGuard;
  defaultOn?: boolean;
  value: (row: T) => ExportCell;
}

export const CLIENT_COLUMNS: ExportColumn<ClientWithStats>[] = [
  { key: 'name', label: 'Клиент', width: 30, defaultOn: true, value: (c) => c.name },
  { key: 'phone', label: 'Телефон', width: 18, guard: 'phone', defaultOn: true, value: (c) => c.phone },
  { key: 'discount', label: 'Скидка, %', width: 10, defaultOn: true, value: (c) => c.discount_percent || 0 },
  { key: 'notes', label: 'Заметки', width: 40, defaultOn: true, value: (c) => c.notes },
  { key: 'orders', label: 'Заказов всего', width: 14, guard: 'stats', defaultOn: true, value: (c) => c.ordersCount },
  { key: 'completed', label: 'Завершено', width: 12, guard: 'stats', value: (c) => c.completedCount },
  {
    key: 'revenue',
    label: 'Выручка, ₽',
    width: 14,
    guard: 'amount',
    defaultOn: true,
    value: (c) => c.revenue,
  },
  {
    key: 'last',
    label: 'Последний заказ',
    width: 16,
    guard: 'stats',
    defaultOn: true,
    value: (c) => (c.lastOrderAt ? dayjs(c.lastOrderAt).format('DD.MM.YYYY') : null),
  },
  { key: 'created', label: 'В базе с', width: 14, value: (c) => dayjs(c.created_at).format('DD.MM.YYYY') },
];

function stopsOf(o: OrderWithDetails) {
  return [...o.order_stops].sort((a, b) => a.order_index - b.order_index);
}

function crewOf(o: OrderWithDetails, role: 'driver' | 'loader') {
  return [...new Set(o.order_crew.filter((c) => c.role === role).map((c) => c.employees?.name ?? ''))]
    .filter(Boolean)
    .join(', ');
}

export const ORDER_COLUMNS: ExportColumn<OrderWithDetails>[] = [
  { key: 'date', label: 'Дата', width: 12, defaultOn: true, value: (o) => dayjs(o.scheduled_start).format('DD.MM.YYYY') },
  {
    key: 'time',
    label: 'Время',
    width: 12,
    defaultOn: true,
    value: (o) => `${dayjs(o.scheduled_start).format('HH:mm')}–${dayjs(o.scheduled_end).format('HH:mm')}`,
  },
  { key: 'status', label: 'Статус', width: 14, defaultOn: true, value: (o) => ORDER_STATUS_LABELS[o.status] },
  { key: 'client', label: 'Клиент', width: 26, defaultOn: true, value: (o) => o.clients?.name ?? null },
  { key: 'phone', label: 'Телефон клиента', width: 18, guard: 'phone', value: (o) => o.clients?.phone ?? null },
  {
    key: 'services',
    label: 'Услуги',
    width: 26,
    defaultOn: true,
    value: (o) => o.order_services.map((s) => s.services?.name).filter(Boolean).join(', '),
  },
  {
    key: 'pickup',
    label: 'Загрузка',
    width: 34,
    defaultOn: true,
    value: (o) => stopsOf(o).filter((s) => s.type === 'pickup').map((s) => s.address).join('; '),
  },
  {
    key: 'dropoff',
    label: 'Выгрузка',
    width: 34,
    defaultOn: true,
    value: (o) => stopsOf(o).filter((s) => s.type === 'dropoff').map((s) => s.address).join('; '),
  },
  { key: 'cargo', label: 'Груз', width: 30, value: (o) => o.cargo_description },
  { key: 'driver', label: 'Водитель', width: 20, defaultOn: true, value: (o) => crewOf(o, 'driver') },
  { key: 'loaders', label: 'Грузчики', width: 26, defaultOn: true, value: (o) => crewOf(o, 'loader') },
  { key: 'vehicle', label: 'Машина', width: 20, value: (o) => (o.vehicles ? `${o.vehicles.name} ${o.vehicles.plate}` : null) },
  { key: 'amount', label: 'Сумма, ₽', width: 12, guard: 'amount', defaultOn: true, value: (o) => o.actual_price },
  { key: 'comment', label: 'Комментарий', width: 30, value: (o) => o.comment },
];

function csvEscape(v: ExportCell) {
  if (v == null) return '';
  const s = v instanceof Date ? dayjs(v).format('DD.MM.YYYY') : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// CSV для русского Excel: разделитель «;» и метка BOM, иначе кириллица
// и колонки открываются криво.
export function downloadCsv<T>(rows: T[], columns: ExportColumn<T>[], fileName: string) {
  const lines = [
    columns.map((c) => csvEscape(c.label)).join(';'),
    ...rows.map((r) => columns.map((c) => csvEscape(c.value(r))).join(';')),
  ];
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), fileName);
}

export async function downloadXlsx<T>(rows: T[], columns: ExportColumn<T>[], fileName: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = [
    columns.map((c) => ({ value: c.label, fontWeight: 'bold' as const })),
    ...rows.map((r) => columns.map((c) => c.value(r))),
  ];
  const blob = await writeXlsxFile(data, { columns: columns.map((c) => ({ width: c.width })) }).toBlob();
  download(blob, fileName);
}
