/**
 * userStore + promoStore against an in-memory Firestore fake that enforces
 * the real SDK's "all reads before any write" transaction rule.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.SIGNUP_BONUS_EXPIRES;
delete process.env.SIGNUP_BONUS_NIS;
delete process.env.REFERRAL_BONUS_NIS;

const db = require('./helpers/fakeFirestore').install();
const userStore = require('../userStore');
const promoStore = require('../promoStore');
const { isSignupBonusEligible } = require('../credits');

const credits = (uid) => db._docs.get(`users/${uid}`).credits;
const ledger = (uid) =>
  [...db._docs.entries()]
    .filter(([p]) => p.startsWith(`users/${uid}/ledger/`))
    .map(([, v]) => v);

test('getOrCreateUser — creates once, grants signup bonus once, idempotent', async () => {
  const u = await userStore.getOrCreateUser('alice', 'alice@x.com', 'Alice');
  assert.match(u.referralCode, /^[A-Z2-9]{6}$/);
  assert.equal(u.referredBy, null);
  assert.equal(isSignupBonusEligible(), true, 'signup bonus window must be open today');
  assert.equal(u.credits, 5);
  assert.equal(u.signupBonusGranted, true);
  const again = await userStore.getOrCreateUser('alice', 'alice@x.com', 'Alice');
  assert.equal(again.referralCode, u.referralCode);
  assert.equal(credits('alice'), 5);
  assert.equal(ledger('alice').filter((e) => e.type === 'signup_bonus').length, 1);
});

test('getOrCreateUser — links referrer; blocks self-referral by email', async () => {
  const ref = await userStore.getOrCreateUser('referrer', 'ref@x.com', 'R');
  const bob = await userStore.getOrCreateUser('bob', 'bob@x.com', 'B', {
    referralCodeUsedAtSignup: ` ${ref.referralCode.toLowerCase()} `,
  });
  assert.equal(bob.referredBy, 'referrer');
  const sneaky = await userStore.getOrCreateUser('ref-alt', 'REF@x.com', 'R2', {
    referralCodeUsedAtSignup: ref.referralCode,
  });
  assert.equal(sneaky.referredBy, null);
  const bogus = await userStore.getOrCreateUser('carol', 'c@x.com', 'C', {
    referralCodeUsedAtSignup: 'NOPE99',
  });
  assert.equal(bogus.referredBy, null);
});

test('markFirstOrderAndPayReferrer — pays the referrer exactly once', async () => {
  const before = credits('referrer');
  const r1 = await userStore.markFirstOrderAndPayReferrer('bob');
  assert.deepEqual(r1, { firstOrder: true, referrerCredited: true, referrerUid: 'referrer' });
  assert.equal(credits('referrer'), before + 20);
  assert.equal(db._docs.get('users/bob').hasMadeFirstOrder, true);
  const r2 = await userStore.markFirstOrderAndPayReferrer('bob');
  assert.deepEqual(r2, { firstOrder: false });
  assert.equal(credits('referrer'), before + 20);
  const bonus = ledger('referrer').filter((e) => e.type === 'referral_bonus');
  assert.equal(bonus.length, 1);
  assert.equal(bonus[0].balanceAfter, before + 20);
});

test('markFirstOrderAndPayReferrer — no referrer / missing referrer doc / unknown user', async () => {
  assert.deepEqual(await userStore.markFirstOrderAndPayReferrer('carol'), {
    firstOrder: true, referrerCredited: false,
  });
  assert.deepEqual(await userStore.markFirstOrderAndPayReferrer('ghost'), { firstOrder: false });
  // Referrer account was deleted after signup: still flip the flag, no crash.
  await userStore.getOrCreateUser('dave', 'd@x.com', 'D');
  db._docs.set('users/dave', { ...db._docs.get('users/dave'), referredBy: 'deleted-user' });
  const r = await userStore.markFirstOrderAndPayReferrer('dave');
  assert.equal(r.firstOrder, true);
  assert.equal(r.referrerCredited, false);
  assert.equal(db._docs.get('users/dave').hasMadeFirstOrder, true);
});

test('spendOnOrder / adminAdjust — balance math + insufficient funds', async () => {
  await userStore.getOrCreateUser('erin', 'e@x.com', 'E');
  await userStore.adminAdjust('erin', 10.5, 'test', 'system');
  assert.equal(credits('erin'), 15.5);
  const nb = await userStore.spendOnOrder('erin', 15.49, 'ORD-1');
  assert.equal(nb, 0.01);
  await assert.rejects(userStore.spendOnOrder('erin', 1, 'ORD-2'), /Insufficient/);
  assert.equal(credits('erin'), 0.01, 'failed spend leaves balance untouched');
  assert.equal(await userStore.spendOnOrder('erin', 0, 'ORD-3'), null);
  await assert.rejects(userStore.adminAdjust('erin', NaN, 'x', 'y'), /finite/);
  await assert.rejects(userStore.adminAdjust('nobody', 5, 'x', 'y'), /not found/);
});

test('createPromo — validation', async () => {
  const ok = await promoStore.createPromo({ code: 'free10', type: 'balance', amount: 10 }, 'admin');
  assert.equal(ok.code, 'FREE10');
  assert.equal(ok.oneTimePerUser, true);
  assert.equal(ok.maxRedemptions, null);
  await assert.rejects(promoStore.createPromo({ code: 'FREE10', type: 'balance', amount: 1 }, 'a'), /exists/);
  await assert.rejects(promoStore.createPromo({ code: 'x', type: 'balance', amount: 1 }, 'a'), /3–32/);
  await assert.rejects(promoStore.createPromo({ code: 'BAD/PATH', type: 'balance', amount: 1 }, 'a'), /3–32/);
  await assert.rejects(promoStore.createPromo({ code: 'TYPE1', type: 'gift', amount: 1 }, 'a'), /Type/);
  await assert.rejects(promoStore.createPromo({ code: 'AMT1', type: 'balance', amount: -1 }, 'a'), /positive/);
  await assert.rejects(promoStore.createPromo({ code: 'AMT2', type: 'balance', amount: '5' }, 'a'), /finite/);
  await assert.rejects(promoStore.createPromo({ code: 'MAX1', type: 'balance', amount: 1, maxRedemptions: 0 }, 'a'), /maxRedemptions/);
  await assert.rejects(promoStore.createPromo({ code: 'EXP1', type: 'balance', amount: 1, expiresAt: 'soon' }, 'a'), /expiresAt/);
});

test('redeemPromo — balance code credits the user once', async () => {
  await userStore.getOrCreateUser('frank', 'f@x.com', 'F');
  const r = await promoStore.redeemPromo('free10', 'frank', { expectType: 'balance' });
  assert.equal(r.type, 'balance');
  assert.equal(r.creditsAdded, 10);
  assert.equal(r.newBalance, 15);
  assert.equal(credits('frank'), 15);
  await assert.rejects(promoStore.redeemPromo('FREE10', 'frank', { expectType: 'balance' }), /already redeemed/);
  assert.equal(credits('frank'), 15);
  assert.equal(db._docs.get('promo_codes/FREE10').redemptionCount, 1);
});

test('redeemPromo — max redemptions, expiry, deactivation, unknown', async () => {
  await promoStore.createPromo({ code: 'ONCE', type: 'balance', amount: 3, maxRedemptions: 1 }, 'a');
  await userStore.getOrCreateUser('g1', 'g1@x.com', 'G1');
  await userStore.getOrCreateUser('g2', 'g2@x.com', 'G2');
  await promoStore.redeemPromo('ONCE', 'g1', { expectType: 'balance' });
  await assert.rejects(promoStore.redeemPromo('ONCE', 'g2', { expectType: 'balance' }), /limit/);

  await promoStore.createPromo({ code: 'OLD', type: 'balance', amount: 3, expiresAt: '2020-01-01T00:00:00Z' }, 'a');
  await assert.rejects(promoStore.redeemPromo('OLD', 'g2', { expectType: 'balance' }), /expired/);

  await promoStore.createPromo({ code: 'OFF', type: 'balance', amount: 3 }, 'a');
  await promoStore.deactivatePromo('off');
  await assert.rejects(promoStore.redeemPromo('OFF', 'g2', { expectType: 'balance' }), /no longer active/);
  await assert.rejects(promoStore.deactivatePromo('MISSING'), /not found/);
  await assert.rejects(promoStore.redeemPromo('MISSING', 'g2'), /not found/);
  assert.equal(credits('g2'), 5, 'none of the failures touched the balance');
});

test('redeemPromo — wrong-place codes are not consumed', async () => {
  await promoStore.createPromo({ code: 'DISC5', type: 'discount', amount: 5 }, 'a');
  await userStore.getOrCreateUser('hana', 'h@x.com', 'H');
  // Discount code typed on the Credits screen → informational only.
  const info = await promoStore.redeemPromo('DISC5', 'hana', { expectType: 'balance' });
  assert.equal(info.informational, true);
  assert.equal(db._docs.has('promo_codes/DISC5/redemptions/hana'), false);
  // …so it still works at checkout.
  const d = await promoStore.redeemPromo('DISC5', 'hana', { orderId: 'ORD-9', expectType: 'discount' });
  assert.deepEqual(d, { type: 'discount', amount: 5, code: 'DISC5' });
  assert.equal(db._docs.get('promo_codes/DISC5/redemptions/hana').orderId, 'ORD-9');
  // Balance code at checkout → throws, not consumed.
  await assert.rejects(promoStore.redeemPromo('FREE10', 'hana', { expectType: 'discount' }), /Credits screen/);
  assert.equal(db._docs.has('promo_codes/FREE10/redemptions/hana'), false);
  const r = await promoStore.redeemPromo('FREE10', 'hana', { expectType: 'balance' });
  assert.equal(r.creditsAdded, 10);
});

test('redeemPromo — multi-use code (oneTimePerUser:false)', async () => {
  await promoStore.createPromo({ code: 'MULTI', type: 'balance', amount: 1, oneTimePerUser: false }, 'a');
  await userStore.getOrCreateUser('ivan', 'i@x.com', 'I');
  await promoStore.redeemPromo('MULTI', 'ivan', { expectType: 'balance' });
  await promoStore.redeemPromo('MULTI', 'ivan', { expectType: 'balance' });
  assert.equal(credits('ivan'), 7);
});

test('listPromos', async () => {
  const list = await promoStore.listPromos();
  assert.ok(list.find((p) => p.code === 'FREE10'));
});
