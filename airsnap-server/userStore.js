/**
 * ============================================================
 *  AirSnap — userStore.js
 * ============================================================
 *  Firestore-backed persistent user data:
 *    users/{uid}                     — user doc (balance, referralCode, …)
 *    users/{uid}/ledger/{auto-id}    — append-only credit audit log
 *
 *  Every credit mutation goes through applyCreditsTx() inside a
 *  Firestore transaction → no race conditions on balances.
 *
 *  Idempotency:
 *    getOrCreateUser() is safe to call on every app start.
 *    markFirstOrderAndPayReferrer() uses CAS on hasMadeFirstOrder
 *    so the referral bonus fires exactly once.
 * ============================================================
 */

const { getDb, getFieldValue } = require('./auth');
const {
  SIGNUP_BONUS_NIS,
  REFERRAL_BONUS_NIS,
  isSignupBonusEligible,
  validateAmount,
  round2,
} = require('./credits');

const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — readability
const REFERRAL_CODE_LEN = 6;

function randomReferralCode() {
  let s = '';
  for (let i = 0; i < REFERRAL_CODE_LEN; i++) {
    s += REFERRAL_CODE_ALPHABET[Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length)];
  }
  return s;
}

function usersCol() {
  return getDb().collection('users');
}

function userRef(uid) {
  return usersCol().doc(uid);
}

function ledgerCol(uid) {
  return userRef(uid).collection('ledger');
}

/**
 * Try to generate a unique referral code. Retries on collision.
 * Returns { code, doc } where doc is the snapshot of the existing user with that code (always empty on success).
 */
async function generateUniqueReferralCode(tx, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    const code = randomReferralCode();
    const q = await tx.get(usersCol().where('referralCode', '==', code).limit(1));
    if (q.empty) return code;
  }
  throw new Error('Could not generate unique referral code');
}

/**
 * Resolve a referral code to a referrer uid, or null. Self-referral blocked.
 */
async function resolveReferrer(tx, code, newUserUid, newUserEmail) {
  if (!code || typeof code !== 'string') return null;
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const q = await tx.get(
    usersCol().where('referralCode', '==', normalized).limit(1),
  );
  if (q.empty) return null;
  const ref = q.docs[0];
  const data = ref.data();
  if (ref.id === newUserUid) return null;                        // self-uid
  if (data.email && newUserEmail && data.email.toLowerCase() === newUserEmail.toLowerCase()) {
    return null;                                                  // self-email
  }
  return ref.id;
}

/**
 * Internal — apply a balance delta atomically within a transaction.
 * Writes the ledger entry with balanceAfter, returns the new balance.
 */
async function applyCreditsTx(tx, uid, delta, ledgerEntry) {
  validateAmount(Math.abs(delta));
  const ref = userRef(uid);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new Error(`User ${uid} not found`);
  const current = snap.data().credits || 0;
  const next = round2(current + delta);
  if (next < 0) {
    throw new Error('Insufficient credits');
  }
  tx.update(ref, {
    credits: next,
    updatedAt: getFieldValue().serverTimestamp(),
  });
  const ledgerRef = ledgerCol(uid).doc();
  tx.set(ledgerRef, {
    ...ledgerEntry,
    amount: round2(delta),
    balanceAfter: next,
    createdAt: getFieldValue().serverTimestamp(),
  });
  return next;
}

/**
 * Idempotently create or fetch a user doc. Grants signup bonus if eligible,
 * links referredBy if a valid referral code is supplied at first creation.
 */
async function getOrCreateUser(uid, email, displayName, { referralCodeUsedAtSignup } = {}) {
  const db = getDb();
  const ref = userRef(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const existing = snap.data();
      // Backfill referralCode if older docs lack one.
      if (!existing.referralCode) {
        const code = await generateUniqueReferralCode(tx);
        tx.update(ref, { referralCode: code, updatedAt: getFieldValue().serverTimestamp() });
        return { ...existing, referralCode: code, uid };
      }
      return { ...existing, uid };
    }
    const referralCode = await generateUniqueReferralCode(tx);
    const referredBy = await resolveReferrer(tx, referralCodeUsedAtSignup, uid, email);
    const eligible = isSignupBonusEligible();
    const newDoc = {
      email: email || null,
      displayName: displayName || null,
      credits: eligible ? SIGNUP_BONUS_NIS : 0,
      referralCode,
      referredBy,
      hasMadeFirstOrder: false,
      signupBonusGranted: eligible,
      createdAt: getFieldValue().serverTimestamp(),
      updatedAt: getFieldValue().serverTimestamp(),
    };
    tx.set(ref, newDoc);
    if (eligible) {
      const ledgerRef = ledgerCol(uid).doc();
      tx.set(ledgerRef, {
        type: 'signup_bonus',
        amount: SIGNUP_BONUS_NIS,
        balanceAfter: SIGNUP_BONUS_NIS,
        reason: 'Welcome to AirSnap!',
        createdAt: getFieldValue().serverTimestamp(),
      });
    }
    return { ...newDoc, uid };
  });
}

async function getUser(uid) {
  const snap = await userRef(uid).get();
  if (!snap.exists) return null;
  return { uid, ...snap.data() };
}

async function getLedger(uid, limit = 20) {
  const snaps = await ledgerCol(uid)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snaps.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Atomically deduct `amount` from a user's balance for an order spend.
 * Returns the new balance. Throws if insufficient.
 */
async function spendOnOrder(uid, amount, orderId) {
  if (amount <= 0) return null;
  const db = getDb();
  return db.runTransaction((tx) =>
    applyCreditsTx(tx, uid, -amount, {
      type: 'order_spend',
      orderId,
      reason: `Paid with credits — order ${orderId}`,
    }),
  );
}

/**
 * CAS: only fires the first time. If the user has a referrer, credits the referrer.
 * Idempotent — safe to call after every paid order; only the first call has effect.
 */
async function markFirstOrderAndPayReferrer(uid) {
  const db = getDb();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef(uid));
    if (!snap.exists) return { firstOrder: false };
    const data = snap.data();
    if (data.hasMadeFirstOrder) return { firstOrder: false };
    tx.update(userRef(uid), {
      hasMadeFirstOrder: true,
      updatedAt: getFieldValue().serverTimestamp(),
    });
    if (!data.referredBy) return { firstOrder: true, referrerCredited: false };
    // Credit the referrer.
    await applyCreditsTx(tx, data.referredBy, REFERRAL_BONUS_NIS, {
      type: 'referral_bonus',
      referredUserId: uid,
      reason: `Referral bonus — ${data.email || uid} placed their first order`,
    });
    return { firstOrder: true, referrerCredited: true, referrerUid: data.referredBy };
  });
}

/**
 * Admin tooling — direct adjustment with audit. Use sparingly.
 */
async function adminAdjust(uid, delta, reason, adminUid) {
  const db = getDb();
  return db.runTransaction((tx) =>
    applyCreditsTx(tx, uid, delta, {
      type: 'admin_adjust',
      reason: reason || 'Admin adjustment',
      adminUid,
    }),
  );
}

module.exports = {
  getOrCreateUser,
  getUser,
  getLedger,
  spendOnOrder,
  markFirstOrderAndPayReferrer,
  applyCreditsTx,
  adminAdjust,
  userRef,
};
