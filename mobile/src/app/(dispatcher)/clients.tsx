import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Divider, FAB, HelperText, List, Searchbar, Text } from 'react-native-paper';
import { useClients, type Client } from '../../api/clients';
import { ClientDialog } from '../../components/clients/ClientDialog';
import { useNewClientFromContacts } from '../../hooks/useNewClientFromContacts';

// База клиентов (раздел 5 ТЗ): поиск, карточка с телефоном и персональной скидкой.
export default function ClientsScreen() {
  const [search, setSearch] = useState('');
  const clientsQuery = useClients(search);
  const [editing, setEditing] = useState<Client | null>(null);
  const newClient = useNewClientFromContacts();

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
              description={[item.phone, item.discount_percent ? `скидка ${item.discount_percent}%` : null]
                .filter(Boolean)
                .join(' · ') || undefined}
              left={(props) => <List.Icon {...props} icon="account-outline" />}
              onPress={() => setEditing(item)}
            />
          )}
        />
      )}
      <FAB
        icon="account-plus"
        label="Добавить"
        style={styles.fab}
        loading={newClient.picking}
        onPress={newClient.start}
      />
      {editing && <ClientDialog client={editing} onClose={() => setEditing(null)} />}
      {newClient.draft && (
        <ClientDialog client={null} initial={newClient.draft} notice={newClient.notice} onClose={newClient.close} />
      )}
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
