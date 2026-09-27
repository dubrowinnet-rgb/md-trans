// Основные настройки приложения — в app.json. Этот файл добавляет к ним
// только то, чего в публичном репозитории быть не должно, и проверяет
// сборку в EAS.
const fs = require('fs');
const path = require('path');

// Адрес сервера и публичный ключ сборка (и обновление по воздуху) берут из
// mobile/.env.production — см. mobile/README.md, «Сборка приложения». Без
// них сборка получилась бы, но приложение не открылось бы ни у кого,
// поэтому сборку в EAS сразу останавливаем с понятной ошибкой.
function assertServerConfigured() {
  const file = path.join(__dirname, '.env.production');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const has = (name) => Boolean(process.env[name]) || new RegExp(`^${name}=\\S+`, 'm').test(text);
  if (!has('EXPO_PUBLIC_SUPABASE_URL') || !has('EXPO_PUBLIC_SUPABASE_ANON_KEY')) {
    throw new Error(
      'Для сборки не заданы EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY — ' +
        'впишите их в mobile/.env.production, см. mobile/README.md, «Сборка приложения».'
    );
  }
}

module.exports = ({ config }) => {
  if (process.env.EAS_BUILD === 'true') assertServerConfigured();

  // google-services.json (проект Firebase — через него Android получает
  // push-уведомления) в git не кладём. При сборке в EAS его подставляет
  // переменная окружения GOOGLE_SERVICES_JSON типа «файл» (expo.dev →
  // проект → Environment variables), для локальной сборки достаточно
  // положить файл рядом, в mobile/google-services.json. Без него приложение
  // собирается и работает, только пуши на Android не приходят.
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ??
    (fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : undefined);

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
