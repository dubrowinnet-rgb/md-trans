// Правка уже существующего аккаунта сотрудника: логин, пароль и профиль
// (раздел «Команда» — админ должен видеть и менять логин/пароль и всю
// информацию о сотруднике). С доработки «Настройки» этой же функцией
// пользуется и сам сотрудник — правит СВОЙ логин/телефон/пароль (раздел
// «Мой профиль»): вызывающий либо администратор, либо id === он сам.
//
// Отдельная функция, а не часть create-account: смена логина меняет email
// в auth.users, а смена пароля — это auth.admin.updateUserById, и то, и
// другое требует service role key по той же причине, что и создание
// аккаунта (см. create-account/index.ts) — с телефона напрямую это
// сделать нельзя.
//
// Тело запроса — частичное обновление: поле, которого нет в body,
// остаётся как было (берётся из текущей строки), а не затирается пустым.
// Это важно для самообслуживания — экран «Мой профиль» отправляет только
// login/phone/password, и не должен случайно стереть фамилию/адрес/etc,
// которые заполнял администратор.
//
// Деплой (после `supabase link`, см. supabase/README.md):
//   supabase functions deploy update-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const LOGIN_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function loginToEmail(login: string) {
  return `${login.toLowerCase()}@mdtrans.internal`;
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
    .select('id, role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();
  if (!caller) return fail(403, 'Недостаточно прав', headers);

  const id = String(body.id ?? '');
  if (!id) return fail(400, 'Не указан сотрудник', headers);

  const isSelf = caller.id === id;
  if (caller.role !== 'admin' && !isSelf) {
    return fail(403, 'Менять данные другого сотрудника может только администратор', headers);
  }

  const { data: target } = await admin.from('employees').select('*').eq('id', id).maybeSingle();
  if (!target) return fail(404, 'Сотрудник не найден', headers);

  // Частичное обновление: трогаем только те поля, которые реально пришли
  // в body (см. комментарий вверху файла) — has() отличает «поле не
  // передали» от «поле передали пустым».
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  const name = has('name') ? String(body.name ?? '').trim() : (target.name as string);
  if (!name) return fail(400, 'Укажите имя', headers);

  // Логин необязателен на редактировании: у сотрудников, заведённых
  // напрямую в Supabase до входа по логину, он может быть пустым, и
  // администратор не обязан заводить его прямо сейчас, если просто
  // правит другое поле — пустое значение оставляет логин как был.
  const loginInput = has('login') ? String(body.login ?? '').trim() : '';
  let login = target.login as string | null;
  if (loginInput) {
    if (!LOGIN_RE.test(loginInput)) {
      return fail(400, 'Логин — 3–32 символа: латинские буквы, цифры, точка, дефис или подчёркивание', headers);
    }
    login = loginInput;
  }
  const password = body.password ? String(body.password) : '';
  if (password && password.length < 6) return fail(400, 'Пароль — минимум 6 символов', headers);

  if (target.auth_user_id && login && login !== target.login) {
    const { error: emailError } = await admin.auth.admin.updateUserById(target.auth_user_id, {
      email: loginToEmail(login),
    });
    if (emailError) {
      const message = emailError.message.toLowerCase().includes('already')
        ? 'Такой логин уже занят'
        : emailError.message;
      return fail(400, message, headers);
    }
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
      phone: has('phone') ? (body.phone ? String(body.phone).trim() : null) : target.phone,
      login,
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

  if (updateError) {
    const message = updateError.message.includes('employees_login_key')
      ? 'Такой логин уже занят'
      : updateError.message;
    return fail(400, message, headers);
  }

  return new Response(JSON.stringify({ employee }), { status: 200, headers });
});
