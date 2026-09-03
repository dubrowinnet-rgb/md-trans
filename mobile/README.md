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
- `App.tsx` — временный экран проверки подключения; будет заменён экраном авторизации диспетчера.
