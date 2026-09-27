'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Anchor,
  Badge,
  Button,
  Container,
  CopyButton,
  Group,
  List,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconBrandAndroid, IconBrandApple, IconDownload, IconExternalLink } from '@tabler/icons-react';
import { QrCode } from '@/components/install/QrCode';
import { detectDevice, installPageUrl, loadInstallInfo, type DeviceKind, type InstallInfo } from '@/lib/installInfo';
import { OPERATOR, PRIVACY_PATH } from '@/lib/operator';

const TESTFLIGHT_APP_STORE = 'https://apps.apple.com/app/testflight/id899247664';

// Публичная страница без входа: ссылку на неё администратор отправляет
// сотруднику вместе с телефоном и паролем (кнопка на странице «Команда»).
export function InstallView() {
  const [info, setInfo] = useState<InstallInfo | null>(null);
  const [device, setDevice] = useState<DeviceKind | null>(null);
  const [url, setUrl] = useState('');

  useEffect(() => {
    setDevice(detectDevice());
    setUrl(installPageUrl());
    loadInstallInfo().then(setInfo);
  }, []);

  const android = <AndroidCard key="android" info={info} />;
  const ios = <IosCard key="ios" info={info} />;

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group wrap="nowrap" align="center">
          <img src="/icon.svg" alt="" width={48} height={48} />
          <div>
            <Title order={2}>Приложение «Грузоперевозки»</Title>
            <Text c="dimmed" size="sm">
              Для водителей, грузчиков и диспетчеров. Ставится файлом, без App Store и Google Play.
            </Text>
          </div>
        </Group>

        {device === 'desktop' && url && (
          <Paper withBorder p="lg">
            <Group wrap="nowrap" align="center" gap="lg">
              <QrCode value={url} size={148} />
              <Stack gap={6}>
                <Text fw={600}>Откройте эту страницу на телефоне</Text>
                <Text size="sm" c="dimmed">
                  Наведите камеру телефона на код или отправьте сотруднику ссылку:
                </Text>
                <Group gap="xs">
                  <Text size="sm" ff="monospace">
                    {url}
                  </Text>
                  <CopyButton value={url}>
                    {({ copied, copy }) => (
                      <Button size="compact-xs" variant="light" onClick={copy}>
                        {copied ? 'Скопировано' : 'Скопировать'}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
              </Stack>
            </Group>
          </Paper>
        )}

        {device === 'ios' ? [ios, android] : [android, ios]}

        <Paper withBorder p="lg">
          <Text fw={600}>После установки</Text>
          <Text size="sm" mt={4}>
            Откройте приложение и войдите номером телефона и паролем, которые выдал администратор. Забыли пароль —
            администратор задаст новый в разделе «Команда».
          </Text>
        </Paper>

        <Group gap="lg">
          <Anchor href="/login/" size="sm">
            Вход в веб-кабинет для диспетчеров и администраторов
          </Anchor>
          {OPERATOR && (
            <Anchor href={PRIVACY_PATH} size="sm" c="dimmed">
              Политика обработки персональных данных
            </Anchor>
          )}
        </Group>
      </Stack>
    </Container>
  );
}

function PlatformCard({
  icon,
  title,
  version,
  children,
}: {
  icon: ReactNode;
  title: string;
  version?: string;
  children: ReactNode;
}) {
  return (
    <Paper withBorder p="lg">
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            {icon}
            <Title order={3}>{title}</Title>
          </Group>
          {version && (
            <Badge variant="light" style={{ textTransform: 'none' }}>
              версия {version}
            </Badge>
          )}
        </Group>
        {children}
      </Stack>
    </Paper>
  );
}

function AndroidCard({ info }: { info: InstallInfo | null }) {
  const android = info?.android;
  return (
    <PlatformCard icon={<IconBrandAndroid size={26} color="#3ddc84" />} title="Android" version={android?.version}>
      {!info ? (
        <Loader size="sm" />
      ) : android ? (
        <>
          <Button component="a" href={android.url} download leftSection={<IconDownload size={18} />} size="md">
            Скачать для Android
          </Button>
          <List type="ordered" size="sm" spacing={6}>
            <List.Item>Откройте скачанный файл — из уведомления или из папки «Загрузки».</List.Item>
            <List.Item>
              Если телефон спросит, разрешите установку из этого источника: «Настройки» → «Установка неизвестных
              приложений» → ваш браузер → «Разрешить».
            </List.Item>
            <List.Item>
              Нажмите «Установить». Если Play Защита предупредит о неизвестном разработчике — «Подробнее» → «Всё
              равно установить».
            </List.Item>
          </List>
          <Text size="xs" c="dimmed">
            Новая версия ставится так же, поверх старой — ничего не пропадёт.
          </Text>
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Файл для Android появится здесь, когда будет готова первая сборка приложения.
        </Text>
      )}
    </PlatformCard>
  );
}

function IosCard({ info }: { info: InstallInfo | null }) {
  const ios = info?.ios;
  return (
    <PlatformCard icon={<IconBrandApple size={26} />} title="iPhone" version={ios?.version}>
      {!info ? (
        <Loader size="sm" />
      ) : ios?.mode === 'testflight' ? (
        <>
          <List type="ordered" size="sm" spacing={6}>
            <List.Item>
              Установите бесплатное приложение Apple TestFlight:{' '}
              <Anchor href={TESTFLIGHT_APP_STORE} target="_blank" rel="noreferrer">
                TestFlight в App Store
              </Anchor>
              .
            </List.Item>
            <List.Item>Вернитесь на эту страницу и нажмите «Открыть приглашение».</List.Item>
            <List.Item>В TestFlight нажмите «Принять», затем «Установить». Обновления будут приходить туда же.</List.Item>
          </List>
          <Button component="a" href={ios.url} leftSection={<IconExternalLink size={18} />} size="md">
            Открыть приглашение
          </Button>
        </>
      ) : ios?.mode === 'adhoc' ? (
        <>
          <List type="ordered" size="sm" spacing={6}>
            <List.Item>
              Приложение ставится только на iPhone, который добавил администратор.{' '}
              {ios.registerUrl ? (
                <>
                  Если ваш ещё не добавлен —{' '}
                  <Anchor href={ios.registerUrl} target="_blank" rel="noreferrer">
                    зарегистрируйте iPhone
                  </Anchor>{' '}
                  в Safari и сообщите администратору, он выпустит обновление.
                </>
              ) : (
                'Если ваш ещё не добавлен — сообщите администратору.'
              )}
            </List.Item>
            <List.Item>Откройте эту страницу в Safari и нажмите «Установить на iPhone».</List.Item>
            <List.Item>Приложение появится на экране «Домой».</List.Item>
          </List>
          <Button component="a" href={ios.url} leftSection={<IconDownload size={18} />} size="md">
            Установить на iPhone
          </Button>
        </>
      ) : (
        <Text size="sm" c="dimmed">
          Версия для iPhone готовится. Когда она будет, здесь появится кнопка установки.
        </Text>
      )}
    </PlatformCard>
  );
}
