// Единое правило «заказ выполнен» (ревью 26.09.2026, задача 2).
//
// С «доработок 2» приложение больше НЕ проставляет статусы confirmed/
// in_progress/completed — заказ бывает только 'new' (активный) или
// 'cancelled'. «Выполненным» считается неотменённый заказ, время окончания
// которого уже прошло — ровно так же, как календарь красит заказ серым
// (см. components/calendar/orderLayout.ts). Раньше зарплата, статистика и
// история клиента фильтровали по status = 'completed' и поэтому по новым
// заказам показывали нули.
//
// ВАЖНО: то же правило должно действовать в веб-кабинете (свой api/*).
// При изменении — менять обе стороны одинаково.

export type OrderBucket = 'active' | 'completed' | 'cancelled';

interface OrderTiming {
  status: string;
  scheduled_end: string;
}

export function orderBucket(order: OrderTiming, now: Date = new Date()): OrderBucket {
  if (order.status === 'cancelled') return 'cancelled';
  if (new Date(order.scheduled_end).getTime() <= now.getTime()) return 'completed';
  return 'active';
}

// Заказ, за который платят / который идёт в выручку: не отменён и уже прошёл.
export function isOrderCompleted(order: OrderTiming, now: Date = new Date()): boolean {
  return orderBucket(order, now) === 'completed';
}
