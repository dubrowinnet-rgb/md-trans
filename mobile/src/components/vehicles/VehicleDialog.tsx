import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, Switch, Text, TextInput } from 'react-native-paper';
import { useCreateVehicle, useDeleteVehicle, useUpdateVehicle, type Vehicle, type VehicleInput } from '../../api/vehicles';
import { DismissKeyboardView } from '../form/DismissKeyboardView';

// Размер кузова хранится одной строкой («Д 4.2 х Ш 2.1 х В 2.3 м», в метрах
// — доработки 2, п.4: раньше было в сантиметрах, Максим попросил метры,
// та же маска Д/Ш/В, что и раньше) — тот же формат читает и пишет
// веб-кабинет (сверено с web/src/components/fleet/VehicleModal.tsx,
// коммит f2bf2d9), чтобы поле выглядело одинаково в обоих приложениях.
// Старое значение в сантиметрах (формат «... см») на три поля не
// разбираем: перепутать см с метрами хуже, чем попросить ввести заново —
// тот же приём, что уже был на этом поле при вводе маски.
const DIMENSIONS_RE = /Д\s*([\d.,]+)\s*х\s*Ш\s*([\d.,]+)\s*х\s*В\s*([\d.,]+)\s*м/i;

function parseBodyDimensions(text: string): { length: string; width: string; height: string } {
  const m = text.match(DIMENSIONS_RE);
  return m ? { length: m[1], width: m[2], height: m[3] } : { length: '', width: '', height: '' };
}

function composeBodyDimensions(length: string, width: string, height: string) {
  const parts: string[] = [];
  if (length.trim()) parts.push(`Д ${length.trim()}`);
  if (width.trim()) parts.push(`Ш ${width.trim()}`);
  if (height.trim()) parts.push(`В ${height.trim()}`);
  return parts.length ? `${parts.join(' х ')} м` : '';
}

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
  const initialDims = parseBodyDimensions(vehicle?.body_dimensions ?? '');
  const [lengthText, setLengthText] = useState(initialDims.length);
  const [widthText, setWidthText] = useState(initialDims.width);
  const [heightText, setHeightText] = useState(initialDims.height);
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
      body_dimensions: composeBodyDimensions(lengthText, widthText, heightText),
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
          <DismissKeyboardView>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
            <Text variant="bodySmall" style={styles.muted}>
              Размеры кузова, м
            </Text>
            <View style={styles.dimsRow}>
              <TextInput
                mode="outlined"
                label="Д"
                placeholder="__"
                accessibilityLabel="Длина кузова"
                style={styles.dimsInput}
                value={lengthText}
                onChangeText={setLengthText}
                keyboardType="numeric"
              />
              <Text variant="bodyMedium" style={styles.dimsX}>
                х
              </Text>
              <TextInput
                mode="outlined"
                label="Ш"
                placeholder="__"
                accessibilityLabel="Ширина кузова"
                style={styles.dimsInput}
                value={widthText}
                onChangeText={setWidthText}
                keyboardType="numeric"
              />
              <Text variant="bodyMedium" style={styles.dimsX}>
                х
              </Text>
              <TextInput
                mode="outlined"
                label="В"
                placeholder="__"
                accessibilityLabel="Высота кузова"
                style={styles.dimsInput}
                value={heightText}
                onChangeText={setHeightText}
                keyboardType="numeric"
              />
            </View>
            <TextInput
              mode="outlined"
              label="Европаллет, шт"
              value={palletsText}
              onChangeText={setPalletsText}
              keyboardType="numeric"
            />

            <CheckRow label="Верхняя погрузка" value={topLoading} onChange={() => setTopLoading((v) => !v)} />
            <CheckRow label="Боковая погрузка" value={sideLoading} onChange={() => setSideLoading((v) => !v)} />
            <CheckRow
              label="Пропуск в центр Москвы"
              value={moscowCenterPass}
              onChange={() => setMoscowCenterPass((v) => !v)}
            />
            {error && <HelperText type="error">{error}</HelperText>}
          </ScrollView>
          </DismissKeyboardView>
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
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  content: {
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 8,
    // Больше воздуха снизу, чем сверху: иначе последний чек-поинт упирается
    // в «Сохранить»/«Отмена» вплотную под ним (раздел «баги», п.8).
    paddingBottom: 24,
  },
  muted: {
    opacity: 0.6,
    marginBottom: -4,
  },
  dimsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dimsInput: {
    flex: 1,
  },
  dimsX: {
    opacity: 0.6,
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
