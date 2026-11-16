// Список диалогов в боковой панели (MSG-45).
// Состояния: загрузка (скелетон), пусто, ошибка с повтором, список.

import { errorMessage } from '../api/index.js';
import { formatListTime } from '../lib/format.js';
import { dialogsStore } from '../state/dialogs.js';
import { avatar, button, emptyState, formatPublicId } from './components.js';
import { h } from './dom.js';
import { icon } from './icons.js';

const SKELETON_ROWS = 5;

export function dialogList({ activeId = null } = {}) {
  const root = h('div', { class: 'dialog-list-wrap' });

  function render() {
    const { status, items } = dialogsStore;

    if (status === 'error') {
      root.replaceChildren(
        h(
          'div',
          { class: 'dialog-list__error', role: 'alert' },
          h('p', null, errorMessage(dialogsStore.error)),
          button(
            { variant: 'secondary', size: 'sm', onClick: () => dialogsStore.load({ force: true }) },
            'Повторить',
          ),
        ),
      );
      return;
    }

    if (status !== 'ready') {
      root.replaceChildren(skeleton());
      return;
    }

    if (items.length === 0) {
      root.replaceChildren(
        emptyState({
          title: 'Диалогов пока нет',
          text: 'Найдите собеседника по ID, а ключ передайте при встрече.',
          action: h(
            'a',
            { href: '#/search', class: 'btn btn--primary btn--sm' },
            icon('plus', { size: 16 }),
            'Новый диалог',
          ),
        }),
      );
      return;
    }

    root.replaceChildren(
      h(
        'ul',
        { class: 'dialog-list', 'aria-label': 'Диалоги' },
        items.map((dialog) => item(dialog, dialog.id === activeId)),
      ),
    );
  }

  // Панель пересоздаётся при каждом переходе. Подписка снимается сама,
  // когда эта панель уже побывала на странице и была убрана.
  let mounted = false;
  const unsubscribe = dialogsStore.subscribe(() => {
    if (root.isConnected) mounted = true;
    else if (mounted) {
      unsubscribe();
      return;
    }
    render();
  });

  render();
  queueMicrotask(() => dialogsStore.load());
  return root;
}

function item(dialog, active) {
  return h(
    'li',
    null,
    h(
      'a',
      {
        href: `#/dialogs/${encodeURIComponent(dialog.id)}`,
        class: `dialog-item${active ? ' dialog-item--active' : ''}`,
        'aria-current': active ? 'page' : null,
      },
      avatar(dialog.peerPublicId),
      h(
        'span',
        { class: 'dialog-item__main' },
        h(
          'span',
          { class: 'dialog-item__row' },
          h('span', { class: 'dialog-item__title' }, formatPublicId(dialog.peerPublicId)),
          h('span', { class: 'dialog-item__time' }, formatListTime(dialog.createdAt)),
        ),
        h(
          'span',
          { class: 'dialog-item__row' },
          // TODO(MSG-47): последнее сообщение после расшифровки.
          h('span', { class: 'dialog-item__preview' }, 'Сообщений пока нет'),
        ),
      ),
    ),
  );
}

function skeleton() {
  return h(
    'ul',
    { class: 'dialog-list', 'aria-busy': 'true', 'aria-label': 'Загружаем диалоги' },
    Array.from({ length: SKELETON_ROWS }, () =>
      h(
        'li',
        { class: 'dialog-item dialog-item--skeleton', 'aria-hidden': 'true' },
        h('span', { class: 'skeleton skeleton--circle' }),
        h(
          'span',
          { class: 'dialog-item__main' },
          h('span', { class: 'skeleton skeleton--line' }),
          h('span', { class: 'skeleton skeleton--line skeleton--short' }),
        ),
      ),
    ),
  );
}
