import type { AccountRole, AccountStatus, CrewStatus } from '@/types/database';
import type { TicketStatus } from '@/api/supportTickets';
import type { DriverReportStatus } from '@/api/driverReports';
import type { OrderBucket } from './orderCompletion';

// Заказы делятся по факту, а не по статусу — см. lib/orderCompletion.ts.
// Те же подписи, что в мобильной «Статистике» (mobile/src/app/(office)/stats.tsx).
export const ORDER_BUCKETS: OrderBucket[] = ['active', 'completed', 'cancelled'];

export const ORDER_BUCKET_LABELS: Record<OrderBucket, string> = {
  active: 'Активные',
  completed: 'Завершённые',
  cancelled: 'Отменённые',
};

export const ORDER_BUCKET_BADGES: Record<OrderBucket, { label: string; color: string }> = {
  active: { label: 'Активен', color: 'blue' },
  completed: { label: 'Завершён', color: 'green' },
  cancelled: { label: 'Отменён', color: 'red' },
};

export const CREW_STATUS_LABELS: Record<CrewStatus, string> = {
  notified: 'уведомлён',
  read: 'открыл заказ',
  confirmed: 'принял заказ',
};

export const ACCOUNT_ROLE_LABELS: Record<AccountRole, string> = {
  owner: 'Владелец сервиса',
  admin: 'Администратор',
  dispatcher: 'Диспетчер',
  driver: 'Водитель',
  loader: 'Грузчик',
};

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Активен',
  pending_payment: 'Ожидает оплаты',
  suspended: 'Приостановлен',
};

export const ACCOUNT_STATUS_COLORS: Record<AccountStatus, string> = {
  active: 'green',
  pending_payment: 'yellow',
  suspended: 'red',
};

export const PAST_ORDER_COLOR = '#6B6B6B';
export const DEFAULT_ORDER_COLOR = '#8E24AA';

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Открыто',
  in_progress: 'В работе',
  resolved: 'Решено',
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  open: 'red',
  in_progress: 'yellow',
  resolved: 'green',
};

export const DRIVER_REPORT_STATUS_LABELS: Record<DriverReportStatus, string> = {
  draft: 'Черновик',
  submitted: 'На проверке',
  confirmed: 'Согласован',
  rejected: 'Не согласован',
};

export const DRIVER_REPORT_STATUS_COLORS: Record<DriverReportStatus, string> = {
  draft: 'gray',
  submitted: 'yellow',
  confirmed: 'green',
  rejected: 'red',
};
