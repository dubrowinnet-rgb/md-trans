import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Divider, FAB, HelperText, List, Text } from 'react-native-paper';
import { useAllAccounts, type Account } from '../../api/accounts';
import { AccountDialog } from '../../components/accounts/AccountDialog';
import { ACCOUNT_ROLE_ICONS, ACCOUNT_ROLE_LABELS } from '../../theme';

// Экран администратора: все аккаунты (свои же админы, диспетчеры,
// водители, грузчики), с логином/паролем и правами доступа для каждого
// (раздел «разделить входы»). Видна только роли admin — см. (office)/_layout.tsx.
export default function TeamScreen() {
  const accountsQuery = useAllAccounts();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Команда" />
      </Appbar.Header>
      {accountsQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={accountsQuery.data ?? []}
          keyExtractor={(a) => a.id}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            accountsQuery.isError ? <HelperText type="error">{accountsQuery.error.message}</HelperText> : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Пока никого нет.</Text>}
          renderItem={({ item }) => (
            <List.Item
              title={item.name}
              description={`${ACCOUNT_ROLE_LABELS[item.role]}${item.login ? ` · ${item.login}` : ''}${item.phone ? ` · ${item.phone}` : ''}`}
              left={(props) => <List.Icon {...props} icon={ACCOUNT_ROLE_ICONS[item.role]} />}
              onPress={() => setEditing(item)}
            />
          )}
        />
      )}
      <FAB icon="account-plus" label="Добавить" style={styles.fab} onPress={() => setEditing('new')} />
      {editing && (
        <AccountDialog account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    marginTop: 32,
  },
  list: {
    paddingBottom: 96,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
