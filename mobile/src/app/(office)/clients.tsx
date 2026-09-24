import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Divider, FAB, HelperText, List, Searchbar, Text } from 'react-native-paper';
import { useClients, type Client } from '../../api/clients';
import { ClientDialog } from '../../components/clients/ClientDialog';
import { useNewClientFromContacts } from '../../hooks/useNewClientFromContacts';
import { useSession } from '../../providers/SessionProvider';
import { canViewClientPhone, canViewClientStats } from '../../lib/permissions';

// База клиентов (раздел 5 ТЗ): поиск, карточка с телефоном и персональной скидкой.
export default function ClientsScreen() {
  const [search, setSearch] = useState('');
  const clientsQuery = useClients(search);
  const [editing, setEditing] = useState<Client | null>(null);
  const newClient = useNewClientFromContacts();
  const { employee } = useSession();
  const canViewContacts = canViewClientPhone(employee);
  const canViewStats = canViewClientStats(employee);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Клиенты" />
      </Appbar.Header>
      <Searchbar
        style={styles.search}
        placeholder="Поиск по имени"
        value={search}
        onChangeText={setSearch}
      />
      {clientsQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={clientsQuery.data ?? []}
          keyExtractor={(c) => c.id}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            clientsQuery.isError ? <HelperText type="error">{clientsQuery.error.message}</HelperText> : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{search ? 'Никого не нашли.' : 'Клиентов пока нет.'}</Text>
          }
          renderItem={({ item }) => (
            <List.Item
              title={item.name}
              description={[
                canViewContacts ? item.phone : null,
                item.discount_percent ? `скидка ${item.discount_percent}%` : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined}
              left={(props) => <List.Icon {...props} icon="account-outline" />}
              onPress={() => setEditing(item)}
            />
          )}
        />
      )}
      <FAB icon="account-plus" label="Добавить" style={styles.fab} onPress={newClient.start} />
      {editing && (
        <ClientDialog
          client={editing}
          canViewContacts={canViewContacts}
          canViewStats={canViewStats}
          onClose={() => setEditing(null)}
        />
      )}
      {newClient.open && <ClientDialog client={null} onClose={newClient.close} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  search: {
    marginHorizontal: 12,
    marginVertical: 8,
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
