'use client';

import { useState } from 'react';
import { Alert, Badge, Box, Button, Group, Loader, Paper, Stack, Table, Tabs, Text, Tooltip } from '@mantine/core';
import { IconBellRinging, IconCreditCard, IconMessage, IconPlus, IconTools, IconUser } from '@tabler/icons-react';
import { useServices, useDeleteService, type Service } from '@/api/services';
import { useSmsTemplates, type SmsTemplate } from '@/api/smsTemplates';
import { useReminderRules, useDeleteReminderRule } from '@/api/reminders';
import { useSession } from '@/providers/SessionProvider';
import { ACCOUNT_STATUS_COLORS, ACCOUNT_STATUS_LABELS } from '@/lib/labels';
import { errorMessage } from '@/lib/errors';
import { formatPhone } from '@/lib/phone';
import { notifications } from '@mantine/notifications';
import { PageHeader } from '@/components/common/PageHeader';
import { ServiceModal } from '@/components/settings/ServiceModal';
import { SmsTemplateModal } from '@/components/settings/SmsTemplateModal';
import { ReminderRuleModal } from '@/components/settings/ReminderRuleModal';
import { AccountModal } from '@/components/team/AccountModal';

// SMS клиенту сейчас отправляется автоматически только для new_order —
// см. комментарий в migrations/0011 и mobile/src/app/settings/sms-templates.tsx.
const AUTO_SENT_KEYS = new Set(['new_order']);

// Настройки (открывается кликом по имени/роли в сайдбаре) — только для
// администратора.
export default function SettingsPage() {
  const { employee } = useSession();
  const servicesQuery = useServices();
  const deleteService = useDeleteService();
  const smsTemplatesQuery = useSmsTemplates();
  const reminderRulesQuery = useReminderRules();
  const deleteReminderRule = useDeleteReminderRule();
  const [editingService, setEditingService] = useState<Service | 'new' | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [addingReminder, setAddingReminder] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  if (employee?.role !== 'admin') {
    return (
      <Box p="lg">
        <Alert>Настройки доступны только администратору.</Alert>
      </Box>
    );
  }

  const removeService = async (s: Service) => {
    if (!confirm(`Удалить услугу «${s.name}»?`)) return;
    try {
      await deleteService.mutateAsync(s.id);
      notifications.show({ message: 'Услуга удалена', color: 'green' });
    } catch (err) {
      notifications.show({ message: errorMessage(err, 'Не удалось удалить услугу'), color: 'red' });
    }
  };

  return (
    <Box p="lg">
      <PageHeader title="Настройки" subtitle="Услуги, SMS, напоминания, ваш профиль и оплата кабинета" />
      <Tabs defaultValue="services">
        <Tabs.List mb="md">
          <Tabs.Tab value="services" leftSection={<IconTools size={16} />}>
            Услуги
          </Tabs.Tab>
          <Tabs.Tab value="sms" leftSection={<IconMessage size={16} />}>
            Шаблоны SMS
          </Tabs.Tab>
          <Tabs.Tab value="reminders" leftSection={<IconBellRinging size={16} />}>
            Напоминания
          </Tabs.Tab>
          <Tabs.Tab value="profile" leftSection={<IconUser size={16} />}>
            Мои данные
          </Tabs.Tab>
          <Tabs.Tab value="billing" leftSection={<IconCreditCard size={16} />}>
            Оплата
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="services">
          <Group justify="flex-end" mb="sm">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEditingService('new')}>
              Добавить услугу
            </Button>
          </Group>
          {servicesQuery.isError && <Alert color="red">{servicesQuery.error.message}</Alert>}
          {servicesQuery.isLoading && <Loader />}
          <Paper withBorder>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Услуга</Table.Th>
                  <Table.Th>Категория</Table.Th>
                  <Table.Th ta="right">Длительность</Table.Th>
                  <Table.Th ta="right">Цена по умолчанию</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(servicesQuery.data ?? []).map((s) => (
                  <Table.Tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setEditingService(s)}>
                    <Table.Td>
                      <Group gap={8} wrap="nowrap">
                        <Box w={4} h={18} style={{ background: s.color, borderRadius: 2, flexShrink: 0 }} />
                        <Text fw={500}>{s.name}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>{s.category || '—'}</Table.Td>
                    <Table.Td ta="right">
                      {s.base_duration_minutes ? `${s.base_duration_minutes} мин` : '—'}
                    </Table.Td>
                    <Table.Td ta="right">{s.base_price ? `${s.base_price} ₽` : '—'}</Table.Td>
                    <Table.Td ta="right">
                      <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeService(s);
                        }}
                      >
                        Удалить
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {servicesQuery.data?.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text c="dimmed" ta="center" py="lg">
                        Услуг пока нет
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="sms">
          <Text size="xs" c="dimmed" mb="sm">
            Подставляются автоматически: [Name] [Day] [Date] [Time] [Cost] [Address]
          </Text>
          {smsTemplatesQuery.isError && <Alert color="red">{smsTemplatesQuery.error.message}</Alert>}
          {smsTemplatesQuery.isLoading && <Loader />}
          <Paper withBorder>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Шаблон</Table.Th>
                  <Table.Th>Статус</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(smsTemplatesQuery.data ?? []).map((t) => (
                  <Table.Tr key={t.key} style={{ cursor: 'pointer' }} onClick={() => setEditingTemplate(t)}>
                    <Table.Td>
                      <Text fw={500}>{t.label}</Text>
                    </Table.Td>
                    <Table.Td>
                      {AUTO_SENT_KEYS.has(t.key) ? (
                        <Badge color="green">Отправляется автоматически</Badge>
                      ) : (
                        <Badge color="gray">Пока не подключено</Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="reminders">
          <Text size="xs" c="dimmed" mb="sm">
            За сколько минут до начала заказа прислать пуш-напоминание экипажу
          </Text>
          <Group justify="flex-end" mb="sm">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setAddingReminder(true)}>
              Новое напоминание
            </Button>
          </Group>
          {reminderRulesQuery.isError && <Alert color="red">{reminderRulesQuery.error.message}</Alert>}
          {reminderRulesQuery.isLoading && <Loader />}
          <Paper withBorder p="md" maw={480}>
            <Stack gap="xs">
              {(reminderRulesQuery.data ?? []).map((r) => (
                <Group key={r.id} justify="space-between">
                  <Text size="sm">Напомнить за {r.offset_minutes} мин.</Text>
                  <Button variant="subtle" color="red" size="xs" onClick={() => deleteReminderRule.mutate(r.id)}>
                    Удалить
                  </Button>
                </Group>
              ))}
              {reminderRulesQuery.data?.length === 0 && (
                <Text c="dimmed" ta="center" py="lg">
                  Напоминаний пока нет
                </Text>
              )}
            </Stack>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="profile">
          <Paper withBorder p="md" maw={480}>
            <Text fw={500} mb={4}>
              {employee.name}
            </Text>
            <Text size="sm" c="dimmed" mb="md">
              Логин {employee.login ?? '—'} · {employee.phone ? formatPhone(employee.phone) : 'телефон не указан'}
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              «Логин» — это то, чем вы входите в кабинет и приложение (настоящей почты и SMTP в системе нет). Здесь
              же можно сменить пароль.
            </Text>
            <Button onClick={() => setEditingProfile(true)}>Изменить мои данные</Button>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="billing">
          <Paper withBorder p="md" maw={480}>
            <Group justify="space-between" mb="xs">
              <Text fw={500}>Статус кабинета</Text>
              <Badge color={ACCOUNT_STATUS_COLORS[employee.account_status]}>
                {ACCOUNT_STATUS_LABELS[employee.account_status]}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed" mb="md">
              Учёт даты, до которой оплачен доступ, и автоматическое продление скоро появятся здесь.
            </Text>
            <Tooltip label="Скоро">
              <Button disabled>Продлить</Button>
            </Tooltip>
          </Paper>
        </Tabs.Panel>
      </Tabs>

      {editingService && (
        <ServiceModal service={editingService === 'new' ? null : editingService} onClose={() => setEditingService(null)} />
      )}
      {editingTemplate && <SmsTemplateModal template={editingTemplate} onClose={() => setEditingTemplate(null)} />}
      {addingReminder && <ReminderRuleModal onClose={() => setAddingReminder(false)} />}
      {editingProfile && <AccountModal account={employee} onClose={() => setEditingProfile(false)} />}
    </Box>
  );
}
