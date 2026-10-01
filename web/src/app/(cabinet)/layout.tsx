'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ActionIcon,
  AppShell,
  Avatar,
  Burger,
  Button,
  Center,
  Group,
  Loader,
  NavLink,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  IconBuildingStore,
  IconCalendarWeek,
  IconChartBar,
  IconDatabaseExport,
  IconHeadset,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
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
  // Сворачиваемое меню на компьютере (Максим, 01.10) — отдельно от мобильного
  // бургера: тут ширина не 0/220, а 220/76 (только иконки). Запоминаем выбор
  // в localStorage, читаем после монтирования, чтобы не спорить с SSR.
  const [navCollapsed, setNavCollapsed] = useState(false);
  useEffect(() => {
    try {
      setNavCollapsed(localStorage.getItem('cabinetNavCollapsed') === '1');
    } catch {
      // приватный режим браузера и т.п. — просто не запоминаем выбор
    }
  }, []);
  const toggleNavCollapsed = () => {
    setNavCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cabinetNavCollapsed', next ? '1' : '0');
      } catch {
        // см. выше
      }
      return next;
    });
  };
  const collapsed = navCollapsed && !isMobile;

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
      navbar={{ width: collapsed ? 76 : 220, breakpoint: 'sm', collapsed: { mobile: !navOpened, desktop: false } }}
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
          <Group justify={collapsed ? 'center' : 'space-between'} wrap="nowrap" px="xs" py="sm">
            {!collapsed && (
              <Title order={5} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isOwner ? 'Кабинет владельца' : 'Кабинет диспетчера'}
              </Title>
            )}
            <Group gap={4} wrap="nowrap">
              {isAdmin && !collapsed && <NotificationBell />}
              <Tooltip label={collapsed ? 'Развернуть меню' : 'Свернуть меню'} position="right">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  visibleFrom="sm"
                  onClick={toggleNavCollapsed}
                  aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
                >
                  {collapsed ? (
                    <IconLayoutSidebarLeftExpand size={18} stroke={1.6} />
                  ) : (
                    <IconLayoutSidebarLeftCollapse size={18} stroke={1.6} />
                  )}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          {isAdmin && collapsed && (
            <Group justify="center" pb="xs">
              <NotificationBell />
            </Group>
          )}
        </AppShell.Section>
        <AppShell.Section grow>
          {isOwner ? (
            // Владелец сервиса не привязан к компании — ему не нужны
            // операционные разделы (заказы, клиенты и т.д.), только его
            // собственный кабинет.
            <Tooltip label="Кабинет владельца" position="right" disabled={!collapsed}>
              <NavLink
                component={Link}
                href="/owner/"
                label={collapsed ? undefined : 'Кабинет владельца'}
                leftSection={<IconBuildingStore size={18} stroke={1.6} />}
                active={pathname?.startsWith('/owner')}
                variant="light"
                style={{ borderRadius: 8, justifyContent: collapsed ? 'center' : undefined }}
              />
            </Tooltip>
          ) : (
            NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => (
              <Tooltip key={item.href} label={item.label} position="right" disabled={!collapsed}>
                <NavLink
                  component={Link}
                  href={item.href}
                  label={collapsed ? undefined : item.label}
                  leftSection={<item.icon size={18} stroke={1.6} />}
                  active={pathname?.startsWith(item.href.replace(/\/$/, ''))}
                  variant="light"
                  style={{ borderRadius: 8, justifyContent: collapsed ? 'center' : undefined }}
                />
              </Tooltip>
            ))
          )}
        </AppShell.Section>
        <AppShell.Section>
          <Tooltip
            label={employee ? `${employee.name} · ${ACCOUNT_ROLE_LABELS[employee.role]}` : ''}
            position="right"
            disabled={!collapsed}
          >
            <Group
              gap="xs"
              px="xs"
              py="sm"
              wrap="nowrap"
              justify={collapsed ? 'center' : undefined}
              {...(isAdmin ? { component: Link, href: '/settings/' } : {})}
              style={{
                borderRadius: 8,
                textDecoration: 'none',
                color: 'inherit',
                cursor: isAdmin ? 'pointer' : 'default',
                background: isAdmin && pathname?.startsWith('/settings') ? 'var(--mantine-color-violet-1)' : undefined,
              }}
              title={isAdmin && !collapsed ? 'Настройки' : undefined}
            >
              <Avatar color="violet" radius="xl" size="sm">
                {employee?.name.slice(0, 1)}
              </Avatar>
              {!collapsed && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" truncate>
                    {employee?.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {employee ? ACCOUNT_ROLE_LABELS[employee.role] : ''}
                  </Text>
                </div>
              )}
            </Group>
          </Tooltip>
          <Tooltip label="Выйти" position="right" disabled={!collapsed}>
            <NavLink
              label={collapsed ? undefined : 'Выйти'}
              leftSection={<IconLogout size={18} stroke={1.6} />}
              onClick={() => supabase.auth.signOut()}
              style={{ borderRadius: 8, justifyContent: collapsed ? 'center' : undefined }}
            />
          </Tooltip>
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main h="100vh">
        <OrderUIProvider>{children}</OrderUIProvider>
      </AppShell.Main>
    </AppShell>
  );
}
