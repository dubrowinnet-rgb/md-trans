'use client';

import Link from 'next/link';
import {
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Grid,
  GridCol,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import {
  IconAddressBook,
  IconBellRinging,
  IconBrandAndroid,
  IconBrandApple,
  IconCircleCheck,
  IconClipboardCheck,
  IconFileSpreadsheet,
  IconShieldLock,
  IconTruck,
  IconUserCog,
  IconUsersGroup,
  IconWorld,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { isServiceOwner } from '@/lib/ownerAccess';
import { OPERATOR, PRIVACY_PATH } from '@/lib/operator';
import { isOfficeRole, useSession } from '@/providers/SessionProvider';

// Публичная страница без входа — маркетинговый одностраничник. Логика
// «Открыть кабинет» вместо «Скачать приложение» для вошедших диспетчера,
// администратора и владельца сервиса — ниже, в useCabinetLink(). Кабинет
// сам решает, кого пускать (см. (cabinet)/layout.tsx), здесь только выбор
// кнопки на видном месте.
function useCabinetLink() {
  const { session, employee, isLoading } = useSession();
  const owner = isServiceOwner(employee);
  const hasCabinet = Boolean(session) && !isLoading && (isOfficeRole(employee) || owner);
  return { hasCabinet, href: owner ? '/owner/' : '/calendar/' };
}

const PROBLEMS = [
  {
    title: 'Грузчик на двух заказах сразу',
    text: 'Система сама не даст назначить занятого или выходного сотрудника — это проверяет база данных, а не только экран.',
  },
  {
    title: 'Бригада не в курсе заказа',
    text: 'Каждый исполнитель получает push-уведомление и подтверждает заказ одной кнопкой. Диспетчер видит, кто открыл и кто принял.',
  },
  {
    title: 'Клиент не уверен, что его записали',
    text: 'Клиенту автоматически открывается SMS с датой, временем и деталями заказа.',
  },
  {
    title: 'Всё в тетрадке и в голове диспетчера',
    text: 'Единая база клиентов, история заказов, статистика по компании и по сотрудникам, выгрузка в Excel.',
  },
] as const;

const FEATURES = [
  {
    icon: IconUsersGroup,
    title: 'Бригада и занятость',
    text: 'Свободен, занят или выходной — видно сразу при выборе водителя и грузчиков на заказ.',
  },
  {
    icon: IconClipboardCheck,
    title: 'Подтверждение заказа',
    text: 'Исполнитель подтверждает заказ в приложении, диспетчер видит статус каждого.',
  },
  {
    icon: IconAddressBook,
    title: 'База клиентов',
    text: 'История заказов, скидки, заметки. Готовую базу можно загрузить из Excel, CSV или TXT.',
  },
  {
    icon: IconTruck,
    title: 'Автопарк и график',
    text: 'Машины компании, личный транспорт сотрудников, рабочие дни и часы на месяц вперёд.',
  },
  {
    icon: IconBellRinging,
    title: 'Уведомления',
    text: 'SMS клиенту о заказе, push-напоминания бригаде перед выездом — по заданному расписанию.',
  },
  {
    icon: IconShieldLock,
    title: 'Права по ролям',
    text: 'Администратор настраивает, что видит и может делать каждый — вплоть до сумм и телефонов клиентов.',
  },
] as const;

const ROLES = [
  { title: 'Администратор', text: 'Видит и настраивает всё: сотрудников, права, услуги, отчёты.' },
  { title: 'Диспетчер', text: 'Принимает заказы, ведёт календарь, назначает бригаду и машину.' },
  { title: 'Водитель', text: 'Свои заказы, подтверждение, звонок клиенту, маршрут в Яндекс.Картах.' },
  { title: 'Грузчик', text: 'Свои заказы и подтверждение — без лишних экранов.' },
] as const;

export function LandingView() {
  const cabinet = useCabinetLink();

  return (
    <Box>
      <Header cabinet={cabinet} />

      <Container size="lg" pt={56} pb={40}>
        <Grid gap={48} align="center">
          <GridCol span={{ base: 12, md: 6 }}>
            <Stack gap="lg">
              <Badge size="lg" variant="light" radius="sm">
                Для компаний грузоперевозок
              </Badge>
              <Title order={1} fz={{ base: 32, sm: 40 }} lh={1.15}>
                Диспетчерская грузоперевозок в вашем телефоне
              </Title>
              <Text size="lg" c="dimmed">
                Заказы, бригады, машины и клиенты — в одном календаре. Мобильное приложение для водителей и
                грузчиков, полноценный веб-кабинет для диспетчера и администратора — на одной базе.
              </Text>
              <Group>
                {cabinet.hasCabinet ? (
                  <>
                    <Button component={Link} href={cabinet.href} size="md">
                      Открыть кабинет
                    </Button>
                    <Button component={Link} href="/install/" size="md" variant="default">
                      Скачать приложение
                    </Button>
                  </>
                ) : (
                  <>
                    <Button component={Link} href="/install/" size="md">
                      Скачать приложение
                    </Button>
                    <Button component={Link} href="/login/" size="md" variant="default">
                      Войти в веб-кабинет
                    </Button>
                  </>
                )}
              </Group>
              <Group gap="xs" c="dimmed">
                <IconShieldLock size={18} stroke={1.6} />
                <Text size="sm">Данные хранятся на сервере в России</Text>
              </Group>
            </Stack>
          </GridCol>
          <GridCol span={{ base: 12, md: 6 }}>
            <HeroShots />
          </GridCol>
        </Grid>
      </Container>

      <Box bg="gray.0" py={56}>
        <Container size="lg">
          <Stack gap="xl">
            <Stack gap={4} ta="center" maw={560} mx="auto">
              <Title order={2} fz={28}>
                Проблемы, которые решает
              </Title>
            </Stack>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
              {PROBLEMS.map((p) => (
                <Paper key={p.title} p="lg" radius="md" withBorder>
                  <Group align="flex-start" wrap="nowrap">
                    <ThemeIcon size={36} radius="md" variant="light" color="violet">
                      <IconCircleCheck size={20} stroke={1.7} />
                    </ThemeIcon>
                    <div>
                      <Text fw={600}>{p.title}</Text>
                      <Text size="sm" c="dimmed" mt={4}>
                        {p.text}
                      </Text>
                    </div>
                  </Group>
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>
        </Container>
      </Box>

      <Container size="lg" py={56}>
        <Stack gap="xl">
          <Stack gap={4} ta="center" maw={560} mx="auto">
            <Title order={2} fz={28}>
              Возможности
            </Title>
          </Stack>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {FEATURES.map((f) => (
              <Stack key={f.title} gap={8}>
                <ThemeIcon size={40} radius="md" variant="light" color="violet">
                  <f.icon size={22} stroke={1.7} />
                </ThemeIcon>
                <Text fw={600}>{f.title}</Text>
                <Text size="sm" c="dimmed">
                  {f.text}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>

      <Box bg="gray.0" py={56} id="screenshots">
        <Container size="lg">
          <Stack gap={48}>
            <Stack gap="lg">
              <Group justify="space-between" align="flex-end" wrap="wrap">
                <Title order={2} fz={28}>
                  Веб-кабинет диспетчера
                </Title>
                <Text c="dimmed" size="sm">
                  Полноценная версия для компьютера — календарь, заказы, клиенты, автопарк, статистика
                </Text>
              </Group>
              <BrowserFrame src="/landing/web-calendar.webp" alt="Календарь заказов в веб-кабинете" />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                <BrowserFrame src="/landing/web-order.webp" alt="Карточка заказа с бригадой и маршрутом" compact />
                <BrowserFrame src="/landing/web-stats.webp" alt="Статистика по заказам и сотрудникам" compact />
              </SimpleGrid>
            </Stack>

            <Stack gap="lg">
              <Group justify="space-between" align="flex-end" wrap="wrap">
                <Title order={2} fz={28}>
                  Мобильное приложение
                </Title>
                <Text c="dimmed" size="sm">
                  Для водителей и грузчиков — свои заказы, подтверждение, маршрут и график
                </Text>
              </Group>
              <Group justify="center" gap={40} wrap="wrap">
                <PhoneFrame src="/landing/mobile-calendar.webp" alt="Календарь заказов водителя" />
                <PhoneFrame src="/landing/mobile-order.webp" alt="Карточка заказа в приложении водителя" />
              </Group>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container size="lg" py={56}>
        <Stack gap="xl">
          <Stack gap={4} ta="center" maw={560} mx="auto">
            <Title order={2} fz={28}>
              Для кого
            </Title>
            <Text c="dimmed" ta="center">
              Четыре роли с разными правами и экранами — в одном приложении
            </Text>
          </Stack>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="lg">
            {ROLES.map((r) => (
              <Stack key={r.title} gap={6} align="center" ta="center">
                <ThemeIcon size={44} radius="xl" variant="light" color="violet">
                  <IconUserCog size={24} stroke={1.7} />
                </ThemeIcon>
                <Text fw={600}>{r.title}</Text>
                <Text size="sm" c="dimmed">
                  {r.text}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>

      <Box bg="violet.9" py={56}>
        <Container size="sm">
          <Stack gap="lg" align="center" ta="center">
            <Title order={2} fz={28} c="white">
              Начните пользоваться
            </Title>
            <Text c="violet.1">
              Установите приложение на Android или iPhone файлом, без App Store и Google Play, или откройте
              веб-кабинет в браузере.
            </Text>
            <Group>
              <Button component={Link} href="/install/" size="md" variant="white" c="violet.9">
                Скачать приложение
              </Button>
              <Button
                component={Link}
                href={cabinet.hasCabinet ? cabinet.href : '/login/'}
                size="md"
                variant="outline"
                c="white"
                style={{ borderColor: 'var(--mantine-color-violet-3)' }}
              >
                {cabinet.hasCabinet ? 'Открыть кабинет' : 'Войти в веб-кабинет'}
              </Button>
            </Group>
            <Group gap="xl" c="violet.2" mt="xs">
              <Group gap={6}>
                <IconBrandAndroid size={18} stroke={1.6} />
                <Text size="sm">Android</Text>
              </Group>
              <Group gap={6}>
                <IconBrandApple size={18} stroke={1.6} />
                <Text size="sm">iPhone</Text>
              </Group>
              <Group gap={6}>
                <IconWorld size={18} stroke={1.6} />
                <Text size="sm">Браузер</Text>
              </Group>
              <Group gap={6}>
                <IconFileSpreadsheet size={18} stroke={1.6} />
                <Text size="sm">Импорт из Excel</Text>
              </Group>
            </Group>
          </Stack>
        </Container>
      </Box>

      <Footer />
    </Box>
  );
}

function Header({ cabinet }: { cabinet: { hasCabinet: boolean; href: string } }) {
  return (
    <Container size="lg" py="md">
      <Group justify="space-between" wrap="nowrap">
        <Group gap={10} wrap="nowrap">
          <img src="/icon.svg" alt="" width={32} height={32} />
          <Text fw={700} size="lg">
            Грузоперевозки
          </Text>
        </Group>
        <Group gap="sm" visibleFrom="xs">
          {cabinet.hasCabinet ? (
            <Button component={Link} href={cabinet.href} size="sm">
              Открыть кабинет
            </Button>
          ) : (
            <>
              <Button component={Link} href="/install/" size="sm" variant="subtle">
                Скачать
              </Button>
              <Button component={Link} href="/login/" size="sm" variant="default">
                Войти
              </Button>
            </>
          )}
        </Group>
      </Group>
    </Container>
  );
}

function HeroShots() {
  return (
    <Box pos="relative" style={{ isolation: 'isolate' }}>
      <BrowserFrame src="/landing/web-calendar.webp" alt="Календарь заказов в веб-кабинете" />
      <Box
        pos="absolute"
        right={{ base: 8, sm: 16 }}
        bottom={-32}
        w={{ base: 92, sm: 132 }}
        style={{ zIndex: 1, filter: 'drop-shadow(0 12px 24px rgba(20, 10, 50, 0.22))' }}
      >
        <PhoneFrame src="/landing/mobile-calendar.webp" alt="Календарь заказов водителя в приложении" bare />
      </Box>
    </Box>
  );
}

function BrowserFrame({ src, alt, compact }: { src: string; alt: string; compact?: boolean }) {
  return (
    <Box
      style={{
        borderRadius: 12,
        border: '1px solid var(--mantine-color-gray-3)',
        background: 'var(--mantine-color-white)',
        boxShadow: '0 12px 32px rgba(20, 10, 50, 0.10)',
        overflow: 'hidden',
      }}
    >
      <Group gap={6} px={12} py={8} style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <Box w={9} h={9} style={{ borderRadius: 999, background: 'var(--mantine-color-gray-3)' }} />
        <Box w={9} h={9} style={{ borderRadius: 999, background: 'var(--mantine-color-gray-3)' }} />
        <Box w={9} h={9} style={{ borderRadius: 999, background: 'var(--mantine-color-gray-3)' }} />
      </Group>
      <img
        src={src}
        alt={alt}
        style={{ display: 'block', width: '100%', height: compact ? 'auto' : undefined, maxHeight: compact ? 260 : undefined, objectFit: 'cover', objectPosition: 'top' }}
      />
    </Box>
  );
}

function PhoneFrame({ src, alt, bare }: { src: string; alt: string; bare?: boolean }) {
  const inner = (
    <Box
      style={{
        borderRadius: 22,
        border: '6px solid var(--mantine-color-dark-8)',
        background: 'var(--mantine-color-dark-8)',
        overflow: 'hidden',
        lineHeight: 0,
      }}
    >
      <img src={src} alt={alt} style={{ display: 'block', width: '100%' }} />
    </Box>
  );
  if (bare) return inner;
  return (
    <Box w={220} style={{ boxShadow: '0 16px 32px rgba(20, 10, 50, 0.16)', borderRadius: 22 }}>
      {inner}
    </Box>
  );
}

function Footer() {
  const links: Array<{ href: string; label: ReactNode }> = [
    { href: '/install/', label: 'Установка приложения' },
    { href: '/login/', label: 'Вход в веб-кабинет' },
  ];
  if (OPERATOR) links.push({ href: PRIVACY_PATH, label: 'Политика обработки персональных данных' });

  return (
    <Container size="lg" py="xl">
      <Divider mb="lg" />
      <Group justify="space-between" wrap="wrap" gap="md">
        <Text size="sm" c="dimmed">
          © {new Date().getFullYear()} · Грузоперевозки
        </Text>
        <Group gap="lg">
          {links.map((l) => (
            <Anchor key={l.href} component={Link} href={l.href} size="sm" c="dimmed">
              {l.label}
            </Anchor>
          ))}
        </Group>
      </Group>
    </Container>
  );
}
