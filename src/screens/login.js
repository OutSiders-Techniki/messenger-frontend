// Вход по публичному ID и паролю (UC-02, TC-02-*).

import { api, ApiError, errorMessage } from '../api/index.js';
import { normalizePublicId, validateLoginPassword, validatePublicId } from '../lib/validation.js';
import { session } from '../state/session.js';
import { takeFlash } from '../state/flash.js';
import { button, field, formatPublicId, setBusy } from '../ui/components.js';
import { h, link } from '../ui/dom.js';
import { cooldown, DEFAULT_RETRY_SECONDS, validateFields } from '../ui/form.js';
import { guestLayout } from '../ui/layout.js';

const BAD_CREDENTIALS = 'Неверный ID или пароль';

export function loginScreen({ navigate, onDispose }) {
  const prefilled = takeFlash('loginId');

  const publicId = field({
    label: 'Ваш ID',
    name: 'publicId',
    autocomplete: 'username',
    autocapitalize: 'characters',
    autocorrect: 'off',
    spellcheck: 'false',
    placeholder: 'XXXX-XXXX-XXXX',
    hint: 'ID выдаётся при регистрации. Можно вводить с дефисами и маленькими буквами.',
    mono: true,
    required: true,
    value: prefilled ? formatPublicId(prefilled) : '',
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

  // Приводим ID к виду XXXX-XXXX-XXXX, когда пользователь закончил ввод.
  publicId.input.addEventListener('blur', () => {
    const id = normalizePublicId(publicId.input.value);
    if (id && !validatePublicId(id)) publicId.input.value = formatPublicId(id);
  });

  const form = h(
    'form',
    { class: 'stack', novalidate: true, onSubmit: handleSubmit },
    publicId.root,
    password.root,
    error,
    submit,
  );

  let stopCooldown = null;
  onDispose(() => stopCooldown?.());

  async function handleSubmit(event) {
    event.preventDefault();
    if (submit.disabled) return;
    error.textContent = '';

    const valid = validateFields([
      [publicId, () => validatePublicId(publicId.input.value)],
      [password, () => validateLoginPassword(password.input.value)],
    ]);
    if (!valid) return;

    const restore = setBusy(submit, 'Входим…');

    try {
      const user = await api.auth.login({
        publicId: normalizePublicId(publicId.input.value),
        password: password.input.value,
      });
      session.set(user);
      navigate('/dialogs', { replace: true });
    } catch (err) {
      restore();
      // Одна и та же ошибка для неверного ID и неверного пароля (TC-02-N1):
      // не подсказываем, существует ли аккаунт.
      error.textContent = errorMessage(err, { 400: BAD_CREDENTIALS, 401: BAD_CREDENTIALS });

      if (err instanceof ApiError && err.status === 429) {
        stopCooldown = cooldown(submit, err.retryAfter ?? DEFAULT_RETRY_SECONDS);
      } else if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
        password.input.select();
        password.input.focus();
      }
    }
  }

  return guestLayout(
    h('h1', null, 'Вход'),
    form,
    h('p', { class: 'muted text-sm' }, 'Нет аккаунта? ', link('/register', 'Создать аккаунт')),
  );
}
