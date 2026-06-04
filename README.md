# AirSnap

A React Native (Expo) demo app for ordering on-demand drone photography. Users open the app, see whether they're inside a delivery zone, pick a photo package, pay (mock), then watch a simulated drone fly to them, record content, and deliver it back to their gallery.

This README covers everything you need to clone, configure, and run the project — including every external service / API key the app talks to.

---

## Tech stack

- **Expo SDK 54** running inside **Expo Go** (no custom native build needed).
- **React Navigation** (stack + bottom tabs) for routing.
- **Firebase Authentication (JS SDK)** for sign-up, sign-in, password reset — all email/password.
- **expo-auth-session** for Google OAuth (browser-based flow, works in Expo Go).
- Apple Sign-In is **disabled in Expo Go** — it requires a native module that Expo Go doesn't ship. The button is left in place but shows a friendly "not available" alert.
- **AsyncStorage** for Firebase session persistence + the "Terms accepted" flag.
- **react-native-maps** + **expo-location** for the home map and geofence checks.
- **react-native-copilot** for the in-app help/demo tour.
- **expo-linear-gradient**, **@expo/vector-icons** for UI.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ (20 LTS recommended) | Use `nvm` if juggling versions |
| Expo CLI | bundled via `npx` | No global install needed |
| Expo Go app | latest | Install on your iPhone/Android from the App Store / Play Store |

No JDK, no Android Studio, no Xcode, no Mac required.

---

## External services & all API keys

### 1. Firebase project (Authentication — free Spark tier)

The auth flow uses the **Firebase Web SDK** for compatibility with Expo Go. All config values are public client-side identifiers — they're not secrets. Access is gated by Firebase's server-side rules.

| Item | Where it lives | Current value |
|---|---|---|
| Project ID | `src/config/firebaseConfig.js` | `airsnap-7844f` |
| API key | `src/config/firebaseConfig.js` | `AIzaSyAUQvPIkGrCOTLZMgodjcwWHnPcIWhgfSE` |
| Auth domain | `src/config/firebaseConfig.js` | `airsnap-7844f.firebaseapp.com` |
| Storage bucket | `src/config/firebaseConfig.js` | `airsnap-7844f.firebasestorage.app` |
| Messaging sender ID | `src/config/firebaseConfig.js` | `229971846721` |
| App ID | `src/config/firebaseConfig.js` | `1:229971846721:android:e263146c5db7248dbd08c0` |
| Google OAuth Web Client ID | `src/config/firebaseConfig.js` | `229971846721-8lt6d8fs707tbs1jacamc91utome5m59.apps.googleusercontent.com` |

The `GoogleService-Info.plist` and `google-services.json` files in the project root are leftovers from the native build setup — they're **unused** in the Expo Go build but harmless to keep (and useful if you ever switch to a Dev Client).

#### Provisioning a new Firebase project

If you're forking and want your own Firebase project:

1. Go to https://console.firebase.google.com → **Add project**.
2. Enable **Authentication** → **Sign-in method** → enable **Email/Password** and **Google**.
3. Project Settings → **Your apps** → add a **Web app** (icon `</>`) → copy the config object → paste values into `src/config/firebaseConfig.js`.
4. On the Google sign-in provider page → expand **Web SDK configuration** → copy the **Web client ID** → paste into `GOOGLE_WEB_CLIENT_ID`.
5. **Critical for Google sign-in in Expo Go:** in Google Cloud Console → APIs & Services → Credentials → click the same Web Client ID → add this to **Authorized redirect URIs**:
   ```
   https://auth.expo.io/@<your-expo-username>/airsnap
   ```
   (Without this, Google sign-in will return a `redirect_uri_mismatch` error.)

### 2. Google Maps (used by `react-native-maps`)

Currently no Maps API key is configured. On iOS the map renders with Apple Maps by default. On Android, `react-native-maps` will show a blank tile area without a Google Maps API key. Add one in `app.json` under `android.config.googleMaps.apiKey` if you need real Android tiles in development.

### 3. Geofence backend (currently disabled)

`src/hooks/useGeofence.js` calls `${API_BASE_URL}/spatial/validate-geofence` (POST). The original Python backend (`airsnap-server/`) was deleted, so this endpoint **always fails** and the hook degrades to "out of bounds." `src/config/serverConfig.js` still points at `192.168.68.81:4000`. The partner-site distance check in `ProfileScreen.js` works because it uses pure client-side haversine math (`src/utils/geofence.js`).

---

## First-time setup

```bash
# 1. Clone and install
git clone <repo-url>
cd demo_app
npm install
# If you hit "UNABLE_TO_VERIFY_LEAF_SIGNATURE", your local AV/firewall
# is doing TLS interception. Workaround:
#   npm config set strict-ssl false
#   npm install
#   npm config set strict-ssl true

# 2. Confirm src/config/firebaseConfig.js has your Firebase values
#    (defaults already point at the demo Firebase project)

# 3. Start the dev server
npx expo start
```

Then on your phone:
- **iPhone:** open the Expo Go app → scan QR code from terminal
- **Android:** open the Expo Go app → scan QR code from terminal
- Or run `npx expo start --tunnel` if your phone is on a different network than your laptop

---

## How to run on your team's phones

There's no build step — everyone uses Expo Go.

1. Each teammate installs **Expo Go** from the App Store / Play Store.
2. You run `npx expo start --tunnel` on your laptop.
3. Send teammates the URL or QR code from the terminal.
4. They open Expo Go → scan/enter the URL → app loads.
5. All changes you push to git, they re-scan the QR to pull the latest JS.

For more permanent sharing (so the app keeps running without your laptop), publish a build:
```bash
npx expo publish              # creates a permanent URL on Expo's servers
```
Then share the URL via Expo Go's "Recently in development" tab or a shareable link.

> If you later want a standalone APK or iOS TestFlight build, see "Switching to a Dev Client" at the bottom of this file.

---

## Project structure

```
demo_app/
├── app.json                       # Expo config
├── package.json
├── App.js                         # Root: wraps providers + navigator
├── src/
│   ├── components/                # Shared UI (Card, GradientButton, Tour tooltip…)
│   ├── config/
│   │   ├── firebaseConfig.js      # Firebase + Google OAuth config
│   │   └── serverConfig.js        # Stale — only useGeofence.js still uses it
│   ├── constants/                 # Drone status enums, delivery zone radius, etc.
│   ├── context/
│   │   ├── AuthContext.js         # Firebase JS SDK wrapper — primary auth surface
│   │   ├── ThemeContext.js        # Dark/light mode toggle
│   │   ├── LocationContext.js     # expo-location wrapper
│   │   └── TourContext.js         # Cross-screen help-tour flag
│   ├── hooks/
│   │   └── useGeofence.js         # Calls deleted Python backend (broken — see above)
│   ├── navigation/
│   │   └── AppNavigator.js        # Stack + tabs; routes Login/SignUp/ForgotPassword
│   ├── screens/
│   │   ├── LoginScreen.js
│   │   ├── SignUpScreen.js
│   │   ├── ForgotPasswordScreen.js
│   │   ├── TermsAcceptanceScreen.js
│   │   ├── HomeScreen.js
│   │   ├── PackageSelectScreen.js
│   │   ├── PaymentScreen.js
│   │   ├── FlightTrackingScreen.js
│   │   ├── LiveSessionScreen.js
│   │   ├── ContentDeliveryScreen.js
│   │   ├── GalleryScreen.js
│   │   ├── ProfileScreen.js
│   │   ├── OrderHistoryScreen.js
│   │   ├── HelpScreen.js
│   │   ├── PrivacyTermsScreen.js
│   │   └── PartnersAboutScreen.js
│   ├── theme/                     # Colors, spacing, typography
│   └── utils/                     # Pure helpers (geofence math, formatters)
└── assets/                        # Icons, splash, partner photos
```

---

## Authentication flow

`src/context/AuthContext.js` is the chokepoint — every screen consumes it via `useAuth()`. The exported shape:

```js
const {
  user,                 // { id, name, email, avatar, provider } | null
  isLoading,            // true until the first onAuthStateChanged fires
  hasAcceptedTerms,     // local AsyncStorage flag
  signInWithEmail,      // (email, password) => void
  signUp,               // (name, email, password) => void
  signInWithGoogle,     // () => void  — opens browser OAuth (expo-auth-session)
  signInWithApple,      // () => void  — disabled in Expo Go; shows alert
  sendPasswordReset,    // (email) => void
  signOut,              // () => void
  acceptTerms,          // () => void
} = useAuth();
```

- **Session persistence + auto refresh**: Firebase handles it natively via AsyncStorage. Force-quit and reopen the app → you're still signed in.
- **Errors**: every method throws `Error` with a friendly message (e.g. "Incorrect email or password"). Screens already wrap calls in `try/catch` + `Alert.alert`.
- **Provider field** on `user` is one of `'email' | 'google' | 'apple'`.

Routing decides the visible stack (`src/navigation/AppNavigator.js`):
1. Loading spinner while `isLoading` is true.
2. `TermsAcceptanceScreen` if the user has never accepted T&Cs.
3. **AuthStack** (Login / SignUp / ForgotPassword) if `user` is null.
4. **MainTabs** (Order / Gallery / Profile) once signed in.

---

## Common commands

```bash
npx expo start              # Start Metro bundler
npx expo start --tunnel     # Same, but accessible to phones on a different network
npx expo start --clear      # Start with a fresh Metro cache
```

---

## Known issues & limitations

- **No real backend.** Orders, payments, and the drone session are all simulated client-side.
- **Geofence hook is broken** (see "Geofence backend" above).
- **Apple Sign-In is disabled** in Expo Go (the button shows a friendly error alert). To enable it, switch to a Dev Client (see below).
- **Google Sign-In requires** the redirect URI configured in Google Cloud Console (see "Provisioning a new Firebase project" step 5).
- **`strict-ssl` workaround.** If `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, your local AV/firewall is doing TLS interception. Use the workaround in step 1 of "First-time setup."

---

## Switching to a Dev Client later

If at some point you need native modules (Apple Sign-In, more polished Google OAuth, push notifications via FCM, etc.), graduate to a **Dev Client**:

1. `npm install expo-dev-client @react-native-firebase/app @react-native-firebase/auth @react-native-google-signin/google-signin expo-apple-authentication expo-build-properties`
2. Re-add the four plugin entries to `app.json` (Firebase, Google sign-in, build properties, plus `"usesAppleSignIn": true` on iOS).
3. `npx expo prebuild --clean`
4. Build via EAS: `eas build --platform android --profile preview` (free) or `--platform ios` (needs Apple Dev account, $99/yr).

Reuse instructions for that path: see git history at the commit that removed the native libraries — the AuthContext can be reverted from the JS SDK version back to the native `@react-native-firebase/auth` API.

---

## License & credits

Demo / educational project. No license file shipped — treat as "all rights reserved" until one is added.
