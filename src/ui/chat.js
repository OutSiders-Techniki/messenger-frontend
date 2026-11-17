// Элементы переписки Graphen: пузырь, галочки, разделитель даты,
// индикатор набора, полоса ввода и кнопка-замок.
// Стили — styles/messenger.css. Используются макетом #/preview и чатом (MSG-47).

import { h } from './dom.js';
import { icon } from './icons.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Статус доставки: одна белая галочка — доставлено, две в акценте — прочитано.
export function ticks(status) {
  const read = status === 'read';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 10');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '10');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', read ? 'Прочитано' : 'Доставлено');
  for (const d of read ? ['M1 5.5l3 3 6-7', 'M7.5 8.5l6-7'] : ['M4 5.5l3 3 6-7']) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return h('span', { class: `ticks${read ? ' ticks--read' : ''}` }, svg);
}

// message: { dir: 'in' | 'out', text?, file?: { name }, time, status?, broken? }
// status у исходящих: 'sending' | 'delivered' | 'read' | 'failed'.
// onRetry — повтор отправки для 'failed'.
export function bubble(message, { isNew = false, onRetry, onDelete } = {}) {
  const classes = ['bubble', `bubble--${message.dir}`];
  if (isNew) classes.push('bubble--new');
  if (message.status === 'sending') classes.push('bubble--sending');
  if (message.status === 'failed') classes.push('bubble--failed');

  let status = null;
  if (message.dir === 'out') {
    if (message.status === 'sending') status = h('span', { class: 'bubble__sending', role: 'img', 'aria-label': 'Отправляется' }, icon('clock', { size: 12 }));
    else if (message.status === 'failed') {
      status = h(
        'button',
        { type: 'button', class: 'bubble__retry', onClick: onRetry },
        icon('alert', { size: 12 }),
        'Не отправлено · Повторить',
      );
    } else if (message.status) status = ticks(message.status);
  }

  const meta = h(
    'span',
    { class: 'bubble__meta' },
    h('time', null, message.time),
    status,
    onDelete
      ? h(
          'button',
          { type: 'button', class: 'bubble__delete', 'aria-label': 'Удалить сообщение', title: 'Удалить', onClick: onDelete },
          icon('trash', { size: 13 }),
        )
      : null,
  );

  if (message.broken) {
    classes.push('bubble--broken');
    return h(
      'div',
      { class: classes.join(' ') },
      h('span', { class: 'bubble__text' }, icon('alert', { size: 16 }), 'Неверный ключ или сообщение повреждено'),
      meta,
    );
  }

  if (message.file) {
    return h(
      'div',
      { class: classes.join(' ') },
      h(
        'span',
        { class: 'bubble__file' },
        h('span', { class: 'bubble__file-icon', 'aria-hidden': 'true' }, icon('file', { size: 16 })),
        h('span', { class: 'bubble__file-info' }, h('span', { class: 'bubble__file-name' }, message.file.name), meta),
      ),
    );
  }

  return h('div', { class: classes.join(' ') }, h('span', { class: 'bubble__text' }, message.text), meta);
}

export function dateDivider(label) {
  return h('p', { class: 'date-divider' }, label);
}

export function typingIndicator() {
  return h(
    'div',
    { class: 'typing', role: 'img', 'aria-label': 'Собеседник печатает' },
    h('span', { class: 'typing__dot' }),
    h('span', { class: 'typing__dot' }),
    h('span', { class: 'typing__dot' }),
  );
}

// Кнопка-замок в шапке чата: ведёт на экран ключа. Без текстовых подписей —
// статус передаёт цвет иконки и подпись для скринридера.
export function lockButton({ href, verified = true }) {
  return h(
    'a',
    {
      href,
      class: `lock-btn${verified ? '' : ' lock-btn--unverified'}`,
      'aria-label': verified ? 'Сквозное шифрование: ключ сверен' : 'Сквозное шифрование: ключ не введён',
      title: verified ? 'Ключ сверен' : 'Ключ не введён',
    },
    icon('lock', { size: 17 }),
  );
}

// Полоса ввода: кнопка вложений и поле-пилюля. Кнопки «Отправить» нет:
// Enter — отправить, Shift+Enter — перенос строки.
export function composer({ onSend, onAttach }) {
  const input = h('textarea', {
    class: 'composer__input',
    rows: '1',
    placeholder: 'Сообщение',
    'aria-label': 'Сообщение. Enter — отправить, Shift+Enter — новая строка',
  });

  function grow() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  input.addEventListener('input', grow);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    const text = input.value.trim();
    // onSend может вернуть false — тогда текст остаётся в поле.
    if (onSend(text) === false) return;
    input.value = '';
    grow();
  });

  return h(
    'div',
    { class: 'composer' },
    h(
      'button',
      { type: 'button', class: 'btn btn--icon composer__attach', 'aria-label': 'Прикрепить фото или видео', onClick: onAttach },
      icon('paperclip', { size: 18 }),
    ),
    h('div', { class: 'composer__field' }, input, h('kbd', { class: 'composer__hint', 'aria-hidden': 'true' }, 'Enter')),
  );
}
