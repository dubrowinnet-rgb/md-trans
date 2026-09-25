import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ActivityIndicator, Appbar, Divider, FAB, HelperText, List, Text } from 'react-native-paper';
import { useServices, type Service } from '../../api/services';
import { ServiceDialog } from '../../components/services/ServiceDialog';

export default function ServicesSettingsScreen() {
  const servicesQuery = useServices();
  const [editing, setEditing] = useState<Service | 'new' | null>(null);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Услуги" />
      </Appbar.Header>
      {servicesQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={servicesQuery.data ?? []}
          keyExtractor={(s) => s.id}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            servicesQuery.isError ? <HelperText type="error">{servicesQuery.error.message}</HelperText> : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Пока нет ни одной услуги.</Text>}
          renderItem={({ item }) => (
            <List.Item
              title={item.name}
              description={[
                item.base_duration_minutes ? `${item.base_duration_minutes} мин` : null,
                item.base_price != null ? `${item.base_price} ₽` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              left={(props) => <List.Icon {...props} icon={() => <View style={[styles.dot, { backgroundColor: item.color }]} />} />}
              onPress={() => setEditing(item)}
            />
          )}
        />
      )}
      <FAB icon="plus" label="Добавить" style={styles.fab} onPress={() => setEditing('new')} />
      {editing && <ServiceDialog service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
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
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignSelf: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
