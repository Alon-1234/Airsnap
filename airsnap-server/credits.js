/**
 * ============================================================
 *  AirSnap — credits.js
 * ============================================================
 *  Pure helpers for the credits + referral system. No I/O.
 *
 *  Reads policy from env vars on first import:
 *    SIGNUP_BONUS_NIS      (default 5)
 *    SIGNUP_BONUS_EXPIRES  (ISO date, default 2026-06-30T23:59:59Z)
 *    REFERRAL_BONUS_NIS    (default 20)
 *
 *  splitPayment() is the single source of truth for how a total
 *  is divided between credit balance and card charge — admins
 *  always pay nothing.
 * ============================================================
 */

const SIGNUP_BONUS_NIS = Number(process.env.SIGNUP_BONUS_NIS) || 5;
const REFERRAL_BONUS_NIS = Number(process.env.REFERRAL_BONUS_NIS) || 20;
const SIGNUP_BONUS_EXPIRES_RAW =
  process.env.SIGNUP_BONUS_EXPIRES || '2026-06-30T23:59:59Z';
const SIGNUP_BONUS_EXPIRES_MS = Date.parse(SIGNUP_BONUS_EXPIRES_RAW);

const MAX_SAFE_AMOUNT = 10000;

function isSignupBonusEligible(now = Date.now()) {
  if (!Number.isFinite(SIGNUP_BONUS_EXPIRES_MS)) return false;
  return now <= SIGNUP_BONUS_EXPIRES_MS;
}

function validateAmount(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error('Amount must be a finite number');
  }
  if (n <= 0) throw new Error('Amount must be positive');
  if (n > MAX_SAFE_AMOUNT) {
    throw new Error(`Amount exceeds maximum (${MAX_SAFE_AMOUNT})`);
  }
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

/**
 * Split totalNis into credit + card portions.
 * Admin → { 0, 0, adminFree: true } so callers know to skip ledger writes.
 */
function splitPayment(totalNis, availableCredits, isAdmin = false) {
  const total = round2(Math.max(0, totalNis));
  if (isAdmin) {
    return { creditsApplied: 0, cardCharge: 0, adminFree: true, total };
  }
  const balance = Math.max(0, availableCredits || 0);
  const creditsApplied = round2(Math.min(balance, total));
  const cardCharge = round2(total - creditsApplied);
  return { creditsApplied, cardCharge, adminFree: false, total };
}

module.exports = {
  SIGNUP_BONUS_NIS,
  REFERRAL_BONUS_NIS,
  SIGNUP_BONUS_EXPIRES_RAW,
  MAX_SAFE_AMOUNT,
  isSignupBonusEligible,
  splitPayment,
  validateAmount,
  round2,
};
