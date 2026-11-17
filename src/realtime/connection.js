// Соединение с сервером для доставки в реальном времени (MSG-48).
//
// Состояния: connecting → online; при сбое — reconnecting с нарастающей
// паузой; без сети у устройства — offline. После восстановления связи
// клиент сверяет открытый диалог и список диалогов с сервером (MSG-52):
// так исчезают сообщения, удалённые, пока вкладка была без связи.
//
// Транспорт сейчас — короткий опрос REST. TODO(backend MSG-017): когда
// в messenger-backend появится SignalR-хаб, подписаться на события
// MessageReceived / MessagesDeleted / DialogUpdated и оставить опрос
// запасным вариантом.

import { api, ApiError } from '../api/index.js';
import { dialogsStore } from '../state/dialogs.js';
import { messagesStore } from '../state/messages.js';
import { session } from '../state/session.js';

const POLL_MS = 4000;
const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000];

let state = 'idle'; // idle | connecting | online | reconnecting | offline
let attempt = 0;
let timer = null;
let watchedDialog = null;
let running = false;
const listeners = new Set();

function setState(next) {
  if (state === next) return;
  const previous = state;
  state = next;
  for (const listener of [...listeners]) listener(state, previous);
}

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(tick, ms);
}

async function resync() {
  if (watchedDialog) await messagesStore.retryFailed(watchedDialog);
  await Promise.all([
    dialogsStore.load({ force: true }),
    watchedDialog ? messagesStore.load(watchedDialog, { silent: true }) : null,
  ]);
}

async function tick() {
  if (!running) return;

  if (!navigator.onLine) {
    setState('offline');
    return; // ждём события online
  }

  // Вкладка в фоне — не нагружаем сервер, проверим при возврате.
  if (document.visibilityState === 'hidden') {
    schedule(POLL_MS);
    return;
  }

  const wasDown = state === 'reconnecting' || state === 'offline' || state === 'connecting';
  try {
    if (watchedDialog) await messagesStore.load(watchedDialog, { silent: true, throwOnError: true });
    else await api.auth.me();
    if (wasDown) await resync();
    attempt = 0;
    setState('online');
    schedule(POLL_MS);
  } catch (err) {
    // 401 обрабатывает общий обработчик сессии — дальше не пытаемся.
    if (err instanceof ApiError && err.status === 401) return;
    setState(state === 'connecting' || state === 'online' ? 'reconnecting' : state);
    schedule(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
    attempt += 1;
  }
}

export const connection = {
  get state() {
    return state;
  },

  start() {
    if (running) return;
    running = true;
    attempt = 0;
    setState('connecting');
    tick();
  },

  stop() {
    running = false;
    clearTimeout(timer);
    setState('idle');
  },

  // Открытый диалог: его сообщения проверяются при каждом опросе.
  watch(dialogId) {
    watchedDialog = dialogId;
    if (running && state === 'online') schedule(0);
  },

  unwatch(dialogId) {
    if (watchedDialog === dialogId) watchedDialog = null;
  },

  // Попробовать прямо сейчас (кнопка «Повторить»).
  retryNow() {
    if (!running) return;
    attempt = 0;
    if (state !== 'online') setState(navigator.onLine ? 'reconnecting' : 'offline');
    schedule(0);
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

window.addEventListener('online', () => connection.retryNow());
window.addEventListener('offline', () => {
  if (running) setState('offline');
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && running) schedule(0);
});

// Соединение живёт, пока пользователь вошёл.
session.subscribe(() => {
  if (session.isAuthenticated) connection.start();
  else connection.stop();
});
