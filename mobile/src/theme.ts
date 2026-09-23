import { MD3LightTheme, type MD3Theme } from 'react-native-paper';
import type { CrewStatus, OrderStatus } from './types/database';

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
