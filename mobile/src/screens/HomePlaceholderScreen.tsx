import { Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function HomePlaceholderScreen({ session }: { session: Session }) {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Вы вошли</Text>
      <Text style={styles.text}>{session.user.email}</Text>
      <Text style={styles.hint}>Календарь диспетчера появится здесь на следующем шаге.</Text>
      <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonText}>Выйти</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  text: {
    fontSize: 15,
    color: '#333',
  },
  hint: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  button: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#c0392b',
    fontWeight: '600',
  },
});
