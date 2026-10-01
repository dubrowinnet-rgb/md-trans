'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell, Avatar, Burger, Button, Center, Group, Loader, NavLink, Stack, Text, Title } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
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
  { href: '/driver-reports/', label: 'Отчёты водителей', icon: IconReportMoney, adminOnly: false },
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
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure();
  // На телефоне меню слева не помещается — прячем за бургер в верхней
  // полоске (AppShell.Header), которая на десктопе не занимает места
  // (collapsed: !isMobile). undefined до первого замера — трактуем как
  // «не телефон», чтобы desktop не мигал лишней полоской при заходе.
  const isMobile = useMediaQuery('(max-width: 48em)') ?? false;

  const isOwner = isServiceOwner(employee);

  useEffect(() => {
    if (!isLoading && !session) router.replace('/login/');
  }, [isLoading, session, router]);

  // Перешли по ссылке в меню на телефоне — само меню больше не нужно.
  useEffect(() => {
    closeNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // На телефоне открытое меню — это полноэкранная панель (сворачивается
  // крестиком слева сверху, он и так виден); Escape — такой же ожидаемый
  // способ её закрыть, но сам по себе не работает, раз меню не является
  // Mantine Modal/Drawer с этим встроенным.
  useEffect(() => {
    if (!navOpened) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNav();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpened, closeNav]);

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
    <AppShell
      header={{ height: 52, collapsed: !isMobile }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !navOpened, desktop: false } }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="sm" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger opened={navOpened} onClick={toggleNav} size="sm" />
            <Title order={5} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isOwner ? 'Кабинет владельца' : 'Кабинет диспетчера'}
            </Title>
          </Group>
          {isAdmin && <NotificationBell />}
        </Group>
      </AppShell.Header>
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
