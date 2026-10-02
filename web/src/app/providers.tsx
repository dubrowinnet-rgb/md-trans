'use client';

import { useState, type ReactNode } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from '@/providers/SessionProvider';
import { shouldRetryQuery } from '@/lib/supabaseQuery';
import '@/lib/dates';

// Фиолетовый — как основной цвет мобильного приложения (#5b21b6).
const theme = createTheme({
  primaryColor: 'violet',
  primaryShade: 8,
  defaultRadius: 'md',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  // Чуть компактнее десктопный интерфейс (Максим, 01.10) — масштабирует
  // разом все отступы, шрифты и размеры компонентов (всё в rem).
  scale: 0.9,
});

export function Providers({ children }: { children: ReactNode }) {
  // Данные, загруженные меньше минуты назад, при возврате на вкладку не
  // перечитываются: иначе тысячи открытых кабинетов дёргают базу на каждое
  // переключение окна. Свои правки сбрасывают кэш сразу (invalidateQueries).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 60_000, retry: shouldRetryQuery } },
      })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme} defaultColorScheme="light">
        <DatesProvider settings={{ locale: 'ru', firstDayOfWeek: 1, weekendDays: [0, 6] }}>
          <ModalsProvider labels={{ confirm: 'Да', cancel: 'Отмена' }}>
            <Notifications position="bottom-right" zIndex={1000} />
            <SessionProvider>{children}</SessionProvider>
          </ModalsProvider>
        </DatesProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}
