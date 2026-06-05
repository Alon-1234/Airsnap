/**
 * ============================================================
 *  AirSnap — promoStore.js
 * ============================================================
 *  Admin-issued promo codes with two flavors:
 *    • type: 'balance'   — credits the user's balance on redeem.
 *    • type: 'discount'  — discount applied to a single order at creation.
 *
 *  Firestore layout:
 *    promo_codes/{CODE}                  — the code definition
 *    promo_codes/{CODE}/redemptions/{uid}— per-user redemption record (dedup)
 *
 *  Redemption runs in a Firestore transaction → safe under concurrency.
 *  Codes are stored UPPERCASE; input is normalized.
 * ============================================================
 */

const { getDb, getFieldValue } = require('./auth');
const { applyCreditsTx } = require('./userStore');
const { validateAmount } = require('./credits');

const PROMO_TYPES = ['balance', 'discount'];

function promosCol() {
  return getDb().collection('promo_codes');
}

function promoRef(code) {
  return promosCol().doc(String(code).trim().toUpperCase());
}

function redemptionRef(code, uid) {
  return promoRef(code).collection('redemptions').doc(uid);
}

/**
 * Admin: create a new code. Rejects duplicates and invalid input.
 */
async function createPromo(input, createdByUid) {
  const code = String(input?.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    throw new Error('Code must be 3–32 chars, letters/digits/underscore/dash.');
  }
  const type = input?.type;
  if (!PROMO_TYPES.includes(type)) {
    throw new Error(`Type must be one of: ${PROMO_TYPES.join(', ')}`);
  }
  validateAmount(input?.amount);
  const maxRedemptions =
    input?.maxRedemptions === null || input?.maxRedemptions === undefined
      ? null
      : Math.floor(Number(input.maxRedemptions));
  if (maxRedemptions !== null && (!Number.isFinite(maxRedemptions) || maxRedemptions < 1)) {
    throw new Error('maxRedemptions must be null or a positive integer');
  }
  const expiresAtMs =
    input?.expiresAt ? Date.parse(String(input.expiresAt)) : null;
  if (expiresAtMs !== null && !Number.isFinite(expiresAtMs)) {
    throw new Error('expiresAt must be a valid ISO date or null');
  }
  const oneTimePerUser = input?.oneTimePerUser !== false; // default true

  const ref = promoRef(code);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) throw new Error(`Code ${code} already exists`);
    tx.set(ref, {
      code,
      type,
      amount: Number(input.amount),
      maxRedemptions,
      redemptionCount: 0,
      oneTimePerUser,
      expiresAt: expiresAtMs,
      createdBy: createdByUid,
      createdAt: getFieldValue().serverTimestamp(),
      active: true,
    });
  });
  const snap = await ref.get();
  return { code, ...snap.data() };
}

async function listPromos() {
  const snaps = await promosCol().orderBy('createdAt', 'desc').get();
  return snaps.docs.map((d) => ({ ...d.data() }));
}

async function deactivatePromo(code) {
  const ref = promoRef(code);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Code not found');
  await ref.update({ active: false });
  return { code: ref.id, active: false };
}

/**
 * Redeem a code for a user. Atomic. Returns:
 *   - balance type: { type: 'balance', creditsAdded, newBalance }
 *   - discount type: { type: 'discount', amount } — caller applies to an order
 *
 * The caller MUST apply discount amounts immediately (within the same request)
 * since the redemption doc is written inside this transaction — if the caller
 * later abandons the order, the user has "spent" their one-shot redemption.
 * For 'discount' codes, pass an orderId so the redemption record is linked.
 */
async function redeemPromo(code, uid, { orderId } = {}) {
  const ref = promoRef(code);
  return getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('Code not found');
    const data = snap.data();
    if (!data.active) throw new Error('Code is no longer active');
    if (data.expiresAt && Date.now() > data.expiresAt) {
      throw new Error('Code has expired');
    }
    if (
      data.maxRedemptions !== null &&
      data.redemptionCount >= data.maxRedemptions
    ) {
      throw new Error('Code has reached its redemption limit');
    }
    if (data.oneTimePerUser) {
      const redSnap = await tx.get(redemptionRef(code, uid));
      if (redSnap.exists) throw new Error('You already redeemed this code');
    }

    // Record redemption + increment counter.
    tx.set(redemptionRef(code, uid), {
      redeemedAt: getFieldValue().serverTimestamp(),
      orderId: orderId || null,
    });
    tx.update(ref, {
      redemptionCount: getFieldValue().increment(1),
    });

    if (data.type === 'balance') {
      const newBalance = await applyCreditsTx(tx, uid, data.amount, {
        type: 'promo_redeem',
        promoCode: data.code,
        reason: `Redeemed promo code ${data.code}`,
      });
      return {
        type: 'balance',
        creditsAdded: data.amount,
        newBalance,
        code: data.code,
      };
    }
    // discount
    return {
      type: 'discount',
      amount: data.amount,
      code: data.code,
    };
  });
}

module.exports = {
  createPromo,
  listPromos,
  deactivatePromo,
  redeemPromo,
  PROMO_TYPES,
};
