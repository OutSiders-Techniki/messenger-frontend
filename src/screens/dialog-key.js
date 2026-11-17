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
  onDispose(() => pendingBytes?.fill(0));

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
    if (mode === 'ready') content.replaceChildren(readyView());
    else if (mode === 'show') content.replaceChildren(await showView());
    else if (mode === 'enter') content.replaceChildren(enterView());
    else content.replaceChildren(chooseView());
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

    const remember = checkbox({
      label: 'Не запоминать на этом устройстве',
      hint: 'Ключ будет жить только до закрытия вкладки',
    });
    const handed = checkbox({ label: 'Собеседник ввёл ключ у себя' });
    const done = button({ block: true, disabled: true }, 'Готово');
    handed.input.addEventListener('change', () => {
      done.disabled = !handed.input.checked;
    });
    done.addEventListener('click', async () => {
      await keysStore.set(dialogId, pendingBytes, { remember: !remember.input.checked });
      pendingBytes = null;
      navigate(chatPath, { replace: true });
    });

    return h(
      'div',
      { class: 'stack' },
      intro('Новый ключ диалога', 'Покажите ключ собеседнику, пока вы рядом. Он вводит его у себя — по группам, контрольная группа в конце.'),
      keyGrid(display),
      alert(
        { tone: 'warning', title: 'Ключ показывается один раз' },
        'Не пересылайте его через другие мессенджеры и почту. Потерянный ключ не восстанавливается — вместе с ним теряется переписка.',
      ),
      h('div', { class: 'card stack stack--sm' }, remember.root, handed.root),
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
      if (token !== checkToken) return;
      if (!result.ok) {
        setError(KEY_ERRORS.checksum);
        return;
      }
      result.bytes.fill(0);
      progress.textContent = 'Контрольная сумма сходится';
      progress.classList.add('key-progress--ok');
      submit.disabled = false;
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
          const result = await parseKey(input.value);
          if (!result.ok) {
            setError(KEY_ERRORS[result.reason] ?? KEY_ERRORS.checksum);
            return;
          }
          await keysStore.set(dialogId, result.bytes, { remember: !remember.input.checked });
          input.value = '';
          navigate(chatPath, { replace: true });
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
    return h(
      'div',
      { class: 'stack' },
      intro(
        'Ключ сохранён на этом устройстве',
        remembered
          ? 'Сообщения этого диалога шифруются и расшифровываются этим ключом.'
          : 'Ключ живёт только до закрытия вкладки — потом его придётся ввести снова.',
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
            keysStore.remove(dialogId);
            mode = 'choose';
            render();
          },
        },
        'Удалить ключ с устройства',
      ),
    );
  }

  render();

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
