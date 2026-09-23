import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { loginInputToEmail } from '../lib/accountLogin';

export default function LoginScreen() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = login.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginInputToEmail(login),
      password,
    });

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
          label="Логин"
          accessibilityLabel="Логин"
          value={login}
          onChangeText={setLogin}
          autoCapitalize="none"
          autoComplete="username"
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
