import { h } from '../ui/dom.js';
import { guestLayout } from '../ui/layout.js';

export function notFoundScreen() {
  return guestLayout(
    h('h1', null, 'Страница не найдена'),
    h('p', { class: 'muted' }, 'Возможно, ссылка устарела.'),
    h('a', { href: '#/', class: 'btn btn--secondary btn--block' }, 'На главную'),
  );
}
