// Макет главного экрана Graphen на демо-данных: список диалогов и переписка.
// Повторяет холст «Graphen — направления дизайна», вариант C. Нужен, чтобы
// сравнивать стили, плотность и акцент до того, как появится настоящий чат.

import { preferences } from '../state/preferences.js';
import { avatar, formatPublicId } from '../ui/components.js';
import { bubble, composer, dateDivider, lockButton, typingIndicator } from '../ui/chat.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { brand } from '../ui/layout.js';

const ME = '7QPW-K2MD-HX4R'.replaceAll('-', '');

const dialogs = [
  {
    id: 'd1',
    peer: '9XRGBHFAKQZ9',
    time: '12:58',
    messages: [
      { dir: 'in', text: 'Добрый день. Юристы вернули договор с правками по разделу 4.', time: '12:41' },
      { dir: 'out', text: 'Вижу. Пункт 4.2 принимаем, по 4.5 нужна ещё одна итерация.', time: '12:44', status: 'read' },
      { dir: 'in', text: 'Хорошо, согласую с их стороной и пришлю обновлённую редакцию.', time: '12:50' },
      { dir: 'in', file: { name: 'Договор_ред.3.pdf' }, time: '12:51' },
      { dir: 'out', text: 'Принято. Подпишу сегодня до конца дня.', time: '12:58', status: 'delivered' },
    ],
    typing: true,
  },
  { id: 'd2', peer: '4MTDQW7LZP2E', time: '12:41', preview: 'Доступ к стенду выдан до пятницы' },
  { id: 'd3', peer: 'K7HN33VXRA8C', time: '11:20', preview: 'Перенёс встречу на 16:00' },
  { id: 'd4', peer: 'T2LBYF6S8JWD', time: 'Вчера', preview: 'Файл: Отчёт_Q3.pdf' },
  { id: 'd5', peer: 'B8CENU5KHM1P', time: 'Вчера', preview: 'Принято' },
];

function lastText(dialog) {
  const last = dialog.messages?.at(-1);
  if (!last) return dialog.preview;
  return last.file ? `Файл: ${last.file.name}` : last.text;
}

export function previewScreen() {
  let selectedId = 'd1';
  let animateLast = false;
  const root = h('div', { class: 'messenger', 'data-view': 'pane' });

  function select(id) {
    selectedId = id;
    root.dataset.view = 'pane';
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
        brand(),
        h(
          'div',
          { class: 'sidebar__actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn--ghost btn--icon',
              title: 'Переключить стиль Lattice / Glass',
              'aria-label': 'Переключить стиль: Lattice или Glass',
              onClick() {
                preferences.theme = preferences.theme === 'glass' ? 'lattice' : 'glass';
              },
            },
            icon('sparkles', { size: 18 }),
          ),
          h('button', { type: 'button', class: 'btn btn--secondary btn--icon', 'aria-label': 'Новый диалог' }, icon('plus')),
        ),
      ),
      h('a', { href: '#/preview', class: 'sidebar__search' }, icon('search', { size: 16 }), h('span', null, 'Найти по ID')),
      h(
        'div',
        { class: 'sidebar__body' },
        h(
          'ul',
          { class: 'dialog-list' },
          dialogs.map((d) =>
            h(
              'li',
              null,
              h(
                'button',
                {
                  type: 'button',
                  class: `dialog-item${d.id === selectedId ? ' dialog-item--active' : ''}`,
                  'aria-current': d.id === selectedId ? 'true' : null,
                  onClick: () => select(d.id),
                },
                avatar(d.peer),
                h(
                  'span',
                  { class: 'dialog-item__main' },
                  h(
                    'span',
                    { class: 'dialog-item__row' },
                    h('span', { class: 'dialog-item__title' }, formatPublicId(d.peer)),
                    h('span', { class: 'dialog-item__time' }, d.time),
                  ),
                  h('span', { class: 'dialog-item__row' }, h('span', { class: 'dialog-item__preview' }, lastText(d))),
                ),
              ),
            ),
          ),
        ),
      ),
      h(
        'a',
        { href: '#/preview', class: 'sidebar__me' },
        avatar(ME, { size: 'sm' }),
        h('span', { class: 'sidebar__me-id' }, formatPublicId(ME)),
        icon('settings', { size: 18 }),
      ),
    );

    const messages = dialog.messages ?? [];
    const feed = h(
      'div',
      { class: 'feed' },
      messages.length ? dateDivider('16 ноября') : h('p', { class: 'feed-notice' }, 'Сообщений пока нет'),
      messages.map((m, i) => bubble(m, { isNew: animateLast && i === messages.length - 1 })),
      dialog.typing ? typingIndicator() : null,
    );
    animateLast = false;

    const body = h('div', { class: 'pane__body' }, feed);

    const chat = h(
      'section',
      { class: 'pane pane--chat lattice' },
      h(
        'header',
        { class: 'pane__head' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--ghost btn--icon pane__back',
            'aria-label': 'К списку диалогов',
            onClick() {
              root.dataset.view = 'list';
            },
          },
          icon('arrow-left'),
        ),
        h('span', { class: 'pane__lead' }, avatar(dialog.peer, { size: 'sm' })),
        h('div', { class: 'pane__title' }, h('h1', null, formatPublicId(dialog.peer))),
        lockButton({ href: '#/preview' }),
      ),
      body,
      composer({
        onSend(text) {
          dialog.typing = false;
          dialog.messages = [...messages, { dir: 'out', text, time: currentTime(), status: 'delivered' }];
          dialog.time = currentTime();
          animateLast = true;
          render();
          root.querySelector('.composer__input')?.focus();
        },
        onAttach() {},
      }),
    );

    root.replaceChildren(sidebar, chat);
    queueMicrotask(() => {
      body.scrollTop = body.scrollHeight;
    });
  }

  render();
  return root;
}

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
