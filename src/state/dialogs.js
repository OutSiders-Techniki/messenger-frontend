// Список диалогов текущего пользователя в памяти вкладки.
// Боковая панель, поиск и шапка чата читают его отсюда, поэтому список
// не перезапрашивается при каждом переходе, а новый диалог виден сразу.

import { api } from '../api/index.js';
import { session } from './session.js';

// Через сколько считать список устаревшим и тихо обновить при переходе.
const STALE_MS = 30_000;
// Пока нет событий SignalR, список опрашивается, если вкладка на экране.
// TODO(MSG-48): заменить опрос событием DialogUpdated от сервера.
const POLL_MS = 15_000;

let items = [];
let status = 'idle'; // idle | loading | ready | error
let error = null;
let loadedAt = 0;
let pending = null;
// listener → элемент страницы, которому он принадлежит (или null).
const listeners = new Map();
const seenOwners = new WeakSet();

// Убираем подписки элементов, которые уже были на странице и исчезли
// (экран сменился). Ещё не вставленные элементы не трогаем.
function prune() {
  for (const [listener, owner] of listeners) {
    if (!owner) continue;
    if (owner.isConnected) seenOwners.add(owner);
    else if (seenOwners.has(owner)) listeners.delete(listener);
  }
}

function emit() {
  prune();
  for (const listener of [...listeners.keys()]) listener();
}

// Новые сверху. Когда бэкенд начнёт отдавать время последнего сообщения,
// сортировать нужно будет по нему.
function sorted(list) {
  return [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function sameList(a, b) {
  return a.length === b.length && a.every((d, i) => d.id === b[i].id && d.peerPublicId === b[i].peerPublicId);
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
        const next = sorted(list);
        const changed = status !== 'ready' || !sameList(items, next);
        items = next;
        status = 'ready';
        error = null;
        loadedAt = Date.now();
        // Без изменений не перерисовываем: не сбиваем фокус и прокрутку.
        if (changed) emit();
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

  // owner — элемент, при исчезновении которого со страницы подписка снимается сама.
  subscribe(listener, { owner = null } = {}) {
    prune();
    listeners.set(listener, owner);
    return () => listeners.delete(listener);
  },
};

// ---------- Автообновление ----------

function refreshIfVisible() {
  prune();
  if (session.isAuthenticated && document.visibilityState === 'visible' && listeners.size > 0) {
    dialogsStore.load({ force: true });
  }
}

setInterval(refreshIfVisible, POLL_MS);
// Вернулись на вкладку — сразу проверяем, не появились ли новые диалоги.
document.addEventListener('visibilitychange', refreshIfVisible);
window.addEventListener('focus', refreshIfVisible);

// Выход или смена аккаунта — чужой список больше не показываем.
session.subscribe(() => {
  items = [];
  status = 'idle';
  error = null;
  loadedAt = 0;
  pending = null;
  emit();
});
