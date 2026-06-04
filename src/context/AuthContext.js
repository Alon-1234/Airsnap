/**
 * ============================================================
 *  AirSnap — AuthContext (Firebase JS SDK + Expo Go)
 * ============================================================
 *  Pure-JS Firebase Auth — runs inside Expo Go (no native build).
 *
 *  Supports:
 *    • Email + password (sign in / sign up / password reset)
 *    • Google OAuth   (browser-based via expo-auth-session)
 *    • Apple OAuth    — disabled in Expo Go (native-only)
 *
 *  Firebase persists the session in AsyncStorage and refreshes
 *  ID tokens automatically. We only manage the local
 *  terms-acceptance flag ourselves.
 * ============================================================
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

import { FIREBASE_CONFIG, GOOGLE_WEB_CLIENT_ID } from '../config/firebaseConfig';

WebBrowser.maybeCompleteAuthSession();

const TERMS_KEY = '@airsnap_terms_accepted';

// ── Initialize Firebase once ─────────────────────────────
const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);

// initializeAuth must run only once per app; subsequent calls throw.
let firebaseAuth;
try {
  firebaseAuth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (_) {
  firebaseAuth = getAuth(app);
}

function mapFirebaseUser(fbUser) {
  if (!fbUser) return null;
  const providerId = fbUser.providerData?.[0]?.providerId || 'password';
  return {
    id: fbUser.uid,
    name: fbUser.displayName || fbUser.email?.split('@')[0] || 'AirSnap User',
    email: fbUser.email,
    emailVerified: fbUser.emailVerified,
    avatar: fbUser.photoURL || null,
    provider:
      providerId === 'google.com' ? 'google'
      : providerId === 'apple.com' ? 'apple'
      : 'email',
  };
}

function friendlyError(err) {
  switch (err?.code) {
    case 'auth/invalid-email':            return 'That email address looks invalid.';
    case 'auth/user-disabled':            return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':       return 'Incorrect email or password.';
    case 'auth/email-already-in-use':     return 'An account with this email already exists.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Password is too weak. Use at least 8 chars with an uppercase letter, a lowercase letter, and a number.';
    case 'auth/too-many-requests':        return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':   return 'Network error. Check your connection and try again.';
    case 'auth/operation-not-allowed':    return 'This sign-in method is not enabled.';
    default:                              return err?.message || 'Something went wrong. Please try again.';
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);

  // ── Google OAuth (expo-auth-session) ───────────────────
  const [googleRequest, googleResponse, promptGoogle] = Google.useAuthRequest({
    clientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId: GOOGLE_WEB_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });

  // ── Restore terms-accepted flag + subscribe to auth ────
  useEffect(() => {
    let firstCallback = true;

    AsyncStorage.getItem(TERMS_KEY)
      .then((v) => { if (v === 'true') setHasAcceptedTerms(true); })
      .catch((err) => console.log('Terms recovery error:', err));

    const unsub = onAuthStateChanged(firebaseAuth, (fbUser) => {
      setUser(mapFirebaseUser(fbUser));
      if (firstCallback) {
        setIsLoading(false);
        firstCallback = false;
      }
    });

    return unsub;
  }, []);

  // ── Handle Google sign-in callback ──────────────────────
  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params?.id_token || googleResponse.authentication?.idToken;
      const accessToken = googleResponse.authentication?.accessToken;
      if (!idToken && !accessToken) return;
      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      signInWithCredential(firebaseAuth, credential).catch((err) => {
        console.log('Google sign-in error:', friendlyError(err));
      });
    }
  }, [googleResponse]);

  const signInWithEmail = async (email, password) => {
    if (!email || !password) throw new Error('Email and password are required');
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (err) {
      throw new Error(friendlyError(err));
    }
  };

  const signUp = async (name, email, password) => {
    if (!name || !email || !password) {
      throw new Error('Name, email, and password are required');
    }
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      if (cred.user && name) {
        await updateProfile(cred.user, { displayName: name });
        setUser(mapFirebaseUser(firebaseAuth.currentUser));
      }
      // Send the verification email — user must click the link in their inbox
      // to mark their account as verified.
      if (cred.user) {
        try {
          await sendEmailVerification(cred.user);
          console.log('[Auth] Verification email sent to', cred.user.email);
        } catch (sendErr) {
          console.log('[Auth] sendEmailVerification FAILED:', sendErr?.code, sendErr?.message);
        }
      }
    } catch (err) {
      throw new Error(friendlyError(err));
    }
  };

  const resendVerificationEmail = async () => {
    const current = firebaseAuth.currentUser;
    if (!current) throw new Error('You need to be signed in to resend the verification email.');
    try {
      await sendEmailVerification(current);
    } catch (err) {
      throw new Error(friendlyError(err));
    }
  };

  const reloadUser = async () => {
    const current = firebaseAuth.currentUser;
    if (!current) return;
    await current.reload();
    setUser(mapFirebaseUser(firebaseAuth.currentUser));
  };

  const signInWithGoogle = async () => {
    if (!GOOGLE_WEB_CLIENT_ID) {
      throw new Error(
        'Google Sign-In is not configured. Add GOOGLE_WEB_CLIENT_ID in src/config/firebaseConfig.js.'
      );
    }
    if (!googleRequest) {
      throw new Error('Google Sign-In is still initializing. Try again in a moment.');
    }
    const result = await promptGoogle();
    if (result?.type === 'error') {
      throw new Error(result?.error?.message || 'Google Sign-In failed.');
    }
    // Success path is handled by the useEffect above.
  };

  const signInWithApple = async () => {
    throw new Error(
      'Apple Sign-In is not available in Expo Go. Use email or Google to sign in.'
    );
  };

  const sendPasswordReset = async (email) => {
    if (!email) throw new Error('Please enter your email address.');
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
    } catch (err) {
      throw new Error(friendlyError(err));
    }
  };

  const signOut = async () => {
    await fbSignOut(firebaseAuth);
  };

  const acceptTerms = async () => {
    setHasAcceptedTerms(true);
    await AsyncStorage.setItem(TERMS_KEY, 'true');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        hasAcceptedTerms,
        signInWithGoogle,
        signInWithApple,
        signInWithEmail,
        signUp,
        signOut,
        sendPasswordReset,
        resendVerificationEmail,
        reloadUser,
        acceptTerms,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
