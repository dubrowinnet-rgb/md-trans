'use client';

import { Anchor, Button, CopyButton, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { QrCode } from '@/components/install/QrCode';
import { installPageUrl } from '@/lib/installInfo';

// «Команда» → «Установка приложения»: ссылка и QR-код на публичную страницу
// /install/, чтобы отправить сотруднику вместе с телефоном и паролем.
export function InstallLinkModal({ onClose }: { onClose: () => void }) {
  const url = installPageUrl();
  return (
    <Modal opened onClose={onClose} title={<Title order={4} component="span">Установка приложения</Title>}>
      <Stack align="center" gap="md">
        <Text size="sm">
          Отправьте сотруднику эту ссылку вместе с его номером телефона и паролем. На странице — кнопка скачивания
          для Android и шаги для iPhone.
        </Text>
        <QrCode value={url} size={200} />
        <Group gap="xs">
          <Anchor href={url} target="_blank" rel="noreferrer" size="sm" ff="monospace">
            {url}
          </Anchor>
          <CopyButton value={url}>
            {({ copied, copy }) => (
              <Button size="compact-sm" variant="light" onClick={copy}>
                {copied ? 'Скопировано' : 'Скопировать'}
              </Button>
            )}
          </CopyButton>
        </Group>
        <Text size="xs" c="dimmed" ta="center">
          Или покажите QR-код — сотрудник наведёт на него камеру телефона.
        </Text>
      </Stack>
    </Modal>
  );
}
