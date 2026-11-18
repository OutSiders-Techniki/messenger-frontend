// Переписка открытых диалогов — только в памяти вкладки (FR-09):
// на диск клиента сообщения не пишутся. При выходе всё очищается.
//
// Элемент ленты: { id, senderId, sentAt, text | null, broken, status }
//   status: 'sending' | 'sent' | 'failed' (свои), null (чужие)
//   broken: не удалось расшифровать (неверный ключ или повреждение).

import { api } from '../api/index.js';
import { decryptMessage, encryptMediaMessage, encryptMessage } from '../crypto.js';
import { encryptMedia } from '../crypto/media.js';
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
  return items.sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
}

function samePacket(a, b) {
  return a.senderId === b.senderId && ['v', 'id', 'sentAt', 'iv', 'ct'].every(field => a.envelope[field] === b.envelope[field]);
}

async function decryptItem(dialogId, { senderId, envelope }, key) {
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

async function findDeleted(dialogId, items) {
  const deleted = new Set();
  for (let i = 0; i < items.length; i += 500) {
    const missing = await api.messages.sync(dialogId, items.slice(i, i + 500).map(item => item.id));
    for (const id of missing) deleted.add(id);
  }
  return deleted;
}

async function uploadMedia(dialogId, { id, upload }) {
  try {
    await api.attachments.upload(dialogId, id, id, upload);
  } catch (error) {
    if (error.status !== 409) throw error;
    // Ответ на успешную загрузку мог потеряться. Принимаем только тот же пакет.
    const existing = await api.attachments.metadata(dialogId, id, id);
    if (existing.encryptedMetadata !== upload.metadata || existing.size !== upload.body.size) throw error;
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
        const { items, nextBeforeId } = await api.messages.list(dialogId);
        if (generation !== session.generation || revision !== current.revision) return;
        const known = new Map(current.items.map((m) => [m.id, m]));
        const wasReady = current.status === 'ready';
        const key = keysStore.get(dialogId);
        const listed = new Set(items.map(item => item.envelope.id));
        const older = nextBeforeId ? current.items.filter(item => (
          !listed.has(item.id) && item.status !== 'sending' && item.status !== 'failed'
        )) : [];
        const [decrypted, deleted] = await Promise.all([
          Promise.all(
            items.map((item) => {
              const old = known.get(item.envelope.id);
              return old && !old.status && old.text !== null && samePacket(old, item)
                ? old : decryptItem(dialogId, item, key);
            }),
          ),
          findDeleted(dialogId, older),
        ]);
        if (generation !== session.generation || revision !== current.revision || key !== keysStore.get(dialogId)) return;
        // Сетевой повтор не создаёт второй элемент. Если первый пакет
        // повреждён, корректный пакет с тем же ID может его заменить.
        const byId = new Map(current.items.filter((m) => m.status === 'sending' || m.status === 'failed').map((m) => [m.id, m]));
        for (const item of older) {
          if (!deleted.has(item.id)) byId.set(item.id, item);
        }
        for (const item of decrypted) {
          const previous = byId.get(item.id);
          if (previous?.status === 'sending' || previous?.status === 'failed') {
            if (!previous.upload && samePacket(previous, item) && !item.broken) {
              byId.set(item.id, { ...item, status: 'sent' });
            }
            continue;
          }
          if (previous?.text != null) continue;
          byId.set(item.id, wasReady && !known.has(item.id) ? { ...item, isNew: true } : item);
        }
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

  // Входящий пакет может повториться или прийти параллельно с историей.
  async receive(dialogId, item) {
    if (!session.isAuthenticated) return;
    const generation = session.generation;
    const key = keysStore.get(dialogId);
    const current = entry(dialogId);
    const revision = current.revision;
    const existing = current.items.find(m => m.id === item.envelope.id);
    if (existing?.text != null && !existing.status) return;
    const decrypted = await decryptItem(dialogId, item, key);
    if (generation !== session.generation || revision !== current.revision || key !== keysStore.get(dialogId)) return;
    const previous = current.items.find(m => m.id === decrypted.id);
    if (previous?.status) {
      if (previous.upload || !samePacket(previous, decrypted) || decrypted.broken) return;
      decrypted.status = 'sent';
    } else if (previous?.text != null || (previous && decrypted.text === null)) {
      return;
    }
    current.items = sortItems([...current.items.filter(m => m.id !== decrypted.id), { ...decrypted, isNew: !previous }]);
    emit(dialogId);
  },

  async send(dialogId, text, file = null) {
    const generation = session.generation;
    const key = keysStore.get(dialogId);
    const senderId = session.user?.publicId;
    if (!key || !senderId) throw new Error('No key or session');

    const envelope = file
      ? await encryptMediaMessage(key, { dialogId, senderId })
      : await encryptMessage(key, { dialogId, senderId, text });
    const upload = file ? await encryptMedia(key, { dialogId, senderId, envelope }, file, text) : null;
    if (generation !== session.generation || key !== keysStore.get(dialogId)) return;
    const current = entry(dialogId);
    current.revision += 1;
    current.items = sortItems([
      ...current.items,
      {
        id: envelope.id, senderId, sentAt: envelope.sentAt, envelope, text: file ? '' : text,
        upload, broken: false, status: 'sending', isNew: true,
      },
    ]);
    emit(dialogId);
    await this.deliver(dialogId, envelope.id);
  },

  // Отправка (и повтор) того же пакета: при повторе не шифруем заново,
  // чтобы не создать новый IV под тем же id (контракт v1, «повтор»).
  async deliver(dialogId, messageId) {
    const generation = session.generation;
    const current = entry(dialogId);
    const message = current.items.find((m) => m.id === messageId);
    if (!message) return;
    message.status = 'sending';
    message.isNew = false;
    emit(dialogId);
    try {
      const result = await api.messages.send(dialogId, message.envelope);
      if (generation !== session.generation) return;
      if (result?.deleted) {
        current.revision += 1;
        current.items = current.items.filter(item => item.id !== messageId);
      } else {
        const delivered = current.items.find(item => item.id === messageId);
        if (!delivered) return;
        if (delivered.upload) {
          delivered.serverAccepted = true;
          await uploadMedia(dialogId, delivered);
          if (generation !== session.generation) return;
          const latest = current.items.find(item => item.id === messageId);
          if (!latest) return;
          latest.upload = null;
          latest.status = 'sent';
        } else {
          delivered.status = 'sent';
        }
      }
    } catch {
      if (generation !== session.generation) return;
      const failed = current.items.find(item => item.id === messageId);
      if (failed?.status === 'sending') failed.status = 'failed';
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
    const onServer = before.filter((m) => (!targets || targets.has(m.id)) && (m.serverAccepted || (m.status !== 'sending' && m.status !== 'failed')));
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
    const generation = session.generation;
    const key = keysStore.get(dialogId);
    const snapshot = current.items.map(item => ({ ...item, text: null, locked: true, broken: false }));
    current.items = snapshot;
    emit(dialogId);
    if (!key || snapshot.length === 0) return;
    const decrypted = await Promise.all(snapshot.map(item => decryptItem(dialogId, item, key)));
    if (generation !== session.generation || key !== keysStore.get(dialogId)) return;
    const replacements = new Map(snapshot.map((item, index) => [item, decrypted[index]]));
    current.items = current.items.map(item => {
      const next = replacements.get(item);
      return next ? { ...item, text: next.text, locked: next.locked, broken: next.broken } : item;
    });
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

keysStore.subscribe(changedDialogId => {
  for (const dialogId of dialogs.keys()) {
    if (changedDialogId === null || changedDialogId === dialogId) messagesStore.redecrypt(dialogId);
  }
});
