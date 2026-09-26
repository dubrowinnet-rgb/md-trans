'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Anchor, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { loginInputToE164, loginInputToEmail } from '@/lib/accountLogin';
import { useSession } from '@/providers/SessionProvider';

// Вход по телефону и паролю (доработки 3, п.4 — логин сотрудникам больше не
// нужен), те же учётные данные, что и в мобильном приложении. «Войти по
// логину или email» ниже — свёрнутый запасной вариант: нужен только
// аккаунту, которому ещё ни разу не синхронизировали телефон на auth.users
// (см. providers/SessionProvider.tsx), обычно только самые старые учётки.
export default function LoginPage() {
  const router = useRouter();
  const { session } = useSession();
  const [phone, setPhone] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [useLoginFallback, setUseLoginFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) router.replace('/calendar/');
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (useLoginFallback) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginInputToEmail(login),
        password,
      });
      setLoading(false);
      if (signInError) setError(friendlyError(signInError.message));
      return;
    }

    const e164 = loginInputToE164(phone);
    if (!e164) {
      setError('Проверьте номер телефона');
      setLoading(false);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ phone: e164, password });
    setLoading(false);
    if (signInError) setError(friendlyError(signInError.message));
  };

  return (
    <Center h="100vh">
      <Paper w={380} p="xl" shadow="md" withBorder>
        <form onSubmit={handleSubmit}>
          <Stack>
            <div>
              <Title order={3}>Кабинет диспетчера</Title>
              <Text c="dimmed" size="sm">
                Телефон и пароль — те же, что в мобильном приложении
              </Text>
            </div>
            {!supabaseConfigured && (
              <Alert color="red">
                Кабинет не настроен: не заданы NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY (см.
                web/README.md).
              </Alert>
            )}
            {useLoginFallback ? (
              <TextInput
                label="Логин или email"
                value={login}
                onChange={(e) => setLogin(e.currentTarget.value)}
                autoComplete="username"
                required
              />
            ) : (
              <TextInput
                label="Телефон"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
                autoComplete="tel"
                required
              />
            )}
            <PasswordInput
              label="Пароль"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="current-password"
              required
            />
            {error && <Alert color="red">{error}</Alert>}
            <Button type="submit" loading={loading}>
              Войти
            </Button>
            <Anchor size="sm" ta="center" onClick={() => setUseLoginFallback((v) => !v)}>
              {useLoginFallback ? 'Войти по телефону' : 'Войти по логину или email'}
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}

function friendlyError(message: string) {
  return message === 'Invalid login credentials' ? 'Неверные данные для входа' : `Не удалось войти: ${message}`;
}
