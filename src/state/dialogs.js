// Список диалогов текущего пользователя в памяти вкладки.
// Боковая панель, поиск и шапка чата читают его отсюда, поэтому список
// не перезапрашивается при каждом переходе, а новый диалог виден сразу.

import { api } from '../api/index.js';
import { session } from './session.js';

// Через сколько считать список устаревшим и тихо обновить при переходе.
const STALE_MS = 30_000;

let items = [];
let status = 'idle'; // idle | loading | ready | error
let error = null;
let loadedAt = 0;
let pending = null;
const listeners = new Set();

function emit() {
  for (const listener of [...listeners]) listener();
}

// Новые сверху. Когда бэкенд начнёт отдавать время последнего сообщения,
// сортировать нужно будет по нему.
function sorted(list) {
  return [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export const dialogsStore = {
  get items() {
    return items;
  },
  get status() {
    return status;
  },
  get error() {
    return error;
  },

  find(id) {
    return items.find((d) => d.id === id) ?? null;
  },

  findByPeer(publicId) {
    return items.find((d) => d.peerPublicId === publicId) ?? null;
  },

  // Загрузить список. Без force повторно не грузит свежий список.
  load({ force = false } = {}) {
    if (pending) return pending;
    const fresh = status === 'ready' && Date.now() - loadedAt < STALE_MS;
    if (fresh && !force) return Promise.resolve(items);

    const generation = session.generation;
    // Если список уже показан, обновляем его тихо, без индикатора загрузки.
    if (status !== 'ready') {
      status = 'loading';
      error = null;
      emit();
    }

    pending = api.dialogs
      .list()
      .then((list) => {
        // Пока шёл запрос, пользователь вышел или сменил аккаунт.
        if (generation !== session.generation) return items;
        items = sorted(list);
        status = 'ready';
        error = null;
        loadedAt = Date.now();
        emit();
        return items;
      })
      .catch((err) => {
        if (generation !== session.generation) return items;
        // Ошибку показываем, только если показать нечего.
        if (status !== 'ready') {
          status = 'error';
          error = err;
          emit();
        }
        return items;
      })
      .finally(() => {
        pending = null;
      });

    return pending;
  },

  // Добавить или обновить диалог (после создания) — он сразу появится в списке.
  upsert(dialog) {
    items = sorted([dialog, ...items.filter((d) => d.id !== dialog.id)]);
    if (status !== 'ready') {
      status = 'ready';
      loadedAt = Date.now();
    }
    emit();
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// Выход или смена аккаунта — чужой список больше не показываем.
session.subscribe(() => {
  items = [];
  status = 'idle';
  error = null;
  loadedAt = 0;
  pending = null;
  emit();
});
