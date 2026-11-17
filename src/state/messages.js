// Переписка открытых диалогов — только в памяти вкладки (FR-09):
// на диск клиента сообщения не пишутся. При выходе всё очищается.
//
// Элемент ленты: { id, senderId, sentAt, text | null, broken, status }
//   status: 'sending' | 'sent' | 'failed' (свои), null (чужие)
//   broken: не удалось расшифровать (неверный ключ или повреждение).

import { api } from '../api/index.js';
import { decryptMessage, encryptMessage } from '../crypto/envelope.js';
import { keysStore } from './keys.js';
import { session } from './session.js';

const dialogs = new Map(); // dialogId → { status, items, error, pending }
const listeners = new Set();

function emit(dialogId) {
  for (const listener of [...listeners]) listener(dialogId);
}

function entry(dialogId) {
  if (!dialogs.has(dialogId)) dialogs.set(dialogId, { status: 'idle', items: [], error: null, pending: null });
  return dialogs.get(dialogId);
}

function sortItems(items) {
  return items.sort((a, b) => a.sentAt - b.sentAt);
}

async function decryptItem(dialogId, { senderId, envelope }) {
  const key = keysStore.get(dialogId);
  const base = { id: envelope.id, senderId, sentAt: envelope.sentAt, envelope, status: null };
  if (!key) return { ...base, text: null, broken: false, locked: true };
  try {
    const text = await decryptMessage(key, { dialogId, senderId, envelope });
    return { ...base, text, broken: false };
  } catch {
    // Открытый текст не показываем ни частично (TC-06-N2, TC-23-N2).
    return { ...base, text: null, broken: true };
  }
}

export const messagesStore = {
  get(dialogId) {
    return entry(dialogId);
  },

  async load(dialogId) {
    const current = entry(dialogId);
    if (current.pending) return current.pending;
    const generation = session.generation;
    if (current.status !== 'ready') {
      current.status = 'loading';
      current.error = null;
      emit(dialogId);
    }

    current.pending = (async () => {
      try {
        const { items } = await api.messages.list(dialogId);
        const decrypted = await Promise.all(items.map((item) => decryptItem(dialogId, item)));
        if (generation !== session.generation) return;
        // Отсев повторов по id (TC-23): одно сообщение — один элемент ленты.
        const byId = new Map(current.items.filter((m) => m.status === 'sending' || m.status === 'failed').map((m) => [m.id, m]));
        for (const item of decrypted) byId.set(item.id, item);
        current.items = sortItems([...byId.values()]);
        current.status = 'ready';
        current.error = null;
      } catch (err) {
        if (generation !== session.generation) return;
        current.status = current.status === 'ready' ? 'ready' : 'error';
        current.error = err;
      } finally {
        current.pending = null;
        emit(dialogId);
      }
    })();
    return current.pending;
  },

  // Новое входящее событие (MSG-48): дубликат по id не добавляется.
  async receive(dialogId, item) {
    const current = entry(dialogId);
    if (current.items.some((m) => m.id === item.envelope.id && m.status !== 'failed')) return;
    const decrypted = await decryptItem(dialogId, item);
    current.items = sortItems([...current.items.filter((m) => m.id !== decrypted.id), { ...decrypted, isNew: true }]);
    emit(dialogId);
  },

  async send(dialogId, text) {
    const key = keysStore.get(dialogId);
    const senderId = session.user?.publicId;
    if (!key || !senderId) throw new Error('No key or session');

    const envelope = await encryptMessage(key, { dialogId, senderId, text });
    const current = entry(dialogId);
    current.items = sortItems([
      ...current.items,
      { id: envelope.id, senderId, sentAt: envelope.sentAt, envelope, text, broken: false, status: 'sending', isNew: true },
    ]);
    emit(dialogId);
    await this.deliver(dialogId, envelope.id);
  },

  // Отправка (и повтор) того же пакета: при повторе не шифруем заново,
  // чтобы не создать новый IV под тем же id (контракт v1, «повтор»).
  async deliver(dialogId, messageId) {
    const current = entry(dialogId);
    const message = current.items.find((m) => m.id === messageId);
    if (!message) return;
    message.status = 'sending';
    message.isNew = false;
    emit(dialogId);
    try {
      await api.messages.send(dialogId, message.envelope);
      message.status = 'sent';
    } catch {
      message.status = 'failed';
    }
    emit(dialogId);
  },

  // Ключ ввели или сменили — расшифровываем загруженное заново.
  async redecrypt(dialogId) {
    const current = entry(dialogId);
    current.items = sortItems(
      await Promise.all(
        current.items.map((m) => (m.status ? m : decryptItem(dialogId, { senderId: m.senderId, envelope: m.envelope }))),
      ),
    );
    emit(dialogId);
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

session.subscribe(() => {
  dialogs.clear();
  emit(null);
});

keysStore.subscribe(() => {
  for (const dialogId of dialogs.keys()) messagesStore.redecrypt(dialogId);
});
