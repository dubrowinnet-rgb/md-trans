import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { loginInputToE164, loginInputToEmail } from '../lib/accountLogin';

// Вход по телефону и паролю (доработки 3, п.4 — логин сотрудникам больше не
// нужен). «Войти по логину или email» ниже — свёрнутый запасной вариант:
// нужен только аккаунту, которому ещё ни разу не синхронизировали телефон
// на auth.users (см. providers/SessionProvider.tsx), обычно это только
// самые старые учётки, заведённые до этой доработки. Специально не убираем
// совсем — иначе такой аккаунт разом потеряет способ войти.
export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [useLoginFallback, setUseLoginFallback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    (useLoginFallback ? login.trim().length > 0 : phone.trim().length > 0) &&
    password.length > 0 &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    if (useLoginFallback) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginInputToEmail(login),
        password,
      });
      if (signInError) setError(signInError.message);
      setSubmitting(false);
      return;
    }

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
        {useLoginFallback ? (
          <TextInput
            mode="outlined"
            label="Логин или email"
            accessibilityLabel="Логин или email"
            value={login}
            onChangeText={setLogin}
            autoCapitalize="none"
            autoComplete="username"
            disabled={submitting}
          />
        ) : (
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
        )}
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
        <Button compact onPress={() => setUseLoginFallback((v) => !v)} disabled={submitting}>
          {useLoginFallback ? 'Войти по телефону' : 'Войти по логину или email'}
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
