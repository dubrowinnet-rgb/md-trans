# Мобильное приложение (Expo)

## Запуск

```bash
cd mobile
npm install
cp .env.example .env   # заполнить EXPO_PUBLIC_SUPABASE_URL и EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```

Значения для `.env` — в Supabase Dashboard → Project Settings → API (Project URL и `anon` `public` key).
`anon key` предназначен для клиентских приложений и защищён политиками RLS на стороне базы —
хранить его в `.env` вместо кода нужно только для удобства смены окружений (dev/prod), не как секрет.

## Структура

- `src/lib/supabase.ts` — инициализация клиента Supabase (Auth + Postgres + Storage).
- `src/screens/LoginScreen.tsx` — вход диспетчера.
- `src/screens/CalendarScreen.tsx` — календарь по сотрудникам (день/неделя).
- `src/screens/CreateOrderModal.tsx` — создание заказа с проверкой занятости экипажа.

## Известное ограничение окружения разработки

Пакеты ставились через `npm install` напрямую (у среды разработки нет сети до
`api.expo.dev`, поэтому `npx expo install` не мог проверить версии,
совместимые с вашим SDK). После `git pull` рекомендуется один раз выполнить
локально, где сеть есть:

```bash
npx expo install --check
```

Это подтянет версии нативных пакетов (в первую очередь
`@react-native-community/datetimepicker`), точно совместимые с установленным
Expo SDK.
