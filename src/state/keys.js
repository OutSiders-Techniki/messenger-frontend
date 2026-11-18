import { importDialogKey } from '../crypto.js';
import { keyDatabase } from './key-db.js';
import { session } from './session.js';

let active = null;
const listeners = new Set();

function emit(dialogId) {
  for (const listener of [...listeners]) listener(dialogId);
}

async function restore(account) {
  try {
    const records = await keyDatabase.read(account.id, account.signal);
    if (account.signal.aborted) return;
    for (const { dialogId, key } of records) {
      account.keys.set(dialogId, { key, remember: true });
    }
  } catch {
    // Доступ к чату остаётся, а невозможность сохранить ключ видна при вводе.
  } finally {
    if (!account.signal.aborted) {
      account.restoring = false;
      emit(null);
    }
  }
}

function enqueue(account, operation) {
  const pending = account.pending.then(async () => {
    if (account.signal.aborted) return false;
    try {
      return await operation();
    } catch (error) {
      if (account.signal.aborted) return false;
      throw error;
    }
  });
  account.pending = pending.catch(() => {});
  return pending;
}

export const keysStore = {
  get restoring() {
    return active?.restoring ?? false;
  },

  whenReady() {
    return active?.ready ?? Promise.resolve();
  },

  has(dialogId) {
    return active?.keys.has(dialogId) ?? false;
  },

  get(dialogId) {
    return active?.keys.get(dialogId)?.key ?? null;
  },

  remembered(dialogId) {
    return active?.keys.get(dialogId)?.remember ?? false;
  },

  async set(dialogId, bytes, { remember = true } = {}) {
    const account = active;
    try {
      if (!account) return false;
      return await enqueue(account, async () => {
        const key = await importDialogKey(bytes);
        if (account.signal.aborted) return false;
        if (remember) {
          await keyDatabase.write({ accountId: account.id, dialogId, key }, account.signal);
        } else if (typeof indexedDB !== 'undefined') {
          // Переход в режим без сохранения также удаляет ранее сохранённый ключ.
          await keyDatabase.delete(account.id, dialogId, account.signal);
        }
        if (account.signal.aborted) return false;
        account.keys.set(dialogId, { key, remember });
        emit(dialogId);
        return true;
      });
    } finally {
      bytes.fill(0);
    }
  },

  async remove(dialogId) {
    const account = active;
    if (!account) return false;
    return enqueue(account, async () => {
      if (account.keys.get(dialogId)?.remember) {
        await keyDatabase.delete(account.id, dialogId, account.signal);
      }
      if (account.signal.aborted) return false;
      account.keys.delete(dialogId);
      emit(dialogId);
      return true;
    });
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

session.subscribe(user => {
  if (active) {
    active.controller.abort();
    active.keys.clear();
  }
  active = null;
  if (user) {
    const controller = new AbortController();
    const account = { id: user.publicId, keys: new Map(), controller, signal: controller.signal, restoring: true };
    active = account;
    account.ready = restore(account);
    account.pending = account.ready;
  }
  emit(null);
});
