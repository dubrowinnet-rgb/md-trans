import type { Employee } from '@/api/employees';

// Владелец сервиса — отдельная роль (миграция 0013), не привязанная к
// компании (company_id всегда null). Заводится вручную, не через экран
// «Команда» — см. supabase/README.md, «Стать владельцем сервиса».
export function isServiceOwner(employee: Employee | null): boolean {
  return employee?.role === 'owner';
}
