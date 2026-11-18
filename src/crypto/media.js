import { buildAAD } from '../crypto.js';

export const MAX_ATTACHMENT_BYTES = 25_000_000;
const MAX_METADATA_BYTES = 16_384;
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const allowedImageTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'image/heic', 'image/heif',
]);

export function isMediaType(type) {
  return typeof type === 'string' && (allowedImageTypes.has(type) || /^video\/[a-z0-9][a-z0-9.+-]{0,99}$/.test(type));
}

function aad({ dialogId, senderId, envelope }, part) {
  const { v, id, sentAt } = envelope;
  const messageContext = decoder.decode(buildAAD({ v, dialogId, senderId, id, sentAt }));
  return encoder.encode(JSON.stringify(['graphen/media', VERSION, part, messageContext, id]));
}

function options(context, part, iv) {
  return { name: 'AES-GCM', iv, additionalData: aad(context, part), tagLength: 128 };
}

function base64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value, max) {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4) {
    throw new TypeError('Некорректный пакет вложения');
  }
  const bytes = Uint8Array.from(atob(value), ch => ch.charCodeAt(0));
  if (bytes.length > max || base64(bytes) !== value) throw new TypeError('Некорректный пакет вложения');
  return bytes;
}

export async function encryptMedia(key, context, file, caption = '') {
  if (!isMediaType(file.type) || !file.size || file.size > MAX_ATTACHMENT_BYTES) {
    throw new TypeError('Некорректный тип или размер вложения');
  }

  const fileIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const metadataIv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const input = new Uint8Array(await file.arrayBuffer());
  let ciphertext;
  try {
    ciphertext = new Uint8Array(await crypto.subtle.encrypt(options(context, 'file', fileIv), key, input));
  } finally {
    input.fill(0);
  }

  const name = typeof file.name === 'string' && file.name ? file.name : 'Вложение';
  const metadataInput = encoder.encode(JSON.stringify({
    name,
    mime: file.type,
    caption,
    fileIv: base64(fileIv),
    fileTag: base64(ciphertext.subarray(-TAG_BYTES)),
  }));
  try {
    if (1 + IV_BYTES + metadataInput.length + TAG_BYTES > MAX_METADATA_BYTES) {
      throw new RangeError('Имя файла или подпись слишком длинные');
    }
    const encryptedMetadata = new Uint8Array(await crypto.subtle.encrypt(
      options(context, 'metadata', metadataIv), key, metadataInput,
    ));
    const packet = new Uint8Array(1 + IV_BYTES + encryptedMetadata.length);
    packet[0] = VERSION;
    packet.set(metadataIv, 1);
    packet.set(encryptedMetadata, 1 + IV_BYTES);
    return {
      body: new Blob([ciphertext.subarray(0, -TAG_BYTES)], { type: 'application/octet-stream' }),
      metadata: base64(packet),
    };
  } finally {
    metadataInput.fill(0);
  }
}

export async function decryptMediaMetadata(key, context, value) {
  const packet = fromBase64(value, MAX_METADATA_BYTES);
  if (packet[0] !== VERSION || packet.length <= 1 + IV_BYTES + TAG_BYTES) {
    throw new TypeError('Некорректные метаданные вложения');
  }
  const iv = packet.subarray(1, 1 + IV_BYTES);
  const plain = new Uint8Array(await crypto.subtle.decrypt(
    options(context, 'metadata', iv), key, packet.subarray(1 + IV_BYTES),
  ));
  try {
    const { name, mime, caption, fileIv, fileTag } = JSON.parse(decoder.decode(plain));
    const nonce = fromBase64(fileIv, IV_BYTES);
    const tag = fromBase64(fileTag, TAG_BYTES);
    if (typeof name !== 'string' || !name || !isMediaType(mime) || typeof caption !== 'string'
      || nonce.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new TypeError('Некорректные метаданные вложения');
    }
    return { name, mime, caption, nonce, tag };
  } finally {
    plain.fill(0);
  }
}

export async function decryptMediaFile(key, context, bytes, { mime, nonce, tag }) {
  if (!bytes.byteLength || bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new TypeError('Некорректный размер вложения');
  }
  const ciphertext = new Uint8Array(bytes.byteLength + TAG_BYTES);
  ciphertext.set(new Uint8Array(bytes));
  ciphertext.set(tag, bytes.byteLength);
  const plain = new Uint8Array(await crypto.subtle.decrypt(options(context, 'file', nonce), key, ciphertext));
  try {
    return new Blob([plain], { type: mime });
  } finally {
    plain.fill(0);
  }
}
