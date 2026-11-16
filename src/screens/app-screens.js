// Экраны для вошедшего пользователя внутри оболочки мессенджера.
// Пока это каркасы; содержимое делается в отдельных задачах (номера в TODO).

import { logout } from '../actions/auth.js';
import { session } from '../state/session.js';
import { alert, avatar, button, formatPublicId } from '../ui/components.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { appShell, pane, paneEmpty } from '../ui/layout.js';

function shell(content, view = 'pane') {
  return appShell({ user: session.user, view, content });
}

// TODO(MSG-45): список диалогов в боковой панели, загрузка/пусто/ошибка.
export function dialogsScreen() {
  return shell(paneEmpty('Выберите диалог или найдите собеседника по ID'), 'list');
}

// TODO(MSG-44): поиск по точному публичному ID и создание диалога.
export function searchScreen() {
  return shell(
    pane(
      { title: 'Новый диалог', subtitle: 'Поиск по точному ID' },
      h('div', { class: 'card stack' }, h('p', { class: 'muted' }, 'Здесь будет поиск собеседника по точному ID.')),
    ),
  );
}

// TODO(MSG-47): лента сообщений, отправка, вложения.
export function chatScreen({ params }) {
  const keyPath = `/dialogs/${encodeURIComponent(params.dialogId)}/key`;
  return shell(
    pane(
      {
        title: 'Диалог',
        subtitle: params.dialogId,
        variant: 'chat',
        actions: h('a', { href: `#${keyPath}`, class: 'btn btn--ghost btn--icon', 'aria-label': 'Ключ диалога' }, icon('key')),
      },
      h(
        'p',
        { class: 'chat__notice' },
        icon('lock', { size: 13 }),
        'Сообщения шифруются на ваших устройствах. Сервер их не видит.',
      ),
    ),
  );
}

// TODO(MSG-46): показ сгенерированного ключа и ввод ключа собеседника.
export function dialogKeyScreen({ params }) {
  return shell(
    pane(
      { title: 'Ключ диалога', back: `/dialogs/${encodeURIComponent(params.dialogId)}` },
      h(
        'div',
        { class: 'key-prompt' },
        h('span', { class: 'key-prompt__icon' }, icon('key', { size: 28 })),
        h('h2', null, 'Ключ диалога'),
        h('p', { class: 'muted' }, 'Здесь будет показ и ввод ключа в формате Base32.'),
      ),
    ),
  );
}

// Аккаунт: свой ID, ключи на этом устройстве, выход.
// TODO(MSG-34): режим хранения ключей — на устройстве или «не запоминать».
// TODO(MSG-39): «Выйти и удалить сохранённые ключи с устройства».
export function accountScreen() {
  const publicId = session.user?.publicId ?? '';
  return shell(
    pane(
      { title: 'Аккаунт' },
      h(
        'div',
        { class: 'profile' },
        avatar(publicId, { size: 'xl' }),
        h('p', { class: 'profile__id' }, formatPublicId(publicId)),
        h('p', { class: 'muted text-sm' }, 'Ваш ID — по нему вы входите, а собеседники находят вас.'),
      ),
      alert({ tone: 'info' }, 'Здесь будут настройки хранения ключей на этом устройстве.'),
      button({ variant: 'secondary', block: true, onClick: logout }, icon('log-out', { size: 18 }), 'Выйти'),
    ),
  );
}
