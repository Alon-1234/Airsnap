const test = require('node:test');
const assert = require('node:assert/strict');

// Exercise the built-in defaults, not whatever the shell happens to export.
delete process.env.SIGNUP_BONUS_EXPIRES;
delete process.env.SIGNUP_BONUS_NIS;
delete process.env.REFERRAL_BONUS_NIS;

const {
  SIGNUP_BONUS_NIS,
  REFERRAL_BONUS_NIS,
  MAX_SAFE_AMOUNT,
  isSignupBonusEligible,
  splitPayment,
  validateAmount,
  round2,
} = require('../credits');

test('defaults', () => {
  assert.equal(SIGNUP_BONUS_NIS, 5);
  assert.equal(REFERRAL_BONUS_NIS, 20);
  assert.equal(MAX_SAFE_AMOUNT, 10000);
});

test('signup bonus window is still open in Nov 2026 with the default expiry', () => {
  assert.equal(isSignupBonusEligible(Date.parse('2026-11-09T12:00:00Z')), true);
  assert.equal(isSignupBonusEligible(Date.parse('2027-06-01T00:00:00Z')), true);
  assert.equal(isSignupBonusEligible(Date.parse('2030-01-01T00:00:00Z')), false);
});

test('round2', () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(19.999), 20);
  assert.equal(round2(-3.456), -3.46);
  assert.equal(round2(0), 0);
});

test('splitPayment — credits cover part', () => {
  assert.deepEqual(splitPayment(21.59, 5), {
    creditsApplied: 5, cardCharge: 16.59, adminFree: false, total: 21.59,
  });
});

test('splitPayment — credits cover all', () => {
  const s = splitPayment(10.79, 50);
  assert.equal(s.creditsApplied, 10.79);
  assert.equal(s.cardCharge, 0);
});

test('splitPayment — no credits / negative / NaN credits', () => {
  for (const bal of [0, -10, NaN, undefined, null]) {
    const s = splitPayment(9.99, bal);
    assert.equal(s.creditsApplied, 0, `balance=${bal}`);
    assert.equal(s.cardCharge, 9.99, `balance=${bal}`);
  }
});

test('splitPayment — negative total clamps to zero', () => {
  const s = splitPayment(-5, 10);
  assert.equal(s.total, 0);
  assert.equal(s.creditsApplied, 0);
  assert.equal(s.cardCharge, 0);
});

test('splitPayment — float noise does not leak into the split', () => {
  const s = splitPayment(0.1 + 0.2, 0.1);
  assert.equal(s.total, 0.3);
  assert.equal(s.creditsApplied, 0.1);
  assert.equal(s.cardCharge, 0.2);
  assert.equal(round2(s.creditsApplied + s.cardCharge), s.total);
});

test('splitPayment — admin pays nothing and keeps credits', () => {
  assert.deepEqual(splitPayment(39.99, 100, true), {
    creditsApplied: 0, cardCharge: 0, adminFree: true, total: 39.99,
  });
});

test('validateAmount', () => {
  for (const bad of [0, -1, NaN, Infinity, '5', null, undefined, MAX_SAFE_AMOUNT + 1]) {
    assert.throws(() => validateAmount(bad), undefined, `should reject ${bad}`);
  }
  for (const ok of [0.01, 1, MAX_SAFE_AMOUNT]) {
    assert.doesNotThrow(() => validateAmount(ok));
  }
});
