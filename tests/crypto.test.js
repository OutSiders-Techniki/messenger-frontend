import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAAD, decryptMessage, encryptMessage, formatKey, importDialogKey, MAX_TEXT_BYTES, parseKey, randomKeyBytes } from '../src/crypto.js';

const vector = JSON.parse(readFileSync(new URL('../fixtures/crypto-v1.json', import.meta.url)));
const bytes = Uint8Array.from(Buffer.from(vector.keyHex, 'hex'));
const key = await importDialogKey(bytes);

test('WebCrypto generates a 256-bit key and imports it as nonextractable', async () => {
  const first = randomKeyBytes();
  const second = randomKeyBytes();
  assert.equal(first.length, 32);
  assert.notDeepEqual(first, second);
  const imported = await importDialogKey(first);
  assert.equal(imported.algorithm.length, 256);
  assert.equal(imported.extractable, false);
  await assert.rejects(crypto.subtle.exportKey('raw', imported));
});

test('Base32 and SHA-256 checksum match the published vector', async () => {
  assert.equal(await formatKey(bytes), vector.displayKey);
  const pasted = vector.displayKey.toLowerCase().replaceAll('-', ' \t');
  assert.deepEqual(await parseKey(pasted), { ok: true, bytes });
  const cut = vector.displayKey.slice(0, -1);
  assert.deepEqual(await parseKey(cut), { ok: false, reason: 'length' });
  assert.deepEqual(await parseKey(cut + 'A'), { ok: false, reason: 'checksum' });
  assert.deepEqual(await parseKey(vector.displayKey.replace('-DYPQ-', '-DYPR-')), { ok: false, reason: 'checksum' });
});

test('AES-GCM decrypts the known vector and a new envelope without transmitting AAD', async () => {
  assert.equal(Buffer.from(buildAAD(vector.context)).toString('hex'), vector.aadHex);
  assert.equal(await decryptMessage(key, { ...vector.context, envelope: vector.envelope }), vector.plaintext);
  const input = { ...vector.context, text: '\ufeff' + vector.plaintext };
  const envelope = await encryptMessage(key, input);
  assert.deepEqual(Object.keys(envelope), ['v', 'id', 'sentAt', 'iv', 'ct']);
  assert.equal(await decryptMessage(key, { ...input, envelope }), input.text);
  assert.notEqual((await encryptMessage(key, input)).iv, envelope.iv);
});

test('AAD binds dialogId, senderId, messageId and sentAt', async () => {
  const input = { ...vector.context, envelope: vector.envelope };
  const differentId = '00000000-0000-4000-8000-000000000002';
  for (const mutation of [
    { dialogId: 'dialog-test-2' },
    { senderId: 'NEWUSER' },
    { envelope: { ...input.envelope, id: differentId } },
    { envelope: { ...input.envelope, sentAt: input.sentAt + 1 } },
  ]) {
    await assert.rejects(decryptMessage(key, { ...input, ...mutation }), { name: 'OperationError' });
  }
  const wrongKey = await importDialogKey(randomKeyBytes());
  await assert.rejects(decryptMessage(wrongKey, input), { name: 'OperationError' });
});

test('reads the backend interoperability vector without changing any AAD fields', async () => {
  const { key: base64, aad, plaintext, dialogId, senderId, packet } =
    JSON.parse(readFileSync(new URL('../fixtures/backend-protocol-v1.json', import.meta.url)));
  const backendKey = await importDialogKey(new Uint8Array(Buffer.from(base64, 'base64url')));
  assert.equal(new TextDecoder().decode(buildAAD({ dialogId, senderId, ...packet })), aad);
  assert.equal(await decryptMessage(backendKey, { dialogId, senderId, envelope: packet }), plaintext);
});

test('ciphertext limit includes the GCM tag and uses UTF-8 bytes', async () => {
  const input = { ...vector.context, text: 'я'.repeat(MAX_TEXT_BYTES / 2) };
  const packet = await encryptMessage(key, input);
  assert.equal(Buffer.from(packet.ct, 'base64url').length, 64 * 1024);
  assert.equal(await decryptMessage(key, { ...input, envelope: packet }), input.text);
  await assert.rejects(encryptMessage(key, { ...input, text: input.text + 'я' }), /размер/);
});
