// Сотрудники входят по логину, а не по email (раздел «разделить входы»),
// но Supabase Auth умеет только email/пароль. Поэтому логин превращается
// во внутренний, никуда не отправляемый адрес — тот же приём, что и на
// сервере при создании аккаунта (supabase/functions/create-account).
// Держим правило синхронно на обоих концах.
const LOGIN_DOMAIN = '@mdtrans.internal';

export function loginToEmail(login: string) {
  return `${login.trim().toLowerCase()}${LOGIN_DOMAIN}`;
}

// Логин, введённый на экране входа, может быть и обычным email — так
// продолжает работать более ранняя учётная запись администратора,
// заведённая напрямую в Supabase Dashboard на его настоящий email.
export function loginInputToEmail(input: string) {
  const trimmed = input.trim();
  return trimmed.includes('@') ? trimmed : loginToEmail(trimmed);
}
