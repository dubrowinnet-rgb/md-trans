import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ActivityIndicator, Appbar, Button, Dialog, Divider, HelperText, IconButton, List, Portal, Text, TextInput } from 'react-native-paper';
import { useCreateReminderRule, useDeleteReminderRule, useReminderRules } from '../../api/reminders';

// Правила «за сколько минут напомнить сотруднику о заказе» (доработки 1,
// п.1 — сама отправка в Edge Function send-crew-reminders). Список, как
// в референсе Bumpix: несколько правил, каждое можно убрать крестиком.
export default function RemindersSettingsScreen() {
  const rulesQuery = useReminderRules();
  const createRule = useCreateReminderRule();
  const deleteRule = useDeleteReminderRule();
  const [adding, setAdding] = useState(false);
  const [minutesText, setMinutesText] = useState('30');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setError(null);
    const minutes = Number(minutesText.trim());
    if (!minutes || minutes <= 0) {
      setError('Укажите число минут больше нуля');
      return;
    }
    try {
      await createRule.mutateAsync(minutes);
      setAdding(false);
      setMinutesText('30');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Напоминания сотрудникам" />
      </Appbar.Header>
      <HelperText type="info" style={styles.hint}>
        За сколько минут до начала заказа прислать пуш-напоминание экипажу
      </HelperText>
      {rulesQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={rulesQuery.data ?? []}
          keyExtractor={(r) => r.id}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={<Text style={styles.empty}>Напоминаний пока нет.</Text>}
          renderItem={({ item }) => (
            <List.Item
              title={`Напомнить за ${item.offset_minutes} мин.`}
              left={(props) => <List.Icon {...props} icon="bell-outline" />}
              right={(props) => (
                <IconButton
                  {...props}
                  icon="close"
                  accessibilityLabel="Удалить напоминание"
                  onPress={() => deleteRule.mutate(item.id)}
                />
              )}
            />
          )}
        />
      )}
      <Button mode="outlined" icon="plus" style={styles.addButton} onPress={() => setAdding(true)}>
        Новое напоминание
      </Button>

      <Portal>
        <Dialog visible={adding} onDismiss={() => setAdding(false)}>
          <Dialog.Title>Новое напоминание</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <TextInput
              mode="outlined"
              label="За сколько минут"
              accessibilityLabel="За сколько минут"
              value={minutesText}
              onChangeText={setMinutesText}
              keyboardType="numeric"
            />
            {error && <HelperText type="error">{error}</HelperText>}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAdding(false)}>Отмена</Button>
            <Button mode="contained" onPress={handleAdd} loading={createRule.isPending} disabled={createRule.isPending}>
              Добавить
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hint: {
    paddingHorizontal: 16,
  },
  loader: {
    marginTop: 32,
  },
  empty: {
    textAlign: 'center',
    marginTop: 32,
  },
  addButton: {
    margin: 16,
  },
  dialogContent: {
    gap: 4,
  },
});
