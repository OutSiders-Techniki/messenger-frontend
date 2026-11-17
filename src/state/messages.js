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
  // revision растёт при каждом локальном изменении ленты (отправка, удаление):
  // ответ сервера, запрошенный до изменения, уже устарел и не применяется.
  if (!dialogs.has(dialogId)) dialogs.set(dialogId, { status: 'idle', items: [], error: null, pending: null, revision: 0 });
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

  // silent — фоновая сверка: без индикатора загрузки.
  // throwOnError — пробросить ошибку сети (для менеджера соединения).
  async load(dialogId, { silent = false, throwOnError = false } = {}) {
    const current = entry(dialogId);
    if (current.pending) return current.pending;
    const generation = session.generation;
    if (current.status !== 'ready' && !silent) {
      current.status = 'loading';
      current.error = null;
      emit(dialogId);
    }

    let failure = null;
    const revision = current.revision;
    current.pending = (async () => {
      try {
        const { items } = await api.messages.list(dialogId);
        if (generation !== session.generation || revision !== current.revision) return;
        const known = new Map(current.items.map((m) => [m.id, m]));
        const wasReady = current.status === 'ready';
        // Уже расшифрованные не расшифровываем повторно при каждом опросе.
        const decrypted = await Promise.all(
          items.map((item) => {
            const old = known.get(item.envelope.id);
            return old && !old.status && !old.locked ? old : decryptItem(dialogId, item);
          }),
        );
        if (generation !== session.generation || revision !== current.revision) return;
        // Отсев повторов по id (TC-23): одно сообщение — один элемент ленты.
        // Неотправленные свои остаются, пока сервер их не подтвердит.
        const byId = new Map(current.items.filter((m) => m.status === 'sending' || m.status === 'failed').map((m) => [m.id, m]));
        for (const item of decrypted) {
          const pendingOwn = byId.get(item.id);
          byId.set(item.id, pendingOwn ? { ...pendingOwn, status: 'sent' } : item);
          if (wasReady && !known.has(item.id)) item.isNew = true;
        }
        // Чего нет на сервере, того нет и в ленте: удалённое исчезает (MSG-52).
        const next = sortItems([...byId.values()]);
        const changed =
          !wasReady ||
          next.length !== current.items.length ||
          next.some((m, i) => m !== current.items[i] || m.status !== current.items[i]?.status);
        current.items = next;
        current.status = 'ready';
        current.error = null;
        if (changed) emit(dialogId);
      } catch (err) {
        failure = err;
        if (generation !== session.generation) return;
        if (current.status !== 'ready') {
          current.status = 'error';
          current.error = err;
          emit(dialogId);
        }
      } finally {
        current.pending = null;
      }
    })();
    await current.pending;
    if (failure && throwOnError) throw failure;
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
    current.revision += 1;
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

  // Удаление (MSG-51): scope 'self' — своя копия, 'both' — у обоих.
  // ids не передан — вся переписка. Из ленты убираем сразу; если сервер
  // отказал — возвращаем как было и пробрасываем ошибку.
  async remove(dialogId, scope, ids = null) {
    const current = entry(dialogId);
    current.revision += 1;
    const before = current.items;
    const targets = ids ? new Set(ids) : null;
    // Неотправленные свои удаляем только локально — на сервере их нет.
    const onServer = before.filter((m) => (!targets || targets.has(m.id)) && m.status !== 'sending' && m.status !== 'failed');
    current.items = before.filter((m) => targets && !targets.has(m.id));
    emit(dialogId);

    try {
      if (scope === 'both') {
        if (onServer.length) await api.messages.deleteBoth(dialogId, onServer.map((m) => m.id));
      } else {
        await api.messages.deleteSelf(dialogId, ids ?? undefined);
      }
    } catch (err) {
      current.revision += 1;
      current.items = before;
      emit(dialogId);
      throw err;
    }
    // Изменение подтверждено сервером — следующий опрос снова актуален.
    current.revision += 1;
  },

  // Связь вернулась — отправляем то, что не ушло (тот же пакет, тот же id).
  async retryFailed(dialogId) {
    const failed = entry(dialogId).items.filter((m) => m.status === 'failed');
    for (const message of failed) await this.deliver(dialogId, message.id);
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
