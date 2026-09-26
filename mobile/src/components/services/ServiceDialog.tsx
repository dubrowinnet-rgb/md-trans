import { useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { Button, Dialog, HelperText, Portal, TextInput } from 'react-native-paper';
import { useCreateService, useUpdateService, type Service, type ServiceInput } from '../../api/services';
import { DismissKeyboardView } from '../form/DismissKeyboardView';

// Та же палитра, что уже используется в стартовом каталоге услуг
// (миграция 0004_services_catalog) — чтобы цвета новых услуг сочетались
// со старыми на календаре, а не добавляли произвольный тринадцатый.
const COLOR_SWATCHES = [
  '#1E88E5', '#00969B', '#6A00F4', '#3DCC3D', '#1B9E3E', '#F4411E',
  '#D500F9', '#FF6D00', '#9E9E9E', '#6A1B4D', '#A0A0A0', '#D4A017',
];

// Добавление/изменение услуги каталога (доработки 1, п.2 — «добавлять/
// изменять услуги и всё, что с ними связано: стоимость по умолчанию,
// цвета плашек, время по умолчанию»). Удаления нет — см. api/services.ts.
export function ServiceDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const createService = useCreateService();
  const updateService = useUpdateService();
  const saving = createService.isPending || updateService.isPending;

  const [name, setName] = useState(service?.name ?? '');
  const [durationText, setDurationText] = useState(
    service?.base_duration_minutes != null ? String(service.base_duration_minutes) : ''
  );
  const [priceText, setPriceText] = useState(service?.base_price != null ? String(service.base_price) : '');
  const [color, setColor] = useState(service?.color ?? COLOR_SWATCHES[0]);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Укажите название услуги');
      return;
    }
    const input: ServiceInput = {
      name: name.trim(),
      base_duration_minutes: durationText.trim() ? Number(durationText.trim()) : null,
      base_price: priceText.trim() ? Number(priceText.trim().replace(',', '.')) : null,
      color,
    };
    try {
      if (service) {
        await updateService.mutateAsync({ id: service.id, ...input });
      } else {
        await createService.mutateAsync(input);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={onClose} style={styles.dialog}>
        <Dialog.Title>{service ? service.name : 'Новая услуга'}</Dialog.Title>
        <Dialog.ScrollArea style={styles.area}>
          <DismissKeyboardView>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <TextInput mode="outlined" label="Название *" accessibilityLabel="Название" value={name} onChangeText={setName} />
              <TextInput
                mode="outlined"
                label="Время по умолчанию, мин"
                accessibilityLabel="Время по умолчанию, мин"
                value={durationText}
                onChangeText={setDurationText}
                keyboardType="numeric"
              />
              <TextInput
                mode="outlined"
                label="Стоимость по умолчанию, ₽"
                accessibilityLabel="Стоимость по умолчанию, ₽"
                value={priceText}
                onChangeText={setPriceText}
                keyboardType="numeric"
              />
              <HelperText type="info" style={styles.colorLabel}>
                Цвет плашки на календаре
              </HelperText>
              <View style={styles.swatches}>
                {COLOR_SWATCHES.map((swatch) => (
                  <Pressable
                    key={swatch}
                    accessibilityLabel={`Цвет ${swatch}`}
                    onPress={() => setColor(swatch)}
                    style={[
                      styles.swatch,
                      { backgroundColor: swatch },
                      color === swatch && styles.swatchSelected,
                    ]}
                  />
                ))}
              </View>
              {error && <HelperText type="error">{error}</HelperText>}
            </ScrollView>
          </DismissKeyboardView>
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
    paddingBottom: 24,
  },
  colorLabel: {
    marginBottom: -6,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: '#111827',
  },
});
