// Регистрация: только пароль, ID выдаёт сервер.
// TODO(MSG-42): правила пароля (ждём политику от бэкенда), показ пароля, тайм-аут.

import { api } from '../api/index.js';
import { putFlash } from '../state/flash.js';
import { h, link } from '../ui/dom.js';
import { guestLayout } from '../ui/layout.js';

export function registerScreen({ navigate }) {
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn--primary' }, 'Создать аккаунт');

  const form = h(
    'form',
    { class: 'form', novalidate: true, onSubmit: handleSubmit },
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, 'Пароль'),
      h('input', {
        class: 'field__input',
        name: 'password',
        type: 'password',
        autocomplete: 'new-password',
        required: true,
      }),
    ),
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field__label' }, 'Повторите пароль'),
      h('input', {
        class: 'field__input',
        name: 'passwordRepeat',
        type: 'password',
        autocomplete: 'new-password',
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
    const password = String(data.get('password'));

    if (!password) {
      error.textContent = 'Введите пароль';
      return;
    }
    if (password !== String(data.get('passwordRepeat'))) {
      error.textContent = 'Пароли не совпадают';
      return;
    }

    error.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Создаём аккаунт…';

    try {
      const { publicId } = await api.register({ password });
      putFlash('registeredId', publicId);
      navigate('/register/done', { replace: true });
    } catch {
      error.textContent = 'Не удалось создать аккаунт. Попробуйте ещё раз';
      submit.disabled = false;
      submit.textContent = 'Создать аккаунт';
    }
  }

  return guestLayout(
    h('h1', null, 'Регистрация'),
    h(
      'p',
      { class: 'muted' },
      'Телефон и почта не нужны. После регистрации вы получите ID — по нему вы входите, а собеседники находят вас.',
    ),
    form,
    h('p', { class: 'muted' }, 'Уже есть аккаунт? ', link('/login', 'Войти')),
  );
}
