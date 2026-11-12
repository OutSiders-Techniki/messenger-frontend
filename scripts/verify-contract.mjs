// Specification fixture verification only; not a production crypto module.
// Node 22+; no dependencies. Fixed key/IV below are PUBLIC test material.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const f = JSON.parse(await readFile(new URL('../fixtures/crypto-v1.json', import.meta.url), 'utf8'));
const raw = Buffer.from(f.keyHex, 'hex');
const iv = Buffer.from(f.ivHex, 'hex');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes) {
  let pending = 0, bits = 0, out = '';
  for (const byte of bytes) {
    pending = (pending << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(pending >>> bits) & 31];
    }
    pending &= (1 << bits) - 1;
  }
  if (bits) out += alphabet[(pending << (5 - bits)) & 31];
  return out;
}
assert.equal(raw.length, 32);
assert.equal(iv.length, 12);
assert.equal(base32(raw), f.keyBase32);
const digest = new Uint8Array(await webcrypto.subtle.digest('SHA-256', raw));
assert.equal(base32(digest).slice(0, 4), f.checksum);
assert.equal((f.keyBase32 + f.checksum).match(/.{4}/g).join('-'), f.displayKey);
const c = f.context;
const serialize = c => JSON.stringify([c.v, c.dialogId, c.senderId, c.id, c.sentAt]);
const aad = Buffer.from(serialize(c), 'utf8');
assert.equal(aad.toString('utf8'), f.aadUtf8);
assert.equal(aad.toString('hex'), f.aadHex);
assert.equal(iv.toString('base64url'), f.envelope.iv);
assert.equal(f.envelope.v, c.v);
assert.equal(f.envelope.id, c.id);
assert.equal(f.envelope.sentAt, c.sentAt);
assert.deepEqual(Object.keys(f.envelope).sort(), ['ct', 'id', 'iv', 'sentAt', 'v']);
const key = await webcrypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
assert.equal(key.extractable, false);
const params = { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 };
const encrypted = await webcrypto.subtle.encrypt(params, key, Buffer.from(f.plaintext, 'utf8'));
assert.equal(Buffer.from(encrypted).toString('base64url'), f.envelope.ct);
const ciphertext = Buffer.from(f.envelope.ct, 'base64url');
const decrypted = await webcrypto.subtle.decrypt(params, key, ciphertext);
assert.equal(Buffer.from(decrypted).toString('utf8'), f.plaintext);
for (const field of ['dialogId', 'senderId', 'id', 'sentAt']) {
  const changed = { ...c, [field]: field === 'sentAt' ? c[field] + 1 : c[field] + 'x' };
  await assert.rejects(webcrypto.subtle.decrypt({ ...params, additionalData: Buffer.from(serialize(changed)) }, key, ciphertext));
}
for (const offset of [0, ciphertext.length - 1]) {
  const tampered = Buffer.from(ciphertext);
  tampered[offset] ^= 1;
  await assert.rejects(webcrypto.subtle.decrypt(params, key, tampered));
}
const changedIV = Buffer.from(iv);
changedIV[0] ^= 1;
await assert.rejects(webcrypto.subtle.decrypt({ ...params, iv: changedIV }, key, ciphertext));
const changedKey = Buffer.from(raw);
changedKey[0] ^= 1;
const wrongKey = await webcrypto.subtle.importKey('raw', changedKey, 'AES-GCM', false, ['decrypt']);
await assert.rejects(webcrypto.subtle.decrypt(params, wrongKey, ciphertext));
console.log('PASS: Base32, checksum, AAD, independent AES-GCM vector, round-trip and 8 tampering checks');
