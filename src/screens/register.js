// Регистрация: только пароль, ID выдаёт сервер.
// TODO(MSG-42): правила пароля (ждём политику от бэкенда), тайм-аут.

import { api } from '../api/index.js';
import { putFlash } from '../state/flash.js';
import { button, field, setBusy } from '../ui/components.js';
import { h, link } from '../ui/dom.js';
import { guestLayout } from '../ui/layout.js';

export function registerScreen({ navigate }) {
  const password = field({
    label: 'Пароль',
    name: 'password',
    type: 'password',
    autocomplete: 'new-password',
    revealable: true,
    required: true,
  });
  const passwordConfirm = field({
    label: 'Повторите пароль',
    name: 'passwordConfirm',
    type: 'password',
    autocomplete: 'new-password',
    revealable: true,
    required: true,
  });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = button({ type: 'submit', block: true }, 'Зарегистрироваться');

  const form = h(
    'form',
    { class: 'stack', novalidate: true, onSubmit: handleSubmit },
    password.root,
    passwordConfirm.root,
    error,
    submit,
  );

  async function handleSubmit(event) {
    event.preventDefault();
    if (submit.disabled) return;

    const value = password.input.value;
    password.setError('');
    passwordConfirm.setError('');
    error.textContent = '';

    if (!value) {
      password.setError('Введите пароль');
      password.input.focus();
      return;
    }
    if (value !== passwordConfirm.input.value) {
      passwordConfirm.setError('Пароли не совпадают');
      passwordConfirm.input.focus();
      return;
    }

    const restore = setBusy(submit, 'Создаём аккаунт…');

    try {
      const { publicId } = await api.register({ password: value, passwordConfirm: passwordConfirm.input.value });
      putFlash('registeredId', publicId);
      navigate('/register/done', { replace: true });
    } catch {
      error.textContent = 'Не удалось зарегистрироваться. Попробуйте позже';
      restore();
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
    h('p', { class: 'muted text-sm' }, 'Уже есть аккаунт? ', link('/login', 'Войти')),
  );
}
