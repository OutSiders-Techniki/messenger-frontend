import { h, link } from './dom.js';

// Экран для гостя: вход, регистрация.
export function guestLayout(...content) {
  return h('main', { class: 'page page--centered' }, h('div', { class: 'card' }, ...content));
}

// Экран вошедшего пользователя: шапка с ID и выходом.
export function appLayout({ user, onLogout }, ...content) {
  return h(
    'div',
    { class: 'app' },
    h(
      'header',
      { class: 'app-header' },
      link('/dialogs', 'Мессенджер', { class: 'app-header__brand' }),
      h(
        'div',
        { class: 'app-header__account' },
        link('/account', user?.publicId ?? '', {
          class: 'app-header__id',
          title: 'Аккаунт',
          'aria-label': `Аккаунт, ваш ID ${user?.publicId ?? ''}`,
        }),
        h('button', { type: 'button', class: 'btn btn--ghost', onClick: onLogout }, 'Выйти'),
      ),
    ),
    h('main', { class: 'page' }, ...content),
  );
}

export function loadingView(text) {
  return h('main', { class: 'page page--centered' }, h('p', { class: 'status', role: 'status' }, text));
}
