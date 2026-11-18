// Переписка (MSG-47) и безопасный вывод текста (MSG-49).
//
// Текст сообщений попадает в страницу только как текстовый узел (h() →
// append(string)), никогда как HTML: строка «<img onerror=…>» будет
// показана буквально. Проверка — npm run check:dom.

import { errorMessage } from '../api/index.js';
import { textError } from '../crypto.js';
import { dialogsStore } from '../state/dialogs.js';
import { keysStore } from '../state/keys.js';
import { messagesStore } from '../state/messages.js';
import { connection } from '../realtime/connection.js';
import { session } from '../state/session.js';
import { avatar, button, choiceDialog, formatPublicId, loading } from '../ui/components.js';
import { bubble, composer, dateDivider, lockButton } from '../ui/chat.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { appShell } from '../ui/layout.js';
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

  body.addEventListener('scroll', () => {
    stickToBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  });

  function renderFeed() {
    const hasKey = keysStore.has(dialogId);
    const state = messagesStore.get(dialogId);

    if (!hasKey) {
      composerSlot.replaceChildren();
      feed.replaceChildren(keysStore.restoring
        ? h('div', { class: 'feed-notice' }, loading('Восстанавливаем ключи…'))
        : noKeyCard());
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
          {
            isNew: item.isNew,
            onRetry: () => messagesStore.deliver(dialogId, item.id),
            onDelete: () => deleteOne(item),
          },
        ),
      );
      item.isNew = false;
    }
    feed.replaceChildren(deleteError, ...nodes);
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
      onSend(text) {
        if (picker.file) {
          // TODO(MSG-38): шифрование файла и метаданных по спецификации
          // медиа, затем загрузка в AttachmentsController бэкенда.
          picker.showError('Отправка файлов включится, когда будет согласовано шифрование медиа. Уберите файл, чтобы отправить текст.');
          return false;
        }
        if (!text) return false;
        const problem = textError(text);
        sendError.textContent = problem ?? '';
        if (problem) return false;
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
  onDispose(() => picker.clear());

  dialogsStore.subscribe(renderHeader, { owner: lead });
  const stopMessages = messagesStore.subscribe((id) => {
    if (id === dialogId || id === null) renderFeed();
  });
  const stopKeys = keysStore.subscribe(() => {
    renderHeader();
    renderFeed();
  });
  const stopConnection = connection.subscribe(renderBanner);
  connection.watch(dialogId);
  onDispose(() => {
    stopMessages();
    stopKeys();
    stopConnection();
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
