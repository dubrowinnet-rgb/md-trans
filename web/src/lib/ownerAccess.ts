import type { Employee } from '@/api/employees';

// Временная проверка «это владелец сервиса» — до того как в схеме
// появится настоящая роль 'owner' (миграция мобильного треда, предложенная
// форма — см. память owner-console-feature). Сегодня Максим — единственный
// admin в системе, так что это безопасно; как только role==='owner'
// появится в types/database.ts, заменить эту проверку на неё.
export function isServiceOwner(employee: Employee | null): boolean {
  return employee?.role === 'admin';
}
