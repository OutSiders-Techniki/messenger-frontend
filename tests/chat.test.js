import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { messagesStore } from '../src/state/messages.js';
import { keysStore } from '../src/state/keys.js';
import { session } from '../src/state/session.js';

const vector = JSON.parse(readFileSync(new URL('../fixtures/crypto-v1.json', import.meta.url)));
const dialogId = vector.context.dialogId;
const alice = 'USERAB23';
const bob = 'USERCD45';
const raw = () => Uint8Array.from(Buffer.from(vector.keyHex, 'hex'));
const emptyHistory = () => Response.json({ items: [], nextBeforeId: null, revision: 0 });

test('HTTP chat sends only v1 ciphertext, decrypts server DTOs and deduplicates retransmission', async (t) => {
  let wire;
  let nextBeforeId = null;
  let pendingRemoval = [];
  let history = [];
  const posts = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    if (path.endsWith('/sync')) {
      return Response.json({ missingIds: pendingRemoval, revision: 3 });
    }
    if (options.method === 'GET') {
      return history.length ? Response.json({ items: history, nextBeforeId, revision: 2 }) : emptyHistory();
    }
    const envelope = JSON.parse(options.body);
    posts.push(envelope);
    if (posts.length === 1) return new Response(null, { status: 503 });
    if (posts.length === 4) return Response.json({ message: null, created: false, deleted: true, revision: 3 });
    wire = { dialogId, senderId: alice, ...envelope };
    return Response.json({ message: wire, created: true, deleted: false, revision: 1 }, { status: 201 });
  });
  try {
    session.set({ publicId: alice });
    await keysStore.set(dialogId, raw(), { remember: false });
    await messagesStore.send(dialogId, 'Сообщение из первой сессии');
    assert.equal(messagesStore.get(dialogId).items[0].status, 'failed');
    await messagesStore.retryFailed(dialogId);
    assert.deepEqual(posts[0], posts[1]);
    assert.equal(messagesStore.get(dialogId).items[0].status, 'sent');
    assert.deepEqual(Object.keys(posts[0]), ['v', 'id', 'sentAt', 'iv', 'ct']);

    session.set({ publicId: bob });
    await keysStore.set(dialogId, raw(), { remember: false });
    const altered = { ...wire, senderId: bob };
    history = [altered, wire, wire];
    await messagesStore.load(dialogId);
    assert.equal(messagesStore.get(dialogId).items.length, 1);
    assert.equal(messagesStore.get(dialogId).items[0].text, 'Сообщение из первой сессии');

    const item = { senderId: alice, envelope: posts[0] };
    await Promise.all([messagesStore.receive(dialogId, item), messagesStore.receive(dialogId, item)]);
    assert.equal(messagesStore.get(dialogId).items.length, 1);

    history = [{ dialogId, senderId: vector.context.senderId, ...vector.envelope }];
    nextBeforeId = vector.envelope.id;
    await messagesStore.load(dialogId);
    assert.equal(messagesStore.get(dialogId).items.length, 2);
    pendingRemoval = [wire.id];
    await messagesStore.load(dialogId);
    assert.deepEqual(messagesStore.get(dialogId).items.map(i => i.id), [vector.envelope.id]);

    await messagesStore.send(dialogId, 'Локальная отправка');
    const id = messagesStore.get(dialogId).items.find(i => i.text === 'Локальная отправка').id;
    await messagesStore.deliver(dialogId, id);
    assert.equal(messagesStore.get(dialogId).items.some(i => i.id === id), false);
  } finally {
    session.clear();
  }
});
