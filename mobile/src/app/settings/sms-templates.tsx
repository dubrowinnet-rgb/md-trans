import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ActivityIndicator, Appbar, Button, Dialog, Divider, HelperText, List, Portal, TextInput } from 'react-native-paper';
import { useSmsTemplates, useUpdateSmsTemplate, type SmsTemplate } from '../../api/smsTemplates';
import { DismissKeyboardView } from '../../components/form/DismissKeyboardView';

// Только new_order отправляется автоматически сейчас (доработки 1, п.0 —
// смс клиенту при принятом заказе); остальные шаблоны уже можно готовить
// на будущее (см. комментарий в миграции 0011).
const AUTO_SENT_KEYS = new Set(['new_order']);

export default function SmsTemplatesSettingsScreen() {
  const templatesQuery = useSmsTemplates();
  const [editing, setEditing] = useState<SmsTemplate | null>(null);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Шаблоны СМС" />
      </Appbar.Header>
      {templatesQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={templatesQuery.data ?? []}
          keyExtractor={(t) => t.key}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <HelperText type="info" style={styles.hint}>
              {'Подставляются автоматически: [Name] [Day] [Date] [Time] [Cost] [Address]'}
            </HelperText>
          }
          renderItem={({ item }) => (
            <List.Item
              title={item.label}
              description={AUTO_SENT_KEYS.has(item.key) ? 'Отправляется автоматически' : 'Пока не подключено'}
              descriptionNumberOfLines={3}
              left={(props) => <List.Icon {...props} icon="message-text-outline" />}
              onPress={() => setEditing(item)}
            />
          )}
        />
      )}
      {editing && <SmsTemplateDialog template={editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

function SmsTemplateDialog({ template, onClose }: { template: SmsTemplate; onClose: () => void }) {
  const updateTemplate = useUpdateSmsTemplate();
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setBody(template.body), [template]);

  const handleSave = async () => {
    setError(null);
    try {
      await updateTemplate.mutateAsync({ key: template.key, body });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={onClose} style={styles.dialog}>
        <Dialog.Title>{template.label}</Dialog.Title>
        <Dialog.ScrollArea style={styles.area}>
          <DismissKeyboardView>
            <View style={styles.content}>
              <TextInput
                mode="outlined"
                label="Текст сообщения"
                accessibilityLabel="Текст сообщения"
                value={body}
                onChangeText={setBody}
                multiline
                numberOfLines={6}
              />
              <HelperText type="info">{'[Name] [Day] [Date] [Time] [Cost] [Address]'}</HelperText>
              {error && <HelperText type="error">{error}</HelperText>}
            </View>
          </DismissKeyboardView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onClose}>Отмена</Button>
          <Button mode="contained" onPress={handleSave} loading={updateTemplate.isPending} disabled={updateTemplate.isPending}>
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
  loader: {
    marginTop: 32,
  },
  list: {
    paddingBottom: 32,
  },
  hint: {
    paddingHorizontal: 16,
  },
  dialog: {
    maxHeight: '90%',
  },
  area: {
    paddingHorizontal: 0,
  },
  content: {
    gap: 4,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
});
