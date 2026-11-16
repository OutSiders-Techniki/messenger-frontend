// Показ выданного ID после регистрации.
// TODO(MSG-42): кнопка «Скопировать ID» с запасным вариантом без Clipboard API.

import { putFlash, takeFlash } from '../state/flash.js';
import { alert, button, formatPublicId, loading } from '../ui/components.js';
import { h } from '../ui/dom.js';
import { guestLayout } from '../ui/layout.js';

export function registerDoneScreen({ navigate }) {
  const publicId = takeFlash('registeredId');

  // ID есть только сразу после регистрации; при перезагрузке его уже нет.
  if (!publicId) {
    queueMicrotask(() => navigate('/login', { replace: true }));
    return guestLayout(loading('Переходим ко входу…'));
  }

  return guestLayout(
    h('h1', null, 'Аккаунт создан'),
    h('p', { class: 'muted' }, 'Ваш ID:'),
    h('p', { class: 'code-block' }, formatPublicId(publicId)),
    alert(
      { tone: 'warning', title: 'Сохраните ID' },
      'Он нужен для входа и чтобы собеседники нашли вас. Восстановить его нельзя.',
    ),
    button(
      {
        block: true,
        onClick() {
          putFlash('loginId', publicId);
          navigate('/login');
        },
      },
      'Перейти ко входу',
    ),
  );
}
