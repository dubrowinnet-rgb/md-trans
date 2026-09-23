import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Кабинет диспетчера',
  description: 'Веб-кабинет диспетчера и администратора',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
