'use client';

import { useState, type ReactNode } from 'react';
import { MantineProvider, createTheme } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from '@/providers/SessionProvider';
import '@/lib/dates';

// Фиолетовый — как основной цвет мобильного приложения (#5b21b6).
const theme = createTheme({
  primaryColor: 'violet',
  primaryShade: 8,
  defaultRadius: 'md',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 15_000 } } })
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
