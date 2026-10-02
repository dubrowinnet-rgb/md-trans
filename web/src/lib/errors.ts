import { supabase } from './supabase';

// Ошибки Supabase — обычные объекты с полем message, а не Error, поэтому
// `err instanceof Error` их не узнаёт и показывал бы общий текст вместо
// понятной причины из базы.
export function errorMessage(err: unknown, fallback = 'Не удалось сохранить') {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && err.message) {
    return err.message;
  }
  return fallback;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Триггеры занятости в базе (миграция 0007) пишут id сотрудника и заказа —
// для диспетчера подставляем имя и убираем технический id.
export async function friendlyOrderError(err: unknown): Promise<Error> {
  const message = errorMessage(err, 'Не удалось сохранить заказ');
  const busy = message.match(new RegExp(`Сотрудник (${UUID}) уже занят на заказе ${UUID} в это время`));
  if (busy) {
    const { data } = await supabase.from('employees').select('name').eq('id', busy[1]).maybeSingle();
    return new Error(`${data?.name ?? 'Сотрудник'} уже занят на другом заказе в это время. Грузчик не может быть на двух заказах сразу.`);
  }
  if (new RegExp(`Перенос заказа конфликтует по времени с заказом ${UUID}`).test(message)) {
    return new Error('На это время кто-то из бригады уже занят на другом заказе. Выберите другое время или поменяйте бригаду.');
  }
  return new Error(message);
}
