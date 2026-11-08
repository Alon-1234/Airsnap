import { ADMIN_EMAILS } from '../config/firebaseConfig';

/**
 * Should this signed-in user see admin UI (Manage Hives, Promo Codes,
 * skip email verification)?
 *
 * True if the email is in the app's built-in ADMIN_EMAILS list, OR the
 * server says so (`me.isAdmin`, from the server's ADMIN_EMAILS env var).
 * The second case lets someone running their own server (e.g. a friend
 * using Docker) make themselves admin without editing the app.
 * Real security is enforced by the server either way.
 */
export function isAdminUser(user, me) {
  const email = (user?.email || '').toLowerCase();
  if (!email) return false;
  if (ADMIN_EMAILS.includes(email)) return true;
  return !!me?.isAdmin && (!me.email || String(me.email).toLowerCase() === email);
}
