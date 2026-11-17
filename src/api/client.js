// HTTP-клиент реального бэкенда (messenger-backend).
// Ответы сервера переводятся в модели клиента, чтобы экраны не зависели
// от названий полей в DTO.
//
// Модели:
//   User   { publicId, createdAt }
//   Dialog { id, peerPublicId, createdAt }

import { request } from './http.js';

function toUser(dto) {
  return { publicId: dto.publicId, createdAt: dto.createdAt ?? null };
}

function toDialog(dto) {
  return { id: String(dto.id), peerPublicId: dto.companionPublicId, createdAt: dto.createdAt };
}

export const httpApi = {
  auth: {
    // 201 { publicId }. Ошибки: 400 — пароль не подходит.
    async register({ password }) {
      const dto = await request('POST', '/auth/register', { body: { password } });
      return { publicId: dto.publicId };
    },

    // 200 { publicId } + cookie. Ошибки: 400 — формат, 401 — неверные данные.
    async login({ publicId, password }) {
      const dto = await request('POST', '/auth/login', { body: { publicId, password }, allowUnauthorized: true });
      return toUser(dto);
    },

    // 204. Отзывает сессию и удаляет cookie.
    async logout() {
      await request('POST', '/auth/logout', { allowUnauthorized: true });
    },

    // 200 { publicId, createdAt }. 401 — сессии нет.
    async me() {
      return toUser(await request('GET', '/auth/me', { allowUnauthorized: true }));
    },
  },

  users: {
    // 200 { publicId, createdAt }. 404 — пользователь не найден.
    async findByPublicId(publicId, { signal } = {}) {
      return toUser(await request('GET', `/users/by-id/${encodeURIComponent(publicId)}`, { signal }));
    },
  },

  dialogs: {
    // 201 — создан, 200 — такой диалог уже был. Ошибки: 400 — с самим собой, 404 — нет пользователя.
    async create(peerPublicId) {
      const dto = await request('POST', '/dialogs', { body: { publicId: peerPublicId } });
      return toDialog(dto);
    },

    async list({ signal } = {}) {
      const items = await request('GET', '/dialogs', { signal });
      return (items ?? []).map(toDialog);
    },

    // 404 — диалога нет или пользователь в нём не участвует.
    async get(dialogId, { signal } = {}) {
      return toDialog(await request('GET', `/dialogs/${encodeURIComponent(dialogId)}`, { signal }));
    },
  },

  // Сообщения: только шифротекст. TODO(backend MSG-019/020): эндпоинтов
  // в messenger-backend пока нет — пути по матрице контрактов аналитиков,
  // формат элемента — по контракту шифрования { senderId, envelope }.
  // Сверить, когда бэкенд их опубликует.
  messages: {
    // История копии текущего пользователя, новые в конце.
    async list(dialogId, { beforeId, limit = 50, signal } = {}) {
      const query = new URLSearchParams({ limit: String(limit) });
      if (beforeId) query.set('beforeId', beforeId);
      const dto = await request('GET', `/dialogs/${encodeURIComponent(dialogId)}/messages?${query}`, { signal });
      return {
        items: (dto?.items ?? []).map(toMessage),
        nextBeforeId: dto?.nextBeforeId ?? null,
      };
    },

    async send(dialogId, envelope) {
      const dto = await request('POST', `/dialogs/${encodeURIComponent(dialogId)}/messages`, { body: envelope });
      return { id: dto?.id ?? envelope.id, receivedAt: dto?.receivedAt ?? null };
    },

    // Физическое удаление своей копии: выбранных сообщений или всей переписки
    // (messageIds не передан). Копия собеседника остаётся (FR-11).
    async deleteSelf(dialogId, messageIds) {
      await request('POST', `/dialogs/${encodeURIComponent(dialogId)}/messages/delete-self`, {
        body: messageIds ? { messageIds } : {},
      });
    },

    // Удаление обеих копий (FR-12). Подключённый собеседник получит событие.
    async deleteBoth(dialogId, messageIds) {
      await request('POST', `/dialogs/${encodeURIComponent(dialogId)}/messages/delete-both`, { body: { messageIds } });
    },
  },
};

function toMessage(dto) {
  const envelope = dto.envelope ?? { v: dto.v, id: dto.id, sentAt: dto.sentAt, iv: dto.iv, ct: dto.ct };
  return { senderId: dto.senderId ?? dto.senderPublicId, envelope, receivedAt: dto.receivedAt ?? null };
}
