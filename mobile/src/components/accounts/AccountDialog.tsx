import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Dialog, Divider, HelperText, Portal, SegmentedButtons, Switch, Text, TextInput } from 'react-native-paper';
import { useCreateAccount, useUpdateAccount, type Account, type AccountPermissions } from '../../api/accounts';
import type { AccountRole } from '../../types/database';
import { ACCOUNT_ROLE_LABELS } from '../../theme';

const ROLE_OPTIONS: { value: AccountRole; label: string }[] = [
  { value: 'admin', label: ACCOUNT_ROLE_LABELS.admin },
  { value: 'dispatcher', label: ACCOUNT_ROLE_LABELS.dispatcher },
  { value: 'driver', label: ACCOUNT_ROLE_LABELS.driver },
  { value: 'loader', label: ACCOUNT_ROLE_LABELS.loader },
];

const DEFAULT_PERMISSIONS: AccountPermissions = {
  can_manage_orders: true,
  can_view_client_stats: true,
  can_view_contacts_and_amounts: true,
};

// Один диалог на создание (account === null, спрашивает логин и пароль —
// их задаёт администратор, раздел «разделить входы») и на редактирование
// роли и прав уже существующего аккаунта.
export function AccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const saving = createAccount.isPending || updateAccount.isPending;

  const [name, setName] = useState(account?.name ?? '');
  const [login, setLogin] = useState(account?.login ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AccountRole>(account?.role ?? 'dispatcher');
  const [permissions, setPermissions] = useState<AccountPermissions>(
    account
      ? {
          can_manage_orders: account.can_manage_orders,
          can_view_client_stats: account.can_view_client_stats,
          can_view_contacts_and_amounts: account.can_view_contacts_and_amounts,
        }
      : DEFAULT_PERMISSIONS
  );
  const [error, setError] = useState<string | null>(null);

  const togglePermission = (key: keyof AccountPermissions) =>
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async () => {
    setError(null);
    try {
      if (account) {
        await updateAccount.mutateAsync({ id: account.id, role, permissions });
      } else {
        if (!name.trim()) throw new Error('Укажите имя');
        await createAccount.mutateAsync({
          login: login.trim(),
          password,
          name: name.trim(),
          phone: phone.trim() || undefined,
          role,
          permissions,
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
          <View style={styles.content}>
            {!account && (
              <>
                <TextInput mode="outlined" label="Имя" accessibilityLabel="Имя" value={name} onChangeText={setName} />
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
                <HelperText type="info">Латиница, цифры, точка, дефис или подчёркивание, 3–32 символа</HelperText>
                <TextInput
                  mode="outlined"
                  label="Пароль"
                  accessibilityLabel="Пароль"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </>
            )}

            <Text variant="labelLarge">Роль</Text>
            <SegmentedButtons
              value={role}
              onValueChange={(value) => setRole(value as AccountRole)}
              buttons={ROLE_OPTIONS.slice(0, 2)}
            />
            <SegmentedButtons
              value={role}
              onValueChange={(value) => setRole(value as AccountRole)}
              buttons={ROLE_OPTIONS.slice(2)}
            />

            {role === 'admin' ? (
              <Text variant="bodySmall" style={styles.muted}>
                У администратора всегда полный доступ.
              </Text>
            ) : (
              <>
                <Divider style={styles.divider} />
                <Text variant="labelLarge">Права доступа</Text>
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
                  label="Видеть контакты и суммы заказов"
                  value={permissions.can_view_contacts_and_amounts}
                  onChange={() => togglePermission('can_view_contacts_and_amounts')}
                />
              </>
            )}
            {error && <HelperText type="error">{error}</HelperText>}
          </View>
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
    paddingVertical: 8,
  },
  muted: {
    opacity: 0.6,
  },
  divider: {
    marginVertical: 4,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  permissionLabel: {
    flex: 1,
  },
});
