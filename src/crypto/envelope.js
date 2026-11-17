// Шифрование текста сообщения по контракту v1 (docs/crypto-contract-v1.md):
//   AES-256-GCM, новый случайный IV 12 байт на каждое сообщение,
//   тег 128 бит в конце ct, AAD = UTF-8 от JSON.stringify([1, dialogId,
//   senderId, id, sentAt]). Пакет: { v, id, sentAt, iv, ct }, iv и ct —
//   Base64url без «=».
//
// Минимальная реализация для экрана переписки, совпадает с контрольным
// примером fixtures/crypto-v1.json. TODO(MSG-33, MSG-36): заменить на
// crypto.js тимлида, когда он появится в репозитории.

const VERSION = 1;
const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export class DecryptError extends Error {
  constructor(reason) {
    super(`Cannot decrypt message: ${reason}`);
    this.name = 'DecryptError';
    this.reason = reason;
  }
}

function toBase64url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw new DecryptError('encoding');
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  // Строгая проверка: повторное кодирование должно совпасть с входом.
  if (toBase64url(bytes) !== text) throw new DecryptError('encoding');
  return bytes;
}

function aad({ dialogId, senderId, id, sentAt }) {
  return encoder.encode(JSON.stringify([VERSION, dialogId, senderId, id, sentAt]));
}

// iv передаётся только в тестах с контрольным примером.
export async function encryptMessage(key, { dialogId, senderId, text, id = crypto.randomUUID(), sentAt = Date.now(), iv }) {
  const nonce = iv ?? crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad({ dialogId, senderId, id, sentAt }), tagLength: 128 },
    key,
    encoder.encode(text),
  );
  return { v: VERSION, id, sentAt, iv: toBase64url(nonce), ct: toBase64url(ct) };
}

// Возвращает текст или бросает DecryptError. Открытый текст наружу
// попадает только после успешной проверки тега GCM.
export async function decryptMessage(key, { dialogId, senderId, envelope }) {
  if (!envelope || envelope.v !== VERSION) throw new DecryptError('version');
  if (!Number.isSafeInteger(envelope.sentAt) || envelope.sentAt < 0) throw new DecryptError('format');
  const iv = fromBase64url(envelope.iv);
  const ct = fromBase64url(envelope.ct);
  if (iv.length !== IV_BYTES || ct.length < 17) throw new DecryptError('format');

  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad({ dialogId, senderId, id: envelope.id, sentAt: envelope.sentAt }), tagLength: 128 },
      key,
      ct,
    );
  } catch {
    throw new DecryptError('tag');
  }
  try {
    return decoder.decode(plain);
  } catch {
    throw new DecryptError('utf8');
  }
}
