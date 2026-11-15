// Заглушка API, пока нет бэкенда. Повторяет предложенный контракт
// из docs/auth-flows.md: register / login / me / logout.
//
// Данные живут в sessionStorage вкладки и пропадают при её закрытии.
// Пароли хранятся только в виде SHA-256 — заглушка не должна приучать
// к хранению паролей в открытом виде даже в dev-режиме.

import { ApiError } from './errors.js';

const STORE_KEY = 'mock-api';
const DELAY_MS = 300;
// Алфавит публичного ID: без I, O, 0, 1.
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_LENGTH = 8;

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY)) ?? { users: {}, sessionUser: null };
  } catch {
    return { users: {}, sessionUser: null };
  }
}

function save(state) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Без sessionStorage заглушка работает до перезагрузки страницы.
  }
}

const state = load();

function delay() {
  return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

async function hash(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function generatePublicId() {
  const random = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  // 256 делится на 32 без остатка, поэтому распределение равномерное.
  return Array.from(random, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

export const mockApi = {
  async register({ password }) {
    await delay();
    if (!password) {
      throw new ApiError(400, {
        code: 'validation',
        fieldErrors: { password: 'required' },
      });
    }

    let publicId;
    do {
      publicId = generatePublicId();
    } while (state.users[publicId]);

    state.users[publicId] = { passwordHash: await hash(password) };
    save(state);
    return { publicId };
  },

  async login({ publicId, password }) {
    await delay();
    const user = state.users[publicId];
    if (!user || user.passwordHash !== (await hash(password ?? ''))) {
      throw new ApiError(401, { code: 'invalid_credentials' });
    }
    state.sessionUser = publicId;
    save(state);
    return { publicId };
  },

  async me() {
    await delay();
    if (!state.sessionUser) throw new ApiError(401, { code: 'unauthorized' });
    return { publicId: state.sessionUser };
  },

  async logout() {
    await delay();
    if (!state.sessionUser) throw new ApiError(401, { code: 'unauthorized' });
    state.sessionUser = null;
    save(state);
  },
};
