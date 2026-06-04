/**
 * Firebase ID-token verification + admin gating.
 *
 * Two middlewares:
 *   requireAuth  — verifies the bearer token; attaches req.user.
 *   requireAdmin — runs requireAuth, then checks email against ADMIN_EMAILS.
 *
 * Admin SDK only needs the project ID to verify ID tokens — no service
 * account JSON required, since the library fetches Google's public keys.
 */

const admin = require('firebase-admin');

let initialized = false;
function initFirebase() {
  if (initialized) return;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID env var is required');
  }
  admin.initializeApp({ projectId });
  initialized = true;
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
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
      req.user = { uid: decoded.uid, email: decoded.email, emailVerified: decoded.email_verified };
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
      req.user = { uid: decoded.uid, email, emailVerified: decoded.email_verified };
      next();
    })
    .catch((err) => res.status(err.status || 500).json({ error: err.message }));
}

module.exports = { requireAuth, requireAdmin, initFirebase };
