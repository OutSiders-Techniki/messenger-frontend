import { api, errorMessage } from '../api/index.js';
import { decryptMediaFile, decryptMediaMetadata } from '../crypto/media.js';
import { h } from './dom.js';

export function mediaAttachment(dialogId, { id, senderId, envelope }, key) {
  const controller = new AbortController();
  const { signal } = controller;
  const context = { dialogId, senderId, envelope };
  const open = h('button', { type: 'button', class: 'btn btn--secondary btn--sm', onClick: load }, 'Открыть вложение');
  const feedback = h('span', { class: 'bubble__text', role: 'status' });
  const node = h('div', { class: 'bubble__media' }, open, feedback);
  let url;

  async function load() {
    open.disabled = true;
    feedback.textContent = 'Загружаем вложение…';
    try {
      const item = await api.attachments.metadata(dialogId, id, id, { signal });
      const metadata = await decryptMediaMetadata(key, context, item.encryptedMetadata);
      const bytes = await api.attachments.content(dialogId, id, id, { signal });
      const blob = await decryptMediaFile(key, context, bytes, metadata);
      if (signal.aborted) return;

      url = URL.createObjectURL(blob);
      const preview = blob.type.startsWith('image/')
        ? h('img', { src: url, alt: metadata.name })
        : h('video', { src: url, controls: true, playsinline: true, preload: 'metadata' });
      node.replaceChildren(
        preview,
        h('a', { href: url, download: metadata.name }, metadata.name),
        metadata.caption ? h('span', { class: 'bubble__text' }, metadata.caption) : null,
      );
    } catch (error) {
      if (signal.aborted) return;
      feedback.textContent = errorMessage(error, {
        404: 'Вложение пока недоступно. Попробуйте снова.',
        default: 'Не удалось открыть зашифрованное вложение.',
      });
      open.disabled = false;
    }
  }

  return {
    node,
    dispose() {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    },
  };
}
