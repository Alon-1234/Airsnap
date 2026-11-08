/**
 * Preload (`node -r tests/helpers/stubAuthPreload.js index.js`) that swaps
 * auth.js for a test double so the full HTTP/socket order flow can run
 * locally without Firebase credentials:
 *   - Firestore → in-memory fake (tests/helpers/fakeFirestore.js)
 *   - Bearer tokens are "test:<uid>:<email>"; admin = email in ADMIN_EMAILS
 * TEST USE ONLY — never load this in production.
 */
const path = require('path');
const { createFakeDb, FieldValue } = require('./fakeFirestore');

const db = createFakeDb();
const authPath = require.resolve(path.join(__dirname, '..', '..', 'auth.js'));

const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const isAdminEmail = (e) => !!e && adminEmails().includes(String(e).toLowerCase());

function parse(req) {
  const m = (req.get('Authorization') || '').match(/^Bearer test:([^:]+):(.+)$/);
  return m ? { uid: m[1], email: m[2].toLowerCase() } : null;
}

function requireAuth(req, res, next) {
  const u = parse(req);
  if (!u) return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  req.user = { ...u, emailVerified: true, isAdmin: isAdminEmail(u.email) };
  next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin only' });
    next();
  });
}
function requireAdminPass(req, res, next) {
  requireAdmin(req, res, () => {
    if ((req.get('X-Admin-Pass') || '') !== process.env.ADMIN_PROMO_PASS) {
      return res.status(403).json({ error: 'Invalid or missing admin passcode' });
    }
    next();
  });
}

require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    requireAuth,
    requireAdmin,
    requireAdminPass,
    initFirebase: () => {},
    getDb: () => db,
    getFieldValue: () => FieldValue,
    isAdminEmail,
  },
};
console.log('[test] auth.js stubbed with in-memory Firestore');
