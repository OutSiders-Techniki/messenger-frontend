// Экраны для вошедшего пользователя. Пока это каркасы с навигацией;
// содержимое делается в отдельных задачах, номера указаны в TODO.

import { logout } from '../actions/auth.js';
import { session } from '../state/session.js';
import { emptyState } from '../ui/components.js';
import { h, link } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { appLayout, backLink } from '../ui/layout.js';

function page(...content) {
  return appLayout({ user: session.user, onLogout: logout }, ...content);
}

function newDialogLink() {
  return h('a', { href: '#/search', class: 'btn btn--primary' }, icon('plus', { size: 18 }), 'Новый диалог');
}

// TODO(MSG-45): список диалогов, загрузка/пусто/ошибка.
export function dialogsScreen() {
  return page(
    h('div', { class: 'page-head' }, h('h1', null, 'Диалоги'), newDialogLink()),
    emptyState({
      title: 'Диалогов пока нет',
      text: 'Найдите собеседника по его ID и договоритесь о встрече, чтобы передать ключ.',
    }),
  );
}

// TODO(MSG-44): поиск по точному публичному ID и создание диалога.
export function searchScreen() {
  return page(
    backLink('/dialogs', 'Диалоги'),
    h('div', { class: 'page-head' }, h('h1', null, 'Новый диалог')),
    h('p', { class: 'muted' }, 'Здесь будет поиск собеседника по точному ID.'),
  );
}

// TODO(MSG-47): лента сообщений, отправка, вложения.
export function chatScreen({ params }) {
  return page(
    backLink('/dialogs', 'Диалоги'),
    h('div', { class: 'page-head' }, h('h1', null, 'Диалог')),
    h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted' }, 'ID диалога: ', h('code', null, params.dialogId)),
      link(`/dialogs/${encodeURIComponent(params.dialogId)}/key`, 'Ключ диалога'),
    ),
  );
}

// TODO(MSG-46): показ сгенерированного ключа и ввод ключа собеседника.
export function dialogKeyScreen({ params }) {
  return page(
    backLink(`/dialogs/${encodeURIComponent(params.dialogId)}`, 'К диалогу'),
    h('div', { class: 'page-head' }, h('h1', null, 'Ключ диалога')),
    h('p', { class: 'muted' }, 'Здесь будет показ и ввод ключа в формате Base32.'),
  );
}

// Аккаунт: свой ID и управление ключами на этом устройстве.
// TODO(MSG-34): режим хранения ключей — на устройстве или «не запоминать».
// TODO(MSG-39): «Выйти и удалить сохранённые ключи с устройства».
export function accountScreen() {
  return page(
    backLink('/dialogs', 'Диалоги'),
    h('div', { class: 'page-head' }, h('h1', null, 'Аккаунт')),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, 'Ваш ID'),
      h('p', { class: 'muted' }, 'По нему вы входите, а собеседники находят вас.'),
      h('p', { class: 'code-block' }, session.user?.publicId ?? ''),
    ),
  );
}
