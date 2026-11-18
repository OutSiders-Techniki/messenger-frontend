import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decryptMessage, encryptMediaMessage, importDialogKey, randomKeyBytes } from '../src/crypto.js';
import { decryptMediaFile, decryptMediaMetadata, encryptMedia, MAX_ATTACHMENT_BYTES } from '../src/crypto/media.js';

test('media keeps the 25 MB limit and authenticates the file, metadata and message context', async () => {
  const key = await importDialogKey(randomKeyBytes());
  const ids = { dialogId: crypto.randomUUID(), senderId: 'SENDER-234567' };
  const envelope = await encryptMediaMessage(key, ids);
  const context = { ...ids, envelope };
  assert.equal(await decryptMessage(key, context), '');

  await assert.rejects(
    encryptMedia(key, context, new File([], 'Пустое.png', { type: 'image/png' })),
    { name: 'TypeError' },
  );

  const plain = new Uint8Array(MAX_ATTACHMENT_BYTES);
  plain.fill(0xff);
  const file = new File([plain], 'Фото.png', { type: 'image/png' });
  const caption = 'Подпись';
  const { body, metadata } = await encryptMedia(key, context, file, caption);
  assert.equal(body.size, MAX_ATTACHMENT_BYTES);
  const bytes = await body.arrayBuffer();
  assert.notDeepEqual(new Uint8Array(bytes).slice(0, 64), plain.slice(0, 64));
  const info = await decryptMediaMetadata(key, context, metadata);
  assert.deepEqual([info.name, info.mime, info.caption], [file.name, file.type, caption]);
  const recovered = await decryptMediaFile(key, context, bytes, info);
  assert.deepEqual(new Uint8Array(await recovered.arrayBuffer()), plain);

  await assert.rejects(
    decryptMediaMetadata(key, { ...context, dialogId: crypto.randomUUID() }, metadata),
    { name: 'OperationError' },
  );
  const badMetadata = atob(metadata);
  const firstCipherByte = 13;
  const tampered = badMetadata.slice(0, firstCipherByte)
    + String.fromCharCode(badMetadata.charCodeAt(firstCipherByte) ^ 1)
    + badMetadata.slice(firstCipherByte + 1);
  await assert.rejects(decryptMediaMetadata(key, context, btoa(tampered)), { name: 'OperationError' });
  info.tag[0] ^= 1;
  await assert.rejects(decryptMediaFile(key, context, bytes, info), { name: 'OperationError' });
  await assert.rejects(
    encryptMedia(key, context, new File([plain, Uint8Array.of(0)], file.name, { type: file.type })),
    { name: 'TypeError' },
  );
});
