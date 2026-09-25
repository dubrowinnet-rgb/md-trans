'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell, Avatar, Button, Center, Group, Loader, NavLink, Stack, Text, Title } from '@mantine/core';
import {
  IconBuildingStore,
  IconCalendarWeek,
  IconChartBar,
  IconDatabaseExport,
  IconHeadset,
  IconListDetails,
  IconLogout,
  IconAddressBook,
  IconTruck,
  IconCalendarOff,
  IconUsersGroup,
  IconReportMoney,
} from '@tabler/icons-react';
import { supabase } from '@/lib/supabase';
import { isOfficeRole, useSession } from '@/providers/SessionProvider';
import { isServiceOwner } from '@/lib/ownerAccess';
import { ACCOUNT_ROLE_LABELS } from '@/lib/labels';
import { OrderUIProvider } from '@/components/orders/OrderUIProvider';
import { NotificationBell } from '@/components/common/NotificationBell';

const NAV = [
  { href: '/calendar/', label: 'Календарь', icon: IconCalendarWeek, adminOnly: false },
  { href: '/orders/', label: 'Заказы', icon: IconListDetails, adminOnly: false },
  { href: '/clients/', label: 'Клиенты', icon: IconAddressBook, adminOnly: false },
  { href: '/fleet/', label: 'Автопарк', icon: IconTruck, adminOnly: false },
  { href: '/schedule/', label: 'График', icon: IconCalendarOff, adminOnly: false },
  { href: '/export/', label: 'Выгрузка', icon: IconDatabaseExport, adminOnly: false },
  { href: '/team/', label: 'Команда', icon: IconUsersGroup, adminOnly: true },
  { href: '/driver-reports/', label: 'Отчёты водителей', icon: IconReportMoney, adminOnly: true },
  { href: '/stats/', label: 'Статистика', icon: IconChartBar, adminOnly: true },
  { href: '/support/', label: 'Техподдержка', icon: IconHeadset, adminOnly: true },
];

// Общая рамка кабинета: меню слева, страница справа. Пускаем только
// администратора и диспетчера — водителю и грузчику кабинет не нужен,
// у них мобильное приложение.
export default function CabinetLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, employee, isLoading } = useSession();

  const isOwner = isServiceOwner(employee);

  useEffect(() => {
    if (!isLoading && !session) router.replace('/login/');
  }, [isLoading, session, router]);

  // Владелец сервиса не работает с заказами конкретной компании — уводим
  // его сразу в /owner/, минуя общий кабинет диспетчера (куда ведут /login/
  // и корневой /).
  useEffect(() => {
    if (isOwner && !pathname?.startsWith('/owner')) router.replace('/owner/');
  }, [isOwner, pathname, router]);

  if (isLoading || !session) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (!isOfficeRole(employee) && !isOwner) {
    return (
      <Center h="100vh">
        <Stack align="center" maw={420}>
          <Title order={4} ta="center">
            {employee ? 'Кабинет доступен только администратору и диспетчеру' : 'У этого аккаунта нет доступа'}
          </Title>
          <Text c="dimmed" ta="center">
            {employee
              ? 'Водители и грузчики работают в мобильном приложении.'
              : 'Попросите администратора завести для вас логин в разделе «Команда».'}
          </Text>
          <Button variant="default" onClick={() => supabase.auth.signOut()}>
            Выйти
          </Button>
        </Stack>
      </Center>
    );
  }

  const isAdmin = employee?.role === 'admin';

  return (
    <AppShell navbar={{ width: 220, breakpoint: 0 }} padding={0}>
      <AppShell.Navbar p="sm">
        <AppShell.Section>
          <Group justify="space-between" wrap="nowrap" px="xs" py="sm">
            <Title order={5}>{isOwner ? 'Кабинет владельца' : 'Кабинет диспетчера'}</Title>
            {isAdmin && <NotificationBell />}
          </Group>
        </AppShell.Section>
        <AppShell.Section grow>
          {isOwner ? (
            // Владелец сервиса не привязан к компании — ему не нужны
            // операционные разделы (заказы, клиенты и т.д.), только его
            // собственный кабинет.
            <NavLink
              component={Link}
              href="/owner/"
              label="Кабинет владельца"
              leftSection={<IconBuildingStore size={18} stroke={1.6} />}
              active={pathname?.startsWith('/owner')}
              variant="light"
              style={{ borderRadius: 8 }}
            />
          ) : (
            NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
              <NavLink
                key={item.href}
                component={Link}
                href={item.href}
                label={item.label}
                leftSection={<item.icon size={18} stroke={1.6} />}
                active={pathname?.startsWith(item.href.replace(/\/$/, ''))}
                variant="light"
                style={{ borderRadius: 8 }}
              />
            ))
          )}
        </AppShell.Section>
        <AppShell.Section>
          <Group
            gap="xs"
            px="xs"
            py="sm"
            wrap="nowrap"
            {...(isAdmin ? { component: Link, href: '/settings/' } : {})}
            style={{
              borderRadius: 8,
              textDecoration: 'none',
              color: 'inherit',
              cursor: isAdmin ? 'pointer' : 'default',
              background: isAdmin && pathname?.startsWith('/settings') ? 'var(--mantine-color-violet-1)' : undefined,
            }}
            title={isAdmin ? 'Настройки' : undefined}
          >
            <Avatar color="violet" radius="xl" size="sm">
              {employee?.name.slice(0, 1)}
            </Avatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" truncate>
                {employee?.name}
              </Text>
              <Text size="xs" c="dimmed">
                {employee ? ACCOUNT_ROLE_LABELS[employee.role] : ''}
              </Text>
            </div>
          </Group>
          <NavLink
            label="Выйти"
            leftSection={<IconLogout size={18} stroke={1.6} />}
            onClick={() => supabase.auth.signOut()}
            style={{ borderRadius: 8 }}
          />
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main h="100vh">
        <OrderUIProvider>{children}</OrderUIProvider>
      </AppShell.Main>
    </AppShell>
  );
}
