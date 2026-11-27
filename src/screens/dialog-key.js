// Ключ диалога (MSG-46; UC-05, UC-06; TC-05-P, TC-06-*).
//
// Режимы экрана:
//   choose — ключа нет: «Создать ключ» или «Ввести ключ собеседника»;
//   show   — показ нового ключа инициатору, 14 групп по 4 символа;
//   enter  — ввод ключа с проверкой контрольной суммы по мере набора;
//   ready  — ключ уже есть на этом устройстве.

import { DISPLAY_CHARS, formatKey, groups, normalizeKeyInput, parseKey, randomKeyBytes } from '../crypto/key-format.js';
import { dialogsStore } from '../state/dialogs.js';
import { takeFlash } from '../state/flash.js';
import { keysStore } from '../state/keys.js';
import { session } from '../state/session.js';
import { alert, avatar, button, checkbox, confirmDialog, formatPublicId } from '../ui/components.js';
import { copyControl } from '../ui/copy.js';
import { lockButton } from '../ui/chat.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { appShell, pane } from '../ui/layout.js';

const KEY_ERRORS = {
  chars: 'В ключе только латинские буквы A–Z и цифры 2–7. Проверьте похожие символы: 0 и O, 1 и I, 8 и B.',
  checksum: 'Неверный ключ или ошибка ввода. Проверьте контрольную сумму',
};

export function dialogKeyScreen({ params, navigate, onDispose }) {
  const { dialogId } = params;
  const chatPath = `/dialogs/${encodeURIComponent(dialogId)}`;

  // Только что созданный через поиск диалог: сразу показываем новый ключ.
  const justCreated = takeFlash('createKeyFor') === dialogId;
  let mode = keysStore.has(dialogId) ? 'ready' : justCreated ? 'show' : 'choose';

  // Байты нового ключа живут только до сохранения или ухода с экрана.
  let pendingBytes = null;
  let disposed = false;
  let renderId = 0;
  onDispose(() => {
    disposed = true;
    pendingBytes?.fill(0);
    pendingBytes = null;
  });

  const content = h('div', { class: 'stack' });
  const peerTitle = h('span', null, 'Ключ диалога');
  const lead = h('span', { class: 'pane__lead' });

  function renderHeader() {
    const dialog = dialogsStore.find(dialogId);
    if (dialog) {
      lead.replaceChildren(avatar(dialog.peerPublicId, { size: 'sm' }));
      peerTitle.textContent = formatPublicId(dialog.peerPublicId);
    }
  }
  dialogsStore.subscribe(renderHeader, { owner: lead });
  renderHeader();

  async function render() {
    const id = ++renderId;
    let view;
    if (mode === 'ready') view = readyView();
    else if (mode === 'show') view = await showView();
    else if (mode === 'enter') view = enterView();
    else view = chooseView();
    if (disposed || id !== renderId) return;
    content.replaceChildren(view);
    content.querySelector('[data-autofocus]')?.focus();
  }

  // ---------- Ключа нет: выбор ----------

  function chooseView() {
    return h(
      'div',
      { class: 'stack' },
      intro('Ключа этого диалога нет на устройстве', 'Ключ создаёт один из собеседников и передаёт второму лично — при встрече. По сети ключ не передаётся.'),
      h(
        'div',
        { class: 'key-choice' },
        h(
          'button',
          {
            type: 'button',
            class: 'key-choice__option',
            'data-autofocus': '',
            onClick() {
              mode = 'show';
              render();
            },
          },
          icon('key', { size: 20 }),
          h('span', { class: 'key-choice__title' }, 'Создать ключ'),
          h('span', { class: 'key-choice__text' }, 'Я начинаю переписку и передам ключ собеседнику'),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'key-choice__option',
            onClick() {
              mode = 'enter';
              render();
            },
          },
          icon('lock', { size: 20 }),
          h('span', { class: 'key-choice__title' }, 'Ввести ключ'),
          h('span', { class: 'key-choice__text' }, 'Собеседник уже создал ключ и показал его мне'),
        ),
      ),
    );
  }

  // ---------- Показ нового ключа ----------

  async function showView() {
    pendingBytes?.fill(0);
    pendingBytes = randomKeyBytes();
    const display = await formatKey(pendingBytes);
    const grid = keyGrid(display);

    const remember = checkbox({
      label: 'Не запоминать на этом устройстве',
      hint: 'Ключ будет жить только до закрытия вкладки',
    });
    const handed = checkbox({ label: 'Собеседник ввёл ключ у себя' });
    const done = button({ block: true, disabled: true }, 'Готово');
    const error = h('p', { class: 'field__error', role: 'alert' });
    let saving = false;
    handed.input.addEventListener('change', () => {
      done.disabled = saving || !handed.input.checked;
    });
    done.addEventListener('click', async () => {
      if (saving || !pendingBytes) return;
      saving = true;
      done.disabled = true;
      error.textContent = '';
      const bytes = pendingBytes;
      try {
        if (!await keysStore.set(dialogId, bytes.slice(), { remember: !remember.input.checked })) return;
        bytes.fill(0);
        if (pendingBytes === bytes) pendingBytes = null;
        if (!disposed) navigate(chatPath, { replace: true });
      } catch {
        error.textContent = 'Не удалось обновить хранилище ключей. Проверьте настройки браузера и повторите.';
      } finally {
        saving = false;
        done.disabled = !handed.input.checked;
      }
    });

    return h(
      'div',
      { class: 'stack' },
      intro('Новый ключ диалога', 'Покажите ключ собеседнику, пока вы рядом. Он вводит его у себя — по группам, контрольная группа в конце.'),
      grid,
      copyControl(display, { label: 'Скопировать ключ диалога', target: grid }),
      alert(
        { tone: 'warning', title: 'Ключ показывается один раз' },
        'Не пересылайте его через другие мессенджеры и почту. Потерянный ключ не восстанавливается — вместе с ним теряется переписка.',
      ),
      h('div', { class: 'card stack stack--sm' }, remember.root, handed.root, error),
      done,
      button(
        {
          variant: 'ghost',
          block: true,
          onClick() {
            render();
          },
        },
        'Создать другой ключ',
      ),
    );
  }

  // ---------- Ввод ключа ----------

  function enterView() {
    const input = h('textarea', {
      class: 'field__input field__input--mono key-input',
      rows: '4',
      autocomplete: 'off',
      autocapitalize: 'characters',
      autocorrect: 'off',
      spellcheck: 'false',
      // Клавиатуре и облачной проверке орфографии ключ видеть незачем.
      'data-gramm': 'false',
      placeholder: 'XXXX-XXXX-XXXX-…',
      'aria-describedby': 'key-progress key-error',
      'data-autofocus': '',
    });
    const progress = h('p', { class: 'key-progress', id: 'key-progress', 'aria-live': 'polite' });
    const error = h('p', { class: 'field__error', id: 'key-error', role: 'alert' });
    const remember = checkbox({
      label: 'Не запоминать на этом устройстве',
      hint: 'Ключ будет жить только до закрытия вкладки, после входа его придётся ввести снова',
    });
    const submit = button({ type: 'submit', block: true, disabled: true }, 'Сохранить ключ');

    let checkToken = 0;
    let saving = false;

    async function update() {
      const normalized = normalizeKeyInput(input.value);
      const token = ++checkToken;
      error.textContent = '';
      input.removeAttribute('aria-invalid');
      submit.disabled = true;

      if (normalized === null) {
        setError(KEY_ERRORS.chars);
        progress.textContent = '';
        return;
      }

      // Группы по 4 символа ставятся сами по мере ввода.
      const formatted = groups(normalized).join('-');
      if (formatted !== input.value && document.activeElement === input) {
        const atEnd = input.selectionStart === input.value.length;
        input.value = formatted;
        if (atEnd) input.setSelectionRange(formatted.length, formatted.length);
      }

      progress.textContent = `${Math.min(normalized.length, DISPLAY_CHARS)} из ${DISPLAY_CHARS} символов`;
      progress.classList.remove('key-progress--ok');

      if (normalized.length > DISPLAY_CHARS) {
        setError(`В ключе ${DISPLAY_CHARS} символов — введено лишнее`);
        return;
      }
      if (normalized.length < DISPLAY_CHARS) return;

      // Опечатка видна сразу, до попытки расшифровки (TC-06-N1).
      const result = await parseKey(normalized);
      if (disposed || token !== checkToken) {
        if (result.ok) result.bytes.fill(0);
        return;
      }
      if (!result.ok) {
        setError(KEY_ERRORS.checksum);
        return;
      }
      result.bytes.fill(0);
      progress.textContent = 'Контрольная сумма сходится';
      progress.classList.add('key-progress--ok');
      submit.disabled = saving;
    }

    function setError(message) {
      error.textContent = message;
      input.setAttribute('aria-invalid', 'true');
    }

    input.addEventListener('input', update);

    const form = h(
      'form',
      {
        class: 'stack',
        novalidate: true,
        async onSubmit(event) {
          event.preventDefault();
          if (saving) return;
          saving = true;
          submit.disabled = true;
          const typed = input.value;
          const generation = session.generation;
          try {
            const result = await parseKey(typed);
            if (disposed || generation !== session.generation || typed !== input.value) {
              if (result.ok) result.bytes.fill(0);
              return;
            }
            if (!result.ok) {
              setError(KEY_ERRORS[result.reason] ?? KEY_ERRORS.checksum);
              return;
            }
            if (!await keysStore.set(dialogId, result.bytes, { remember: !remember.input.checked })) return;
            input.value = '';
            if (!disposed) navigate(chatPath, { replace: true });
          } catch {
            error.textContent = 'Не удалось обновить хранилище ключей. Проверьте настройки браузера и повторите.';
          } finally {
            saving = false;
            submit.disabled = !progress.classList.contains('key-progress--ok');
          }
        },
      },
      h('label', { class: 'field__label', for: 'dialog-key-input' }, 'Ключ от собеседника'),
      input,
      progress,
      error,
      h('div', { class: 'card' }, remember.root),
      submit,
    );
    input.id = 'dialog-key-input';

    return h(
      'div',
      { class: 'stack' },
      intro('Введите ключ диалога', 'Ключ — 14 групп по 4 символа, последняя группа — контрольная. Дефисы и пробелы можно не вводить.'),
      form,
      button(
        {
          variant: 'ghost',
          block: true,
          onClick() {
            mode = 'choose';
            render();
          },
        },
        'Назад',
      ),
    );
  }

  // ---------- Ключ уже есть ----------

  function readyView() {
    const remembered = keysStore.remembered(dialogId);
    const error = h('p', { class: 'field__error', role: 'alert' });
    return h(
      'div',
      { class: 'stack' },
      intro(
        'Ключ готов к использованию',
        remembered
          ? 'Ключ сохранён в этом браузере и восстановится после перезагрузки в том же аккаунте.'
          : 'Ключ хранится в памяти вкладки до выхода или перезагрузки страницы.',
        true,
      ),
      button({ block: true, 'data-autofocus': '', onClick: () => navigate(chatPath) }, 'Открыть переписку'),
      button(
        {
          variant: 'secondary',
          block: true,
          async onClick() {
            const ok = await confirmDialog({
              title: 'Удалить ключ с устройства?',
              text: 'Переписка на сервере останется, но прочитать её на этом устройстве можно будет только после повторного ввода ключа.',
              confirmLabel: 'Удалить ключ',
              tone: 'danger',
            });
            if (!ok) return;
            try {
              if (!await keysStore.remove(dialogId) || disposed) return;
            } catch {
              error.textContent = 'Не удалось удалить сохранённый ключ. Повторите попытку.';
              return;
            }
            mode = 'choose';
            render();
          },
        },
        'Удалить ключ с устройства',
      ),
      error,
    );
  }

  if (keysStore.restoring) {
    content.replaceChildren(h('p', { role: 'status' }, 'Восстанавливаем ключи…'));
    keysStore.whenReady().then(() => {
      if (disposed) return;
      if (keysStore.has(dialogId)) mode = 'ready';
      render();
    });
  } else {
    render();
  }

  return appShell({
    user: session.user,
    activeDialogId: dialogId,
    content: pane(
      { title: peerTitle, lead, back: chatPath, actions: lockButton({ href: `#${chatPath}/key`, verified: mode === 'ready' }) },
      content,
    ),
  });
}

function intro(title, text, verified = false) {
  return h(
    'div',
    { class: 'key-intro' },
    h('span', { class: `key-prompt__icon${verified ? ' key-prompt__icon--ok' : ''}`, 'aria-hidden': 'true' }, icon(verified ? 'check' : 'key', { size: 24 })),
    h('h2', null, title),
    h('p', { class: 'muted text-sm' }, text),
  );
}

// Ключ сеткой: 14 групп по 4, последняя (контрольная) отмечена.
function keyGrid(display) {
  const parts = display.split('-');
  return h(
    'div',
    { class: 'key-grid', role: 'group', 'aria-label': `Ключ диалога: ${parts.join(' ')}` },
    parts.map((part, i) =>
      h('span', { class: `key-grid__cell${i === parts.length - 1 ? ' key-grid__cell--check' : ''}`, 'aria-hidden': 'true' }, part),
    ),
  );
}
