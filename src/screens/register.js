// Регистрация: только пароль, ID выдаёт сервер (UC-01, TC-01-*).

import { api, ApiError, NetworkError, errorMessage } from '../api/index.js';
import { PASSWORD_MIN, validateNewPassword, validatePasswordConfirm } from '../lib/validation.js';
import { putFlash } from '../state/flash.js';
import { button, field, setBusy } from '../ui/components.js';
import { h, link } from '../ui/dom.js';
import { cooldown, DEFAULT_RETRY_SECONDS, validateFields } from '../ui/form.js';
import { icon } from '../ui/icons.js';
import { guestLayout } from '../ui/layout.js';

export function registerScreen({ navigate, onDispose }) {
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

  // Требование к паролю видно сразу и отмечается, когда выполнено (TC-01-N2).
  const lengthRule = h(
    'p',
    { class: 'requirement', id: 'password-rule' },
    icon('check', { size: 14 }),
    `Не короче ${PASSWORD_MIN} символов`,
  );
  password.input.setAttribute('aria-describedby', `${password.input.getAttribute('aria-describedby')} password-rule`);
  password.input.addEventListener('input', () => {
    lengthRule.classList.toggle('requirement--met', password.input.value.length >= PASSWORD_MIN);
  });

  const error = h('p', { class: 'form-error', role: 'alert' });
  const submit = button({ type: 'submit', block: true }, 'Зарегистрироваться');

  const form = h(
    'form',
    { class: 'stack', novalidate: true, onSubmit: handleSubmit },
    h('div', { class: 'stack stack--sm' }, password.root, lengthRule),
    passwordConfirm.root,
    error,
    submit,
  );

  let stopCooldown = null;
  onDispose(() => stopCooldown?.());

  async function handleSubmit(event) {
    event.preventDefault();
    if (submit.disabled) return;
    error.textContent = '';

    const value = password.input.value;
    const valid = validateFields([
      [password, () => validateNewPassword(value)],
      [passwordConfirm, () => validatePasswordConfirm(value, passwordConfirm.input.value)],
    ]);
    if (!valid) return;

    const restore = setBusy(submit, 'Создаём аккаунт…');

    try {
      const { publicId } = await api.auth.register({ password: value });
      putFlash('registeredId', publicId);
      navigate('/register/done', { replace: true });
    } catch (err) {
      restore();

      if (err instanceof ApiError && err.status === 400) {
        // Сервер отклонил пароль — показываем причину у поля.
        password.setError(err.fieldError('password') ?? errorMessage(err));
        password.input.focus();
      } else if (err instanceof NetworkError) {
        // Запрос мог дойти и создать аккаунт, но ID мы не получили.
        // Автоматически не повторяем, чтобы не создать второй аккаунт.
        error.textContent =
          'Нет ответа от сервера. Аккаунт мог создаться, но его ID не получен — зарегистрируйтесь ещё раз, когда связь восстановится.';
      } else {
        error.textContent = errorMessage(err);
        if (err instanceof ApiError && err.status === 429) {
          stopCooldown = cooldown(submit, err.retryAfter ?? DEFAULT_RETRY_SECONDS);
        }
      }
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
