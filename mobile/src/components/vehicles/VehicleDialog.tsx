import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, Switch, Text, TextInput } from 'react-native-paper';
import { useCreateVehicle, useDeleteVehicle, useUpdateVehicle, type Vehicle, type VehicleInput } from '../../api/vehicles';

// Создание и правка машины автопарка (раздел «автопарк»). Обязательны
// только название и гос номер — остальное можно дозаполнить позже.
// onDeleted — вызывается после успешного удаления существующей машины,
// чтобы список закрыл диалог; для создания новой машины не передаётся.
export function VehicleDialog({
  vehicle,
  onClose,
  onDeleted,
}: {
  vehicle: Vehicle | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();
  const saving = createVehicle.isPending || updateVehicle.isPending;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState(vehicle?.name ?? '');
  const [plate, setPlate] = useState(vehicle?.plate ?? '');
  const [capacityText, setCapacityText] = useState(vehicle?.capacity_kg != null ? String(vehicle.capacity_kg) : '');
  const [bodyDimensions, setBodyDimensions] = useState(vehicle?.body_dimensions ?? '');
  const [palletsText, setPalletsText] = useState(
    vehicle?.europallet_count != null ? String(vehicle.europallet_count) : ''
  );
  const [topLoading, setTopLoading] = useState(vehicle?.top_loading ?? false);
  const [sideLoading, setSideLoading] = useState(vehicle?.side_loading ?? false);
  const [moscowCenterPass, setMoscowCenterPass] = useState(vehicle?.moscow_center_pass ?? false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!name.trim() || !plate.trim()) {
      setError('Укажите название и гос номер');
      return;
    }
    const input: VehicleInput = {
      name: name.trim(),
      plate: plate.trim(),
      capacity_kg: capacityText.trim() ? Number(capacityText.trim().replace(',', '.')) : null,
      body_dimensions: bodyDimensions.trim(),
      europallet_count: palletsText.trim() ? Number(palletsText.trim()) : null,
      top_loading: topLoading,
      side_loading: sideLoading,
      moscow_center_pass: moscowCenterPass,
    };
    try {
      if (vehicle) {
        await updateVehicle.mutateAsync({ id: vehicle.id, ...input });
      } else {
        await createVehicle.mutateAsync(input);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  };

  const handleDelete = async () => {
    if (!vehicle) return;
    try {
      await deleteVehicle.mutateAsync(vehicle.id);
      setConfirmDelete(false);
      onDeleted?.();
    } catch (err) {
      setConfirmDelete(false);
      setError(err instanceof Error ? err.message : 'Не удалось удалить');
    }
  };

  return (
    <Portal>
      <Dialog visible={!confirmDelete} onDismiss={onClose} style={styles.dialog}>
        <Dialog.Title>{vehicle ? vehicle.name : 'Новая машина'}</Dialog.Title>
        <Dialog.ScrollArea style={styles.area}>
          <View style={styles.content}>
            <TextInput mode="outlined" label="Название *" accessibilityLabel="Название" value={name} onChangeText={setName} />
            <TextInput
              mode="outlined"
              label="Гос номер *"
              accessibilityLabel="Гос номер"
              value={plate}
              onChangeText={setPlate}
              autoCapitalize="characters"
            />
            <TextInput
              mode="outlined"
              label="Грузоподъёмность, кг"
              value={capacityText}
              onChangeText={setCapacityText}
              keyboardType="numeric"
            />
            <TextInput
              mode="outlined"
              label="Размеры кузова"
              placeholder="Например: 4×2×2 м"
              value={bodyDimensions}
              onChangeText={setBodyDimensions}
            />
            <TextInput
              mode="outlined"
              label="Европаллет, шт"
              value={palletsText}
              onChangeText={setPalletsText}
              keyboardType="numeric"
            />

            <Text variant="labelLarge" style={styles.sectionLabel}>
              Чек-поинты
            </Text>
            <CheckRow label="Верхняя погрузка" value={topLoading} onChange={() => setTopLoading((v) => !v)} />
            <CheckRow label="Боковая погрузка" value={sideLoading} onChange={() => setSideLoading((v) => !v)} />
            <CheckRow
              label="Пропуск в центр Москвы"
              value={moscowCenterPass}
              onChange={() => setMoscowCenterPass((v) => !v)}
            />
            {error && <HelperText type="error">{error}</HelperText>}
          </View>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          {vehicle && (
            <Button textColor="#b91c1c" onPress={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          )}
          <Button onPress={onClose}>Отмена</Button>
          <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving}>
            Сохранить
          </Button>
        </Dialog.Actions>
      </Dialog>

      {vehicle && (
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)}>
          <Dialog.Title>Удалить машину?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{`${vehicle.name} · ${vehicle.plate}. Это действие нельзя отменить.`}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)}>Отмена</Button>
            <Button textColor="#b91c1c" onPress={handleDelete} loading={deleteVehicle.isPending}>
              Удалить
            </Button>
          </Dialog.Actions>
        </Dialog>
      )}
    </Portal>
  );
}

function CheckRow({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <View style={styles.checkRow}>
      <Text variant="bodyMedium" style={styles.checkLabel}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '90%',
  },
  area: {
    paddingHorizontal: 0,
  },
  content: {
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  sectionLabel: {
    marginTop: 4,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkLabel: {
    flex: 1,
  },
});
