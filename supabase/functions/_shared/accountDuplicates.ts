// Проверка на дубль сотрудника — тем же телефоном или тем же именем и
// фамилией внутри одной компании (Максим, 2026-09-29: «Создать проверку по
// номеру телефона, имени и фамилии сотрудника, чтоб не было возможность
// вносить дубли»). Используется и в create-account, и в update-account —
// общий код функций (см. комментарий в _shared/expoPush.ts).
//
// Телефон и так не даст завести Supabase Auth (номер уникален глобально),
// но сообщение оттуда — «Error updating user» и не называет, у кого он уже
// занят; эта проверка идёт ПЕРЕД обращением к Auth и называет сотрудника.
// Совпадение имени+фамилии Auth вообще не проверяет — целиком на этой
// функции.
//
// Проверяем только среди «живых» (deleted_at is null) сотрудников той же
// компании — удалённый однофамилец или прежний номер удалённого сотрудника
// дублем не считаются.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export async function findDuplicateEmployee(
  admin: SupabaseClient,
  params: { companyId: string; phone: string | null; name: string; lastName: string | null; excludeId?: string }
): Promise<string | null> {
  const { companyId, phone, name, lastName, excludeId } = params;
  let query = admin
    .from('employees')
    .select('id, name, last_name, phone')
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query;
  if (!data) return null;

  const normName = name.trim().toLowerCase();
  const normLastName = (lastName ?? '').trim().toLowerCase();

  for (const row of data as { id: string; name: string; last_name: string | null; phone: string | null }[]) {
    if (phone && row.phone === phone) {
      return `Такой номер телефона уже есть у сотрудника «${row.name}»`;
    }
    if (normName && row.name.trim().toLowerCase() === normName && (row.last_name ?? '').trim().toLowerCase() === normLastName) {
      const fullName = row.last_name ? `${row.name} ${row.last_name}` : row.name;
      return `Сотрудник «${fullName}» уже есть в команде`;
    }
  }
  return null;
}
