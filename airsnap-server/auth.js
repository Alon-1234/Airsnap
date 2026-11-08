/**
 * Firebase Admin init + auth middlewares.
 *
 *   requireAuth        — verifies the bearer token; attaches req.user.
 *   requireAdmin       — requireAuth + email must be in ADMIN_EMAILS env.
 *   requireAdminPass   — requireAdmin + X-Admin-Pass header must equal ADMIN_PROMO_PASS.
 *
 * Firestore access:
 *   getDb()         — returns the Firestore instance (initialized lazily).
 *   getFieldValue() — convenience for serverTimestamp() and increment().
 *
 * Credentials:
 *   For Firestore writes you MUST set FIREBASE_SERVICE_ACCOUNT
 *   (raw JSON or base64 of the service-account JSON) as an env var.
 *   Without it the SDK can verify ID tokens (uses Google's public
 *   keys) but Firestore calls will fail.
 */

const path = require('path');
const admin = require('firebase-admin');

let initialized = false;

function decodeServiceAccount(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    try {
      return JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON or base64-JSON');
    }
  }
}

function initFirebase() {
  if (initialized) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID env var is required');
  }
  const svcRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (svcRaw) {
    const svc = decodeServiceAccount(svcRaw);
    admin.initializeApp({
      credential: admin.credential.cert(svc),
      projectId: svc.project_id || projectId,
    });
    console.log('[auth] Firebase Admin initialized with service account.');
  } else {
    admin.initializeApp({ projectId });
    if (useLocalDb()) {
      console.log(
        `[auth] No FIREBASE_SERVICE_ACCOUNT — using the local database (${process.env.LOCAL_DB_FILE}). ` +
        'Sign-in still uses the real Firebase accounts.',
      );
    } else {
      console.warn(
        '[auth] FIREBASE_SERVICE_ACCOUNT not set — Firestore writes will fail. ' +
        'ID-token verification still works. (Set LOCAL_DB_FILE to use a local database instead.)',
      );
    }
  }
  initialized = true;
}

// Local database (localDb.js) instead of Firestore: only when explicitly
// requested with LOCAL_DB_FILE and there are no Firestore credentials.
// Production (Render) always has FIREBASE_SERVICE_ACCOUNT, so it never
// falls back to this silently.
function useLocalDb() {
  return !!process.env.LOCAL_DB_FILE && !process.env.FIREBASE_SERVICE_ACCOUNT;
}

let localDb = null;
function getLocalDb() {
  if (!localDb) {
    const { createLocalDb } = require('./localDb');
    localDb = createLocalDb({ file: path.resolve(process.env.LOCAL_DB_FILE) });
  }
  return localDb;
}

function getDb() {
  initFirebase();
  return useLocalDb() ? getLocalDb() : admin.firestore();
}

function getFieldValue() {
  initFirebase();
  return useLocalDb() ? require('./localDb').FieldValue : admin.firestore.FieldValue;
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email) {
  return !!email && adminEmails().includes(String(email).toLowerCase());
}

async function verifyBearer(req) {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const err = new Error('Missing or malformed Authorization header');
    err.status = 401;
    throw err;
  }
  initFirebase();
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (e) {
    const err = new Error('Invalid or expired ID token');
    err.status = 401;
    throw err;
  }
}

function requireAuth(req, res, next) {
  verifyBearer(req)
    .then((decoded) => {
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified,
        isAdmin: isAdminEmail(decoded.email),
      };
      next();
    })
    .catch((err) => res.status(err.status || 500).json({ error: err.message }));
}

function requireAdmin(req, res, next) {
  verifyBearer(req)
    .then((decoded) => {
      const email = (decoded.email || '').toLowerCase();
      if (!adminEmails().includes(email)) {
        return res.status(403).json({ error: 'Admin only' });
      }
      req.user = {
        uid: decoded.uid,
        email,
        emailVerified: decoded.email_verified,
        isAdmin: true,
      };
      next();
    })
    .catch((err) => res.status(err.status || 500).json({ error: err.message }));
}

/**
 * requireAdmin + X-Admin-Pass header check. Used for promo code management.
 * The passcode is a second factor — a stolen Firebase token without it
 * cannot mint promo codes.
 */
function requireAdminPass(req, res, next) {
  requireAdmin(req, res, () => {
    const expected = process.env.ADMIN_PROMO_PASS;
    if (!expected) {
      return res.status(503).json({ error: 'ADMIN_PROMO_PASS not configured on server' });
    }
    const provided = req.get('X-Admin-Pass') || '';
    if (provided !== expected) {
      return res.status(403).json({ error: 'Invalid or missing admin passcode' });
    }
    next();
  });
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireAdminPass,
  initFirebase,
  getDb,
  getFieldValue,
  isAdminEmail,
};
