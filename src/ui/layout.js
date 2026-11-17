import { avatar, formatPublicId, loading } from './components.js';
import { preferences } from '../state/preferences.js';
import { dialogList } from './dialog-list.js';
import { h } from './dom.js';
import { icon } from './icons.js';

// ---------- Гостевые экраны: вход, регистрация ----------

const PROMISES = [
  ['lock', 'Шифрование на устройстве', 'Сообщения шифруются до отправки. Сервер хранит только шифротекст.'],
  ['key', 'Ключ из рук в руки', 'Ключ диалога передаётся лично и никогда не уходит в сеть.'],
  ['trash', 'Удаление без следов', 'Переписку можно стереть у себя или у обоих — физически, а не скрыть.'],
];

// Знак Graphen — шестиугольник с двойным контуром в цвете акцента.
export function brand({ compact = false } = {}) {
  return h(
    'span',
    { class: `brand${compact ? ' brand--compact' : ''}` },
    h('span', { class: 'brand__mark', 'aria-hidden': 'true' }, icon('logo', { size: 22 })),
    h('span', { class: 'brand__name' }, 'Graphen'),
  );
}

// Компьютер: слева бренд и обещания продукта, справа форма.
// Телефон: только форма с логотипом сверху.
export function guestLayout(...content) {
  return h(
    'div',
    { class: 'auth' },
    h(
      'aside',
      { class: 'auth__brand lattice' },
      h('div', { class: 'auth__logo' }, brand()),
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
      h('div', { class: 'auth__form stack' }, h('div', { class: 'auth__mobile-logo' }, brand()), ...content),
    ),
  );
}

// ---------- Оболочка мессенджера после входа ----------

// view: 'list' — на телефоне виден список диалогов, 'pane' — правая часть.
// На компьютере обе колонки видны всегда.
// activeDialogId — какой диалог подсветить в списке.
// Боковую панель на компьютере можно свернуть в узкую полоску с аватарами.
export function appShell({ user, view = 'pane', activeDialogId = null, content }) {
  const root = h(
    'div',
    { class: 'messenger', 'data-view': view, 'data-sidebar': preferences.sidebarCollapsed ? 'collapsed' : 'expanded' },
    sidebar({ user, activeDialogId, onToggle: toggle }),
    content,
  );

  function toggle() {
    const collapsed = root.dataset.sidebar !== 'collapsed';
    preferences.sidebarCollapsed = collapsed;
    root.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
    syncToggle(root.querySelector('.sidebar__toggle'), collapsed);
  }

  syncToggle(root.querySelector('.sidebar__toggle'), preferences.sidebarCollapsed);
  return root;
}

function syncToggle(btn, collapsed) {
  if (!btn) return;
  const label = collapsed ? 'Развернуть список диалогов' : 'Свернуть список диалогов';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.replaceChildren(icon(collapsed ? 'panel-right' : 'panel-left'));
}

function sidebar({ user, activeDialogId, onToggle }) {
  const publicId = user?.publicId ?? '';
  return h(
    'aside',
    { class: 'sidebar', 'aria-label': 'Диалоги' },
    h(
      'header',
      { class: 'sidebar__head' },
      h('a', { href: '#/dialogs', class: 'sidebar__brand', 'aria-label': 'Graphen, к списку диалогов' }, brand()),
      h(
        'div',
        { class: 'sidebar__actions' },
        h('button', { type: 'button', class: 'btn btn--ghost btn--icon sidebar__toggle', onClick: onToggle }),
        h(
          'a',
          { href: '#/search', class: 'btn btn--secondary btn--icon sidebar__new', title: 'Новый диалог', 'aria-label': 'Новый диалог' },
          icon('plus'),
        ),
      ),
    ),
    h(
      'a',
      { href: '#/search', class: 'sidebar__search', title: 'Найти по ID' },
      icon('search', { size: 16 }),
      h('span', { class: 'sidebar__search-text' }, 'Найти по ID'),
    ),
    h('div', { class: 'sidebar__body' }, dialogList({ activeId: activeDialogId })),
    h(
      'a',
      {
        href: '#/account',
        class: 'sidebar__me',
        title: 'Аккаунт и оформление',
        'aria-label': `Аккаунт и оформление, ваш ID ${formatPublicId(publicId)}`,
      },
      avatar(publicId, { size: 'sm' }),
      h('span', { class: 'sidebar__me-id' }, formatPublicId(publicId)),
      icon('settings', { size: 18 }),
    ),
  );
}

// Правая часть: стеклянная шапка + содержимое.
// back — куда ведёт стрелка на телефоне.
export function pane({ title, subtitle, back = '/dialogs', lead, actions, variant = 'panel' }, ...body) {
  return h(
    'section',
    { class: `pane pane--${variant}${variant === 'chat' ? ' lattice' : ''}` },
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
    { class: 'pane pane--empty lattice' },
    h('h1', { class: 'visually-hidden' }, 'Диалоги'),
    h('p', { class: 'pane__hint' }, text),
  );
}

export function loadingView(text) {
  return h('main', { class: 'page page--centered' }, loading(text));
}

export function backLink(path, text) {
  return h('a', { href: `#${path}`, class: 'back-link' }, icon('arrow-left', { size: 16 }), text);
}
