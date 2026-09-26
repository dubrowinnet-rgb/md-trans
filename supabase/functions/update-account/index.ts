// Правка уже существующего аккаунта сотрудника: телефон, пароль и профиль
// (раздел «Команда» — админ должен видеть и менять телефон/пароль и всю
// информацию о сотруднике). С доработки «Настройки» этой же функцией
// пользуется и сам сотрудник — правит СВОЙ телефон/пароль (раздел
// «Мой профиль»): вызывающий либо администратор СВОЕЙ ЖЕ компании, либо
// владелец сервиса (любой компании — для поддержки), либо id === он сам.
//
// Отдельная функция, а не часть create-account: смена телефона меняет
// auth.users.phone, а смена пароля — это auth.admin.updateUserById, и то, и
// другое требует service role key по той же причине, что и создание
// аккаунта (см. create-account/index.ts) — с телефона напрямую это
// сделать нельзя.
//
// Тело запроса — частичное обновление: поле, которого нет в body,
// остаётся как было (берётся из текущей строки), а не затирается пустым.
// Это важно для самообслуживания — экран «Мой профиль» отправляет только
// phone/password, и не должен случайно стереть фамилию/адрес/etc, которые
// заполнял администратор. Также этим же частичным обновлением (только
// id+phone, без остальных полей) SessionProvider тихо синхронизирует
// auth.users.phone старым аккаунтам при входе — см. п.4 в 0016.
//
// Деплой (после `supabase link`, см. supabase/README.md):
//   supabase functions deploy update-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Единый формат телефона (Максим, 2026-09-25): +7(ХХХ)ХХХ-ХХ-ХХ везде —
// та же логика, что в mobile/src/lib/phone.ts и web/src/lib/phone.ts.
function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const core = digits.length === 11 && (digits[0] === '7' || digits[0] === '8') ? digits.slice(1) : digits;
  if (core.length !== 10) return phone;
  return `+7(${core.slice(0, 3)})${core.slice(3, 6)}-${core.slice(6, 8)}-${core.slice(8, 10)}`;
}

// То же самое, но в E.164 (+7XXXXXXXXXX) — формат, который ждёт Supabase
// Auth для входа по телефону (см. create-account/index.ts).
function toE164(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const core = digits.length === 11 && (digits[0] === '7' || digits[0] === '8') ? digits.slice(1) : digits;
  if (core.length !== 10) return null;
  return `+7${core}`;
}

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function fail(status: number, error: string, headers: HeadersInit) {
  return new Response(JSON.stringify({ error }), { status, headers });
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return fail(405, 'Метод не поддерживается', headers);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Некорректный запрос', headers);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return fail(401, 'Не авторизован', headers);

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) return fail(401, 'Не авторизован', headers);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: caller } = await admin
    .from('employees')
    .select('id, role, company_id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!caller) return fail(403, 'Недостаточно прав', headers);

  const id = String(body.id ?? '');
  if (!id) return fail(400, 'Не указан сотрудник', headers);

  const { data: target } = await admin.from('employees').select('*').eq('id', id).maybeSingle();
  if (!target) return fail(404, 'Сотрудник не найден', headers);

  // Самого себя менять можно всегда (профиль в «Настройках»). Иначе —
  // владелец сервиса (любого сотрудника, для поддержки) или администратор,
  // но только своей же компании: без проверки company_id администратор
  // одной компании мог бы по id поменять логин/пароль сотруднику ДРУГОЙ.
  const isSelf = caller.id === id;
  const canManageOther = caller.role === 'owner' || (caller.role === 'admin' && target.company_id === caller.company_id);
  if (!isSelf && !canManageOther) {
    return fail(403, 'Менять данные другого сотрудника может только администратор его компании', headers);
  }

  // Частичное обновление: трогаем только те поля, которые реально пришли
  // в body (см. комментарий вверху файла) — has() отличает «поле не
  // передали» от «поле передали пустым».
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  const name = has('name') ? String(body.name ?? '').trim() : (target.name as string);
  if (!name) return fail(400, 'Укажите имя', headers);

  const password = body.password ? String(body.password) : '';
  if (password && password.length < 6) return fail(400, 'Пароль — минимум 6 символов', headers);

  const phone = has('phone') ? formatPhone(body.phone ? String(body.phone).trim() : null) : (target.phone as string | null);
  const e164Phone = toE164(phone);

  // Вход теперь по телефону (доработки 3, п.4), а не по логину — синхронизируем
  // auth.users.phone при каждом сохранении профиля, где телефон есть. Это же
  // тихо доводит до нужного состояния и старые аккаунты, заведённые ещё по
  // логину (см. mobile/src/providers/SessionProvider.tsx — вызывает
  // update-account с текущим телефоном один раз при входе). Не фатально: если
  // не получилось (например, в Supabase ещё не включён Phone-провайдер, см.
  // supabase/README.md), остальной профиль всё равно сохраняется — просто
  // вход по телефону для этого сотрудника пока не заработает.
  if (target.auth_user_id && e164Phone) {
    await admin.auth.admin.updateUserById(target.auth_user_id, { phone: e164Phone, phone_confirm: true });
  }
  if (password && target.auth_user_id) {
    const { error: passwordError } = await admin.auth.admin.updateUserById(target.auth_user_id, { password });
    if (passwordError) return fail(400, passwordError.message, headers);
  }

  const { data: employee, error: updateError } = await admin
    .from('employees')
    .update({
      name,
      last_name: has('last_name') ? (body.last_name ? String(body.last_name).trim() : null) : target.last_name,
      phone,
      birth_date: has('birth_date') ? (body.birth_date ? String(body.birth_date) : null) : target.birth_date,
      hire_date: has('hire_date') ? (body.hire_date ? String(body.hire_date) : null) : target.hire_date,
      address: has('address') ? (body.address ? String(body.address).trim() : null) : target.address,
      personal_vehicle_make: has('personal_vehicle_make')
        ? body.personal_vehicle_make
          ? String(body.personal_vehicle_make).trim()
          : null
        : target.personal_vehicle_make,
      personal_vehicle_plate: has('personal_vehicle_plate')
        ? body.personal_vehicle_plate
          ? String(body.personal_vehicle_plate).trim()
          : null
        : target.personal_vehicle_plate,
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) return fail(400, updateError.message, headers);

  return new Response(JSON.stringify({ employee }), { status: 200, headers });
});
