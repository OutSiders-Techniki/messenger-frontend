// Вход по публичному ID и паролю.
// TODO(MSG-42): валидация полей, состояния ошибок 429/сети.

import { api, errorMessage } from '../api/index.js';
import { session } from '../state/session.js';
import { takeFlash } from '../state/flash.js';
import { button, field, setBusy } from '../ui/components.js';
import { h, link } from '../ui/dom.js';
import { guestLayout } from '../ui/layout.js';

export function loginScreen({ navigate }) {
  const publicId = field({
    label: 'Ваш ID',
    name: 'publicId',
    autocomplete: 'username',
    autocapitalize: 'characters',
    spellcheck: 'false',
    mono: true,
    required: true,
    value: takeFlash('loginId') ?? '',
  });
  const password = field({
    label: 'Пароль',
    name: 'password',
    type: 'password',
    autocomplete: 'current-password',
    revealable: true,
    required: true,
  });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = button({ type: 'submit', block: true }, 'Войти');

  const form = h(
    'form',
    { class: 'stack', novalidate: true, onSubmit: handleSubmit },
    publicId.root,
    password.root,
    error,
    submit,
  );

  async function handleSubmit(event) {
    event.preventDefault();
    if (submit.disabled) return;

    error.textContent = '';
    const restore = setBusy(submit, 'Входим…');

    try {
      const user = await api.auth.login({
        // ID показываем группами через дефис, серверу отправляем без них.
        publicId: publicId.input.value.replace(/[\s-]/g, '').toUpperCase(),
        password: password.input.value,
      });
      session.set(user);
      navigate('/dialogs', { replace: true });
    } catch (err) {
      // Одна и та же ошибка для неверного ID и неверного пароля (TC-02-N1).
      error.textContent = errorMessage(err, { 400: 'Неверный ID или пароль', 401: 'Неверный ID или пароль' });
      restore();
    }
  }

  return guestLayout(
    h('h1', null, 'Вход'),
    form,
    h('p', { class: 'muted text-sm' }, 'Нет аккаунта? ', link('/register', 'Создать аккаунт')),
  );
}
