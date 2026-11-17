// Формат ключа диалога для показа и ввода (контракт шифрования v1,
// docs/crypto-contract-v1.md в PR #28):
//   32 случайных байта → Base32 RFC 4648 без «=» (52 символа, последние
//   4 бита нулевые) + контрольная сумма: первые 20 бит SHA-256 исходных
//   32 байт, 4 символа Base32. Итого 56 символов, 14 групп по 4.
//
// Здесь только кодирование и проверка ввода — то, что нужно экранам.
// Импорт в CryptoKey и хранение — задачи MSG-33/MSG-34 (крипто-модуль).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const KEY_BYTES = 32;
const KEY_CHARS = 52;
const CHECKSUM_CHARS = 4;
export const DISPLAY_CHARS = KEY_CHARS + CHECKSUM_CHARS; // 56
export const GROUP = 4;

function encodeBits(bytes, bitCount) {
  let out = '';
  let buffer = 0;
  let bits = 0;
  let used = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && used + 5 <= bitCount) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
      used += 5;
    }
    if (used >= bitCount) break;
  }
  if (used < bitCount && bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

function decodeBase32(text) {
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    buffer = (buffer << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return { bytes: new Uint8Array(bytes), tail: buffer & ((1 << bits) - 1) };
}

async function checksum(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return encodeBits(digest, 20);
}

export function groups(text) {
  return text.match(/.{1,4}/g) ?? [];
}

// 32 байта ключа → строка для показа: 14 групп через дефис.
export async function formatKey(bytes) {
  return groups(encodeBits(bytes, 256) + (await checksum(bytes))).join('-');
}

// Убирает разрешённые разделители и приводит a–z к верхнему регистру.
// null — во вводе есть недопустимые символы (кириллица, 0, 1, 8, 9 и т. п.).
export function normalizeKeyInput(input) {
  const cleaned = String(input).replace(/[\s-]/g, '').replace(/[a-z]/g, (c) => c.toUpperCase());
  return /^[A-Z2-7]*$/.test(cleaned) ? cleaned : null;
}

// Проверка ввода: { ok: true, bytes } или { ok: false, reason }.
// reason: 'chars' | 'length' | 'checksum'.
export async function parseKey(input) {
  const text = normalizeKeyInput(input);
  if (text === null) return { ok: false, reason: 'chars' };
  if (text.length !== DISPLAY_CHARS) return { ok: false, reason: 'length' };

  const { bytes, tail } = decodeBase32(text.slice(0, KEY_CHARS));
  if (bytes.length !== KEY_BYTES || tail !== 0) return { ok: false, reason: 'checksum' };
  if ((await checksum(bytes)) !== text.slice(KEY_CHARS)) return { ok: false, reason: 'checksum' };
  return { ok: true, bytes };
}

// Новый ключ: 32 случайных байта из криптостойкого генератора браузера.
export function randomKeyBytes() {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES));
}
