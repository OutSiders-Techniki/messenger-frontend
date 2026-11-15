import { button, loading } from './components.js';
import { h, link } from './dom.js';
import { icon } from './icons.js';

// Экран для гостя: вход, регистрация.
export function guestLayout(...content) {
  return h(
    'main',
    { class: 'page page--centered' },
    h('div', { class: 'card card--form stack' }, ...content),
  );
}

// Экран вошедшего пользователя: шапка с ID и выходом.
export function appLayout({ user, onLogout }, ...content) {
  return h(
    'div',
    { class: 'app' },
    h(
      'header',
      { class: 'app-header' },
      h(
        'a',
        { href: '#/dialogs', class: 'app-header__brand' },
        h('span', { class: 'app-header__logo' }, icon('lock', { size: 16 })),
        'Мессенджер',
      ),
      h(
        'div',
        { class: 'app-header__account' },
        link('/account', user?.publicId ?? '', {
          class: 'app-header__id',
          title: 'Аккаунт',
          'aria-label': `Аккаунт, ваш ID ${user?.publicId ?? ''}`,
        }),
        button({ variant: 'ghost', size: 'sm', onClick: onLogout }, icon('log-out', { size: 18 }), 'Выйти'),
      ),
    ),
    h('main', { class: 'page' }, ...content),
  );
}

export function backLink(path, text) {
  return h('a', { href: `#${path}`, class: 'back-link' }, icon('arrow-left', { size: 16 }), text);
}

export function loadingView(text) {
  return h('main', { class: 'page page--centered' }, loading(text));
}
