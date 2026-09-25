import { MD3LightTheme, type MD3Theme } from 'react-native-paper';
import type { AccountRole, CrewStatus, DriverReportStatus, OrderStatus, TicketStatus } from './types/database';

export const theme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#5b21b6',
    onPrimary: '#ffffff',
    primaryContainer: '#ede9fe',
    onPrimaryContainer: '#2e1065',
    secondaryContainer: '#ede9fe',
    onSecondaryContainer: '#2e1065',
  },
};

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
  owner: 'Владелец сервиса',
  admin: 'Администратор',
  dispatcher: 'Диспетчер',
  driver: 'Водитель',
  loader: 'Грузчик',
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Открыто',
  in_progress: 'В работе',
  resolved: 'Решено',
};

export const DRIVER_REPORT_STATUS_LABELS: Record<DriverReportStatus, string> = {
  draft: 'Заполняется',
  submitted: 'Отправлен',
  confirmed: 'Подтверждён',
};

export const DRIVER_REPORT_STATUS_COLORS: Record<DriverReportStatus, string> = {
  draft: '#9ca3af',
  submitted: '#f59e0b',
  confirmed: '#22c55e',
};

export const ACCOUNT_ROLE_ICONS: Record<AccountRole, string> = {
  owner: 'shield-star-outline',
  admin: 'shield-crown-outline',
  dispatcher: 'headset',
  driver: 'truck',
  loader: 'account-hard-hat',
};
