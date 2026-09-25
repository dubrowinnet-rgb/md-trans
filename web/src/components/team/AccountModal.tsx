'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { errorMessage } from '@/lib/errors';
import { dayjs } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import {
  ROLE_DEFAULT_PERMISSIONS,
  useCreateAccount,
  useUpdateAccount,
  useUpdateAccountProfile,
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

// Аккаунт сотрудника — как экран «Команда» в мобильном приложении: один
// диалог и на создание, и на правку. При создании администратор сразу
// задаёт логин и пароль; при правке их тоже можно сменить (логин и
// пароль — необязательные поля: пусто значит «не менять», см.
// useUpdateAccountProfile).
export function AccountModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [lastName, setLastName] = useState(account?.last_name ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [login, setLogin] = useState(account?.login ?? '');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState<string | null>(account?.birth_date ?? null);
  const [hireDate, setHireDate] = useState<string | null>(account?.hire_date ?? null);
  const [address, setAddress] = useState(account?.address ?? '');
  const [personalVehicleMake, setPersonalVehicleMake] = useState(account?.personal_vehicle_make ?? '');
  const [personalVehiclePlate, setPersonalVehiclePlate] = useState(account?.personal_vehicle_plate ?? '');
  const [role, setRole] = useState<AccountRole>(account?.role ?? 'dispatcher');
  // Роль задаётся один раз при заведении сотрудника и почти никогда не
  // меняется — у уже существующего аккаунта прячем переключатель за
  // кнопку «Изменить», чтобы не занимал место и не провоцировал случайный
  // клик. У нового аккаунта роль ещё не выбрана — показываем сразу.
  const [roleEditing, setRoleEditing] = useState(!account);
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
  const updateProfile = useUpdateAccountProfile();
  const saving = createAccount.isPending || updateAccount.isPending || updateProfile.isPending;
  const age = birthDate ? dayjs().diff(dayjs(birthDate), 'year') : null;

  const changeRole = (value: string) => {
    const next = value as AccountRole;
    setRole(next);
    // Новому аккаунту подставляем права по умолчанию для роли; у
    // существующего не трогаем — админ мог настроить их осознанно.
    if (!account) setPermissions(ROLE_DEFAULT_PERMISSIONS[next]);
  };

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Укажите имя');
    const vehicleForRole = role === 'driver' ? vehicleId : null;
    // Авто по умолчанию имеет смысл только у водителя — при другой роли
    // всегда отправляем null, чтобы очистить поле, если, скажем,
    // бывшего водителя переводят в диспетчеры.
    // null, не undefined: update-account теперь частично обновляет профиль
    // (не трогает поле, которого нет в теле запроса — нужно самому
    // сотруднику в мобильном "Мой профиль"), а JSON.stringify выбрасывает
    // ключи со значением undefined. Раз это поле есть в форме — очищенное
    // значение должно реально очищать поле в базе, а не оставлять старое.
    const profileFields = {
      name: name.trim(),
      last_name: lastName.trim() || null,
      phone: phone.trim() ? formatPhone(phone.trim()) : null,
      birth_date: birthDate,
      hire_date: hireDate,
      address: address.trim() || null,
      personal_vehicle_make: personalVehicleMake.trim() || null,
      personal_vehicle_plate: personalVehiclePlate.trim() || null,
    };
    try {
      if (account) {
        await updateProfile.mutateAsync({
          id: account.id,
          login: login.trim(),
          password: password || undefined,
          ...profileFields,
        });
        await updateAccount.mutateAsync({ id: account.id, role, permissions, default_vehicle_id: vehicleForRole });
      } else {
        await createAccount.mutateAsync({
          login: login.trim(),
          password,
          role,
          permissions,
          default_vehicle_id: vehicleForRole,
          ...profileFields,
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
        <SimpleGrid cols={2}>
          <TextInput label="Имя *" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          <TextInput label="Фамилия" value={lastName} onChange={(e) => setLastName(e.currentTarget.value)} />
          <TextInput
            label="Телефон"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            onBlur={() => phone.trim() && setPhone(formatPhone(phone.trim()))}
          />
          <TextInput
            label={account ? 'Логин' : 'Логин *'}
            description={
              account
                ? 'Латиница, цифры, точка, дефис, 3–32 символа. Пусто — логин не меняется'
                : 'Латиница, цифры, точка, дефис, 3–32 символа'
            }
            value={login}
            onChange={(e) => setLogin(e.currentTarget.value)}
          />
          <PasswordInput
            label={account ? 'Новый пароль' : 'Пароль *'}
            description={account ? 'Пусто — пароль не меняется' : 'Не короче 6 символов'}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
        </SimpleGrid>

        <Divider label="Данные сотрудника" labelPosition="left" />
        <SimpleGrid cols={3}>
          <div>
            <DatePickerInput
              label="Дата рождения"
              placeholder="Не указана"
              value={birthDate}
              onChange={setBirthDate}
              valueFormat="D MMMM YYYY"
              clearable
              popoverProps={{ zIndex: 500 }}
            />
            {age != null && (
              <Text size="xs" c="dimmed" mt={4}>
                {age} лет
              </Text>
            )}
          </div>
          <DatePickerInput
            label="Начало работы в компании"
            placeholder="Не указано"
            value={hireDate}
            onChange={setHireDate}
            valueFormat="D MMMM YYYY"
            clearable
            popoverProps={{ zIndex: 500 }}
          />
          <Textarea
            label="Адрес проживания"
            autosize
            minRows={1}
            value={address}
            onChange={(e) => setAddress(e.currentTarget.value)}
          />
        </SimpleGrid>
        <Text size="xs" c="dimmed">
          Личный транспорт (необязательно) — если сотрудник иногда добирается на нём до заказа.
        </Text>
        <SimpleGrid cols={2}>
          <TextInput
            label="Марка"
            value={personalVehicleMake}
            onChange={(e) => setPersonalVehicleMake(e.currentTarget.value)}
          />
          <TextInput
            label="Гос номер"
            value={personalVehiclePlate}
            onChange={(e) => setPersonalVehiclePlate(e.currentTarget.value.toUpperCase())}
          />
        </SimpleGrid>

        <Divider />
        <div>
          <Text size="sm" fw={500} mb={4}>
            Роль
          </Text>
          {roleEditing ? (
            <SegmentedControl
              fullWidth
              value={role}
              onChange={changeRole}
              data={ROLES.map((r) => ({ value: r, label: ACCOUNT_ROLE_LABELS[r] }))}
            />
          ) : (
            <Group justify="space-between">
              <Text size="sm">{ACCOUNT_ROLE_LABELS[role]}</Text>
              <Button variant="subtle" size="xs" onClick={() => setRoleEditing(true)}>
                Изменить
              </Button>
            </Group>
          )}
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
          <Button onClick={save} loading={saving}>
            {account ? 'Сохранить' : 'Создать аккаунт'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
