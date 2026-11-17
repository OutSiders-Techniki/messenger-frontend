// Заглушка API для работы без бэкенда. Интерфейс и поведение повторяют
// httpApi из client.js и реальный messenger-backend: те же статусы,
// формат ID и тексты ошибок.
//
// Данные живут в sessionStorage вкладки и пропадают при её закрытии.
// Пароли хранятся только в виде SHA-256 — заглушка не должна приучать
// к хранению паролей в открытом виде даже в dev-режиме.
//
// Проверка состояний ошибок: в консоли браузера
//   sessionStorage.setItem('mock-fail', '429')   // или 500, 403, network
// — следующий запрос завершится этой ошибкой.

import { ApiError, NetworkError } from './errors.js';
import { reportUnauthorized } from './http.js';

const STORE_KEY = 'mock-api';
const FAIL_KEY = 'mock-fail';
const DELAY_MS = 300;

// Как в бэкенде (PublicIdGenerator): 12 символов без 0/O, 1/I/L и U.
const ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const ID_LENGTH = 12;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY));
    if (saved?.users) return { dialogs: [], messages: {}, ...saved };
  } catch {
    // Повреждённые данные заглушки — начинаем с чистого листа.
  }
  return { users: {}, dialogs: [], messages: {}, sessionUser: null };
}

const state = load();

function save() {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Без sessionStorage заглушка работает до перезагрузки страницы.
  }
}

async function respond() {
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));

  let fail = null;
  try {
    fail = sessionStorage.getItem(FAIL_KEY);
    sessionStorage.removeItem(FAIL_KEY);
  } catch {
    // ignore
  }
  if (fail === 'network') throw new NetworkError(new TypeError('Failed to fetch'));
  if (fail === '429') throw new ApiError(429, { title: 'Too Many Requests', retryAfter: 30 });
  if (fail === '401') {
    const error = unauthorized();
    reportUnauthorized(error);
    throw error;
  }
  if (fail) throw new ApiError(Number(fail) || 500, { title: 'Ошибка', detail: '' });
}

function problem(status, title, detail, errors) {
  return new ApiError(status, { title, detail, errors });
}

function unauthorized() {
  return problem(401, 'Требуется авторизация', 'Сессия отсутствует или закончилась. Войдите заново.');
}

async function hash(password) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function generatePublicId() {
  const result = [];
  // Отбрасываем байты ≥ 240, чтобы не было смещения по модулю 30.
  while (result.length < ID_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(ID_LENGTH))) {
      if (byte < 240 && result.length < ID_LENGTH) result.push(ID_ALPHABET[byte % ID_ALPHABET.length]);
    }
  }
  return result.join('');
}

// Защищённые методы: при отсутствии сессии ведут себя как http.js —
// сообщают о 401, чтобы приложение выполнило локальный выход.
function currentUser() {
  if (!state.sessionUser || !state.users[state.sessionUser]) {
    const error = unauthorized();
    reportUnauthorized(error);
    throw error;
  }
  return state.sessionUser;
}

function toDialog(dialog, me) {
  return {
    id: dialog.id,
    peerPublicId: dialog.members.find((m) => m !== me),
    createdAt: dialog.createdAt,
  };
}

export const mockApi = {
  auth: {
    async register({ password }) {
      await respond();
      const value = password ?? '';
      if (!value.trim()) throw problem(400, 'Ошибка валидации', 'Пароль обязателен.');
      if (value.length < MIN_PASSWORD) {
        throw problem(400, 'Ошибка валидации', `Пароль должен содержать не менее ${MIN_PASSWORD} символов.`);
      }
      if (value.length > MAX_PASSWORD) {
        throw problem(400, 'Ошибка валидации', `Пароль должен содержать не более ${MAX_PASSWORD} символов.`);
      }

      let publicId;
      do publicId = generatePublicId();
      while (state.users[publicId]);

      state.users[publicId] = { passwordHash: await hash(value), createdAt: new Date().toISOString() };
      save();
      return { publicId };
    },

    async login({ publicId, password }) {
      await respond();
      if (!publicId || !password || password.length < MIN_PASSWORD) {
        throw problem(400, 'Ошибка валидации', 'Проверьте правильность переданных данных.', {
          ...(!publicId ? { PublicId: ['Укажите публичный ID.'] } : {}),
          ...(!password ? { Password: ['Укажите пароль.'] } : {}),
          ...(password && password.length < MIN_PASSWORD
            ? { Password: [`Пароль должен быть не короче ${MIN_PASSWORD} символов.`] }
            : {}),
        });
      }
      const user = state.users[publicId];
      if (!user || user.passwordHash !== (await hash(password))) {
        throw problem(401, 'Неверные учётные данные', 'Неверный публичный ID или пароль.');
      }
      state.sessionUser = publicId;
      save();
      return { publicId, createdAt: user.createdAt };
    },

    async logout() {
      await respond();
      state.sessionUser = null;
      save();
    },

    async me() {
      await respond();
      const publicId = currentUser();
      return { publicId, createdAt: state.users[publicId].createdAt };
    },
  },

  users: {
    async findByPublicId(publicId) {
      await respond();
      currentUser();
      const user = state.users[publicId];
      if (!user) throw problem(404, 'Пользователь не найден', 'Пользователь не найден.');
      return { publicId, createdAt: user.createdAt };
    },
  },

  dialogs: {
    async create(peerPublicId) {
      await respond();
      const me = currentUser();
      const peer = peerPublicId?.trim();
      if (!peer) throw problem(400, 'Ошибка валидации', 'Укажите публичный ID собеседника.');
      if (!state.users[peer]) throw problem(404, 'Пользователь не найден', 'Пользователь не найден.');
      if (peer === me) throw problem(400, 'Ошибка валидации', 'Нельзя создать диалог с самим собой.');

      let dialog = state.dialogs.find((d) => d.members.includes(me) && d.members.includes(peer));
      if (!dialog) {
        dialog = { id: crypto.randomUUID(), members: [me, peer], createdAt: new Date().toISOString() };
        state.dialogs.push(dialog);
        save();
      }
      return toDialog(dialog, me);
    },

    async list() {
      await respond();
      const me = currentUser();
      return state.dialogs.filter((d) => d.members.includes(me)).map((d) => toDialog(d, me));
    },

    async get(dialogId) {
      await respond();
      const me = currentUser();
      const dialog = state.dialogs.find((d) => d.id === dialogId && d.members.includes(me));
      if (!dialog) throw problem(404, 'Диалог не найден', 'Диалог не найден.');
      return toDialog(dialog, me);
    },
  },

  // Сообщения хранятся как шифротекст — заглушка, как и сервер, текста не видит.
  messages: {
    async list(dialogId) {
      await respond();
      const me = currentUser();
      if (!state.dialogs.some((d) => d.id === dialogId && d.members.includes(me))) {
        throw problem(404, 'Диалог не найден', 'Диалог не найден.');
      }
      return { items: state.messages[dialogId] ?? [], nextBeforeId: null };
    },

    async send(dialogId, envelope) {
      await respond();
      const me = currentUser();
      if (!state.dialogs.some((d) => d.id === dialogId && d.members.includes(me))) {
        throw problem(404, 'Диалог не найден', 'Диалог не найден.');
      }
      const list = (state.messages[dialogId] ??= []);
      // Идемпотентность: повтор того же id не создаёт второе сообщение.
      if (!list.some((m) => m.envelope.id === envelope.id)) {
        list.push({ senderId: me, envelope, receivedAt: new Date().toISOString() });
        save();
      }
      return { id: envelope.id, receivedAt: new Date().toISOString() };
    },
  },
};
