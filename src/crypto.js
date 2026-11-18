// Криптография текста по docs/crypto-contract-v1.md. Кодирование ключа
// используется напрямую и здесь, и на экранах показа и ввода.
export { formatKey, parseKey, randomKeyBytes } from './crypto/key-format.js';

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_CIPHERTEXT_BYTES = 64 * 1024;
export const MAX_TEXT_BYTES = MAX_CIPHERTEXT_BYTES - TAG_BYTES;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const contextId = /^[A-Za-z0-9_-]{1,128}$/;

export async function importDialogKey(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
    throw new TypeError('Ключ диалога должен содержать 32 байта');
  }
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function buildAAD({ v, dialogId, senderId, id, sentAt }) {
  if (v !== VERSION || typeof dialogId !== 'string' || !contextId.test(dialogId)
    || typeof senderId !== 'string' || !contextId.test(senderId)
    || typeof id !== 'string' || !uuid.test(id)
    || !Number.isSafeInteger(sentAt) || sentAt < 0 || sentAt > 253402300799999) {
    throw new TypeError('Некорректный контекст сообщения');
  }
  return encoder.encode(JSON.stringify([v, dialogId, senderId, id, sentAt]));
}

function encodeBase64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64url(text, min, max) {
  if (typeof text !== 'string' || text.length > Math.ceil(max * 4 / 3)
    || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new TypeError('Некорректный формат сообщения');
  }
  const bytes = Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  if (bytes.length < min || bytes.length > max || encodeBase64url(bytes) !== text) {
    throw new TypeError('Некорректный формат сообщения');
  }
  return bytes;
}

function requireDialogKey(key) {
  if (key?.type !== 'secret' || key.algorithm?.name !== 'AES-GCM'
    || key.algorithm.length !== 256 || key.extractable) {
    throw new TypeError('Нужен неизвлекаемый ключ AES-256-GCM');
  }
}

export function textError(text) {
  if (!text) return null;
  return text.length > MAX_TEXT_BYTES || encoder.encode(text).length > MAX_TEXT_BYTES
    ? `Сообщение слишком длинное. Максимум — ${MAX_TEXT_BYTES.toLocaleString('ru-RU')} байт текста.`
    : null;
}

export async function encryptMessage(key, { dialogId, senderId, text }) {
  requireDialogKey(key);
  if (typeof text !== 'string' || !text || textError(text)) {
    throw new TypeError('Некорректный размер сообщения');
  }

  const id = crypto.randomUUID();
  const sentAt = Date.now();
  const additionalData = buildAAD({ v: VERSION, dialogId, senderId, id, sentAt });
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const input = encoder.encode(text);
  try {
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData, tagLength: 128 }, key, input);
    return Object.freeze({ v: VERSION, id, sentAt, iv: encodeBase64url(iv), ct: encodeBase64url(new Uint8Array(ct)) });
  } finally {
    input.fill(0);
  }
}

export async function decryptMessage(key, { dialogId, senderId, envelope }) {
  requireDialogKey(key);
  const { v, id, sentAt, iv, ct } = envelope;
  const additionalData = buildAAD({ v, dialogId, senderId, id, sentAt });
  const nonce = decodeBase64url(iv, IV_BYTES, IV_BYTES);
  const ciphertext = decodeBase64url(ct, TAG_BYTES + 1, MAX_CIPHERTEXT_BYTES);
  const plain = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData, tagLength: 128 }, key, ciphertext,
  ));
  try {
    return decoder.decode(plain);
  } finally {
    plain.fill(0);
  }
}
