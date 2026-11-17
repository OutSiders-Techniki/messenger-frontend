// Компоненты интерфейса поверх h(). Стили — styles/components.css,
// витрина всех состояний — экран #/ui.

import { h } from './dom.js';
import { icon } from './icons.js';

let idCounter = 0;
function uid(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

// ---------- Кнопка ----------

// variant: primary | secondary | ghost | danger; size: md | sm
export function button(
  { variant = 'primary', size = 'md', block = false, icon = false, type = 'button', class: extra, ...props } = {},
  ...children
) {
  const classes = ['btn', `btn--${variant}`];
  if (size === 'sm') classes.push('btn--sm');
  if (block) classes.push('btn--block');
  if (icon) classes.push('btn--icon');
  if (extra) classes.push(extra);
  return h('button', { ...props, type, class: classes.join(' ') }, ...children);
}

// Блокирует кнопку на время запроса и меняет подпись.
// Возвращает функцию, которая возвращает кнопку в исходное состояние.
export function setBusy(btn, busyText) {
  const original = Array.from(btn.childNodes);
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.replaceChildren(spinner(), busyText);
  return () => {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.replaceChildren(...original);
  };
}

// ---------- Поле ввода ----------

// Возвращает { root, input, setError }. Ошибка связывается с полем через
// aria-describedby, чтобы её зачитывал скринридер.
// revealable: для паролей — кнопка «показать/скрыть».
export function field({
  label,
  hint,
  multiline = false,
  mono = false,
  revealable = false,
  class: extra,
  ...inputProps
}) {
  const id = inputProps.id ?? uid('field');
  const hintId = hint ? `${id}-hint` : null;
  const errorId = `${id}-error`;

  const input = h(multiline ? 'textarea' : 'input', {
    ...inputProps,
    id,
    class: `field__input${mono ? ' field__input--mono' : ''}`,
    'aria-describedby': [hintId, errorId].filter(Boolean).join(' '),
  });

  const error = h('p', { id: errorId, class: 'field__error' });

  let action = null;
  if (revealable) {
    action = button(
      {
        variant: 'ghost',
        size: 'sm',
        icon: true,
        class: 'field__action',
        'aria-label': 'Показать пароль',
        'aria-pressed': 'false',
        onClick() {
          const show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          action.setAttribute('aria-pressed', String(show));
          action.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
          action.replaceChildren(icon(show ? 'eye-off' : 'eye'));
        },
      },
      icon('eye'),
    );
  }

  const root = h(
    'div',
    { class: `field${extra ? ` ${extra}` : ''}` },
    h('label', { class: 'field__label', for: id }, label),
    h('div', { class: `field__control${action ? ' field__control--with-action' : ''}` }, input, action),
    hint ? h('p', { id: hintId, class: 'field__hint' }, hint) : null,
    error,
  );

  function setError(message) {
    error.textContent = message ?? '';
    root.classList.toggle('field--invalid', Boolean(message));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  // Пользователь начал исправлять — старая ошибка больше не актуальна.
  input.addEventListener('input', () => {
    if (root.classList.contains('field--invalid')) setError('');
  });

  return { root, input, setError };
}

// ---------- Флажок ----------

export function checkbox({ label, hint, ...inputProps }) {
  const input = h('input', { ...inputProps, type: 'checkbox', class: 'checkbox__input' });
  const root = h(
    'label',
    { class: 'checkbox' },
    input,
    h(
      'span',
      { class: 'checkbox__text' },
      h('span', null, label),
      hint ? h('span', { class: 'checkbox__hint' }, hint) : null,
    ),
  );
  return { root, input };
}

// ---------- Уведомление ----------

// tone: info | success | warning | danger
export function alert({ tone = 'info', title } = {}, ...children) {
  return h(
    'div',
    { class: `alert alert--${tone}`, role: tone === 'danger' || tone === 'warning' ? 'alert' : 'status' },
    title ? h('p', { class: 'alert__title' }, title) : null,
    children.length ? h('div', null, ...children) : null,
  );
}

// ---------- Значок ----------

export function badge({ tone = 'neutral' } = {}, text) {
  return h('span', { class: `badge badge--${tone}` }, text);
}

// ---------- Загрузка ----------

export function spinner({ large = false } = {}) {
  return h('span', { class: `spinner${large ? ' spinner--lg' : ''}`, 'aria-hidden': 'true' });
}

export function loading(text) {
  return h('p', { class: 'status', role: 'status' }, spinner(), text);
}

// ---------- Пустое состояние ----------

export function emptyState({ title, text, action } = {}) {
  return h(
    'div',
    { class: 'empty' },
    title ? h('p', { class: 'empty__title' }, title) : null,
    text ? h('p', { class: 'empty__text' }, text) : null,
    action ?? null,
  );
}

// ---------- Аватар по ID ----------

// Публичный ID — единственное, что известно о собеседнике, поэтому аватар —
// нейтральный шестиугольник с первыми двумя символами ID (Graphen: без цвета).
export function avatar(publicId = '', { size } = {}) {
  const classes = ['avatar'];
  if (size) classes.push(`avatar--${size}`);
  return h('span', { class: classes.join(' '), 'aria-hidden': 'true' }, publicId.slice(0, 2));
}

// ID удобнее читать и диктовать группами: K7PX-QM2D-9RT4.
export function formatPublicId(publicId = '') {
  return publicId.match(/.{1,4}/g)?.join('-') ?? '';
}

// ---------- Модальные окна ----------

// Закрывает окно и отдаёт результат ровно один раз. Результат возвращается
// сразу при выборе, а не по событию close: в некоторых окружениях оно не
// приходит. Esc (событие cancel) и любое другое закрытие — отмена.
function settle(dialog, resolve, cancelValue) {
  let done = false;
  function close(value) {
    if (done) return;
    done = true;
    resolve(value);
    if (dialog.open) dialog.close();
    dialog.remove();
  }
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close(cancelValue);
  });
  dialog.addEventListener('close', () => close(cancelValue));
  return close;
}

// ---------- Модальное окно подтверждения ----------

// Возвращает Promise<boolean>: true — подтвердил, false — отменил или закрыл.
// tone: 'danger' для разрушительных действий (удаление).
export function confirmDialog({
  title,
  text,
  details,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  tone = 'primary',
}) {
  return new Promise((resolve) => {
    const titleId = uid('modal-title');
    const textId = uid('modal-text');

    const cancel = button({ variant: 'secondary', onClick: () => close(false) }, cancelLabel);
    const confirm = button({ variant: tone === 'danger' ? 'danger' : 'primary', onClick: () => close(true) }, confirmLabel);

    const dialog = h(
      'dialog',
      { class: 'modal', 'aria-labelledby': titleId, 'aria-describedby': text ? textId : null },
      h(
        'div',
        { class: 'modal__body' },
        h('h2', { id: titleId }, title),
        text ? h('p', { id: textId, class: 'modal__text' }, text) : null,
        details ?? null,
      ),
      h('div', { class: 'modal__actions' }, cancel, confirm),
    );

    const close = settle(dialog, resolve, false);
    // Клик по затемнению вокруг окна — отмена.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close(false);
    });

    document.body.append(dialog);
    dialog.showModal();
    // Для разрушительных действий фокус на «Отмена», чтобы Enter не удалил случайно.
    (tone === 'danger' ? cancel : confirm).focus();
  });
}

// ---------- Окно с выбором из нескольких действий ----------

// choices: [{ value, label, description, tone: 'danger' | 'secondary' }]
// Возвращает Promise с value выбранного действия или null (отмена, Esc).
// Каждое действие подписано последствием — разрушительные действия
// различимы до нажатия (ТЗ, раздел 8).
export function choiceDialog({ title, text, choices, cancelLabel = 'Отмена' }) {
  return new Promise((resolve) => {
    const titleId = uid('modal-title');
    const cancel = button({ variant: 'secondary', block: true, onClick: () => close(null) }, cancelLabel);
    const options = choices.map((choice) =>
      h(
        'button',
        {
          type: 'button',
          class: `choice-action${choice.tone === 'danger' ? ' choice-action--danger' : ''}`,
          onClick: () => close(choice.value),
        },
        h('span', { class: 'choice-action__label' }, choice.label),
        choice.description ? h('span', { class: 'choice-action__text' }, choice.description) : null,
      ),
    );

    const dialog = h(
      'dialog',
      { class: 'modal', 'aria-labelledby': titleId },
      h(
        'div',
        { class: 'modal__body' },
        h('h2', { id: titleId }, title),
        text ? h('p', { class: 'modal__text' }, text) : null,
        h('div', { class: 'choice-actions' }, options),
      ),
      h('div', { class: 'modal__actions' }, cancel),
    );

    const close = settle(dialog, resolve, null);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close(null);
    });

    document.body.append(dialog);
    dialog.showModal();
    // Фокус на «Отмена»: Enter не должен ничего удалить случайно.
    cancel.focus();
  });
}
