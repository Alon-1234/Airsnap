# AirSnap

On-demand drone photography demo. Users see whether they're inside a delivery zone, pick a photo package, pay, and watch a simulated drone fly to them, record content, and deliver it back to their gallery.

Two halves:

- **Mobile app** (Expo / React Native) — UI, auth, ordering, gallery.
- **Simulation server** ([`airsnap-server/`](airsnap-server/)) — Express + Socket.IO. Realistic drone physics, hive management, payments, credits, referrals, promo codes. Hostable on Render free tier.

➡️ **New here? Read [SETUP.md](SETUP.md) for the full from-scratch install guide.**

---

## Features

### User-facing

- **Email + Google sign-in** (Firebase Auth, JS SDK — runs in Expo Go).
- **Email verification** required before ordering.
- **Real-time drone simulation** — watch the drone fly to you on the map; spinning rotors, battery drain, smooth heading.
- **Hive geofence** — orders only allowed within 500m of a hive; nearest-hive distance + "drones recharging in ~Ns" feedback.
- **Real photo + video delivery** to Gallery and Order History (AsyncStorage cached for offline).
- **Pull-to-refresh** + tab-focus auto-refresh everywhere.

### Credits & referrals

- **₪5 signup bonus** (configurable env var, time-windowed).
- **₪20 referral bonus** — paid to the referrer when their referee makes their first paid order. Server-side CAS guarantees it fires exactly once.
- **Partial credit payment** — credits cover what they can; card covers the rest. Server is the authority on the split.
- **Append-only ledger** of every credit movement per user (`users/{uid}/ledger/{id}`).
- **Promo codes** with two flavors:
  - `balance` — adds amount to user's balance on redeem (Credits screen)
  - `discount` — applied to one order at checkout (Payment screen)
  - Optional expiry, max redemptions, one-time-per-user.

### Admin

- **Hive management** — drop hives on the map; auto-merge within 25m; per-hive drone fleet.
- **Promo code admin** — gated by passcode `Alon132` (UX) AND server-side `X-Admin-Pass` header (real security). Create / list / deactivate codes.
- **Unlimited credits** — admin orders are always free.
- **Live web visualization** — open the server's URL in a browser for a Leaflet map of every hive, drone, flight trail, and order in real time.

### Web visualization

The server hosts a polished web viz at `/`. Dark CartoDB tiles, animated rotor markers, per-hive battery rings, fleet status card. Useful for showing the system off (or debugging).

---

## Tech stack

### Mobile

- **Expo SDK 54** in **Expo Go** (no native build).
- **Firebase Web SDK 12** + `expo-auth-session` for Google OAuth.
- **React Navigation** 7 (stack + tabs).
- **react-native-maps** + **expo-location** for the map and geofence.
- **socket.io-client** for live drone state.
- **AsyncStorage** for session persistence, offline gallery + order history.
- **expo-linear-gradient**, **expo-blur**, **@expo/vector-icons** for UI.

### Server

- **Node 20** + **Express** + **Socket.IO** (CommonJS).
- **firebase-admin** for ID-token verification + Firestore.
- **Firestore** for persistent user data, credits, ledger, promo codes.
- In-memory for ephemeral state (active drones, orders during their flight).
- Hosted on **Render** free tier.

---

## Architecture at a glance

```
┌─────────────────┐     Firebase ID token       ┌───────────────────────────┐
│ Expo Go (phone) │ ──────────────────────────► │ Express + Socket.IO       │
│   AuthContext   │ ◄────── JSON / events ──── │  ┌──────────────────────┐ │
│   SimClient     │                             │  │ verifyIdToken        │ │
└────────┬────────┘                             │  │ requireAuth/Admin    │ │
         │                                      │  └──────────┬───────────┘ │
         │                                      │             │             │
         ▼                                      │  ┌──────────▼───────────┐ │
   ┌──────────┐                                 │  │ hiveStore (memory)   │ │
   │ Firebase │ ◄──────── verifyIdToken ────────┤  │ orderStore (memory)  │ │
   │   Auth   │                                 │  │ droneSim (30Hz tick) │ │
   └──────────┘                                 │  └──────────────────────┘ │
                                                │             │             │
                                                │  ┌──────────▼───────────┐ │
                                                │  │ userStore (Firestore)│ │
                                                │  │ promoStore (FS)      │ │
                                                │  │ credits.js (pure)    │ │
                                                │  └──────────┬───────────┘ │
                                                └─────────────┼─────────────┘
                                                              ▼
                                                       ┌─────────────┐
                                                       │  Firestore  │
                                                       │  users/{uid}│
                                                       │  promo_codes│
                                                       └─────────────┘
```

Key invariants:

- **All credit mutations** go through `applyCreditsTx()` inside a Firestore transaction. Balance is never trusted from the client.
- **Referral bonus** fires via CAS on `users/{uid}.hasMadeFirstOrder` — exactly once per user.
- **Admin** = email in `ADMIN_EMAILS` (server-side) — derived in `requireAuth` and passed downstream. `splitPayment` special-cases admin → always free, no ledger writes.
- **Promo redemption** is transactional — no double-redeem under concurrency.

---

## Start everything (one click)

Double-click **`Start AirSnap.bat`** (or the **AirSnap** icon on the Desktop, created by
`scripts/create-desktop-shortcut.ps1`). It installs packages on first run, wakes the
Render server, starts Expo, and opens two browser tabs: the app at
http://localhost:8081 and the live drone viewer. Scan the QR code in the window
with Expo Go to open the app on your phone. Close the window (or press Ctrl+C) to stop.

| How | What it runs |
|---|---|
| `Start AirSnap.bat` · `npm run start:all` · VS Code ▶ "AirSnap: Start everything" | App + cloud server (Render) + viewer |
| `Start AirSnap (local server).bat` · `npm run start:local` | Same, with the server on this laptop (port 4000). Needs `FIREBASE_SERVICE_ACCOUNT` in `airsnap-server/.env` for credits/orders. |

Options: `--tunnel` (phone on a different network), `--no-browser`.

The app also runs **in the browser** (Expo web): maps use a Leaflet stand-in
([web-shims/](web-shims/)) because `react-native-maps` is mobile-only.

## Quick start (manual)

See [SETUP.md](SETUP.md) for the complete guide. TL;DR:

```bash
# 1. Mobile
git clone <repo-url>
cd demo_app
npm install
# Edit src/config/firebaseConfig.js + src/config/serverConfig.js
npx expo start --tunnel

# 2. Server
cd airsnap-server
npm install
# Set env vars (see SETUP.md §5.3), then:
node index.js
```

---

## Project structure

```
demo_app/
├── README.md                       # ← you are here
├── SETUP.md                        # full install guide
├── App.js                          # Root: wraps providers + navigator
├── app.json                        # Expo config
├── package.json
│
├── src/                            # ── Mobile app ──
│   ├── components/                 # Card, GradientButton, ScreenWrapper, etc.
│   ├── config/
│   │   ├── firebaseConfig.js       # Firebase + Google OAuth + admin emails
│   │   └── serverConfig.js         # API_BASE_URL + SOCKET_URL
│   ├── constants/                  # Drone status enums, delivery zone radius
│   ├── context/
│   │   ├── AuthContext.js          # Firebase + bootstrap /users/me + me/refreshMe
│   │   ├── ThemeContext.js         # Dark/light toggle
│   │   ├── LocationContext.js      # expo-location wrapper
│   │   └── TourContext.js          # In-app help-tour flag
│   ├── hooks/
│   │   └── useGeofence.js          # Calls server's /spatial/validate-geofence
│   ├── navigation/
│   │   └── AppNavigator.js         # Routes — auth, terms, main tabs, profile stack
│   ├── screens/
│   │   ├── LoginScreen.js          # + Google OAuth
│   │   ├── SignUpScreen.js         # + referral code field
│   │   ├── ForgotPasswordScreen.js
│   │   ├── EmailVerificationScreen.js
│   │   ├── TermsAcceptanceScreen.js
│   │   ├── HomeScreen.js           # Map, hive markers, geofence, order CTA
│   │   ├── PackageSelectScreen.js
│   │   ├── PaymentScreen.js        # ₪ breakdown, credits + card + promo code
│   │   ├── FlightTrackingScreen.js
│   │   ├── LiveSessionScreen.js    # Live drone view + end-early
│   │   ├── ContentDeliveryScreen.js
│   │   ├── GalleryScreen.js        # AsyncStorage-backed
│   │   ├── ProfileScreen.js        # Settings + menu + admin items
│   │   ├── CreditsScreen.js        # Balance, referral code, ledger, redeem
│   │   ├── PromoCodeAdminScreen.js # Admin-only, passcode-gated
│   │   ├── HiveAdminScreen.js      # Admin-only, drop / merge / delete hives
│   │   ├── OrderHistoryScreen.js   # Server-backed + cached
│   │   ├── HelpScreen.js
│   │   ├── PrivacyTermsScreen.js
│   │   └── PartnersAboutScreen.js
│   ├── services/
│   │   └── SimClient.js            # HTTP + socket wrapper, auto-attaches ID token
│   ├── theme/                      # Colors, spacing, typography
│   └── utils/                      # haversineDistanceMeters, formatters
│
└── airsnap-server/                 # ── Simulation server ──
    ├── index.js                    # Routes + socket handlers + drone lifecycle
    ├── auth.js                     # Firebase Admin init, requireAuth/Admin/AdminPass
    ├── hiveStore.js                # In-memory hive fleet + charging tick
    ├── orderStore.js               # In-memory orders + payment status
    ├── droneSim.js                 # 30Hz physics, 10Hz broadcast, ENU frame
    ├── samples.js                  # Stock photo / video URLs for delivery
    ├── userStore.js                # Firestore: users + ledger + referral
    ├── promoStore.js               # Firestore: promo codes + redemptions
    ├── credits.js                  # Pure helpers — splitPayment, validation
    ├── geofence.js                 # Haversine distance
    ├── public/                     # Web viz (index.html, sim.js)
    └── render.yaml                 # Render deployment blueprint
```

---

## Authentication flow

`src/context/AuthContext.js` is the chokepoint — every screen consumes it via `useAuth()`:

```js
const {
  user,                       // { id, name, email, avatar, provider } | null
  isLoading,                  // true until first onAuthStateChanged fires
  hasAcceptedTerms,           // local AsyncStorage flag
  me,                         // server's view: { credits, referralCode, isAdmin, … }
  refreshMe,                  // () => Promise<me>
  setPendingReferralCode,     // (code) — stashed by SignUp before sign-in completes
  signInWithEmail,            // (email, password)
  signUp,                     // (name, email, password)
  signInWithGoogle,           // browser OAuth via expo-auth-session
  sendPasswordReset,
  signOut,
  acceptTerms,
  resendVerificationEmail,
  reloadUser,
} = useAuth();
```

- Firebase persists the session in AsyncStorage; force-quit and reopen → still signed in.
- On every sign-in, AuthContext calls `simApi.bootstrapMe()` which hits `POST /users/me` on the server — idempotent. Creates the Firestore user doc if missing, grants signup bonus, links referral.
- Routing decides the visible stack ([src/navigation/AppNavigator.js](src/navigation/AppNavigator.js)):
  1. Loading spinner
  2. TermsAcceptance if first launch
  3. AuthStack if signed out
  4. EmailVerification if email not verified (admins bypass)
  5. MainTabs once everything checks out

---

## Server API summary

Detail in [airsnap-server/index.js](airsnap-server/index.js).

### Public

- `GET  /health` — liveness
- `GET  /hives` — list all hives
- `POST /spatial/validate-geofence` — distance to nearest hive, available drones

### Authed (Bearer token)

- `POST /users/me` — bootstrap user doc (idempotent, optional `referralCode` body)
- `GET  /users/me` — current user + isAdmin
- `GET  /users/me/ledger` — last 20 credit movements
- `POST /promos/redeem` — redeem a code (balance → credits added; discount → response only)
- `POST /orders` — create order (optionally with `discountCode`); returns split
- `GET  /orders` — your orders
- `GET  /orders/:id` — one order + live drone state
- `POST /orders/:id/confirm-payment` — **stop-gap until Meshulam** webhook lands

### Admin (email check)

- `POST /hives` — create / merge
- `DELETE /hives/:id` — delete

### Admin + passcode (`X-Admin-Pass` header)

- `POST /admin/promos` — create promo code
- `GET  /admin/promos` — list all
- `DELETE /admin/promos/:code` — deactivate

### Webhook (not yet wired)

- `POST /payments/webhook` — Meshulam will call this; signature verification TODO

### Socket.IO (server → client)

`drone:state`, `order:status`, `session:progress`, `hive:created`, `hive:updated`, `hive:deleted`, `hives:snapshot`, `order:delivered`, `order:paid`, `user:location`

### Socket.IO (client → server)

`order:join`, `user:location`, `session:start`, `session:end`, `hello:viewer`

---

## Environment variables (server)

| Var | Required | Default | Purpose |
|---|---|---|---|
| `FIREBASE_PROJECT_ID` | yes | — | ID-token verification |
| `FIREBASE_SERVICE_ACCOUNT` | for Firestore | — | Raw or base64 JSON of service account |
| `ADMIN_EMAILS` | yes | empty | Comma-separated admin emails |
| `ADMIN_PROMO_PASS` | for promo admin | — | Must match mobile constant; `X-Admin-Pass` header |
| `SIGNUP_BONUS_NIS` | no | `5` | Welcome credit amount |
| `SIGNUP_BONUS_EXPIRES` | no | `2027-12-31T23:59:59Z` | After this, no signup bonus |
| `REFERRAL_BONUS_NIS` | no | `20` | Referrer's payout on referee's first paid order |
| `PORT` | no | `4000` | Render injects this automatically |
| `MESHULAM_WEBHOOK_SECRET` | future | — | For HMAC validation when wired |

---

## Common commands

```bash
# Mobile
npx expo start                    # Local QR (same network)
npx expo start --tunnel           # Reachable from any network
npx expo start --clear            # Fresh Metro cache

# Server (local)
cd airsnap-server
node index.js                     # production
node --watch index.js             # dev with reload

# Render
git push                          # auto-deploys main branch
```

---

## Known limitations & roadmap

- **No real payment processor wired yet.** The `/orders/:id/confirm-payment` stop-gap simulates a successful card capture. Adding Meshulam means:
  1. Replace the mobile "Pay" button with the Meshulam SDK launcher.
  2. Wire `POST /payments/webhook` to verify Meshulam HMAC using `MESHULAM_WEBHOOK_SECRET`, then flip `paymentStatus` to `'paid'` and call `onPaymentSucceeded(orderId)` (same path the stop-gap uses).
  3. Remove `POST /orders/:id/confirm-payment`.
- **Apple Sign-In disabled** in Expo Go (native-only). Switch to a Dev Client to enable.
- **Free Render tier sleeps after 15 min idle** — first request after sleep takes ~20s.
- **Orders are kept in memory.** If the server restarts during a flight, the in-progress order's drone state is lost (the order doc in Firestore stays consistent — user is not double-charged). Acceptable for a demo.

---

## License & credits

Demo / educational project. No license file shipped — treat as "all rights reserved" until one is added.
