/**
 * ============================================================
 *  AirSnap — Firebase config
 * ============================================================
 *  Public client-side identifiers used by the auth flow.
 *  These are NOT secrets — Firebase API keys are safe to ship
 *  in client apps; access is gated by Firebase Auth + Security
 *  Rules, not by hiding the key.
 * ============================================================
 */

// ── Firebase Web SDK config ─────────────────────────────
// These values are public — they appear in every Firebase
// Web app's index.html. Auth domain is always
// <projectId>.firebaseapp.com.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAUQvPIkGrCOTLZMgodjcwWHnPcIWhgfSE',
  authDomain: 'airsnap-7844f.firebaseapp.com',
  projectId: 'airsnap-7844f',
  storageBucket: 'airsnap-7844f.firebasestorage.app',
  messagingSenderId: '229971846721',
  appId: '1:229971846721:android:e263146c5db7248dbd08c0',
};

// ── Google OAuth Web Client ID ──────────────────────────
// Used by expo-auth-session for browser-based Google sign-in.
// Firebase Console → Authentication → Sign-in method → Google →
// Web SDK configuration → "Web client ID".
//
// IMPORTANT for Expo Go: add this redirect URI to the OAuth
// client's "Authorized redirect URIs" in Google Cloud Console:
//   https://auth.expo.io/@<your-expo-username>/airsnap
export const GOOGLE_WEB_CLIENT_ID =
  '229971846721-8lt6d8fs707tbs1jacamc91utome5m59.apps.googleusercontent.com';

// ── Admin gate ──────────────────────────────────────────
// Users whose email is in this list see the "Manage Hives" entry
// in Profile and can create/delete hives. The SERVER also enforces
// this against its own ADMIN_EMAILS env var — this client-side list
// is only a UI gate, not security.
export const ADMIN_EMAILS = [
  'akonk13579@gmail.com',
];

// ── Admin promo passcode (UX gate) ──────────────────────
// Required to unlock the Promo Codes admin screen. The SERVER
// enforces this against ADMIN_PROMO_PASS env var via the
// X-Admin-Pass header — this constant is the UX shortcut so a
// stolen device can't browse the screen idly.
export const ADMIN_PROMO_PASS = 'Alon132';
