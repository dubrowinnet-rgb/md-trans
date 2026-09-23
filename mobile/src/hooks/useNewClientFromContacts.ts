import { useState } from 'react';
import { pickPhoneContact, type PickedContact } from '../lib/phoneContacts';

// «Добавить клиента»: сразу открываем записную книжку телефона, а потом
// карточку нового клиента с подставленными именем и телефоном. Если контакт
// не выбрали или доступа нет, карточка открывается пустой.
export function useNewClientFromContacts() {
  const [draft, setDraft] = useState<PickedContact | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const start = async () => {
    if (picking) return;
    setPicking(true);
    setNotice(null);
    try {
      setDraft((await pickPhoneContact()) ?? { name: '', phone: '' });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Не удалось открыть контакты');
      setDraft({ name: '', phone: '' });
    } finally {
      setPicking(false);
    }
  };

  const close = () => {
    setDraft(null);
    setNotice(null);
  };

  return { draft, notice, picking, start, close };
}
