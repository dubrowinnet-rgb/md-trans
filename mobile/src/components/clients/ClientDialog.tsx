import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, TextInput } from 'react-native-paper';
import { useCreateClient, useUpdateClient, type Client } from '../../api/clients';
import { pickPhoneContact, type PickedContact } from '../../lib/phoneContacts';

// Карточка клиента: создание и правка. Для нового клиента имя и телефон
// можно взять из записной книжки телефона.
export function ClientDialog({
  client,
  initial,
  notice,
  onClose,
  onSaved,
}: {
  client: Client | null;
  initial?: PickedContact | null;
  notice?: string | null;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}) {
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const [name, setName] = useState(client?.name ?? initial?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? initial?.phone ?? '');
  const [discountText, setDiscountText] = useState(client?.discount_percent ? String(client.discount_percent) : '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [error, setError] = useState<string | null>(notice ?? null);
  const saving = createClient.isPending || updateClient.isPending;

  const fillFromContacts = async () => {
    setError(null);
    try {
      const picked = await pickPhoneContact();
      if (!picked) return;
      if (picked.name) setName(picked.name);
      if (picked.phone) setPhone(picked.phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть контакты');
    }
  };

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
      if (client) {
        await updateClient.mutateAsync({ id: client.id, ...input });
        onSaved?.({ ...client, ...input, phone: input.phone || null, notes: input.notes || null });
      } else {
        onSaved?.(await createClient.mutateAsync(input));
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить клиента');
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={onClose}>
        <Dialog.Title>{client ? 'Клиент' : 'Новый клиент'}</Dialog.Title>
        <Dialog.ScrollArea style={styles.area}>
          <View style={styles.content}>
            {!client && Platform.OS !== 'web' && (
              <Button mode="text" icon="contacts" onPress={fillFromContacts} style={styles.contacts}>
                Выбрать из контактов
              </Button>
            )}
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
  area: {
    paddingHorizontal: 0,
  },
  content: {
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  contacts: {
    alignSelf: 'flex-start',
  },
});
