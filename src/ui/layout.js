import { avatar, formatPublicId, loading } from './components.js';
import { dialogList } from './dialog-list.js';
import { h } from './dom.js';
import { icon } from './icons.js';

// ---------- Гостевые экраны: вход, регистрация ----------

const PROMISES = [
  ['lock', 'Шифрование на устройстве', 'Сообщения шифруются до отправки. Сервер хранит только шифротекст.'],
  ['key', 'Ключ из рук в руки', 'Ключ диалога передаётся лично и никогда не уходит в сеть.'],
  ['trash', 'Удаление без следов', 'Переписку можно стереть у себя или у обоих — физически, а не скрыть.'],
];

function brandMark() {
  return h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('lock', { size: 20 }));
}

// Компьютер: слева бренд и обещания продукта, справа форма.
// Телефон: только форма с логотипом сверху.
export function guestLayout(...content) {
  return h(
    'div',
    { class: 'auth' },
    h(
      'aside',
      { class: 'auth__brand' },
      h('div', { class: 'auth__logo' }, brandMark(), 'Мессенджер'),
      h(
        'div',
        { class: 'auth__pitch' },
        h('p', { class: 'auth__headline' }, 'Переписка, которую видите только вы и собеседник'),
        h(
          'ul',
          { class: 'auth__promises' },
          PROMISES.map(([name, title, text]) =>
            h(
              'li',
              { class: 'auth__promise' },
              h('span', { class: 'auth__promise-icon' }, icon(name, { size: 18 })),
              h('span', { class: 'auth__promise-text' }, h('strong', null, title), h('span', null, text)),
            ),
          ),
        ),
      ),
      h('p', { class: 'auth__foot' }, 'Без телефона и почты — только ID и пароль.'),
    ),
    h(
      'main',
      { class: 'auth__main' },
      h('div', { class: 'auth__form stack' }, h('div', { class: 'auth__mobile-logo' }, brandMark(), 'Мессенджер'), ...content),
    ),
  );
}

// ---------- Оболочка мессенджера после входа ----------

// view: 'list' — на телефоне виден список диалогов, 'pane' — правая часть.
// На компьютере обе колонки видны всегда.
// activeDialogId — какой диалог подсветить в списке.
export function appShell({ user, view = 'pane', activeDialogId = null, content }) {
  return h('div', { class: 'messenger', 'data-view': view }, sidebar({ user, activeDialogId }), content);
}

function sidebar({ user, activeDialogId }) {
  const publicId = user?.publicId ?? '';
  return h(
    'aside',
    { class: 'sidebar', 'aria-label': 'Диалоги' },
    h(
      'header',
      { class: 'sidebar__head' },
      h(
        'a',
        {
          href: '#/account',
          class: 'sidebar__me',
          title: 'Аккаунт',
          'aria-label': `Аккаунт, ваш ID ${formatPublicId(publicId)}`,
        },
        avatar(publicId, { size: 'sm' }),
      ),
      h('p', { class: 'sidebar__title' }, 'Сообщения'),
      h(
        'a',
        { href: '#/search', class: 'btn btn--ghost btn--icon', title: 'Новый диалог', 'aria-label': 'Новый диалог' },
        icon('plus'),
      ),
    ),
    h('a', { href: '#/search', class: 'sidebar__search' }, icon('search', { size: 18 }), h('span', null, 'Найти собеседника по ID')),
    h('div', { class: 'sidebar__body' }, dialogList({ activeId: activeDialogId })),
  );
}

// Правая часть: стеклянная шапка + содержимое.
// back — куда ведёт стрелка на телефоне.
export function pane({ title, subtitle, back = '/dialogs', lead, actions, variant = 'panel' }, ...body) {
  return h(
    'section',
    { class: `pane pane--${variant}` },
    h(
      'header',
      { class: 'pane__head' },
      h('a', { href: `#${back}`, class: 'btn btn--ghost btn--icon pane__back', 'aria-label': 'Назад' }, icon('arrow-left')),
      lead ?? null,
      h(
        'div',
        { class: 'pane__title' },
        h('h1', null, title),
        subtitle ? h('span', { class: 'pane__sub' }, subtitle) : null,
      ),
      actions ? h('div', { class: 'pane__actions' }, actions) : null,
    ),
    h('div', { class: 'pane__body' }, h('div', { class: 'pane__content' }, ...body)),
  );
}

// Правая часть, когда ничего не выбрано (видна только на компьютере).
export function paneEmpty(text) {
  return h(
    'section',
    { class: 'pane pane--empty' },
    h('h1', { class: 'visually-hidden' }, 'Диалоги'),
    h('p', { class: 'pane__hint' }, icon('lock', { size: 14 }), text),
  );
}

export function loadingView(text) {
  return h('main', { class: 'page page--centered' }, loading(text));
}

export function backLink(path, text) {
  return h('a', { href: `#${path}`, class: 'back-link' }, icon('arrow-left', { size: 16 }), text);
}
