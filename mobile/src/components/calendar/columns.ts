import type { Employee } from '../../api/employees';
import type { OrderWithDetails } from '../../api/orders';
import { formatDayLabel, isSameDay } from '../../utils/date';

export interface CalendarColumn {
  key: string;
  date: Date;
  title: string;
  highlighted: boolean;
  orders: OrderWithDetails[];
  /** Колонка конкретного сотрудника: тап по слоту создаёт заказ сразу с ним. */
  employeeId?: string;
}

export const NO_CREW_COLUMN = 'no-crew';

function ordersOfDay(orders: OrderWithDetails[], date: Date) {
  return orders.filter((o) => isSameDay(new Date(o.scheduled_start), date));
}

// Колонка на каждый день (режим «Неделя» или один выбранный сотрудник).
export function dayColumns(days: Date[], orders: OrderWithDetails[]): CalendarColumn[] {
  const today = new Date();
  return days.map((date) => ({
    key: date.toISOString(),
    date,
    title: formatDayLabel(date),
    highlighted: isSameDay(date, today),
    orders: ordersOfDay(orders, date),
  }));
}

// Один день, колонка на каждого сотрудника (раздел 3 ТЗ: календарь по
// исполнителям). Заказ без экипажа попадает в отдельную колонку.
export function employeeColumns(
  date: Date,
  employees: Employee[],
  orders: OrderWithDetails[]
): CalendarColumn[] {
  const dayOrders = ordersOfDay(orders, date);
  const columns: CalendarColumn[] = employees.map((employee) => ({
    key: employee.id,
    date,
    title: employee.name,
    highlighted: false,
    employeeId: employee.id,
    orders: dayOrders.filter((o) => o.order_crew.some((c) => c.employee_id === employee.id)),
  }));
  const withoutCrew = dayOrders.filter((o) => o.order_crew.length === 0);
  if (withoutCrew.length > 0) {
    columns.push({
      key: NO_CREW_COLUMN,
      date,
      title: 'Без экипажа',
      highlighted: false,
      orders: withoutCrew,
    });
  }
  return columns;
}
