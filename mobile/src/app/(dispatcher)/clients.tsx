import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Dialog,
  Divider,
  FAB,
  HelperText,
  List,
  Portal,
  Searchbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { useClients, useCreateClient, useUpdateClient, type Client } from '../../api/clients';

// База клиентов (раздел 5 ТЗ): поиск, карточка с телефоном и персональной скидкой.
export default function ClientsScreen() {
  const [search, setSearch] = useState('');
  const clientsQuery = useClients(search);
  // null — диалог закрыт, 'new' — новый клиент, иначе редактируемый клиент.
  const [editing, setEditing] = useState<Client | 'new' | null>(null);

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
      <FAB icon="account-plus" label="Добавить" style={styles.fab} onPress={() => setEditing('new')} />
      {editing && (
        <ClientDialog client={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </View>
  );
}

function ClientDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [discountText, setDiscountText] = useState(client?.discount_percent ? String(client.discount_percent) : '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const saving = createClient.isPending || updateClient.isPending;

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Укажите имя клиента');
      return;
    }
    const discount = discountText.trim() ? Number(discountText.trim().replace(',', '.')) : 0;
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      setError('Скидка — число от 0 до 100');
      return;
    }
    const input = { name: name.trim(), phone: phone.trim(), discount_percent: discount, notes: notes.trim() };
    try {
      if (client) await updateClient.mutateAsync({ id: client.id, ...input });
      else await createClient.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить клиента');
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={onClose}>
        <Dialog.Title>{client ? 'Клиент' : 'Новый клиент'}</Dialog.Title>
        <Dialog.ScrollArea style={styles.dialogArea}>
          <View style={styles.dialogContent}>
            <TextInput mode="outlined" label="Имя" accessibilityLabel="Имя" value={name} onChangeText={setName} />
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
              label="Персональная скидка"
              accessibilityLabel="Персональная скидка"
              value={discountText}
              onChangeText={setDiscountText}
              keyboardType="numeric"
              right={<TextInput.Affix text="%" />}
            />
            <TextInput
              mode="outlined"
              label="Заметки"
              accessibilityLabel="Заметки"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
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
  dialogArea: {
    paddingHorizontal: 0,
  },
  dialogContent: {
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
});
