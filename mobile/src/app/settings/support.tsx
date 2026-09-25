import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ActivityIndicator, Appbar, Button, Dialog, Divider, HelperText, List, Portal, Text, TextInput } from 'react-native-paper';
import { useCreateTicket, useMyTickets, useSendTicketMessage, useTicketMessages } from '../../api/supportTickets';
import { useSession } from '../../providers/SessionProvider';
import { TICKET_STATUS_LABELS } from '../../theme';
import type { Employee } from '../../api/employees';

// «Техподдержка» (доработка «владелец сервиса», 2026-09-25) — свои
// обращения администратора к владельцу сервиса. Кнопка есть только у
// администратора; полная очередь по всем компаниям и её обработка — в
// кабинете владельца (веб-кабинет, это мобильному приложению не нужно).
export default function SupportSettingsScreen() {
  const { employee } = useSession();

  // Пункт меню скрыт не-админам, но прямой переход по адресу это не
  // остановит — проверяем ещё раз здесь, как остальные экраны «Настроек».
  if (!employee || employee.role !== 'admin') {
    return (
      <View style={styles.noAccess}>
        <Text variant="bodyMedium">Недостаточно прав для просмотра техподдержки.</Text>
      </View>
    );
  }

  return <SupportContent employee={employee} />;
}

function SupportContent({ employee }: { employee: Employee }) {
  const companyId = employee.company_id as string;
  const ticketsQuery = useMyTickets(companyId);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Техподдержка" />
      </Appbar.Header>
      {ticketsQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={ticketsQuery.data ?? []}
          keyExtractor={(t) => t.id}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={<Text style={styles.empty}>Обращений пока нет.</Text>}
          renderItem={({ item }) => (
            <List.Accordion
              title={item.subject}
              description={TICKET_STATUS_LABELS[item.status]}
              expanded={expandedId === item.id}
              onPress={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <TicketThread ticketId={item.id} employeeId={employee.id} />
            </List.Accordion>
          )}
        />
      )}
      <Button mode="outlined" icon="plus" style={styles.addButton} onPress={() => setCreating(true)}>
        Новое обращение
      </Button>

      {creating && (
        <NewTicketDialog companyId={companyId} employeeId={employee.id} onClose={() => setCreating(false)} />
      )}
    </View>
  );
}

function TicketThread({ ticketId, employeeId }: { ticketId: string; employeeId: string }) {
  const messagesQuery = useTicketMessages(ticketId);
  const sendMessage = useSendTicketMessage();
  const [draft, setDraft] = useState('');

  const send = async () => {
    if (!draft.trim()) return;
    await sendMessage.mutateAsync({ ticketId, senderId: employeeId, body: draft.trim() });
    setDraft('');
  };

  return (
    <View style={styles.thread}>
      {messagesQuery.isLoading ? (
        <ActivityIndicator size="small" />
      ) : (messagesQuery.data ?? []).length === 0 ? (
        <Text variant="bodySmall" style={styles.muted}>
          Сообщений пока нет
        </Text>
      ) : (
        (messagesQuery.data ?? []).map((m) => (
          <View key={m.id} style={[styles.message, m.sender_id === employeeId && styles.myMessage]}>
            <Text variant="bodySmall">{m.body}</Text>
          </View>
        ))
      )}
      <View style={styles.replyRow}>
        <TextInput
          mode="outlined"
          dense
          placeholder="Ответить..."
          accessibilityLabel="Ответить"
          value={draft}
          onChangeText={setDraft}
          style={styles.replyInput}
        />
        <Button mode="contained" onPress={send} loading={sendMessage.isPending} disabled={!draft.trim()}>
          Отправить
        </Button>
      </View>
    </View>
  );
}

function NewTicketDialog({
  companyId,
  employeeId,
  onClose,
}: {
  companyId: string;
  employeeId: string;
  onClose: () => void;
}) {
  const createTicket = useCreateTicket();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!subject.trim() || !body.trim()) {
      setError('Заполните тему и сообщение');
      return;
    }
    try {
      await createTicket.mutateAsync({ companyId, employeeId, subject: subject.trim(), body: body.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить обращение');
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={onClose}>
        <Dialog.Title>Новое обращение</Dialog.Title>
        <Dialog.Content style={styles.dialogContent}>
          <TextInput mode="outlined" label="Тема" accessibilityLabel="Тема" value={subject} onChangeText={setSubject} />
          <TextInput
            mode="outlined"
            label="Сообщение"
            accessibilityLabel="Сообщение"
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={4}
          />
          {error && <HelperText type="error">{error}</HelperText>}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onClose}>Отмена</Button>
          <Button mode="contained" onPress={handleSave} loading={createTicket.isPending} disabled={createTicket.isPending}>
            Отправить
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
  empty: {
    textAlign: 'center',
    marginTop: 32,
  },
  addButton: {
    margin: 16,
  },
  thread: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  message: {
    backgroundColor: '#f4f4f5',
    borderRadius: 8,
    padding: 8,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  myMessage: {
    backgroundColor: '#ede9fe',
    alignSelf: 'flex-end',
  },
  muted: {
    opacity: 0.6,
  },
  replyRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  replyInput: {
    flex: 1,
  },
  dialogContent: {
    gap: 12,
  },
  noAccess: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
});
