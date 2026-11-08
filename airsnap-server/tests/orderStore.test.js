const test = require('node:test');
const assert = require('node:assert/strict');
const orderStore = require('../orderStore');

const base = (over = {}) => ({
  userId: 'u1',
  userEmail: 'u1@example.com',
  targetLat: 31.83,
  targetLng: 35.13,
  siteName: 'Here',
  pkg: { id: 'basic', durationSec: 180, photos: 10, price: 10.79 },
  paymentMethod: 'card',
  hive: { id: 'hive_1', latitude: 31.831, longitude: 35.128 },
  droneId: 'hive_1_d1',
  ...over,
});

test('genOrderId — readable prefix, unique in-process', () => {
  const ids = Array.from({ length: 2000 }, () => orderStore.genOrderId());
  assert.match(ids[0], /^ORD-\d{8}-[0-9A-Z]{8}$/);
  assert.equal(new Set(ids).size, ids.length);
});

test('genOrderId — unique across a server restart (fresh module, counter reset)', async () => {
  const before = orderStore.genOrderId();
  await new Promise((r) => setTimeout(r, 5));
  delete require.cache[require.resolve('../orderStore')];
  const restarted = require('../orderStore');
  assert.notEqual(restarted.genOrderId(), before);
});

test('createOrder — defaults and pre-allocated id', () => {
  const id = orderStore.genOrderId();
  const o = orderStore.createOrder(base({ id }));
  assert.equal(o.id, id);
  assert.equal(o.paymentStatus, 'awaiting_card');
  assert.equal(o.paidAt, null);
  assert.equal(o.abandonedAt, null);
  assert.equal(o.media, null);
  assert.equal(o.package.durationSec, 180);
  assert.equal(orderStore.getOrder(id), o);
  assert.equal(orderStore.getOrder('nope'), null);
});

test('createOrder paid → paidAt stamped; setPaymentStatus keeps first paidAt', () => {
  const o = orderStore.createOrder(base({ paymentStatus: 'paid' }));
  assert.ok(o.paidAt > 0);
  const first = o.paidAt;
  orderStore.setPaymentStatus(o.id, 'paid');
  assert.equal(o.paidAt, first);

  const o2 = orderStore.createOrder(base());
  orderStore.setPaymentStatus(o2.id, 'paid');
  assert.ok(o2.paidAt > 0);
  assert.equal(orderStore.setPaymentStatus('missing', 'paid'), null);
});

test('markDelivered / markAbandoned', () => {
  const o = orderStore.createOrder(base());
  orderStore.markDelivered(o.id, { photos: ['a'], videos: [] });
  assert.deepEqual(o.media, { photos: ['a'], videos: [] });
  assert.ok(o.deliveredAt > 0);

  const o2 = orderStore.createOrder(base());
  orderStore.markDelivered(o2.id);
  assert.deepEqual(o2.media, { photos: [], videos: [] });

  const o3 = orderStore.createOrder(base({ paymentStatus: 'paid', creditsApplied: 10 }));
  orderStore.markAbandoned(o3.id, { cancellationFee: 1, refundAmount: 9 });
  assert.ok(o3.abandonedAt > 0);
  assert.equal(o3.cancellationFee, 1);
  assert.equal(o3.refundAmount, 9);
  assert.equal(o3.paymentStatus, 'refunded');
  assert.equal(orderStore.markAbandoned('missing', {}), null);
  assert.equal(orderStore.markDelivered('missing'), null);
});

test('listOrdersForUser — only own orders, newest first, onlyDelivered filter', async () => {
  const mine1 = orderStore.createOrder(base({ userId: 'list-user' }));
  await new Promise((r) => setTimeout(r, 5));
  const mine2 = orderStore.createOrder(base({ userId: 'list-user' }));
  orderStore.createOrder(base({ userId: 'someone-else' }));
  const list = orderStore.listOrdersForUser('list-user');
  assert.deepEqual(list.map((o) => o.id), [mine2.id, mine1.id]);
  orderStore.markDelivered(mine1.id, null);
  assert.deepEqual(
    orderStore.listOrdersForUser('list-user', { onlyDelivered: true }).map((o) => o.id),
    [mine1.id],
  );
  assert.ok(orderStore.listActiveOrderIds().includes(mine1.id));
});
