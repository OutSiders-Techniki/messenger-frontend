import { h, link } from '../ui/dom.js';
import { guestLayout } from '../ui/layout.js';

export function notFoundScreen() {
  return guestLayout(
    h('h1', null, 'Страница не найдена'),
    h('p', null, link('/', 'На главную')),
  );
}
