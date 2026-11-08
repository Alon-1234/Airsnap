/**
 * localDb.js — the Firestore stand-in used by Docker / local mode —
 * plus the real userStore + promoStore + hive persistence running on it
 * through auth.js (LOCAL_DB_FILE set, no service account).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createLocalDb, FieldValue, LocalTimestamp, READ_AFTER_WRITE } = require('../localDb');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'airsnap-localdb-')), 'db.json');

test('set / get / update with increment + serverTimestamp', async () => {
  const db = createLocalDb();
  const ref = db.collection('users').doc('u1');
  assert.equal((await ref.get()).exists, false);
  await ref.set({ credits: 5, createdAt: FieldValue.serverTimestamp() });
  await ref.update({ credits: FieldValue.increment(2.5) });
  const snap = await ref.get();
  assert.equal(snap.data().credits, 7.5);
  assert.ok(snap.data().createdAt instanceof LocalTimestamp);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(snap.data().createdAt))), ['_seconds', '_nanoseconds']);
  await assert.rejects(db.collection('users').doc('missing').update({ a: 1 }), /NOT_FOUND/);
  await ref.set({ name: 'x' }, { merge: true });
  assert.equal((await ref.get()).data().credits, 7.5, 'merge keeps other fields');
  await ref.set({ name: 'y' });
  assert.equal((await ref.get()).data().credits, undefined, 'set without merge replaces');
});

test('where / orderBy desc / limit on a subcollection', async () => {
  const db = createLocalDb();
  const ledger = db.collection('users').doc('u1').collection('ledger');
  for (let i = 0; i < 5; i++) {
    await ledger.doc(`e${i}`).set({ n: i, createdAt: new LocalTimestamp(1000 + i), kind: i % 2 ? 'odd' : 'even' });
  }
  await db.collection('users').doc('u2').collection('ledger').doc('other').set({ n: 99 });
  const q = await ledger.orderBy('createdAt', 'desc').limit(3).get();
  assert.deepEqual(q.docs.map((d) => d.data().n), [4, 3, 2]);
  const odd = await ledger.where('kind', '==', 'odd').get();
  assert.equal(odd.size, 2);
  assert.equal((await ledger.where('kind', '==', 'none').limit(1).get()).empty, true);
});

test('transactions: read-after-write rejected, failed tx writes nothing', async () => {
  const db = createLocalDb();
  const ref = db.collection('c').doc('a');
  await assert.rejects(
    db.runTransaction(async (tx) => { tx.set(ref, { v: 1 }); await tx.get(ref); }),
    new RegExp(READ_AFTER_WRITE.slice(0, 30)),
  );
  assert.equal((await ref.get()).exists, false);
  await assert.rejects(
    db.runTransaction(async (tx) => {
      tx.set(ref, { v: 1 });
      tx.update(db.collection('c').doc('missing'), { v: 2 });
    }),
    /NOT_FOUND/,
  );
  assert.equal((await ref.get()).exists, false, 'whole transaction rolled back');
});

test('transactions run one at a time (no lost updates)', async () => {
  const db = createLocalDb();
  const ref = db.collection('c').doc('counter');
  await ref.set({ v: 0 });
  await Promise.all(Array.from({ length: 20 }, () => db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    await new Promise((r) => setTimeout(r, 1));
    tx.update(ref, { v: s.data().v + 1 });
  })));
  assert.equal((await ref.get()).data().v, 20);
});

test('persists to disk and reloads timestamps', async () => {
  const file = tmpFile();
  const db = createLocalDb({ file });
  await db.collection('users').doc('u1').set({ credits: 3, createdAt: FieldValue.serverTimestamp() });
  db._flush();
  const db2 = createLocalDb({ file });
  const data = (await db2.collection('users').doc('u1').get()).data();
  assert.equal(data.credits, 3);
  assert.ok(data.createdAt instanceof LocalTimestamp);
});

test('real userStore + promoStore + hive persistence run on the local DB', async () => {
  const file = tmpFile();
  process.env.LOCAL_DB_FILE = file;
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'airsnap-test';
  delete process.env.SIGNUP_BONUS_EXPIRES;
  delete process.env.SIGNUP_BONUS_NIS;

  const userStore = require('../userStore');
  const promoStore = require('../promoStore');
  const hiveStore = require('../hiveStore');

  const alice = await userStore.getOrCreateUser('alice', 'alice@x.com', 'Alice');
  assert.equal(alice.credits, 5, 'signup bonus granted');
  const bob = await userStore.getOrCreateUser('bob', 'bob@x.com', 'Bob', {
    referralCodeUsedAtSignup: alice.referralCode,
  });
  assert.equal(bob.referredBy, 'alice');

  await promoStore.createPromo({ code: 'LOCAL10', type: 'balance', amount: 10, onePerUser: true }, 'admin');
  await promoStore.redeemPromo('LOCAL10', 'bob');
  await assert.rejects(promoStore.redeemPromo('LOCAL10', 'bob'), /already redeemed/i);
  assert.equal((await userStore.getUser('bob')).credits, 15);

  const first = await userStore.markFirstOrderAndPayReferrer('bob');
  assert.equal(first.firstOrder, true);
  assert.equal((await userStore.getUser('alice')).credits, 25, 'referrer paid 20');

  const ledger = await userStore.getLedger('alice');
  assert.equal(ledger.length, 2);
  assert.ok(ledger[0].createdAt.toMillis() >= ledger[1].createdAt.toMillis(), 'newest first');

  const { hive } = hiveStore.createHive({ name: 'Local hive', latitude: 32.09, longitude: 34.79, createdBy: 'admin' });
  await new Promise((r) => setTimeout(r, 50));
  const auth = require('../auth');
  const saved = await auth.getDb().collection('hives').get();
  assert.ok(saved.docs.some((d) => d.id === hive.id), 'hive persisted to the local DB');

  auth.getDb()._flush();
  const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Object.keys(onDisk.docs).some((p) => p.startsWith('users/alice')));
});
