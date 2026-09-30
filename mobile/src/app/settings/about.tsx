import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Appbar, List, Text } from 'react-native-paper';

// «О приложении» (Максим, 30.09, «Правки 3», п.5, по образцу référence
// Bumpix) — версия берётся из app.json динамически, а не хардкодом, чтобы
// не расходилась при следующих релизах. Ссылок на видео-уроки и FAQ пока
// нет — Максим их не присылал, показывать несуществующие ссылки не стали;
// добавить, когда появится, что на них ставить.
export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="О приложении" />
      </Appbar.Header>
      <View style={styles.hero}>
        {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
        <Image source={require('../../../assets/images/icon.png')} style={styles.icon} />
        <Text variant="headlineSmall">Мурзик</Text>
        <Text variant="bodyMedium" style={styles.tagline}>
          Всё под лапой
        </Text>
        <Text variant="bodySmall" style={styles.version}>{`Версия ${version}`}</Text>
      </View>
      <List.Section>
        <List.Item
          title="Служба поддержки"
          description="support@myrzik.ru"
          left={(props) => <List.Icon {...props} icon="email-outline" />}
        />
        <List.Item
          title="Политика конфиденциальности"
          left={(props) => <List.Icon {...props} icon="shield-outline" />}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => router.push('/settings/privacy-policy')}
        />
      </List.Section>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 2,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: 8,
  },
  tagline: {
    opacity: 0.6,
  },
  version: {
    opacity: 0.5,
    marginTop: 8,
  },
});
