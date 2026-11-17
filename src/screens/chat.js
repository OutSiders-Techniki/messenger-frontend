// Переписка (MSG-47) и безопасный вывод текста (MSG-49).
//
// Текст сообщений попадает в страницу только как текстовый узел (h() →
// append(string)), никогда как HTML: строка «<img onerror=…>» будет
// показана буквально. Проверка — npm run check:dom.

import { errorMessage } from '../api/index.js';
import { dialogsStore } from '../state/dialogs.js';
import { keysStore } from '../state/keys.js';
import { messagesStore } from '../state/messages.js';
import { session } from '../state/session.js';
import { avatar, button, formatPublicId, loading } from '../ui/components.js';
import { bubble, composer, dateDivider, lockButton } from '../ui/chat.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { appShell } from '../ui/layout.js';

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

function dayLabel(timestamp, now = new Date()) {
  const date = new Date(timestamp);
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  return dayMonth.format(date);
}

const STATUS = { sending: 'sending', sent: 'delivered', failed: 'failed' };

export function chatScreen({ params, navigate, onDispose }) {
  const { dialogId } = params;
  const me = session.user?.publicId;
  const keyPath = `/dialogs/${encodeURIComponent(dialogId)}/key`;

  // ---------- Шапка ----------

  const lead = h('span', { class: 'pane__lead' });
  const title = h('h1', null, 'Диалог');
  const lockSlot = h('span', null);

  function renderHeader() {
    const dialog = dialogsStore.find(dialogId);
    if (dialog) {
      lead.replaceChildren(avatar(dialog.peerPublicId, { size: 'sm' }));
      title.textContent = formatPublicId(dialog.peerPublicId);
    } else if (dialogsStore.status === 'ready') {
      lead.replaceChildren();
      title.textContent = 'Диалог не найден';
    } else {
      lead.replaceChildren(h('span', { class: 'skeleton skeleton--circle skeleton--sm' }));
    }
    lockSlot.replaceChildren(lockButton({ href: `#${keyPath}`, verified: keysStore.has(dialogId) }));
  }

  // ---------- Лента ----------

  const feed = h('div', { class: 'feed', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const body = h('div', { class: 'pane__body' }, feed);
  const composerSlot = h('div', null);
  let stickToBottom = true;

  body.addEventListener('scroll', () => {
    stickToBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  });

  function renderFeed() {
    const hasKey = keysStore.has(dialogId);
    const state = messagesStore.get(dialogId);

    if (!hasKey) {
      composerSlot.replaceChildren();
      feed.replaceChildren(noKeyCard());
      return;
    }

    composerSlot.replaceChildren(chatComposer);

    if (state.status === 'loading' || state.status === 'idle') {
      feed.replaceChildren(h('div', { class: 'feed-notice' }, loading('Загружаем и расшифровываем…')));
      return;
    }

    if (state.status === 'error') {
      feed.replaceChildren(
        h(
          'div',
          { class: 'feed-notice stack stack--sm' },
          h('p', null, `Не удалось загрузить историю. ${errorMessage(state.error)}`),
          button({ variant: 'secondary', size: 'sm', onClick: () => messagesStore.load(dialogId) }, 'Повторить'),
        ),
      );
      return;
    }

    if (state.items.length === 0) {
      feed.replaceChildren(h('p', { class: 'feed-notice' }, 'Сообщений пока нет. Они шифруются на ваших устройствах — сервер видит только шифротекст.'));
      return;
    }

    const nodes = [];
    let lastDay = null;
    for (const item of state.items) {
      const day = dayLabel(item.sentAt);
      if (day !== lastDay) {
        nodes.push(dateDivider(day));
        lastDay = day;
      }
      nodes.push(
        bubble(
          {
            dir: item.senderId === me ? 'out' : 'in',
            text: item.text,
            broken: item.broken,
            time: time.format(new Date(item.sentAt)),
            status: STATUS[item.status] ?? null,
          },
          { isNew: item.isNew, onRetry: () => messagesStore.deliver(dialogId, item.id) },
        ),
      );
      item.isNew = false;
    }
    feed.replaceChildren(...nodes);
    if (stickToBottom) queueMicrotask(() => (body.scrollTop = body.scrollHeight));
  }

  function noKeyCard() {
    return h(
      'div',
      { class: 'key-prompt key-prompt--inline' },
      h('span', { class: 'key-prompt__icon', 'aria-hidden': 'true' }, icon('key', { size: 24 })),
      h('h2', null, 'Нужен ключ диалога'),
      h('p', { class: 'muted' }, 'Без ключа переписку не прочитать и не отправить. Создайте ключ или введите тот, что показал собеседник.'),
      button({ block: true, onClick: () => navigate(keyPath) }, 'Перейти к ключу'),
    );
  }

  const chatComposer = composer({
    async onSend(text) {
      stickToBottom = true;
      try {
        await messagesStore.send(dialogId, text);
      } catch {
        // Ключ пропал (выход в другой вкладке) — лента сама покажет запрос ключа.
      }
    },
    onAttach() {
      // TODO(MSG-53): выбор фото и видео.
    },
  });

  // ---------- Подписки ----------

  const root = appShell({
    user: session.user,
    activeDialogId: dialogId,
    content: h(
      'section',
      { class: 'pane pane--chat lattice' },
      h(
        'header',
        { class: 'pane__head' },
        h('a', { href: '#/dialogs', class: 'btn btn--ghost btn--icon pane__back', 'aria-label': 'К списку диалогов' }, icon('arrow-left')),
        lead,
        h('div', { class: 'pane__title' }, title),
        lockSlot,
      ),
      body,
      composerSlot,
    ),
  });

  dialogsStore.subscribe(renderHeader, { owner: lead });
  const stopMessages = messagesStore.subscribe((id) => {
    if (id === dialogId || id === null) renderFeed();
  });
  const stopKeys = keysStore.subscribe(() => {
    renderHeader();
    renderFeed();
  });
  onDispose(() => {
    stopMessages();
    stopKeys();
  });

  renderHeader();
  renderFeed();
  if (keysStore.has(dialogId)) messagesStore.load(dialogId);
  else queueMicrotask(() => messagesStore.load(dialogId));

  return root;
}
