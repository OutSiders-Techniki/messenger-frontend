// Ключи диалогов текущего пользователя.
// Ключ импортируется как неизвлекаемый CryptoKey AES-GCM: после импорта
// приложение не может прочитать его байты — только шифровать и расшифровывать.
//
// Сейчас ключи живут только в памяти вкладки и пропадают при перезагрузке.
// TODO(MSG-34): сохранение в IndexedDB, если пользователь не выбрал
// «Не запоминать на этом устройстве».

import { session } from './session.js';

const keys = new Map(); // dialogId → { key: CryptoKey, remember: boolean }
const listeners = new Set();

function emit() {
  for (const listener of [...listeners]) listener();
}

export const keysStore = {
  has(dialogId) {
    return keys.has(dialogId);
  },

  get(dialogId) {
    return keys.get(dialogId)?.key ?? null;
  },

  remembered(dialogId) {
    return keys.get(dialogId)?.remember ?? false;
  },

  // bytes — 32 байта ключа. После импорта массив обнуляется.
  async set(dialogId, bytes, { remember = true } = {}) {
    const generation = session.generation;
    try {
      if (!session.isAuthenticated) return false;
      const key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      if (generation !== session.generation) return false;
      keys.set(dialogId, { key, remember });
      emit();
      return true;
    } finally {
      bytes.fill(0);
    }
  },

  remove(dialogId) {
    keys.delete(dialogId);
    emit();
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// Выход или смена аккаунта — ключи из памяти убираем (UC-03).
session.subscribe(() => {
  keys.clear();
  emit();
});
