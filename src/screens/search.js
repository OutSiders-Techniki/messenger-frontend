// Поиск собеседника по точному публичному ID и создание диалога
// (UC-04, UC-05; TC-10-*, TC-11-*).
//
// Состояния результата: пусто (подсказка) → загрузка → найден / это вы /
// не найден / слишком много попыток / ошибка.

import { api, ApiError, errorMessage } from '../api/index.js';
import { normalizePublicId, validatePublicId } from '../lib/validation.js';
import { dialogsStore } from '../state/dialogs.js';
import { putFlash } from '../state/flash.js';
import { session } from '../state/session.js';
import { alert, avatar, button, emptyState, field, formatPublicId, loading, setBusy } from '../ui/components.js';
import { h } from '../ui/dom.js';
import { cooldown, DEFAULT_RETRY_SECONDS, validateFields } from '../ui/form.js';
import { icon } from '../ui/icons.js';
import { appShell, pane } from '../ui/layout.js';

export function searchScreen({ navigate, onDispose }) {
  const me = session.user?.publicId ?? '';

  const query = field({
    label: 'ID собеседника',
    name: 'publicId',
    autocomplete: 'off',
    autocapitalize: 'characters',
    autocorrect: 'off',
    spellcheck: 'false',
    placeholder: 'XXXX-XXXX-XXXX',
    mono: true,
    required: true,
  });
  const submit = button({ type: 'submit' }, icon('search', { size: 18 }), 'Найти');
  const result = h('div', { class: 'search-result', 'aria-live': 'polite' });

  const form = h(
    'form',
    { class: 'search-form', novalidate: true, role: 'search', onSubmit: handleSubmit },
    query.root,
    submit,
  );

  // Список диалогов нужен, чтобы для уже знакомого собеседника предложить
  // «Открыть диалог», а не «Создать» (UC-04 A3). Его грузит боковая панель.
  let searchController = null;
  let stopCooldown = null;
  onDispose(() => {
    searchController?.abort();
    stopCooldown?.();
  });

  showIdle();

  // ---------- Поиск ----------

  async function handleSubmit(event) {
    event.preventDefault();
    if (submit.disabled) return;

    // Неверный формат (пустой, частичный, лишние символы) не отправляем:
    // поиск только по точному ID (TC-10-N2, TC-10-N4).
    if (!validateFields([[query, () => validatePublicId(query.input.value)]])) return;

    const publicId = normalizePublicId(query.input.value);
    query.input.value = formatPublicId(publicId);

    searchController?.abort();
    searchController = new AbortController();
    const { signal } = searchController;

    const restore = setBusy(submit, 'Ищем…');
    result.replaceChildren(loading('Ищем пользователя…'));

    try {
      const user = await api.users.findByPublicId(publicId, { signal });
      if (signal.aborted) return;
      showFound(user);
    } catch (err) {
      if (signal.aborted) return;
      showError(err, publicId);
      if (err instanceof ApiError && err.status === 429) {
        restore();
        stopCooldown = cooldown(submit, err.retryAfter ?? DEFAULT_RETRY_SECONDS);
        return;
      }
    }
    restore();
  }

  // ---------- Состояния результата ----------

  function showIdle() {
    result.replaceChildren(
      emptyState({
        title: 'Найдите собеседника',
        text: 'Введите его ID целиком — поиск работает только по точному совпадению. ID собеседник может посмотреть у себя в аккаунте.',
      }),
    );
  }

  function showError(err, publicId) {
    if (err instanceof ApiError && err.status === 404) {
      result.replaceChildren(
        emptyState({
          title: 'Пользователь не найден',
          text: `Аккаунта с ID ${formatPublicId(publicId)} нет. Проверьте ID у собеседника — особенно похожие символы.`,
        }),
      );
      return;
    }
    const tone = err instanceof ApiError && err.status === 429 ? 'warning' : 'danger';
    result.replaceChildren(alert({ tone }, errorMessage(err)));
  }

  function showFound(user) {
    const isMe = user.publicId === me;
    const existing = dialogsStore.findByPeer(user.publicId);

    let action;
    let note;
    const actionError = h('p', { class: 'form-error', role: 'alert' });
    if (isMe) {
      // Диалог с самим собой создать нельзя (TC-10-N3).
      note = 'Это ваш ID. Чтобы начать переписку, найдите ID собеседника.';
    } else if (existing) {
      note = 'Диалог с этим собеседником уже есть.';
      action = button(
        { block: true, onClick: () => navigate(`/dialogs/${encodeURIComponent(existing.id)}`) },
        'Открыть диалог',
      );
    } else {
      note = 'После создания диалога вы получите ключ — передайте его собеседнику лично.';
      action = button({ block: true }, icon('plus', { size: 18 }), 'Создать диалог');
      action.addEventListener('click', () => createDialog(user.publicId, action, actionError));
    }

    result.replaceChildren(
      h(
        'div',
        { class: 'user-card' },
        avatar(user.publicId, { size: 'lg' }),
        h(
          'div',
          { class: 'user-card__info' },
          h('p', { class: 'user-card__id' }, formatPublicId(user.publicId)),
          isMe ? h('span', { class: 'badge badge--neutral' }, 'Вы') : null,
        ),
        h('p', { class: 'muted text-sm user-card__note' }, note),
        action ?? null,
        actionError,
      ),
    );
  }

  // ---------- Создание диалога ----------

  async function createDialog(peerPublicId, btn, error) {
    if (btn.disabled) return;
    error.textContent = '';
    const restore = setBusy(btn, 'Создаём диалог…');

    try {
      const dialog = await api.dialogs.create(peerPublicId);
      // Сервер возвращает существующий диалог вместо дубля (TC-11-N1):
      // тогда открываем переписку, а для нового — экран ключа.
      const wasKnown = Boolean(dialogsStore.find(dialog.id));
      // Новый диалог сразу появляется в списке, без перезагрузки.
      dialogsStore.upsert(dialog);
      const path = `/dialogs/${encodeURIComponent(dialog.id)}`;
      if (!wasKnown) putFlash('createKeyFor', dialog.id);
      navigate(wasKnown ? path : `${path}/key`);
    } catch (err) {
      restore();
      error.textContent = errorMessage(err);
    }
  }

  return appShell({
    user: session.user,
    content: pane(
      { title: 'Новый диалог', subtitle: 'Поиск по точному ID' },
      h('div', { class: 'card stack' }, form),
      result,
    ),
  });
}
