// Экраны для вошедшего пользователя внутри оболочки мессенджера.
// Пока это каркасы; содержимое делается в отдельных задачах (номера в TODO).

import { logout } from '../actions/auth.js';
import { dialogsStore } from '../state/dialogs.js';
import { session } from '../state/session.js';
import { alert, avatar, button, formatPublicId } from '../ui/components.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { appShell, pane, paneEmpty } from '../ui/layout.js';

function shell(content, { view = 'pane', activeDialogId = null } = {}) {
  return appShell({ user: session.user, view, activeDialogId, content });
}

// Шапка диалога: аватар и ID собеседника из списка диалогов.
// Пока список грузится — нейтральная заглушка; если диалога в списке нет
// (чужой или удалён) — сообщение об этом.
function dialogHeader(dialogId) {
  const lead = h('span', { class: 'pane__lead' });
  const title = h('span', null, 'Диалог');
  const subtitle = h('span', null, '');

  function render() {
    const dialog = dialogsStore.find(dialogId);
    if (dialog) {
      lead.replaceChildren(avatar(dialog.peerPublicId, { size: 'sm' }));
      title.textContent = formatPublicId(dialog.peerPublicId);
      subtitle.replaceChildren(icon('lock', { size: 12 }), 'Сквозное шифрование');
    } else if (dialogsStore.status === 'ready') {
      lead.replaceChildren();
      title.textContent = 'Диалог не найден';
      subtitle.textContent = 'Его нет в вашем списке диалогов';
    } else {
      lead.replaceChildren(h('span', { class: 'skeleton skeleton--circle skeleton--sm' }));
    }
  }

  let mounted = false;
  const unsubscribe = dialogsStore.subscribe(() => {
    if (lead.isConnected) mounted = true;
    else if (mounted) {
      unsubscribe();
      return;
    }
    render();
  });
  render();

  return { lead, title, subtitle };
}

// Список диалогов — в боковой панели (на телефоне это и есть экран).
// При открытии обновляем его, чтобы увидеть диалоги, созданные собеседниками.
export function dialogsScreen() {
  queueMicrotask(() => dialogsStore.load({ force: true }));
  return shell(paneEmpty('Выберите диалог или найдите собеседника по ID'), { view: 'list' });
}

// TODO(MSG-47): лента сообщений, отправка, вложения.
export function chatScreen({ params }) {
  const keyPath = `/dialogs/${encodeURIComponent(params.dialogId)}/key`;
  const header = dialogHeader(params.dialogId);
  return shell(
    pane(
      {
        ...header,
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
    { activeDialogId: params.dialogId },
  );
}

// TODO(MSG-46): показ сгенерированного ключа и ввод ключа собеседника.
export function dialogKeyScreen({ params }) {
  const header = dialogHeader(params.dialogId);
  return shell(
    pane(
      { ...header, subtitle: 'Ключ диалога', back: `/dialogs/${encodeURIComponent(params.dialogId)}` },
      h(
        'div',
        { class: 'key-prompt' },
        h('span', { class: 'key-prompt__icon' }, icon('key', { size: 28 })),
        h('h2', null, 'Ключ диалога'),
        h('p', { class: 'muted' }, 'Здесь будет показ и ввод ключа в формате Base32.'),
      ),
    ),
    { activeDialogId: params.dialogId },
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
