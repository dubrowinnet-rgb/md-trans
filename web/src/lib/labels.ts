import type { AccountRole, CrewStatus, OrderStatus } from '@/types/database';

// Те же подписи и цвета, что в мобильном приложении (mobile/src/theme.ts).
export const ORDER_STATUSES: OrderStatus[] = ['new', 'confirmed', 'in_progress', 'completed', 'cancelled'];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  in_progress: 'В работе',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, { bg: string; border: string }> = {
  new: { bg: '#e5e7eb', border: '#9ca3af' },
  confirmed: { bg: '#dbeafe', border: '#3b82f6' },
  in_progress: { bg: '#fef3c7', border: '#f59e0b' },
  completed: { bg: '#dcfce7', border: '#22c55e' },
  cancelled: { bg: '#fee2e2', border: '#ef4444' },
};

export const CREW_STATUS_LABELS: Record<CrewStatus, string> = {
  notified: 'уведомлён',
  read: 'открыл заказ',
  confirmed: 'принял заказ',
};

export const ACCOUNT_ROLE_LABELS: Record<AccountRole, string> = {
  admin: 'Администратор',
  dispatcher: 'Диспетчер',
  driver: 'Водитель',
  loader: 'Грузчик',
};

export const PAST_ORDER_COLOR = '#6B6B6B';
export const DEFAULT_ORDER_COLOR = '#8E24AA';
