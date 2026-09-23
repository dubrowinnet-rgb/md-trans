import type { Employee } from '../api/employees';

// Права доступа значимы только для не-админа — у администратора они всегда
// включены (и на экране «Команда» недоступны для выключения), а RLS и
// create_order/delete_order на сервере проверяют то же самое.
export function canManageOrders(employee: Employee | null) {
  return employee?.role === 'admin' || Boolean(employee?.can_manage_orders);
}

export function canViewClientStats(employee: Employee | null) {
  return employee?.role === 'admin' || Boolean(employee?.can_view_client_stats);
}

export function canViewContactsAndAmounts(employee: Employee | null) {
  return employee?.role === 'admin' || Boolean(employee?.can_view_contacts_and_amounts);
}
