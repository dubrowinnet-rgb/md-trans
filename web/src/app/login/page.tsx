'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { loginInputToEmail } from '@/lib/accountLogin';
import { useSession } from '@/providers/SessionProvider';

// Вход тем же логином и паролем, что и в мобильном приложении.
export default function LoginPage() {
  const router = useRouter();
  const { session } = useSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) router.replace('/calendar/');
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginInputToEmail(login),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Неверный логин или пароль'
          : `Не удалось войти: ${signInError.message}`
      );
    }
  };

  return (
    <Center h="100vh">
      <Paper w={380} p="xl" shadow="md" withBorder>
        <form onSubmit={handleSubmit}>
          <Stack>
            <div>
              <Title order={3}>Кабинет диспетчера</Title>
              <Text c="dimmed" size="sm">
                Логин и пароль — те же, что в мобильном приложении
              </Text>
            </div>
            {!supabaseConfigured && (
              <Alert color="red">
                Кабинет не настроен: не заданы NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY (см.
                web/README.md).
              </Alert>
            )}
            <TextInput
              label="Логин"
              value={login}
              onChange={(e) => setLogin(e.currentTarget.value)}
              autoComplete="username"
              required
            />
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
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
