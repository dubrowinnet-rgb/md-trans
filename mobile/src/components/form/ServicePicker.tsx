import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Dialog, HelperText, Portal, Text, TouchableRipple } from 'react-native-paper';
import type { Service } from '../../api/services';

export function formatServiceMeta(service: Service) {
  const parts: string[] = [];
  if (service.base_duration_minutes) {
    const h = service.base_duration_minutes / 60;
    parts.push(Number.isInteger(h) ? `${h} ч.` : `${service.base_duration_minutes} мин.`);
  }
  parts.push(`${Number(service.base_price ?? 0)} ₽`);
  return parts.join(' · ');
}

// Выбор услуг, как в Bumpix: список с цветной полосой, длительностью и ценой.
export function ServicePicker({
  visible,
  services,
  selectedIds,
  loadError,
  onDismiss,
  onSave,
}: {
  visible: boolean;
  services: Service[];
  selectedIds: string[];
  loadError?: string;
  onDismiss: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<string[]>(selectedIds);

  const toggle = (id: string) =>
    setDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>Услуги</Dialog.Title>
        <Dialog.ScrollArea style={styles.area}>
          <ScrollView>
            {loadError && <HelperText type="error">{loadError}</HelperText>}
            {services.length === 0 && !loadError && (
              <Text style={styles.empty}>
                Каталог услуг пуст. Выполните миграцию 0004 в Supabase — она добавит услуги.
              </Text>
            )}
            {services.map((service) => (
              <TouchableRipple key={service.id} onPress={() => toggle(service.id)}>
                <View style={styles.row}>
                  <View style={[styles.bar, { backgroundColor: service.color }]} />
                  <View style={styles.info}>
                    <Text variant="bodyLarge">{service.name}</Text>
                    <Text variant="bodySmall" style={styles.meta}>
                      {formatServiceMeta(service)}
                    </Text>
                  </View>
                  <Checkbox.Android
                    status={draft.includes(service.id) ? 'checked' : 'unchecked'}
                    onPress={() => toggle(service.id)}
                  />
                </View>
              </TouchableRipple>
            ))}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Отмена</Button>
          <Button onPress={() => onSave(draft)}>Сохранить</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '85%',
  },
  area: {
    paddingHorizontal: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  bar: {
    width: 4,
    alignSelf: 'stretch',
    marginRight: 12,
    borderRadius: 2,
  },
  info: {
    flex: 1,
  },
  meta: {
    opacity: 0.6,
  },
  empty: {
    padding: 16,
  },
});
