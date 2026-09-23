'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import {
  ROLE_DEFAULT_PERMISSIONS,
  useCreateAccount,
  useUpdateAccount,
  type Account,
  type AccountPermissions,
} from '@/api/accounts';
import { useVehicles } from '@/api/vehicles';
import { ACCOUNT_ROLE_LABELS } from '@/lib/labels';
import type { AccountRole } from '@/types/database';

const ROLES: AccountRole[] = ['admin', 'dispatcher', 'driver', 'loader'];

const PERMISSION_LABELS: { key: keyof AccountPermissions; label: string; hint: string; crewOnly?: boolean }[] = [
  {
    key: 'can_manage_orders',
    label: 'Может создавать и менять заказы',
    hint: 'Водителю или грузчику с этой галочкой доступно всё, что диспетчеру',
  },
  { key: 'can_view_client_stats', label: 'Видит историю и статистику клиентов', hint: '' },
  {
    key: 'can_view_contacts_and_amounts',
    label: 'Видит телефоны клиентов и суммы',
    hint: 'Грузчику сумма не показывается никогда',
  },
  {
    key: 'can_manage_own_schedule',
    label: 'Может сам вести свой график',
    hint: 'Для подрабатывающих',
    crewOnly: true,
  },
];

// Аккаунт сотрудника — как экран «Команда» в мобильном приложении: при
// создании администратор задаёт логин и пароль, при правке — роль, права
// и машину по умолчанию.
export function AccountModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [login, setLogin] = useState(account?.login ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AccountRole>(account?.role ?? 'dispatcher');
  const [permissions, setPermissions] = useState<AccountPermissions>(
    account
      ? {
          can_manage_orders: account.can_manage_orders,
          can_view_client_stats: account.can_view_client_stats,
          can_view_contacts_and_amounts: account.can_view_contacts_and_amounts,
          can_manage_own_schedule: account.can_manage_own_schedule,
        }
      : ROLE_DEFAULT_PERMISSIONS.dispatcher
  );
  const [vehicleId, setVehicleId] = useState<string | null>(account?.default_vehicle_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const vehicles = useVehicles().data ?? [];
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();

  const changeRole = (value: string) => {
    const next = value as AccountRole;
    setRole(next);
    // Новому аккаунту подставляем права по умолчанию для роли; у
    // существующего не трогаем — админ мог настроить их осознанно.
    if (!account) setPermissions(ROLE_DEFAULT_PERMISSIONS[next]);
  };

  const save = async () => {
    setError(null);
    const vehicleForRole = role === 'driver' ? vehicleId : null;
    try {
      if (account) {
        await updateAccount.mutateAsync({ id: account.id, role, permissions, default_vehicle_id: vehicleForRole });
      } else {
        if (!name.trim()) throw new Error('Укажите имя');
        await createAccount.mutateAsync({
          login: login.trim(),
          password,
          name: name.trim(),
          phone: phone.trim() || undefined,
          role,
          permissions,
          default_vehicle_id: vehicleForRole,
        });
      }
      notifications.show({ message: 'Аккаунт сохранён', color: 'green' });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить'));
    }
  };

  const isAdminRole = role === 'admin';
  const isCrew = role === 'driver' || role === 'loader';

  return (
    <Modal opened onClose={onClose} size="lg" title={<Title order={4}>{account ? account.name : 'Новый аккаунт'}</Title>}>
      <Stack>
        {!account && (
          <SimpleGrid cols={2}>
            <TextInput label="Имя *" value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <TextInput label="Телефон" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} />
            <TextInput
              label="Логин *"
              description="Латиница, цифры, точка, дефис, 3–32 символа"
              value={login}
              onChange={(e) => setLogin(e.currentTarget.value)}
            />
            <PasswordInput
              label="Пароль *"
              description="Не короче 6 символов"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
          </SimpleGrid>
        )}
        {account && (
          <Text size="sm" c="dimmed">
            Логин: {account.login ?? '—'}
            {account.phone ? ` · ${account.phone}` : ''}
          </Text>
        )}
        <div>
          <Text size="sm" fw={500} mb={4}>
            Роль
          </Text>
          <SegmentedControl
            fullWidth
            value={role}
            onChange={changeRole}
            data={ROLES.map((r) => ({ value: r, label: ACCOUNT_ROLE_LABELS[r] }))}
          />
        </div>
        {role === 'driver' && (
          <Select
            label="Машина по умолчанию"
            placeholder={vehicles.length ? 'Не выбрана' : 'Автопарк пуст'}
            data={vehicles.map((v) => ({ value: v.id, label: `${v.name} · ${v.plate}` }))}
            value={vehicleId}
            onChange={setVehicleId}
            clearable
          />
        )}
        {isAdminRole ? (
          <Text size="sm" c="dimmed">
            У администратора всегда есть все права.
          </Text>
        ) : (
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Права поверх роли
            </Text>
            {PERMISSION_LABELS.filter((p) => !p.crewOnly || isCrew).map((p) => (
              <Switch
                key={p.key}
                label={p.label}
                description={p.hint || undefined}
                checked={permissions[p.key]}
                onChange={(e) => {
                  const checked = e.currentTarget.checked;
                  setPermissions((prev) => ({ ...prev, [p.key]: checked }));
                }}
              />
            ))}
          </Stack>
        )}
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={save} loading={createAccount.isPending || updateAccount.isPending}>
            {account ? 'Сохранить' : 'Создать аккаунт'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
