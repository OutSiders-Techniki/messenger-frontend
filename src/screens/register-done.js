// Показ выданного ID после регистрации (UC-01, TC-01-P).
// ID восстановить нельзя, поэтому экран помогает его сохранить:
// скопировать, скачать файлом, и только потом перейти ко входу.

import { putFlash, takeFlash } from '../state/flash.js';
import { alert, button, checkbox, formatPublicId, loading } from '../ui/components.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { guestLayout } from '../ui/layout.js';

const COPIED_MS = 2000;

export function registerDoneScreen({ navigate, onDispose }) {
  const publicId = takeFlash('registeredId');

  // ID есть только сразу после регистрации; при перезагрузке его уже нет.
  if (!publicId) {
    queueMicrotask(() => navigate('/login', { replace: true }));
    return guestLayout(loading('Переходим ко входу…'));
  }

  const formatted = formatPublicId(publicId);
  const idBlock = h('p', { class: 'code-block', id: 'new-public-id' }, formatted);
  const status = h('p', { class: 'muted text-sm', role: 'status' });

  // ---------- Скопировать ----------

  let copiedTimer = null;
  const copyButton = button({ variant: 'secondary', onClick: copy }, icon('copy', { size: 18 }), 'Скопировать');

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted);
      copyButton.replaceChildren(icon('check', { size: 18 }), 'Скопировано');
      status.textContent = 'ID скопирован в буфер обмена';
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copyButton.replaceChildren(icon('copy', { size: 18 }), 'Скопировать');
      }, COPIED_MS);
    } catch {
      // Буфер обмена недоступен (старый браузер, нет разрешения):
      // выделяем ID, чтобы его можно было скопировать вручную.
      const range = document.createRange();
      range.selectNodeContents(idBlock);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = 'ID выделен — нажмите Ctrl+C (на телефоне — «Копировать»)';
    }
  }

  // ---------- Скачать файлом ----------

  const downloadButton = button(
    {
      variant: 'secondary',
      onClick() {
        const text = `Ваш ID в мессенджере: ${formatted}\r\n\r\nID нужен для входа и чтобы собеседники нашли вас.\r\nПароль в этом файле не хранится.\r\n`;
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const anchor = h('a', { href: url, download: `messenger-id-${publicId}.txt` });
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        status.textContent = 'Файл с ID сохранён в загрузки';
      },
    },
    icon('arrow-left', { size: 18 }),
    'Скачать файлом',
  );
  // Стрелка вниз из той же иконки — поворотом в CSS.
  downloadButton.classList.add('btn--download');

  // ---------- Подтверждение и переход ----------

  const saved = checkbox({ label: 'Я сохранил ID', hint: 'Без ID войти в аккаунт будет невозможно' });
  const next = button(
    {
      block: true,
      disabled: true,
      onClick() {
        putFlash('loginId', publicId);
        navigate('/login');
      },
    },
    'Перейти ко входу',
  );
  saved.input.addEventListener('change', () => {
    next.disabled = !saved.input.checked;
  });

  // Пока ID не сохранён, предупреждаем при закрытии или перезагрузке вкладки.
  function warnOnLeave(event) {
    if (saved.input.checked) return;
    event.preventDefault();
    event.returnValue = '';
  }
  window.addEventListener('beforeunload', warnOnLeave);
  onDispose(() => {
    window.removeEventListener('beforeunload', warnOnLeave);
    clearTimeout(copiedTimer);
  });

  return guestLayout(
    h('h1', null, 'Аккаунт создан'),
    h('p', { class: 'muted' }, 'Ваш ID:'),
    idBlock,
    h('div', { class: 'button-row' }, copyButton, downloadButton),
    status,
    alert(
      { tone: 'warning', title: 'Сохраните ID сейчас' },
      'Он нужен для входа и чтобы собеседники нашли вас. Восстановить ID нельзя: телефона и почты у аккаунта нет.',
    ),
    saved.root,
    next,
  );
}
