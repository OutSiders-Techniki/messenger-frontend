// Выбор фото и видео для отправки (MSG-53).
// Проверки до чтения файла: только фото или видео, не пустой, не больше
// 25 МБ — как MediaLimits.MaxAttachmentSizeBytes на бэкенде. Файл с
// превышением не отправляется, причина объясняется понятным текстом.

import { h } from './dom.js';
import { icon } from './icons.js';

import { isMediaType, MAX_ATTACHMENT_BYTES } from '../crypto/media.js';

const sizeFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function formatSize(bytes) {
  if (bytes < 1000) return `${bytes} Б`;
  if (bytes < 1_000_000) return `${sizeFormat.format(bytes / 1000)} КБ`;
  return `${sizeFormat.format(bytes / 1_000_000)} МБ`;
}

// Текст ошибки или null, если файл можно прикрепить.
export function validateMedia(file) {
  if (!isMediaType(file.type)) return `Формат файла «${file.name}» не поддерживается.`;
  if (file.size === 0) return `Файл «${file.name}» пустой.`;
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `«${file.name}» весит ${formatSize(file.size)} — больше лимита 25 МБ. Сожмите видео или выберите файл поменьше.`;
  }
  return null;
}

// Панель вложения над полосой ввода: превью, имя, размер, «убрать».
// Возвращает { root, open(), drop(files), file, clear() }.
export function mediaPicker({ onChange } = {}) {
  let current = null;
  let previewUrl = null;

  const input = h('input', {
    type: 'file',
    accept: 'image/*,video/*',
    class: 'visually-hidden',
    tabindex: '-1',
    'aria-hidden': 'true',
  });
  const error = h('p', { class: 'media-error', role: 'alert' });
  const chip = h('div', { class: 'media-chip', hidden: true });
  const root = h('div', { class: 'media-picker' }, input, error, chip);

  function revoke() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  function clear() {
    revoke();
    current = null;
    chip.hidden = true;
    chip.replaceChildren();
    input.value = '';
    onChange?.(null);
  }

  function take(file) {
    error.textContent = '';
    const problem = validateMedia(file);
    if (problem) {
      // Файл с ошибкой не прикрепляется — прежний выбор остаётся.
      error.textContent = problem;
      input.value = '';
      return;
    }

    revoke();
    current = file;
    previewUrl = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    const thumb = isVideo
      ? h('video', { class: 'media-chip__thumb', src: previewUrl, muted: true, preload: 'metadata', playsinline: true, 'aria-hidden': 'true' })
      : h('img', { class: 'media-chip__thumb', src: previewUrl, alt: '' });

    chip.replaceChildren(
      thumb,
      h(
        'span',
        { class: 'media-chip__info' },
        h('span', { class: 'media-chip__name' }, file.name),
        h('span', { class: 'media-chip__meta' }, `${isVideo ? 'Видео' : 'Фото'} · ${formatSize(file.size)}`),
      ),
      h(
        'button',
        { type: 'button', class: 'btn btn--ghost btn--icon btn--sm', 'aria-label': `Убрать ${file.name}`, onClick: clear },
        icon('x', { size: 16 }),
      ),
    );
    chip.hidden = false;
    onChange?.(file);
  }

  input.addEventListener('change', () => {
    const [file] = input.files;
    if (file) take(file);
  });

  return {
    root,
    get file() {
      return current;
    },
    open() {
      input.click();
    },
    drop(files) {
      if (files.length > 1) {
        error.textContent = 'Можно прикрепить один файл за раз.';
        return;
      }
      if (files[0]) take(files[0]);
    },
    showError(message) {
      error.textContent = message;
    },
    clear,
  };
}
