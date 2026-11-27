import { toMessage } from '../api/client.js';
import { api, apiMode, ApiError } from '../api/index.js';
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
let hub = null;

function createHub() {
  // Long Polling поддерживает доставку событий SignalR через обычный HTTP-прокси.
  const { HubConnectionBuilder, HttpTransportType, LogLevel } = window.signalR;
  const client = new HubConnectionBuilder()
    .withUrl('/hubs/messages', { transport: HttpTransportType.LongPolling, withCredentials: true })
    .configureLogging(LogLevel.None)
    .build();
  client.on('MessageReceived', async ({ message }) => {
    if (client !== hub || !message?.dialogId) return;
    if (message.dialogId === watchedDialog) await messagesStore.receive(message.dialogId, toMessage(message));
    if (client === hub && !dialogsStore.find(message.dialogId)) await dialogsStore.load({ force: true });
  });
  client.on('MessageDeleted', ({ dialogId, id }) => {
    if (client === hub && dialogId && id) messagesStore.applyServerDeletion(dialogId, id);
  });
  client.onclose(() => {
    if (client !== hub) return;
    setState(navigator.onLine ? 'reconnecting' : 'offline');
    if (navigator.onLine) schedule(BACKOFF_MS[0]);
  });
  return client;
}
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

function disconnectHub() {
  const old = hub;
  hub = null;
  if (old) void old.stop();
}

async function resync() {
  const generation = session.generation;
  if (watchedDialog) await messagesStore.retryFailed(watchedDialog);
  if (generation !== session.generation) return;
  await Promise.all([
    dialogsStore.load({ force: true }),
    watchedDialog ? messagesStore.load(watchedDialog, { silent: true, afterPending: true }) : null,
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

  const generation = session.generation;
  const wasDown = state === 'reconnecting' || state === 'offline' || state === 'connecting';
  let client = null;
  try {
    if (apiMode === 'real') {
      client = hub ??= createHub();
      if (client.state === 'Connecting' || client.state === 'Disconnecting') return;
      if (client.state === 'Disconnected') {
        await client.start();
        if (generation !== session.generation || client !== hub) return;
        attempt = 0;
        setState('online');
        await resync();
      } else if (wasDown) {
        attempt = 0;
        setState('online');
        await resync();
      }
      return;
    }
    if (watchedDialog) await messagesStore.load(watchedDialog, { silent: true, throwOnError: true });
    else await api.auth.me();
    if (generation !== session.generation) return;
    if (wasDown) await resync();
    if (generation !== session.generation) return;
    attempt = 0;
    setState('online');
    schedule(POLL_MS);
  } catch (err) {
    if (generation !== session.generation || (client && client !== hub)) return;
    if (err.statusCode === 401) {
      session.clear();
      return;
    }
    // 401 обрабатывает общий обработчик сессии — дальше не пытаемся.
    if (err instanceof ApiError && err.status === 401) return;
    if (apiMode === 'mock' && err instanceof ApiError && err.status < 500) {
      setState('online');
      schedule(POLL_MS);
      return;
    }
    setState(navigator.onLine ? 'reconnecting' : 'offline');
    schedule(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
    attempt += 1;
    // Пока хаб недоступен, читаем историю через REST при попытках подключения.
    if (apiMode === 'real' && watchedDialog && navigator.onLine) {
      await messagesStore.load(watchedDialog, { silent: true });
    }
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
    watchedDialog = null;
    disconnectHub();
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
  if (!running) return;
  clearTimeout(timer);
  disconnectHub();
  setState('offline');
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && running) schedule(0);
});

// Соединение живёт, пока пользователь вошёл.
session.subscribe(() => {
  connection.stop();
  if (session.isAuthenticated) connection.start();
});
