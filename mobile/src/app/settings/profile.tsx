import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { Appbar, Button, Divider, HelperText, Snackbar, Text, TextInput } from 'react-native-paper';
import { useUpdateOwnProfile } from '../../api/accounts';
import { useSession } from '../../providers/SessionProvider';
import { ACCOUNT_ROLE_LABELS } from '../../theme';

// «Мой профиль» (доработки 1, п.2) — сотрудник сам меняет логин/телефон/
// пароль, доступно любой роли. «Оплата профиля» — уже существующее
// employees.paid_until (миграция 0001), просто раньше не было экрана,
// который его показывает; «Продлить» — заглушка, как и просил Максим.
export default function ProfileSettingsScreen() {
  const { employee } = useSession();
  const updateProfile = useUpdateOwnProfile();
  const [login, setLogin] = useState(employee?.login ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  if (!employee) return null;

  const handleSave = async () => {
    setError(null);
    try {
      await updateProfile.mutateAsync({ id: employee.id, login: login.trim(), phone: phone.trim(), password });
      setPassword('');
      setSnackbar('Сохранено');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Мой профиль" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="titleMedium">{[employee.name, employee.last_name].filter(Boolean).join(' ')}</Text>
        <Text variant="bodyMedium" style={styles.role}>
          {ACCOUNT_ROLE_LABELS[employee.role]}
        </Text>

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
          label="Телефон"
          accessibilityLabel="Телефон"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <TextInput
          mode="outlined"
          label="Новый пароль"
          accessibilityLabel="Новый пароль"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <HelperText type="info">Оставьте пустым, чтобы не менять пароль</HelperText>
        {error && <HelperText type="error">{error}</HelperText>}
        <Button mode="contained" onPress={handleSave} loading={updateProfile.isPending} disabled={updateProfile.isPending}>
          Сохранить
        </Button>

        <Divider style={styles.divider} />
        <Text variant="labelLarge">Оплата профиля</Text>
        <Text variant="bodyMedium" style={styles.paidUntil}>
          {employee.paid_until
            ? `Оплачено до ${format(new Date(employee.paid_until), 'dd.MM.yyyy')}`
            : 'Дата оплаты не задана'}
        </Text>
        <Button mode="outlined" onPress={() => setSnackbar('Онлайн-оплата скоро появится')}>
          Продлить
        </Button>
      </ScrollView>
      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar(null)} duration={2500}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 4,
  },
  role: {
    opacity: 0.7,
    marginBottom: 12,
  },
  divider: {
    marginVertical: 20,
  },
  paidUntil: {
    marginBottom: 12,
  },
});
