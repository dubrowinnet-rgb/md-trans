import type { Employee } from '@/api/employees';

// Права = роль (см. ниже) + галочки на аккаунте, которые администратор
// может донастроить поверх неё (экран «Команда»). У администратора
// галочки всегда включены и в UI не предлагаются.

// Полное управление заказом (создать/отредактировать любое
// поле/удалить). У админа и диспетчера — по умолчанию; водителю и
// грузчику можно выдать так же галочкой can_manage_orders.
export function canManageOrders(employee: Employee | null) {
  return employee?.role === 'admin' || Boolean(employee?.can_manage_orders);
}

// Узкое право водителя: своё время начала/окончания и сумма заказа.
// Действует, только если водителю не выдано полное управление (иначе он
// и так может всё, как диспетчер).
export function canEditOrderScheduleAndPrice(employee: Employee | null) {
  return employee?.role === 'driver' && !canManageOrders(employee);
}

// Сумма заказа: как и раньше, отдельная от can_manage_orders галочка
// can_view_contacts_and_amounts — админ может дать право редактировать
// заказы, но не показывать суммы, и наоборот. Грузчику сумма не
// показывается галочкой (её смысл для него — только телефон, см. подпись
// в AccountDialog), но видна, если в бригаде заказа нет водителя — тогда
// он сам, по сути, за него отвечает (доработки 2, п.5: например заказ на
// погрузку/разгрузку или сборку мебели без водителя).
export function canViewOrderAmount(
  employee: Employee | null,
  order?: { order_crew: { role: string }[] } | null
) {
  if (employee?.role === 'admin') return true;
  if (employee?.role === 'loader') {
    const hasDriver = order?.order_crew.some((c) => c.role === 'driver') ?? false;
    return !hasDriver;
  }
  return Boolean(employee?.can_view_contacts_and_amounts);
}

// Телефон клиента: админ и диспетчер/водитель с включённой галочкой —
// всегда. Грузчику — только если в бригаде этого заказа нет водителя
// (тогда общаться с клиентом приходится ему самому), либо если админ
// явно включил галочку — тогда телефон виден всегда, независимо от бригады.
export function canViewClientPhone(
  employee: Employee | null,
  order?: { order_crew: { role: string }[] } | null
) {
  if (employee?.role === 'admin') return true;
  if (employee?.role !== 'loader') return Boolean(employee?.can_view_contacts_and_amounts);
  if (employee?.can_view_contacts_and_amounts) return true;
  const hasDriver = order?.order_crew.some((c) => c.role === 'driver') ?? false;
  return !hasDriver;
}

// История и статистика по клиенту (экран «Клиенты» — виден только
// админу/диспетчеру, поэтому для водителя/грузчика эта галочка ни на что
// не влияет).
export function canViewClientStats(employee: Employee | null) {
  return employee?.role === 'admin' || Boolean(employee?.can_view_client_stats);
}
