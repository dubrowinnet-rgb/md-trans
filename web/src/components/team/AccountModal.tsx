'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
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
import { useEmployeePayEstimate, useUpdateEmployeeRates, type EmployeeRates, type RateMode } from '@/api/payroll';
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
  const [rateMode, setRateMode] = useState<RateMode>(account?.rate_mode ?? 'combined');
  const [hourlyRate, setHourlyRate] = useState<number | string>(account?.hourly_rate ?? '');
  const [drivingHourlyRate, setDrivingHourlyRate] = useState<number | string>(account?.driving_hourly_rate ?? '');
  const [loadingHourlyRate, setLoadingHourlyRate] = useState<number | string>(account?.loading_hourly_rate ?? '');
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
  const updateEmployeeRates = useUpdateEmployeeRates();
  const saving = createAccount.isPending || updateAccount.isPending || updateProfile.isPending || updateEmployeeRates.isPending;
  // Расчёт за текущий месяц по уже сохранённым ставкам (не по
  // несохранённым правкам в форме — во избежание путаницы, что именно
  // посчитано). Виден только у уже существующего сотрудника: у нового
  // ставки ещё нечем считать, часов пока нет.
  const savedRates: EmployeeRates = {
    rate_mode: account?.rate_mode ?? 'combined',
    hourly_rate: account?.hourly_rate ?? null,
    driving_hourly_rate: account?.driving_hourly_rate ?? null,
    loading_hourly_rate: account?.loading_hourly_rate ?? null,
  };
  const periodStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const periodEnd = dayjs().startOf('month').add(1, 'month').format('YYYY-MM-DD');
  const payEstimate = useEmployeePayEstimate(account?.id, savedRates, periodStart, periodEnd);
  const age = birthDate ? dayjs().diff(dayjs(birthDate), 'year') : null;

  const changeRole = (value: string) => {
    const next = value as AccountRole;
    setRole(next);
    // Новому аккаунту подставляем права по умолчанию для роли; у
    // существующего не трогаем — админ мог настроить их осознанно.
    if (!account) setPermissions(ROLE_DEFAULT_PERMISSIONS[next]);
  };

  const isAdminRole = role === 'admin';
  const isCrew = role === 'driver' || role === 'loader';

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Укажите имя');
    const vehicleForRole = role === 'driver' ? vehicleId : null;
    // Ставки применимы только водителю/грузчику — при другой роли шлём
    // null-ы, чтобы не оставлять висящую ставку у диспетчера/админа,
    // если роль сменили.
    const rates = {
      rate_mode: rateMode,
      hourly_rate: isCrew && hourlyRate !== '' ? Number(hourlyRate) : null,
      driving_hourly_rate: isCrew && rateMode === 'split' && drivingHourlyRate !== '' ? Number(drivingHourlyRate) : null,
      loading_hourly_rate: isCrew && rateMode === 'split' && loadingHourlyRate !== '' ? Number(loadingHourlyRate) : null,
    };
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
    // Ставки — отдельный запрос (см. useUpdateEmployeeRates), той же кнопкой.
    const saveRates = async (id: string) => {
      await updateEmployeeRates.mutateAsync({ id, rates });
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
        // Помимо самих водителей/грузчиков, шлём и когда у аккаунта раньше
        // уже была сохранена ставка — иначе при смене роли в диспетчеры
        // старая ставка так и останется висеть в базе.
        const hadRates = Boolean(account?.hourly_rate || account?.driving_hourly_rate || account?.loading_hourly_rate);
        if (isCrew || hadRates) await saveRates(account.id);
      } else {
        const created = await createAccount.mutateAsync({
          login: login.trim(),
          password,
          role,
          permissions,
          default_vehicle_id: vehicleForRole,
          ...profileFields,
        });
        if (isCrew) await saveRates(created.id);
      }
      notifications.show({ message: 'Аккаунт сохранён', color: 'green' });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить'));
    }
  };

  return (
    <Modal opened onClose={onClose} size="lg" title={<Title order={4} component="span">{account ? account.name : 'Новый аккаунт'}</Title>}>
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
        {isCrew && (
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Ставка за час
            </Text>
            {role === 'driver' && (
              <SegmentedControl
                value={rateMode}
                onChange={(v) => setRateMode(v as RateMode)}
                data={[
                  { value: 'combined', label: 'Общая ставка' },
                  { value: 'split', label: 'Раздельно вождение/погрузка' },
                ]}
              />
            )}
            {role === 'driver' && rateMode === 'split' ? (
              <SimpleGrid cols={2}>
                <NumberInput
                  label="За час вождения, ₽"
                  min={0}
                  value={drivingHourlyRate}
                  onChange={setDrivingHourlyRate}
                />
                <NumberInput
                  label="За час погрузки, ₽"
                  min={0}
                  value={loadingHourlyRate}
                  onChange={setLoadingHourlyRate}
                />
              </SimpleGrid>
            ) : (
              <NumberInput label="За час, ₽" min={0} value={hourlyRate} onChange={setHourlyRate} maw={220} />
            )}
            {account && (
              <Text size="xs" c="dimmed">
                За {dayjs().format('MMMM')}: {payEstimate.isLoading ? '…' : `${payEstimate.data?.estimate.hours ?? 0} ч × ставка ≈ ${payEstimate.data?.estimate.pay ?? 0} ₽`}
              </Text>
            )}
          </Stack>
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
