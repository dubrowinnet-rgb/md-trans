import { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Divider, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import { useClientOrderStats, useCreateClient, useUpdateClient, type Client } from '../../api/clients';
import { pickPhoneContact } from '../../lib/phoneContacts';
import { DismissKeyboardView } from '../form/DismissKeyboardView';

// Карточка клиента: создание и правка. Для нового клиента имя и телефон
// можно взять из записной книжки телефона кнопкой «Выбрать из контактов».
// canViewContacts/canViewStats сужают карточку для диспетчера с
// ограниченными правами (раздел «права доступа»): у нового клиента телефон
// вводит тот же человек, поэтому его скрывают только при просмотре уже
// существующего.
export function ClientDialog({
  client,
  canViewContacts = true,
  canViewStats = true,
  onClose,
  onSaved,
}: {
  client: Client | null;
  canViewContacts?: boolean;
  canViewStats?: boolean;
  onClose: () => void;
  onSaved?: (client: Client) => void;
}) {
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const showContacts = canViewContacts || !client;
  const statsQuery = useClientOrderStats(canViewStats && client ? client.id : undefined);
  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [discountText, setDiscountText] = useState(client?.discount_percent ? String(client.discount_percent) : '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const saving = createClient.isPending || updateClient.isPending;

  const fillFromContacts = async () => {
    setError(null);
    setPicking(true);
    try {
      const picked = await pickPhoneContact();
      if (!picked) return;
      if (picked.name) setName(picked.name);
      if (picked.phone) setPhone(picked.phone);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть контакты');
    } finally {
      setPicking(false);
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
          <DismissKeyboardView>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {!client && Platform.OS !== 'web' && (
              <Button mode="text" icon="contacts" onPress={fillFromContacts} loading={picking} style={styles.contacts}>
                Выбрать из контактов
              </Button>
            )}
            <TextInput mode="outlined" label="Имя" accessibilityLabel="Имя" value={name} onChangeText={setName} />
            {showContacts && (
              <TextInput
                mode="outlined"
                label="Телефон"
                accessibilityLabel="Телефон"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            )}
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

            {canViewStats && client && (
              <>
                <Divider style={styles.divider} />
                <Text variant="labelLarge">История заказов</Text>
                {statsQuery.isLoading ? (
                  <ActivityIndicator size="small" />
                ) : statsQuery.data ? (
                  <Text variant="bodyMedium">
                    {`Всего заказов: ${statsQuery.data.totalOrders}, завершено: ${statsQuery.data.completedOrders}, сумма по завершённым: ${statsQuery.data.totalAmount} ₽`}
                  </Text>
                ) : (
                  <Text variant="bodySmall" style={styles.muted}>
                    {`Не удалось загрузить историю: ${statsQuery.error?.message ?? ''}`}
                  </Text>
                )}
              </>
            )}
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
  area: {
    paddingHorizontal: 0,
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
  },
  content: {
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  contacts: {
    alignSelf: 'flex-start',
  },
  divider: {
    marginVertical: 4,
  },
  muted: {
    opacity: 0.6,
  },
});
