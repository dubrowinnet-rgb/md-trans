import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Chip,
  Dialog,
  Divider,
  HelperText,
  IconButton,
  Portal,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import { differenceInYears, format } from 'date-fns';
import {
  useCreateAccount,
  useUpdateAccount,
  useUpdateAccountProfile,
  type Account,
  type AccountPermissions,
} from '../../api/accounts';
import { useVehicles } from '../../api/vehicles';
import type { AccountRole } from '../../types/database';
import { ACCOUNT_ROLE_LABELS } from '../../theme';
import { DismissKeyboardView } from '../form/DismissKeyboardView';

const ROLE_OPTIONS: { value: AccountRole; label: string }[] = [
  { value: 'admin', label: ACCOUNT_ROLE_LABELS.admin },
  { value: 'dispatcher', label: ACCOUNT_ROLE_LABELS.dispatcher },
  { value: 'driver', label: ACCOUNT_ROLE_LABELS.driver },
  { value: 'loader', label: ACCOUNT_ROLE_LABELS.loader },
];

// Права по умолчанию при создании нового аккаунта — по роли (раздел
// «права и доступы»): администратору и диспетчеру полный доступ,
// водителю — видимость контактов и сумм, но без полного управления
// заказами (у него своё, более узкое право — редактировать время и
// сумму, оно не выключается галочкой, см. lib/permissions.ts), грузчику —
// только просмотр. Админ может донастроить это на конкретном аккаунте.
const ROLE_DEFAULT_PERMISSIONS: Record<AccountRole, AccountPermissions> = {
  admin: {
    can_manage_orders: true,
    can_view_client_stats: true,
    can_view_contacts_and_amounts: true,
    can_manage_own_schedule: true,
  },
  dispatcher: {
    can_manage_orders: true,
    can_view_client_stats: true,
    can_view_contacts_and_amounts: true,
    can_manage_own_schedule: false,
  },
  driver: {
    can_manage_orders: false,
    can_view_client_stats: false,
    can_view_contacts_and_amounts: true,
    can_manage_own_schedule: false,
  },
  loader: {
    can_manage_orders: false,
    can_view_client_stats: false,
    can_view_contacts_and_amounts: false,
    can_manage_own_schedule: false,
  },
};

function parseDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

// Дата, которую можно очистить (не обязана быть заполнена) — обычный
// DateTimeField этого не умеет, ему дата всегда нужна.
function ProfileDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.dateField}>
      <Text variant="labelMedium">{label}</Text>
      <View style={styles.dateRow}>
        <Button mode="outlined" icon="calendar" onPress={() => setOpen(true)} style={styles.flex}>
          {value ? format(value, 'dd.MM.yyyy') : 'Не указано'}
        </Button>
        {value && (
          <IconButton icon="close" accessibilityLabel={`Очистить поле «${label}»`} onPress={() => onChange(null)} />
        )}
      </View>
      <DatePickerModal
        locale="ru"
        mode="single"
        visible={open}
        date={value ?? undefined}
        onDismiss={() => setOpen(false)}
        onConfirm={({ date }) => {
          setOpen(false);
          if (date) onChange(date);
        }}
      />
    </View>
  );
}

// Один диалог на создание (account === null, спрашивает логин и пароль —
// их задаёт администратор, раздел «разделить входы») и на редактирование
// уже существующего аккаунта: раньше при редактировании было видно только
// роль и права, а имя/телефон/логин/пароль и профиль сотрудника менять
// было негде — теперь то же самое доступно и здесь.
export function AccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const updateProfile = useUpdateAccountProfile();
  const saving = createAccount.isPending || updateAccount.isPending || updateProfile.isPending;

  const [name, setName] = useState(account?.name ?? '');
  const [lastName, setLastName] = useState(account?.last_name ?? '');
  const [login, setLogin] = useState(account?.login ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(parseDate(account?.birth_date ?? null));
  const [hireDate, setHireDate] = useState<Date | null>(parseDate(account?.hire_date ?? null));
  const [address, setAddress] = useState(account?.address ?? '');
  const [personalVehicleMake, setPersonalVehicleMake] = useState(account?.personal_vehicle_make ?? '');
  const [personalVehiclePlate, setPersonalVehiclePlate] = useState(account?.personal_vehicle_plate ?? '');
  const [role, setRole] = useState<AccountRole>(account?.role ?? 'dispatcher');
  // Роль выбирается один раз при заведении сотрудника и почти никогда не
  // меняется — на редактировании селектор свёрнут в строку с кнопкой
  // «Изменить», а не всегда раскрыт (раздел «баги 3», п.5). На создании
  // роль ещё не выбрана, так что селектор открыт сразу.
  const [roleEditing, setRoleEditing] = useState(!account);
  const [permissions, setPermissions] = useState<AccountPermissions>(
    account
      ? {
          can_manage_orders: account.can_manage_orders,
          can_view_client_stats: account.can_view_client_stats,
          can_view_contacts_and_amounts: account.can_view_contacts_and_amounts,
          can_manage_own_schedule: account.can_manage_own_schedule,
        }
      : ROLE_DEFAULT_PERMISSIONS[role]
  );
  const [defaultVehicleId, setDefaultVehicleId] = useState<string | null>(account?.default_vehicle_id ?? null);
  const [error, setError] = useState<string | null>(null);
  const vehiclesQuery = useVehicles();

  const age = birthDate ? differenceInYears(new Date(), birthDate) : null;

  const togglePermission = (key: keyof AccountPermissions) =>
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));

  // Смена роли в форме создания подставляет права по умолчанию для новой
  // роли — иначе, скажем, у только что выбранного грузчика остались бы
  // права диспетчера. При правке существующего аккаунта права не трогаем:
  // администратор мог их уже осознанно донастроить.
  const handleRoleChange = (value: string) => {
    const nextRole = value as AccountRole;
    setRole(nextRole);
    if (!account) setPermissions(ROLE_DEFAULT_PERMISSIONS[nextRole]);
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Укажите имя');
      return;
    }
    try {
      // Авто по умолчанию имеет смысл только у водителя — при другой роли
      // всегда отправляем null, чтобы очистить поле, если админ, скажем,
      // переводит бывшего водителя в диспетчеры.
      const vehicleForRole = role === 'driver' ? defaultVehicleId : null;
      const profileFields = {
        name: name.trim(),
        last_name: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        birth_date: birthDate ? format(birthDate, 'yyyy-MM-dd') : null,
        hire_date: hireDate ? format(hireDate, 'yyyy-MM-dd') : null,
        address: address.trim() || undefined,
        personal_vehicle_make: personalVehicleMake.trim() || undefined,
        personal_vehicle_plate: personalVehiclePlate.trim() || undefined,
      };
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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={onClose} style={styles.dialog}>
        <Dialog.Title>{account ? account.name : 'Новый аккаунт'}</Dialog.Title>
        <Dialog.ScrollArea style={styles.area}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <DismissKeyboardView style={styles.content}>
              <>
                <TextInput mode="outlined" label="Имя" accessibilityLabel="Имя" value={name} onChangeText={setName} />
                <TextInput
                  mode="outlined"
                  label="Фамилия"
                  accessibilityLabel="Фамилия"
                  value={lastName}
                  onChangeText={setLastName}
                />
                <TextInput
                  mode="outlined"
                  label="Телефон (необязательно)"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
                <TextInput
                  mode="outlined"
                  label="Логин"
                  accessibilityLabel="Логин"
                  value={login}
                  onChangeText={setLogin}
                  autoCapitalize="none"
                />
                <HelperText type="info">
                  {account
                    ? 'Латиница, цифры, точка, дефис или подчёркивание, 3–32 символа. Пусто — логин не меняется.'
                    : 'Латиница, цифры, точка, дефис или подчёркивание, 3–32 символа'}
                </HelperText>
                <TextInput
                  mode="outlined"
                  label={account ? 'Новый пароль' : 'Пароль'}
                  accessibilityLabel={account ? 'Новый пароль' : 'Пароль'}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
                {account && <HelperText type="info">Оставьте пустым, чтобы не менять пароль</HelperText>}

                <Divider style={styles.divider} />
                <Text variant="labelLarge">Данные сотрудника</Text>
                <View style={styles.dateRow2}>
                  <ProfileDateField label="Дата рождения" value={birthDate} onChange={setBirthDate} />
                  {age != null && (
                    <Text variant="bodySmall" style={styles.age}>{`${age} лет`}</Text>
                  )}
                </View>
                <ProfileDateField label="Начало работы в компании" value={hireDate} onChange={setHireDate} />
                <TextInput
                  mode="outlined"
                  label="Адрес проживания"
                  accessibilityLabel="Адрес проживания"
                  value={address}
                  onChangeText={setAddress}
                  multiline
                />
                <Text variant="bodySmall" style={styles.muted}>
                  Личный транспорт (необязательно) — если сотрудник иногда добирается на нём до заказа.
                </Text>
                <TextInput
                  mode="outlined"
                  label="Марка"
                  accessibilityLabel="Марка личного транспорта"
                  value={personalVehicleMake}
                  onChangeText={setPersonalVehicleMake}
                />
                <TextInput
                  mode="outlined"
                  label="Гос номер"
                  accessibilityLabel="Гос номер личного транспорта"
                  value={personalVehiclePlate}
                  onChangeText={setPersonalVehiclePlate}
                  autoCapitalize="characters"
                />

                <Divider style={styles.divider} />
                <Text variant="labelLarge">Роль</Text>
                {roleEditing ? (
                  <>
                    <SegmentedButtons value={role} onValueChange={handleRoleChange} buttons={ROLE_OPTIONS.slice(0, 2)} />
                    <SegmentedButtons value={role} onValueChange={handleRoleChange} buttons={ROLE_OPTIONS.slice(2)} />
                    {account && (
                      <HelperText type="info">
                        Роль обычно назначается один раз и не меняется — проверьте перед сохранением.
                      </HelperText>
                    )}
                  </>
                ) : (
                  <View style={styles.roleRow}>
                    <Text variant="bodyMedium" style={styles.flex}>
                      {ACCOUNT_ROLE_LABELS[role]}
                    </Text>
                    <Button compact onPress={() => setRoleEditing(true)}>
                      Изменить
                    </Button>
                  </View>
                )}

                {role === 'driver' && (
                  <>
                    <Divider style={styles.divider} />
                    <Text variant="labelLarge">Авто по умолчанию</Text>
                    <Text variant="bodySmall" style={styles.muted}>
                      Диспетчер сможет назначить другое авто на конкретный заказ.
                    </Text>
                    <View style={styles.chipRow}>
                      <Chip selected={defaultVehicleId === null} onPress={() => setDefaultVehicleId(null)} style={styles.chip}>
                        Не назначено
                      </Chip>
                      {(vehiclesQuery.data ?? []).map((vehicle) => (
                        <Chip
                          key={vehicle.id}
                          selected={defaultVehicleId === vehicle.id}
                          onPress={() => setDefaultVehicleId(vehicle.id)}
                          style={styles.chip}
                        >
                          {`${vehicle.name} · ${vehicle.plate}`}
                        </Chip>
                      ))}
                    </View>
                  </>
                )}

                {role === 'admin' ? (
                  <Text variant="bodySmall" style={styles.muted}>
                    У администратора всегда полный доступ.
                  </Text>
                ) : (
                  <>
                    <Divider style={styles.divider} />
                    <Text variant="labelLarge">Права доступа</Text>
                    {role === 'driver' && (
                      <Text variant="bodySmall" style={styles.muted}>
                        Без «Создавать, редактировать и удалять заказы» водитель всё равно может
                        поменять время и сумму своего заказа — остальное только смотрит.
                      </Text>
                    )}
                    {role === 'loader' && (
                      <Text variant="bodySmall" style={styles.muted}>
                        Грузчик всегда только смотрит заказ и не видит сумму. Телефон клиента видит,
                        если в бригаде заказа нет водителя, либо всегда — если включить ниже.
                      </Text>
                    )}
                    <PermissionRow
                      label="Создавать, редактировать и удалять заказы"
                      value={permissions.can_manage_orders}
                      onChange={() => togglePermission('can_manage_orders')}
                    />
                    <PermissionRow
                      label="Смотреть историю и статистику по клиентам"
                      value={permissions.can_view_client_stats}
                      onChange={() => togglePermission('can_view_client_stats')}
                    />
                    <PermissionRow
                      label={role === 'loader' ? 'Видеть телефон клиента всегда' : 'Видеть контакты и суммы заказов'}
                      value={permissions.can_view_contacts_and_amounts}
                      onChange={() => togglePermission('can_view_contacts_and_amounts')}
                    />
                    {(role === 'driver' || role === 'loader') && (
                      <PermissionRow
                        label="Может сам ставить себе выходные"
                        value={permissions.can_manage_own_schedule}
                        onChange={() => togglePermission('can_manage_own_schedule')}
                      />
                    )}
                  </>
                )}
                {error && <HelperText type="error">{error}</HelperText>}
              </>
            </DismissKeyboardView>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onClose}>Отмена</Button>
          <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving}>
            Сохранить
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function PermissionRow({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <View style={styles.permissionRow}>
      <Text variant="bodyMedium" style={styles.permissionLabel}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '90%',
  },
  area: {
    paddingHorizontal: 0,
  },
  content: {
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 8,
    // Больше воздуха снизу, чем сверху: иначе последнее поле упирается в
    // «Сохранить»/«Отмена» вплотную под ним (раздел «баги», п.8).
    paddingBottom: 24,
  },
  flex: {
    flex: 1,
  },
  muted: {
    opacity: 0.6,
  },
  divider: {
    marginVertical: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    marginBottom: 4,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  permissionLabel: {
    flex: 1,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateField: {
    gap: 4,
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateRow2: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  age: {
    opacity: 0.6,
    marginBottom: 12,
  },
});
