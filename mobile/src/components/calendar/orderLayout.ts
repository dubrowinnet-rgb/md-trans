import type { OrderWithDetails } from '../../api/orders';

export const PAST_ORDER_COLOR = '#6B6B6B';
export const DEFAULT_ORDER_COLOR = '#8E24AA';

// Цвет заказа как в Bumpix: цвет его (первой) услуги; прошедший или уже
// отмеченный «выполнен» заказ — серый (раздел «баги 3», п.8: цветное —
// только предстоящее, статус учитываем отдельно от времени, потому что
// диспетчер может закрыть заказ раньше времени окончания в форме).
export function orderColor(order: OrderWithDetails, now: Date) {
  if (order.status === 'completed' || new Date(order.scheduled_end) <= now) return PAST_ORDER_COLOR;
  return order.order_services[0]?.services?.color ?? DEFAULT_ORDER_COLOR;
}

export interface PlacedOrder {
  order: OrderWithDetails;
  lane: number;
  lanes: number;
}

// Пересекающиеся по времени заказы одного дня ставим рядом, а не друг на друга.
export function layoutDayOrders(orders: OrderWithDetails[]): PlacedOrder[] {
  const sorted = [...orders].sort(
    (a, b) =>
      new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime() ||
      new Date(b.scheduled_end).getTime() - new Date(a.scheduled_end).getTime()
  );
  const result: PlacedOrder[] = [];
  let cluster: { order: OrderWithDetails; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const item of cluster) result.push({ ...item, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const order of sorted) {
    const start = new Date(order.scheduled_start).getTime();
    const end = new Date(order.scheduled_end).getTime();
    if (cluster.length > 0 && start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    cluster.push({ order, lane });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return result;
}
