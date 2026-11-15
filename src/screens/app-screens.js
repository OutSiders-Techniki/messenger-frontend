// Экраны для вошедшего пользователя. Пока это каркасы с навигацией;
// содержимое делается в отдельных задачах, номера указаны в TODO.

import { logout } from '../actions/auth.js';
import { session } from '../state/session.js';
import { h, link } from '../ui/dom.js';
import { appLayout } from '../ui/layout.js';

function page(...content) {
  return appLayout({ user: session.user, onLogout: logout }, ...content);
}

// TODO(MSG-45): список диалогов, загрузка/пусто/ошибка.
export function dialogsScreen() {
  return page(
    h(
      'div',
      { class: 'page-head' },
      h('h1', null, 'Диалоги'),
      link('/search', 'Новый диалог', { class: 'btn btn--primary' }),
    ),
    h('p', { class: 'empty' }, 'Диалогов пока нет. Найдите собеседника по его ID.'),
  );
}

// TODO(MSG-44): поиск по точному публичному ID и создание диалога.
export function searchScreen() {
  return page(
    link('/dialogs', '← Диалоги', { class: 'back-link' }),
    h('h1', null, 'Новый диалог'),
    h('p', { class: 'muted' }, 'Здесь будет поиск собеседника по точному ID.'),
  );
}

// TODO(MSG-47): лента сообщений, отправка, вложения.
export function chatScreen({ params }) {
  return page(
    link('/dialogs', '← Диалоги', { class: 'back-link' }),
    h('h1', null, 'Диалог'),
    h('p', { class: 'muted' }, 'ID диалога: ', h('code', null, params.dialogId)),
    link(`/dialogs/${encodeURIComponent(params.dialogId)}/key`, 'Ключ диалога'),
  );
}

// Аккаунт: свой ID и управление ключами на этом устройстве.
// TODO(MSG-34): режим хранения ключей — на устройстве или «не запоминать».
// TODO(MSG-39): «Выйти и удалить сохранённые ключи с устройства».
export function accountScreen() {
  return page(
    link('/dialogs', '← Диалоги', { class: 'back-link' }),
    h('h1', null, 'Аккаунт'),
    h('p', { class: 'muted' }, 'Ваш ID — по нему вы входите, а собеседники находят вас.'),
    h('p', { class: 'public-id' }, session.user?.publicId ?? ''),
    h('p', { class: 'muted' }, 'Здесь будут настройки хранения ключей на этом устройстве.'),
  );
}

// TODO(MSG-46): показ сгенерированного ключа и ввод ключа собеседника.
export function dialogKeyScreen({ params }) {
  return page(
    link(`/dialogs/${encodeURIComponent(params.dialogId)}`, '← К диалогу', { class: 'back-link' }),
    h('h1', null, 'Ключ диалога'),
    h('p', { class: 'muted' }, 'Здесь будет показ и ввод ключа в формате Base32.'),
  );
}
