// Копия mobile/src/lib/orderCompletion.ts — правило должно совпадать в обоих
// приложениях. Статус 'completed' с «доработок 2» никто не проставляет, поэтому
// «завершён» = не отменён и время окончания уже прошло (как серый заказ в календаре).

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

export function isOrderCompleted(order: OrderTiming, now: Date = new Date()): boolean {
  return orderBucket(order, now) === 'completed';
}
