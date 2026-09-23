import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Divider, FAB, HelperText, List, Text } from 'react-native-paper';
import { useVehicles, type Vehicle } from '../../api/vehicles';
import { VehicleDialog } from '../../components/vehicles/VehicleDialog';

function describeVehicle(vehicle: Vehicle) {
  const parts: string[] = [];
  if (vehicle.capacity_kg) parts.push(`${vehicle.capacity_kg} кг`);
  const checkpoints = [
    vehicle.top_loading && 'верх. погрузка',
    vehicle.side_loading && 'бок. погрузка',
    vehicle.moscow_center_pass && 'пропуск в центр',
  ].filter(Boolean) as string[];
  parts.push(...checkpoints);
  return parts.join(' · ');
}

// Автопарк (раздел «автопарк») — список машин, заполняет админ или
// диспетчер. Машина назначается водителю по умолчанию в «Команде» и
// подставляется в заказ, где её можно сменить.
export default function FleetScreen() {
  const vehiclesQuery = useVehicles();
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Автопарк" />
      </Appbar.Header>
      {vehiclesQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={vehiclesQuery.data ?? []}
          keyExtractor={(v) => v.id}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            vehiclesQuery.isError ? <HelperText type="error">{vehiclesQuery.error.message}</HelperText> : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Машин пока нет.</Text>}
          renderItem={({ item }) => (
            <List.Item
              title={`${item.name} · ${item.plate}`}
              description={describeVehicle(item) || undefined}
              left={(props) => <List.Icon {...props} icon="truck-outline" />}
              onPress={() => setEditing(item)}
            />
          )}
        />
      )}
      <FAB icon="plus" label="Добавить" style={styles.fab} onPress={() => setAdding(true)} />
      {editing && (
        <VehicleDialog vehicle={editing} onClose={() => setEditing(null)} onDeleted={() => setEditing(null)} />
      )}
      {adding && <VehicleDialog vehicle={null} onClose={() => setAdding(false)} />}
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
