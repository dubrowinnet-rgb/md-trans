'use client';

import Link from 'next/link';
import {
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Flex,
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
  IconBrandAndroid,
  IconBrandApple,
  IconCheck,
  IconShieldLock,
  IconTruck,
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

type CabinetLink = ReturnType<typeof useCabinetLink>;

// Скриншоты — из демонстрационной компании в тестовом стенде (вымышленные
// сотрудники и клиенты). Размеры — реальные размеры файлов, чтобы браузер
// заранее знал пропорции и страница не прыгала при загрузке.
type Shot = { src: string; alt: string; width: number; height: number };

const SHOTS = {
  heroCalendar: { src: '/landing/hero-calendar.webp', alt: 'Календарь заказов на неделю в веб-кабинете', width: 1600, height: 1000 },
  heroPhone: { src: '/landing/phone-hero.webp', alt: 'Заказы водителя на день в приложении', width: 640, height: 1385 },
  fleet: { src: '/landing/fleet.webp', alt: 'Автопарк: грузоподъёмность, размеры кузова, европаллеты, тип загрузки', width: 2000, height: 209 },
  orderCard: { src: '/landing/order-card.webp', alt: 'Карточка заказа: клиент, время, адрес, бригада, сумма и машина', width: 840, height: 1225 },
  myOrders: { src: '/landing/phone-my-orders.webp', alt: 'Приложение грузчика: только его заказы', width: 600, height: 1031 },
  accept: { src: '/landing/phone-accept.webp', alt: 'Заказ в приложении грузчика с кнопкой «Принять заказ»', width: 600, height: 1146 },
  crewPicker: { src: '/landing/crew-picker.webp', alt: 'Выбор бригады: кто свободен, кто занят, у кого выходной', width: 820, height: 566 },
  phoneReport: { src: '/landing/phone-report.webp', alt: 'Отчёт водителя за день в приложении', width: 600, height: 1188 },
  report: { src: '/landing/report.webp', alt: 'Отчёт водителя в веб-кабинете: заказы, расходы, касса', width: 1000, height: 994 },
  schedule: { src: '/landing/schedule.webp', alt: 'График работы сотрудников на месяц', width: 2000, height: 416 },
  phoneSchedule: { src: '/landing/phone-schedule.webp', alt: 'Сотрудник сам отмечает рабочие дни в приложении', width: 600, height: 985 },
  permissions: { src: '/landing/permissions.webp', alt: 'Права сотрудника: видит ли он телефоны клиентов и суммы', width: 1000, height: 474 },
} satisfies Record<string, Shot>;

type Feature = {
  eyebrow: string;
  title: string;
  text: ReactNode;
  points?: string[];
  visual: ReactNode;
  // Картинка слева, текст справа (на компьютере; на телефоне всегда текст сверху).
  flip?: boolean;
  // Широкая картинка на всю ширину под текстом.
  wide?: ReactNode;
  // Сколько из 12 колонок занимает картинка на компьютере.
  visualSpan?: number;
};

const FEATURES: Feature[] = [
  {
    eyebrow: 'Учёт заказов',
    title: 'Ни один заказ не потеряется',
    text: 'Никаких тетрадей, блокнотов, заметок в телефоне и «держу в голове». Каждый заказ записан: куда ехать, во сколько, что везти и о какой цене договорились с клиентом.',
    points: [
      'Адреса погрузки и выгрузки, маршрут в Яндекс.Картах',
      'Дата, время и сумма заказа',
      'Кто едет и на какой машине',
      'История заказов каждого клиента',
    ],
    visual: <ShotCard shot={SHOTS.orderCard} maxWidth={420} />,
  },
  {
    eyebrow: 'Бригады',
    title: 'Чёткое распределение по водителям, машинам и грузчикам',
    text: 'Диспетчер назначает на заказ водителя, машину и грузчиков. У каждого сотрудника свой вход в приложение: он видит только свои заказы и только то, что нужно для работы, а перед выездом получает напоминание.',
    visual: (
      <PhoneFrame shot={SHOTS.myOrders}>
        <PushNotifications />
      </PhoneFrame>
    ),
    flip: true,
  },
  {
    eyebrow: 'Клиенты',
    title: 'СМС клиенту о записи — и не нужно перезванивать',
    text: 'Сразу после записи заказа приложение готовит клиенту СМС с днём, датой и временем — вам остаётся нажать «Отправить». Клиент спокоен и уверен, что договорённости по телефону поняты правильно, а вам не нужно звонить накануне и уточнять, всё ли в силе.',
    points: ['Текст сообщения можно поменять под свою компанию'],
    visual: <SmsIllustration />,
  },
  {
    eyebrow: 'Подтверждения',
    title: 'Сотрудники подтверждают, что увидели заказ',
    text: 'Водитель и грузчики получают заказ в телефоне и нажимают «Принять заказ». Диспетчер сразу видит, кто уже принял, а кто пока только открыл заказ, — не нужно звонить каждому и спрашивать, видел ли он.',
    visual: <PhoneFrame shot={SHOTS.accept} />,
    flip: true,
  },
  {
    eyebrow: 'Без накладок',
    title: 'Никого не запишете на два заказа одновременно',
    text: 'При выборе бригады сразу видно, кто свободен, кто занят другим заказом, а у кого выходной. Грузчика приложение не даст поставить на два заказа в одно время, а водителя — только если вы сознательно везёте сборный груз.',
    visual: <ShotCard shot={SHOTS.crewPicker} maxWidth={460} />,
  },
  {
    eyebrow: 'Отчёты',
    title: 'Отчёты о заказах, деньгах, расходах и часах',
    text: 'В конце дня водитель заполняет отчёт в телефоне: выполненные заказы, наличные и переводы, расходы, топливо и фото одометра. Приложение само считает, сколько денег нужно сдать, а администратор сверяет и подтверждает кассу.',
    points: ['Отработанные часы водителей и грузчиков считаются автоматически по выполненным заказам — из них складывается зарплата'],
    visual: <ReportVisual />,
    visualSpan: 7,
    flip: true,
  },
  {
    eyebrow: 'График',
    title: 'Наглядный график работы',
    text: 'Весь месяц на одном экране: кто работает, в какие часы, у кого выходной и сколько заказов на каждый день. Сотрудникам можно разрешить самим отмечать в телефоне рабочие дни и выходные — тогда диспетчеру или администратору остаётся только проверить график и при необходимости поправить.',
    visual: <PhoneFrame shot={SHOTS.phoneSchedule} width={240} />,
    wide: <ShotCard shot={SHOTS.schedule} scrollMinWidth={900} />,
  },
  {
    eyebrow: 'Доступ',
    title: 'Вы решаете, кто видит телефон клиента и сумму заказа',
    text: 'Для каждого сотрудника отдельно: показывать ли ему телефон заказчика и сумму заказа. Так же настраиваются и другие права — кто может создавать и менять заказы, видеть историю клиентов и вести свой график.',
    visual: <ShotCard shot={SHOTS.permissions} maxWidth={560} />,
    flip: true,
  },
];

export function LandingView() {
  const cabinet = useCabinetLink();

  return (
    <Box bg="white">
      <Header cabinet={cabinet} />
      <Hero cabinet={cabinet} />
      <WhyUs />
      {FEATURES.map((f, i) => (
        <FeatureRow key={f.title} feature={f} shaded={i % 2 === 1} />
      ))}
      <CallToAction cabinet={cabinet} />
      <Footer />
    </Box>
  );
}

function Header({ cabinet }: { cabinet: CabinetLink }) {
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

function Hero({ cabinet }: { cabinet: CabinetLink }) {
  return (
    <Container size="lg" pt={{ base: 32, md: 56 }} pb={{ base: 56, md: 72 }}>
      <Grid gap={48} align="center">
        <GridCol span={{ base: 12, md: 6 }}>
          <Stack gap="lg">
            <Badge size="lg" variant="light" radius="sm">
              Для компаний грузоперевозок
            </Badge>
            <Title order={1} fz={{ base: 32, sm: 42 }} lh={1.12}>
              Приложение для грузоперевозок, которое сделал перевозчик
            </Title>
            <Text size="lg" c="dimmed">
              Заказы, водители, грузчики и машины — в одном приложении на телефоне и компьютере. Его придумал
              предприниматель, который больше 20 лет сам занимается грузоперевозками: здесь есть всё, что нужно в
              работе, и нет ничего лишнего.
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
          <Box pos="relative" style={{ isolation: 'isolate' }}>
            <BrowserFrame shot={SHOTS.heroCalendar} />
            <Box
              pos="absolute"
              right={{ base: 8, sm: 16 }}
              bottom={-32}
              w={{ base: 92, sm: 132 }}
              style={{ zIndex: 1, filter: 'drop-shadow(0 12px 24px rgba(20, 10, 50, 0.22))' }}
            >
              <PhoneFrame shot={SHOTS.heroPhone} width="100%" bezel={5} shadow={false} eager />
            </Box>
          </Box>
        </GridCol>
      </Grid>
    </Container>
  );
}

// Пункты 1 и 2 — почему это приложение, а не любое другое.
function WhyUs() {
  return (
    <Box bg="gray.0" py={{ base: 48, md: 72 }}>
      <Container size="lg">
        <Stack gap={40}>
          <Title order={2} fz={{ base: 26, md: 32 }} ta="center">
            Почему именно это приложение
          </Title>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Paper p="xl" radius="lg" withBorder>
              <ThemeIcon size={52} radius="md" variant="light" color="violet">
                <IconTruck size={28} stroke={1.6} />
              </ThemeIcon>
              <Title order={3} fz={22} mt="lg">
                Сделано специально для грузоперевозок
              </Title>
              <Text c="dimmed" mt="xs">
                Это не программа для салонов красоты или записи к врачу, переделанная под перевозки. Всё устроено вокруг
                вашей работы: машины с грузоподъёмностью и размерами кузова, водители и грузчики, адреса погрузки и
                выгрузки, описание груза и даже сборный груз.
              </Text>
            </Paper>
            <Paper p="xl" radius="lg" withBorder>
              <Group gap={12} align="baseline" wrap="nowrap">
                <Text fz={52} fw={800} c="violet.7" lh={1}>
                  20+
                </Text>
                <Text fw={600} c="dimmed">
                  лет в грузоперевозках
                </Text>
              </Group>
              <Title order={3} fz={22} mt="lg">
                Придумано человеком из профессии
              </Title>
              <Text c="dimmed" mt="xs">
                Приложение создал предприниматель, который больше 20 лет сам занимается грузоперевозками. Каждая функция
                здесь — ответ на проблему, с которой он сталкивался в работе: потерянные заказы, звонки клиентам
                накануне, грузчик, записанный на два адреса сразу.
              </Text>
            </Paper>
          </SimpleGrid>
          <Stack gap="sm">
            <ShotCard shot={SHOTS.fleet} scrollMinWidth={900} />
            <Text size="sm" c="dimmed" ta="center">
              Автопарк в приложении: грузоподъёмность, размеры кузова, европаллеты, тип загрузки и пропуск в центр — у
              каждой машины.
            </Text>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

function FeatureRow({ feature: f, shaded }: { feature: Feature; shaded: boolean }) {
  const visualSpan = f.visualSpan ?? 6;
  return (
    <Box bg={shaded ? 'gray.0' : undefined} py={{ base: 48, md: 80 }}>
      <Container size="lg">
        <Grid gap={{ base: 32, md: 64 }} align="center">
          <GridCol span={{ base: 12, md: 12 - visualSpan }} order={{ base: 1, md: f.flip ? 2 : 1 }}>
            <Stack gap="md">
              <Text size="sm" fw={700} c="violet.7" tt="uppercase" style={{ letterSpacing: '0.06em' }}>
                {f.eyebrow}
              </Text>
              <Title order={2} fz={{ base: 26, md: 32 }} lh={1.2}>
                {f.title}
              </Title>
              <Text size="lg" c="dimmed">
                {f.text}
              </Text>
              {f.points && (
                <Stack gap={10} mt={4}>
                  {f.points.map((p) => (
                    <Group key={p} gap={10} wrap="nowrap" align="flex-start">
                      <ThemeIcon size={24} radius="xl" variant="light" color="violet" style={{ flex: 'none' }}>
                        <IconCheck size={15} stroke={2.4} />
                      </ThemeIcon>
                      <Text>{p}</Text>
                    </Group>
                  ))}
                </Stack>
              )}
            </Stack>
          </GridCol>
          <GridCol span={{ base: 12, md: visualSpan }} order={{ base: 2, md: f.flip ? 1 : 2 }}>
            {f.visual}
          </GridCol>
        </Grid>
        {f.wide && <Box mt={{ base: 32, md: 48 }}>{f.wide}</Box>}
      </Container>
    </Box>
  );
}

function CallToAction({ cabinet }: { cabinet: CabinetLink }) {
  return (
    <Box bg="violet.9" py={{ base: 48, md: 72 }}>
      <Container size="sm">
        <Stack gap="lg" align="center" ta="center">
          <Title order={2} fz={{ base: 26, md: 32 }} c="white">
            Попробуйте в своей компании
          </Title>
          <Text c="violet.1">
            Установите приложение на Android или iPhone файлом, без App Store и Google Play. Диспетчер и администратор
            могут работать и в веб-кабинете прямо в браузере.
          </Text>
          <Group justify="center">
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
          <Group gap="xl" c="violet.2" mt="xs" justify="center">
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
          </Group>
        </Stack>
      </Container>
    </Box>
  );
}

function BrowserFrame({ shot }: { shot: Shot }) {
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
        src={shot.src}
        alt={shot.alt}
        width={shot.width}
        height={shot.height}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
    </Box>
  );
}

// Скриншот веб-кабинета без рамки браузера. Широкие таблицы (автопарк,
// график) на телефоне не ужимаются в нечитаемую полоску, а прокручиваются
// в сторону внутри карточки — сама страница вбок не едет.
function ShotCard({ shot, maxWidth, scrollMinWidth }: { shot: Shot; maxWidth?: number; scrollMinWidth?: number }) {
  return (
    <>
      <Box
        w="100%"
        maw={maxWidth}
        mx="auto"
        style={{
          borderRadius: 14,
          border: '1px solid var(--mantine-color-gray-3)',
          background: 'var(--mantine-color-white)',
          boxShadow: '0 16px 40px rgba(20, 10, 50, 0.10)',
          overflowX: scrollMinWidth ? 'auto' : 'hidden',
          overflowY: 'hidden',
        }}
      >
        <img
          src={shot.src}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          loading="lazy"
          style={{ display: 'block', width: '100%', minWidth: scrollMinWidth, height: 'auto' }}
        />
      </Box>
      {scrollMinWidth && (
        <Text hiddenFrom="md" size="xs" c="dimmed" ta="center" mt={6}>
          Таблицу можно пролистать вбок →
        </Text>
      )}
    </>
  );
}

function PhoneFrame({
  shot,
  width = 280,
  bezel = 8,
  shadow = true,
  eager,
  children,
}: {
  shot: Shot;
  width?: number | string;
  bezel?: number;
  shadow?: boolean;
  eager?: boolean;
  children?: ReactNode;
}) {
  return (
    <Box
      pos="relative"
      w={width}
      maw="100%"
      mx="auto"
      style={{
        borderRadius: bezel * 3.5,
        border: `${bezel}px solid var(--mantine-color-dark-8)`,
        background: 'var(--mantine-color-dark-8)',
        overflow: 'hidden',
        boxShadow: shadow ? '0 20px 44px rgba(20, 10, 50, 0.18)' : undefined,
      }}
    >
      <img
        src={shot.src}
        alt={shot.alt}
        width={shot.width}
        height={shot.height}
        loading={eager ? undefined : 'lazy'}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
      {children}
    </Box>
  );
}

// Тексты — те же, что приходят сотрудникам: «Новый заказ» при назначении
// (mobile/src/api/orders.ts) и «Скоро заказ» по правилу напоминаний
// (supabase/functions/send-crew-reminders, по умолчанию за 30 минут).
function PushNotifications() {
  const items = [
    { title: 'Новый заказ', body: 'Вам назначен новый заказ', time: 'вчера' },
    { title: 'Скоро заказ', body: 'Заказ в 11:00 (через 30 мин.)', time: 'сейчас' },
  ];
  return (
    <Stack gap={6} pos="absolute" left={8} right={8} bottom={10}>
      {items.map((n) => (
        <Box
          key={n.title}
          px={10}
          py={8}
          style={{
            borderRadius: 14,
            background: 'rgba(255, 255, 255, 0.94)',
            boxShadow: '0 6px 20px rgba(20, 10, 50, 0.22)',
          }}
        >
          <Group gap={8} wrap="nowrap" align="flex-start">
            <img src="/icon.svg" alt="" width={20} height={20} style={{ flex: 'none', marginTop: 2 }} />
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Group justify="space-between" gap={4} wrap="nowrap">
                <Text fz={12} fw={700} lh={1.3}>
                  {n.title}
                </Text>
                <Text fz={10} c="dimmed" lh={1.3}>
                  {n.time}
                </Text>
              </Group>
              <Text fz={12} lh={1.3}>
                {n.body}
              </Text>
            </Box>
          </Group>
        </Box>
      ))}
    </Stack>
  );
}

// СМС нарисована, а не снята: её отправляет штатное приложение сообщений
// телефона, а текст — шаблон по умолчанию из настроек компании
// (supabase/migrations/0013: «[Name], подтверждаю Ваш заказ [Day], [Date]
// в [Time] в оговоренном месте.»), заполненный как в mobile/src/lib/smsCompose.ts.
function SmsIllustration() {
  return (
    <Box
      w={280}
      maw="100%"
      mx="auto"
      style={{
        borderRadius: 28,
        border: '8px solid var(--mantine-color-dark-8)',
        background: 'var(--mantine-color-white)',
        overflow: 'hidden',
        boxShadow: '0 20px 44px rgba(20, 10, 50, 0.18)',
      }}
    >
      <Stack
        gap={6}
        align="center"
        py={14}
        style={{ background: 'var(--mantine-color-gray-0)', borderBottom: '1px solid var(--mantine-color-gray-2)' }}
      >
        <Avatar color="violet" radius="xl" size={44}>
          СГ
        </Avatar>
        <Text size="sm" fw={600}>
          Скорый Груз
        </Text>
      </Stack>
      <Stack gap={10} px={14} pt={16} pb={24} mih={290}>
        <Text fz={11} c="dimmed" ta="center">
          Сегодня, 14:32
        </Text>
        <Box
          px={12}
          py={9}
          maw="88%"
          style={{ alignSelf: 'flex-start', borderRadius: '18px 18px 18px 4px', background: 'var(--mantine-color-gray-1)' }}
        >
          <Text size="sm" lh={1.4}>
            Мария Сергеевна, подтверждаю Ваш заказ четверг, 01.10 в 09:00 в оговоренном месте.
          </Text>
        </Box>
        <Box
          px={12}
          py={9}
          style={{ alignSelf: 'flex-end', borderRadius: '18px 18px 4px 18px', background: 'var(--mantine-color-blue-6)' }}
        >
          <Text size="sm" c="white" lh={1.4}>
            Спасибо, ждём!
          </Text>
        </Box>
      </Stack>
      <Box px={12} py={10} style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
        <Box
          px={14}
          py={7}
          style={{ borderRadius: 999, border: '1px solid var(--mantine-color-gray-3)' }}
        >
          <Text size="sm" c="dimmed">
            Сообщение
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

// Отчёт водителя: как он его заполняет в телефоне и как его видит
// администратор в веб-кабинете — рядом, без наложения, чтобы обе картинки
// читались целиком; на узком экране — друг под другом.
function ReportVisual() {
  return (
    <Flex direction={{ base: 'column', sm: 'row' }} gap={20} align="center">
      <Box w={{ base: 240, sm: 210 }} style={{ flex: 'none' }}>
        <PhoneFrame shot={SHOTS.phoneReport} width="100%" bezel={6} />
      </Box>
      <Box w="100%" style={{ flex: 1, minWidth: 0 }}>
        <ShotCard shot={SHOTS.report} />
      </Box>
    </Flex>
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
