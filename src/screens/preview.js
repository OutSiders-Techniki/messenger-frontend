// Макет главного экрана: список диалогов и чат на демо-данных.
// Нужен, чтобы согласовать внешний вид до переноса в MSG-45/46/47/50.

import { avatar, button, formatPublicId } from '../ui/components.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const ME = 'MX4T7KQ9ZP2C';

const dialogs = [
  {
    id: 'd1',
    peer: 'K7PXQM2D9RT4',
    state: 'ok',
    messages: [
      { from: 'peer', text: 'Привет! Ключ ввёл, всё работает 👍', at: '10:02' },
      { from: 'me', text: 'Отлично, тогда шлю документы сюда', at: '10:03', status: 'read' },
      { from: 'me', text: 'Сначала договор, потом акты', at: '10:03', status: 'read' },
      { from: 'me', file: { name: 'договор_v3.pdf', size: '1,2 МБ' }, at: '10:05', status: 'read' },
      { from: 'peer', text: 'Получил, открывается нормально. Посмотрю до обеда и вернусь с правками.', at: '10:11' },
      { from: 'peer', photo: true, text: 'Вот так выглядит страница 4 у меня', at: '10:12' },
      { from: 'peer', text: 'Это ок?', at: '10:12' },
    ],
  },
  {
    id: 'd2',
    peer: 'B3HN8R5TW6YQ',
    state: 'no-key',
    lastText: 'Введите ключ, чтобы читать',
    lastAt: 'вчера',
  },
  {
    id: 'd3',
    peer: 'Q9ZD4FJ7MC3K',
    state: 'ok',
    messages: [
      { from: 'me', text: 'Встречаемся в 15:00 у переговорной, передам ключ', at: '09:40', status: 'read' },
      { from: 'peer', text: 'Договорились', at: '09:41' },
      { from: 'peer', broken: true, at: '09:58' },
    ],
  },
  {
    id: 'd4',
    peer: 'H6TR2WXN8PVE',
    state: 'ok',
    unread: 3,
    messages: [{ from: 'peer', text: 'Спасибо, всё получил', at: 'пн' }],
  },
];

function lastPreview(dialog) {
  if (dialog.state === 'no-key') {
    return h('span', { class: 'dialog-item__preview dialog-item__preview--warn' }, icon('key', { size: 14 }), dialog.lastText);
  }
  const last = dialog.messages.at(-1);
  const prefix = last.from === 'me' ? h('span', { class: 'dialog-item__you' }, 'Вы: ') : null;
  let text = last.text;
  if (last.file) text = `📄 ${last.file.name}`;
  if (last.photo) text = `🖼 ${last.text ?? 'Фото'}`;
  if (last.broken) text = 'Не удалось расшифровать';
  return h('span', { class: 'dialog-item__preview' }, prefix, text);
}

function dialogItem(dialog, { active, onSelect }) {
  const last = dialog.messages?.at(-1);
  return h(
    'li',
    null,
    h(
      'button',
      {
        type: 'button',
        class: `dialog-item${active ? ' dialog-item--active' : ''}`,
        'aria-current': active ? 'true' : null,
        onClick: () => onSelect(dialog.id),
      },
      avatar(dialog.peer),
      h(
        'span',
        { class: 'dialog-item__main' },
        h(
          'span',
          { class: 'dialog-item__row' },
          h('span', { class: 'dialog-item__title' }, formatPublicId(dialog.peer)),
          h('span', { class: 'dialog-item__time' }, last?.at ?? dialog.lastAt ?? ''),
        ),
        h(
          'span',
          { class: 'dialog-item__row' },
          lastPreview(dialog),
          dialog.unread ? h('span', { class: 'dialog-item__unread' }, String(dialog.unread)) : null,
        ),
      ),
    ),
  );
}

function statusIcon(status) {
  if (!status) return null;
  return h(
    'span',
    { class: `msg__status msg__status--${status}`, title: status === 'read' ? 'Доставлено' : 'Отправлено' },
    icon('check', { size: 14 }),
    status === 'read' ? icon('check', { size: 14 }) : null,
  );
}

function messageBubble(msg, { first, last }) {
  const own = msg.from === 'me';
  const classes = ['msg', own ? 'msg--out' : 'msg--in'];
  if (first) classes.push('msg--first');
  if (last) classes.push('msg--last');

  const meta = h('span', { class: 'msg__meta' }, msg.at, own ? statusIcon(msg.status) : null);

  if (msg.broken) {
    classes.push('msg--broken');
    return h(
      'div',
      { class: classes.join(' ') },
      h(
        'div',
        { class: 'msg__bubble' },
        h('span', { class: 'msg__broken' }, icon('alert', { size: 16 }), 'Неверный ключ или сообщение повреждено'),
        meta,
      ),
    );
  }

  let body;
  if (msg.file) {
    body = h(
      'span',
      { class: 'msg__file' },
      h('span', { class: 'msg__file-icon' }, icon('paperclip', { size: 18 })),
      h(
        'span',
        { class: 'msg__file-info' },
        h('span', { class: 'msg__file-name' }, msg.file.name),
        h('span', { class: 'msg__file-size' }, `${msg.file.size} · зашифрован`),
      ),
    );
  } else if (msg.photo) {
    body = [h('span', { class: 'msg__photo', role: 'img', 'aria-label': 'Фото' }), msg.text ? h('span', { class: 'msg__text' }, msg.text) : null];
  } else {
    body = h('span', { class: 'msg__text' }, msg.text);
  }

  return h('div', { class: classes.join(' ') }, h('div', { class: `msg__bubble${msg.photo ? ' msg__bubble--media' : ''}` }, body, meta));
}

function messageList(messages) {
  return messages.map((msg, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    return messageBubble(msg, {
      first: !prev || prev.from !== msg.from,
      last: !next || next.from !== msg.from,
    });
  });
}

function chatHeader(dialog, { onBack }) {
  const secured = dialog.state !== 'no-key';
  return h(
    'header',
    { class: 'chat__head' },
    button({ variant: 'ghost', icon: true, class: 'chat__back', 'aria-label': 'К списку диалогов', onClick: onBack }, icon('arrow-left')),
    avatar(dialog.peer, { size: 'sm' }),
    h(
      'div',
      { class: 'chat__title' },
      h('span', { class: 'chat__name' }, formatPublicId(dialog.peer)),
      h(
        'span',
        { class: `chat__sub${secured ? ' chat__sub--secure' : ''}` },
        icon(secured ? 'lock' : 'key', { size: 13 }),
        secured ? 'Зашифровано ключом диалога' : 'Ключ не введён',
      ),
    ),
    h(
      'div',
      { class: 'chat__actions' },
      button({ variant: 'ghost', icon: true, 'aria-label': 'Ключ диалога' }, icon('key')),
      button({ variant: 'ghost', icon: true, 'aria-label': 'Удалить переписку' }, icon('trash')),
    ),
  );
}

function composer(onSend) {
  const input = h('textarea', {
    class: 'composer__input',
    rows: '1',
    placeholder: 'Сообщение',
    'aria-label': 'Текст сообщения',
    onInput() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    },
    onKeydown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    },
  });

  function send() {
    const text = input.value.trim();
    if (!text) return;
    onSend(text);
    input.value = '';
    input.style.height = 'auto';
    input.focus();
  }

  return h(
    'form',
    {
      class: 'composer',
      onSubmit(event) {
        event.preventDefault();
        send();
      },
    },
    button({ variant: 'ghost', icon: true, 'aria-label': 'Прикрепить фото или видео' }, icon('paperclip')),
    input,
    button({ type: 'submit', icon: true, class: 'composer__send', 'aria-label': 'Отправить' }, icon('send', { size: 18 })),
  );
}

function noKeyPane(dialog) {
  return h(
    'div',
    { class: 'chat__center' },
    h(
      'div',
      { class: 'key-prompt' },
      h('span', { class: 'key-prompt__icon' }, icon('key', { size: 28 })),
      h('h2', null, 'Введите ключ диалога'),
      h(
        'p',
        { class: 'muted' },
        `Собеседник ${formatPublicId(dialog.peer)} создал ключ. Получите его при личной встрече — по сети ключ не передаётся.`,
      ),
      button({ block: true }, 'Ввести ключ'),
      button({ variant: 'ghost', block: true }, 'Отсканировать QR'),
    ),
  );
}

export function previewScreen() {
  let selectedId = 'd1';
  const root = h('div', { class: 'messenger', 'data-view': 'list' });

  function select(id) {
    selectedId = id;
    const dialog = dialogs.find((d) => d.id === id);
    if (dialog) dialog.unread = 0;
    root.dataset.view = 'chat';
    render();
  }

  function back() {
    root.dataset.view = 'list';
    render();
  }

  function render() {
    const dialog = dialogs.find((d) => d.id === selectedId);

    const sidebar = h(
      'aside',
      { class: 'sidebar', 'aria-label': 'Диалоги' },
      h(
        'header',
        { class: 'sidebar__head' },
        h('a', { href: '#/preview', class: 'sidebar__me', 'aria-label': `Аккаунт, ваш ID ${formatPublicId(ME)}` }, avatar(ME, { size: 'sm' })),
        h('h1', { class: 'sidebar__title' }, 'Сообщения'),
        button({ variant: 'ghost', icon: true, 'aria-label': 'Новый диалог' }, icon('plus')),
      ),
      h(
        'div',
        { class: 'sidebar__search' },
        icon('search', { size: 18 }),
        h('input', { class: 'sidebar__search-input', placeholder: 'Найти по ID', 'aria-label': 'Найти собеседника по ID' }),
      ),
      h(
        'ul',
        { class: 'dialog-list' },
        dialogs.map((d) => dialogItem(d, { active: d.id === selectedId, onSelect: select })),
      ),
    );

    let chat;
    if (!dialog) {
      chat = h('section', { class: 'chat chat--empty' }, h('p', { class: 'chat__hint' }, 'Выберите диалог'));
    } else if (dialog.state === 'no-key') {
      chat = h('section', { class: 'chat' }, chatHeader(dialog, { onBack: back }), noKeyPane(dialog));
    } else {
      const scroll = h(
        'div',
        { class: 'chat__scroll' },
        h(
          'div',
          { class: 'chat__feed' },
          h('p', { class: 'chat__notice' }, icon('lock', { size: 13 }), 'Сообщения шифруются на ваших устройствах. Сервер их не видит.'),
          h('p', { class: 'chat__date' }, h('span', null, 'Сегодня')),
          messageList(dialog.messages),
        ),
      );
      chat = h(
        'section',
        { class: 'chat' },
        chatHeader(dialog, { onBack: back }),
        scroll,
        composer((text) => {
          const now = new Date();
          dialog.messages.push({
            from: 'me',
            text,
            at: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
            status: 'sent',
          });
          render();
        }),
      );
      queueMicrotask(() => {
        scroll.scrollTop = scroll.scrollHeight;
      });
    }

    root.replaceChildren(sidebar, chat);
  }

  render();
  return root;
}

