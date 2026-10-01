import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { loginInputToE164 } from '../lib/accountLogin';

// Вход только по телефону и паролю (Правки 6, п.1 — Максим явно попросил
// убрать переключение на логин/email, единственный способ входа). Старый
// запасной вариант «Войти по логину или email» убран: у аккаунтов, которым
// телефон ещё не синхронизирован на auth.users, он синхронизируется через
// Профиль (self-service, см. app/settings/profile.tsx и update-account) —
// администратора и владельца Максим попросил завести на конкретные номера
// до этой доработки, см. память проекта.
export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = phone.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const e164 = loginInputToE164(phone);
    if (!e164) {
      setError('Проверьте номер телефона');
      setSubmitting(false);
      return;
    }
    const { error: signInError } = await supabase.auth.signInWithPassword({ phone: e164, password });
    if (signInError) setError(signInError.message);
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text variant="headlineSmall" style={styles.title}>
          Вход
        </Text>
        <TextInput
          mode="outlined"
          label="Телефон"
          accessibilityLabel="Телефон"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          disabled={submitting}
        />
        <TextInput
          mode="outlined"
          label="Пароль"
          accessibilityLabel="Пароль"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          disabled={submitting}
          onSubmitEditing={handleSubmit}
        />
        <HelperText type="error" visible={Boolean(error)}>
          {error}
        </HelperText>
        <Button mode="contained" onPress={handleSubmit} loading={submitting} disabled={!canSubmit}>
          Войти
        </Button>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    marginBottom: 8,
  },
});
