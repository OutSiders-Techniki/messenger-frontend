// Экраны для вошедшего пользователя внутри оболочки мессенджера.
// Пока это каркасы; содержимое делается в отдельных задачах (номера в TODO).

import { logout } from '../actions/auth.js';
import { dialogsStore } from '../state/dialogs.js';
import { keysStore } from '../state/keys.js';
import { session } from '../state/session.js';
import { alert, avatar, button, formatPublicId } from '../ui/components.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { appShell, pane, paneEmpty } from '../ui/layout.js';
import { appearanceSettings } from '../ui/appearance.js';
import { lockButton } from '../ui/chat.js';

function shell(content, { view = 'pane', activeDialogId = null } = {}) {
  return appShell({ user: session.user, view, activeDialogId, content });
}

// Список диалогов — в боковой панели (на телефоне это и есть экран).
// При открытии обновляем его, чтобы увидеть диалоги, созданные собеседниками.
export function dialogsScreen() {
  queueMicrotask(() => dialogsStore.load({ force: true }));
  return shell(paneEmpty('Выберите диалог или найдите собеседника по ID'), { view: 'list' });
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
      h('section', { class: 'card' }, h('h2', { class: 'card__title' }, 'Оформление'), appearanceSettings()),
      alert({ tone: 'info' }, 'Здесь будут настройки хранения ключей на этом устройстве.'),
      button({ variant: 'secondary', block: true, onClick: logout }, icon('log-out', { size: 18 }), 'Выйти'),
    ),
  );
}
