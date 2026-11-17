// Показ выданного ID после регистрации.
// TODO(MSG-42): кнопка «Скопировать ID» с запасным вариантом без Clipboard API.

import { putFlash, takeFlash } from '../state/flash.js';
import { h } from '../ui/dom.js';
import { guestLayout } from '../ui/layout.js';

export function registerDoneScreen({ navigate }) {
  const publicId = takeFlash('registeredId');

  // ID есть только сразу после регистрации; при перезагрузке его уже нет.
  if (!publicId) {
    queueMicrotask(() => navigate('/login', { replace: true }));
    return guestLayout(h('p', { class: 'status' }, 'Переходим ко входу…'));
  }

  return guestLayout(
    h('h1', null, 'Аккаунт создан'),
    h('p', { class: 'public-id' }, publicId),
    h('p', { class: 'muted' }, 'Сохраните ID: он нужен для входа и поиска вас собеседником.'),
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn--primary',
        onClick() {
          putFlash('loginId', publicId);
          navigate('/login');
        },
      },
      'Перейти ко входу',
    ),
  );
}
