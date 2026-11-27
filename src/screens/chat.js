// Переписка (MSG-47) и безопасный вывод текста (MSG-49).
//
// Текст сообщений попадает в страницу только как текстовый узел (h() →
// append(string)), никогда как HTML: строка «<img onerror=…>» будет
// показана буквально. Проверка — npm run check:dom.

import { apiMode, errorMessage } from '../api/index.js';
import { textError } from '../crypto.js';
import { dialogsStore } from '../state/dialogs.js';
import { keysStore } from '../state/keys.js';
import { messagesStore } from '../state/messages.js';
import { connection } from '../realtime/connection.js';
import { session } from '../state/session.js';
import { avatar, button, choiceDialog, formatPublicId, loading } from '../ui/components.js';
import { copyControl } from '../ui/copy.js';
import { bubble, composer, dateDivider, lockButton, typingIndicator } from '../ui/chat.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { appShell } from '../ui/layout.js';
import { mediaAttachment } from '../ui/media-attachment.js';
import { mediaPicker } from '../ui/media-picker.js';

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
const TYPING_PULSE_MS = 1500;
const TYPING_IDLE_MS = 2500;
const TYPING_EXPIRY_MS = 4500;

export function chatScreen({ params, navigate, onDispose }) {
  const { dialogId } = params;
  const me = session.user?.publicId;
  const keyPath = `/dialogs/${encodeURIComponent(dialogId)}/key`;

  // ---------- Шапка ----------

  const lead = h('span', { class: 'pane__lead' });
  const title = h('h1', null, 'Диалог');
  const lockSlot = h('span', { class: 'pane__actions' });

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
    lockSlot.replaceChildren(
      dialog ? copyControl(formatPublicId(dialog.peerPublicId), {
        label: 'Скопировать ID собеседника', target: title, compact: true,
      }) : null,
      keysStore.has(dialogId)
        ? h(
            'button',
            { type: 'button', class: 'btn btn--ghost btn--icon', 'aria-label': 'Удалить переписку', title: 'Удалить переписку', onClick: deleteAll },
            icon('trash', { size: 18 }),
          )
        : null,
      lockButton({ href: `#${keyPath}`, verified: keysStore.has(dialogId) }),
    );
  }

  // ---------- Состояние соединения ----------

  // Показывается, только когда связь не в порядке: «онлайн» — норма, без подписи.
  const banner = h('div', { class: 'conn-banner', role: 'status', 'aria-live': 'polite' });
  let hideTimer = null;

  function renderBanner(next = connection.state, previous) {
    clearTimeout(hideTimer);
    const texts = {
      connecting: ['Подключаемся…', false],
      reconnecting: ['Нет связи с сервером. Переподключаемся…', true],
      offline: ['Нет подключения к интернету. Сообщения отправятся, когда связь вернётся.', false],
    };
    if (texts[next]) {
      const [text, canRetry] = texts[next];
      banner.dataset.state = next;
      banner.replaceChildren(
        h('span', { class: 'conn-banner__dot', 'aria-hidden': 'true' }),
        h('span', null, text),
        canRetry ? h('button', { type: 'button', class: 'conn-banner__retry', onClick: () => connection.retryNow() }, 'Повторить') : null,
      );
      banner.hidden = false;
    } else if (next === 'online' && (previous === 'reconnecting' || previous === 'offline')) {
      banner.dataset.state = 'restored';
      banner.replaceChildren(h('span', { class: 'conn-banner__dot', 'aria-hidden': 'true' }), h('span', null, 'Соединение восстановлено'));
      banner.hidden = false;
      hideTimer = setTimeout(() => (banner.hidden = true), 2500);
    } else {
      banner.hidden = true;
    }
  }

  // ---------- Лента ----------

  const feed = h('div', { class: 'feed', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const body = h('div', { class: 'pane__body' }, feed);
  const composerSlot = h('div', null);
  let stickToBottom = true;
  let mediaKey = null;
  let preparingMedia = false;
  const mediaNodes = new Map();
  let lastTypingPulse = -Infinity;
  let typingIdleTimer;
  let typingExpiryTimer;
  let peerIndicator = null;

  function stopTyping() {
    clearTimeout(typingIdleTimer);
    if (lastTypingPulse === -Infinity) return;
    lastTypingPulse = -Infinity;
    connection.reportTyping(dialogId, false);
  }

  function reportInput(hasText) {
    if (!hasText) {
      stopTyping();
      return;
    }
    const now = performance.now();
    if (now - lastTypingPulse >= TYPING_PULSE_MS && connection.reportTyping(dialogId, true)) {
      lastTypingPulse = now;
    }
    clearTimeout(typingIdleTimer);
    typingIdleTimer = setTimeout(stopTyping, TYPING_IDLE_MS);
  }

  function showPeerTyping(isTyping) {
    clearTimeout(typingExpiryTimer);
    if (!isTyping || !keysStore.has(dialogId)) {
      peerIndicator?.remove();
      peerIndicator = null;
      return;
    }
    if (!peerIndicator) {
      peerIndicator = typingIndicator();
      feed.append(peerIndicator);
      if (stickToBottom) body.scrollTop = body.scrollHeight;
    }
    typingExpiryTimer = setTimeout(() => showPeerTyping(false), TYPING_EXPIRY_MS);
  }

  function replaceFeed(...nodes) {
    feed.replaceChildren(...nodes);
    if (peerIndicator) feed.append(peerIndicator);
  }

  function removeMediaNodes(keep = new Set()) {
    for (const [id, view] of mediaNodes) {
      if (keep.has(id)) continue;
      view.dispose();
      mediaNodes.delete(id);
    }
  }

  body.addEventListener('scroll', () => {
    stickToBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  });

  function renderFeed() {
    const key = keysStore.get(dialogId);
    if (key !== mediaKey) {
      removeMediaNodes();
      mediaKey = key;
    }
    const hasKey = Boolean(key);
    const state = messagesStore.get(dialogId);

    if (!hasKey) {
      stopTyping();
      showPeerTyping(false);
      composerSlot.replaceChildren();
      feed.replaceChildren(keysStore.restoring
        ? h('div', { class: 'feed-notice' }, loading('Восстанавливаем ключи…'))
        : noKeyCard());
      return;
    }

    if (composerSlot.firstChild !== chatComposer) composerSlot.replaceChildren(chatComposer);

    if (state.status === 'loading' || state.status === 'idle') {
      replaceFeed(h('div', { class: 'feed-notice' }, loading('Загружаем и расшифровываем…')));
      return;
    }

    if (state.status === 'error') {
      replaceFeed(
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
      removeMediaNodes();
      replaceFeed(h('p', { class: 'feed-notice' }, 'Сообщений пока нет. Они шифруются на ваших устройствах — сервер видит только шифротекст.'));
      return;
    }

    const nodes = [];
    const visibleMedia = new Set();
    let lastDay = null;
    for (const item of state.items) {
      const day = dayLabel(item.sentAt);
      if (day !== lastDay) {
        nodes.push(dateDivider(day));
        lastDay = day;
      }
      let media;
      if (item.text === '') {
        if (item.status === 'sending' || item.status === 'failed') {
          media = h('span', { class: 'bubble__text' }, 'Вложение');
        } else {
          visibleMedia.add(item.id);
          let view = mediaNodes.get(item.id);
          if (view && view.envelope !== item.envelope) {
            view.dispose();
            view = null;
          }
          if (!view) {
            view = { ...mediaAttachment(dialogId, item, key), envelope: item.envelope };
            mediaNodes.set(item.id, view);
          }
          media = view.node;
        }
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
          {
            isNew: item.isNew,
            onRetry: () => messagesStore.deliver(dialogId, item.id),
            onDelete: item.status === 'sending' ? null : () => deleteOne(item),
            media,
          },
        ),
      );
      item.isNew = false;
    }
    removeMediaNodes(visibleMedia);
    replaceFeed(deleteError, ...nodes);
    if (stickToBottom) queueMicrotask(() => (body.scrollTop = body.scrollHeight));
  }

  // ---------- Удаление (MSG-51) ----------

  const deleteError = h('p', { class: 'feed-error', role: 'alert', hidden: true });

  async function runDelete(scope, ids) {
    deleteError.hidden = true;
    try {
      await messagesStore.remove(dialogId, scope, ids);
    } catch (err) {
      // Сообщения вернулись в ленту — говорим, что удаление не прошло.
      deleteError.textContent = `Не удалось удалить. ${errorMessage(err)}`;
      deleteError.hidden = false;
    }
  }

  async function deleteOne(item) {
    const own = item.senderId === me;
    const scope = await choiceDialog({
      title: 'Удалить сообщение?',
      choices: [
        { value: 'self', label: 'Удалить у себя', description: 'Исчезнет только у вас. У собеседника сообщение останется.' },
        {
          value: 'both',
          label: 'Удалить у обоих',
          description: own
            ? 'Исчезнет у вас и у собеседника. Отменить нельзя.'
            : 'Исчезнет и у вас, и у собеседника. Отменить нельзя.',
          tone: 'danger',
        },
      ],
    });
    if (scope) await runDelete(scope, [item.id]);
  }

  async function deleteAll() {
    const items = messagesStore.get(dialogId).items;
    if (items.length === 0) return;
    const scope = await choiceDialog({
      title: 'Удалить переписку?',
      text: `Сообщений: ${items.length}. Удаление физическое — восстановить переписку будет нельзя.`,
      choices: [
        { value: 'self', label: 'Удалить у себя', description: 'Ваша копия исчезнет с сервера. У собеседника переписка останется.' },
        { value: 'both', label: 'Удалить у обоих', description: 'Переписка исчезнет с сервера у вас и у собеседника.', tone: 'danger' },
      ],
    });
    if (scope === 'self') await runDelete('self', null);
    else if (scope === 'both') await runDelete('both', items.map((m) => m.id));
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

  // ---------- Вложения (MSG-53) ----------

  const picker = mediaPicker();
  const sendError = h('p', { class: 'field__error', role: 'alert' });

  const chatComposer = h(
    'div',
    { class: 'composer-wrap' },
    picker.root,
    sendError,
    composer({
      onInput: reportInput,
      onSend(text) {
        if (picker.file) {
          if (preparingMedia) return false;
          if (apiMode === 'mock') {
            picker.showError('Для отправки файлов нужен запущенный бэкенд.');
            return false;
          }
          const file = picker.file;
          const problem = textError(text);
          if (problem) {
            picker.showError(problem);
            return false;
          }
          preparingMedia = true;
          stopTyping();
          picker.showError('');
          stickToBottom = true;
          return messagesStore.send(dialogId, text, file).then(() => {
            if (picker.file === file) picker.clear();
            return true;
          }).catch(error => {
            picker.showError(error instanceof RangeError ? error.message : 'Не удалось подготовить вложение.');
            return false;
          }).finally(() => {
            preparingMedia = false;
          });
        }
        if (preparingMedia) return false;
        if (!text) return false;
        const problem = textError(text);
        sendError.textContent = problem ?? '';
        if (problem) return false;
        stopTyping();
        stickToBottom = true;
        messagesStore.send(dialogId, text).catch(() => {
          // Ключ пропал (выход в другой вкладке) — лента сама покажет запрос ключа.
        });
        return true;
      },
      onAttach() {
        picker.open();
      },
    }),
  );

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
      banner,
      body,
      composerSlot,
    ),
  });

  // Файл можно перетащить в окно чата.
  const chatPane = root.querySelector('.pane--chat');
  chatPane.addEventListener('dragover', (event) => {
    if (!keysStore.has(dialogId) || !event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    chatPane.classList.add('pane--drop');
  });
  chatPane.addEventListener('dragleave', (event) => {
    if (!chatPane.contains(event.relatedTarget)) chatPane.classList.remove('pane--drop');
  });
  chatPane.addEventListener('drop', (event) => {
    chatPane.classList.remove('pane--drop');
    if (!keysStore.has(dialogId) || !event.dataTransfer?.files.length) return;
    event.preventDefault();
    picker.drop([...event.dataTransfer.files]);
  });
  onDispose(() => {
    picker.clear();
    removeMediaNodes();
  });

  dialogsStore.subscribe(renderHeader, { owner: lead });
  const stopMessages = messagesStore.subscribe((id) => {
    if (id === dialogId || id === null) renderFeed();
  });
  const stopKeys = keysStore.subscribe(() => {
    renderHeader();
    renderFeed();
  });
  const stopConnection = connection.subscribe((next, previous) => {
    if (next !== 'online') {
      stopTyping();
      showPeerTyping(false);
    }
    renderBanner(next, previous);
  });
  const unsubscribeTyping = connection.subscribeTyping((id, isTyping) => {
    if (id === dialogId) showPeerTyping(isTyping);
  });
  connection.watch(dialogId);
  onDispose(() => {
    stopMessages();
    stopKeys();
    stopConnection();
    unsubscribeTyping();
    stopTyping();
    showPeerTyping(false);
    connection.unwatch(dialogId);
    clearTimeout(hideTimer);
  });
  renderBanner();

  renderHeader();
  renderFeed();
  if (keysStore.has(dialogId)) messagesStore.load(dialogId);
  else queueMicrotask(() => messagesStore.load(dialogId));

  return root;
}
