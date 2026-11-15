// Вход по публичному ID и паролю.
// TODO(MSG-42): валидация полей, показ пароля, состояния ошибок 429/сети.

import { api, ApiError } from '../api/index.js';
import { session } from '../state/session.js';
import { takeFlash } from '../state/flash.js';
import { h, link } from '../ui/dom.js';
import { guestLayout } from '../ui/layout.js';

export function loginScreen({ navigate }) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, 'Войти');

  const form = h(
    'form',
    { class: 'form', novalidate: true, onSubmit: handleSubmit },
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, 'Ваш ID'),
      h('input', {
        class: 'field__input',
        name: 'publicId',
        autocomplete: 'username',
        autocapitalize: 'characters',
        spellcheck: 'false',
        required: true,
        value: takeFlash('loginId') ?? '',
      }),
    ),
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, 'Пароль'),
      h('input', {
        class: 'field__input',
        name: 'password',
        type: 'password',
        autocomplete: 'current-password',
        required: true,
      }),
    ),
    error,
    submit,
  );

  async function handleSubmit(event) {
    event.preventDefault();
    if (submit.disabled) return;

    const data = new FormData(form);
    error.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Входим…';

    try {
      const user = await api.login({
        publicId: String(data.get('publicId')).trim(),
        password: String(data.get('password')),
      });
      session.set(user);
      navigate('/dialogs', { replace: true });
    } catch (err) {
      error.textContent =
        err instanceof ApiError && err.status === 401
          ? 'Неверный ID или пароль'
          : 'Не удалось войти. Попробуйте ещё раз';
      submit.disabled = false;
      submit.textContent = 'Войти';
    }
  }

  return guestLayout(
    h('h1', null, 'Вход'),
    form,
    h('p', { class: 'muted' }, 'Нет аккаунта? ', link('/register', 'Создать аккаунт')),
  );
}
