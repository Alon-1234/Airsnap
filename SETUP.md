# AirSnap — Full Setup Guide

This walks you through everything needed to run AirSnap end-to-end, **assuming nothing**. By the end you'll have:

- A working Firebase project (auth + Firestore)
- The simulation server running on Render (free tier)
- The mobile app running in Expo Go on your phone
- Credits, referrals, and admin promo codes working

If you already did parts of this, skim and jump to whatever you haven't done.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & install](#2-clone--install)
3. [Firebase: create project + enable services](#3-firebase-create-project--enable-services)
4. [Firebase: generate service account JSON](#4-firebase-generate-service-account-json)
5. [Server: deploy to Render](#5-server-deploy-to-render)
6. [Mobile app: configure & run](#6-mobile-app-configure--run)
7. [Verify everything works](#7-verify-everything-works)
8. [Admin features](#8-admin-features)
9. [Rotating the service account](#9-rotating-the-service-account)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

| Tool | Why | How |
|---|---|---|
| Node.js 18+ (20 LTS recommended) | Runs Expo CLI + the server locally | https://nodejs.org |
| Git | Cloning + pushing to Render | https://git-scm.com |
| Expo Go app | Runs the mobile app on your phone | App Store / Play Store |
| Firebase account | Auth + Firestore | https://console.firebase.google.com |
| Render account | Hosts the server (free tier) | https://render.com |
| GitHub account | Render pulls code from a GitHub repo | https://github.com |

No JDK, Android Studio, Xcode, or Mac required.

---

## 2. Clone & install

```bash
git clone <your-repo-url>
cd demo_app
npm install
```

If `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (common on Windows with strict AV / corporate networks):

```bash
npm config set strict-ssl false
npm install
npm config set strict-ssl true
```

Install the server's deps too:

```bash
cd airsnap-server
npm install
cd ..
```

---

## 3. Firebase: create project + enable services

Skip this section if you're using the existing `airsnap-7844f` project.

### 3.1 Create the project

1. https://console.firebase.google.com → **Add project**
2. Name it (e.g. `airsnap-yourname`) → continue → disable Analytics (not needed) → **Create**

### 3.2 Add a web app

1. Project Overview → click the `</>` icon → register a web app named `AirSnap`
2. Copy the `firebaseConfig` object — you'll paste these values into [src/config/firebaseConfig.js](src/config/firebaseConfig.js) in step 6.

### 3.3 Enable Authentication

1. Sidebar → **Authentication** → **Get started**
2. **Sign-in method** tab → enable:
   - **Email/Password**
   - **Google** (you'll need a support email)
3. After enabling Google, click into the Google provider → expand **Web SDK configuration** → copy the **Web client ID** (looks like `…-…apps.googleusercontent.com`). This is `GOOGLE_WEB_CLIENT_ID` in step 6.

### 3.4 Enable Firestore

This is what stores users, credits, ledger, and promo codes.

1. Sidebar → **Firestore Database** → **Create database**
2. Pick **production mode** → next
3. Pick a region close to you (e.g. `eur3` for Europe, `nam5` for US) → **Enable**
4. Wait ~30 seconds for it to provision.

### 3.5 (Required for Google sign-in in Expo Go)

In **Google Cloud Console** → APIs & Services → Credentials → click your Web Client ID → add this **Authorized redirect URI**:

```
https://auth.expo.io/@<your-expo-username>/airsnap
```

Without this, Google sign-in fails with `redirect_uri_mismatch`.

---

## 4. Firebase: generate service account JSON

The server needs admin credentials to read/write Firestore on behalf of users.

1. Firebase Console → ⚙️ (Project Settings) → **Service accounts** tab
2. Make sure language is **Node.js**
3. Click **Generate new private key** → confirm with **Generate key**
4. A `.json` file downloads. **Treat this file as a password.** Anyone with it has full admin access to your project.
5. Move it somewhere safe (NOT inside the repo — `.gitignore` doesn't cover it):

```powershell
# Windows example
move "$env:USERPROFILE\Downloads\airsnap-*-firebase-adminsdk-*.json" "$env:USERPROFILE\airsnap-sa.json"
```

### 4.1 Base64-encode it (for Render)

Render env vars take a single line, so we base64-encode the multi-line JSON.

**PowerShell:**

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\airsnap-sa.json"))
```

**Bash / Git Bash:**

```bash
base64 -w 0 ~/airsnap-sa.json
```

Copy the resulting blob. That's the value of `FIREBASE_SERVICE_ACCOUNT` in the next step.

---

## 5. Server: deploy to Render

### 5.1 Push the repo to GitHub

If the repo isn't on GitHub yet:

```bash
# Create an empty repo on GitHub first (no README, no .gitignore)
git remote add origin https://github.com/<you>/airsnap.git
git push -u origin main
```

### 5.2 Create the Render service

1. https://dashboard.render.com → **New** → **Web Service**
2. Connect your GitHub account if it isn't already → pick the airsnap repo
3. Settings:
   - **Name:** `airsnap-server`
   - **Region:** Oregon (or whichever is closest)
   - **Branch:** `main`
   - **Root Directory:** `airsnap-server`  ← this matters
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance type:** Free
4. Don't click "Create Web Service" yet — first scroll down to **Environment Variables** and add them.

### 5.3 Add environment variables

On the same Create-Service page (or after creation, under the **Environment** tab of the service):

| Key | Value | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID` | `airsnap-7844f` | Or your project ID |
| `FIREBASE_SERVICE_ACCOUNT` | *(the base64 blob from §4.1)* | Mark as secret |
| `ADMIN_EMAILS` | `you@example.com` | Comma-separated. These accounts get admin powers. |
| `ADMIN_PROMO_PASS` | `Alon132` | Required as `X-Admin-Pass` header to mint promo codes |
| `SIGNUP_BONUS_NIS` | `5` | New-user welcome credit |
| `SIGNUP_BONUS_EXPIRES` | `2026-06-30T23:59:59Z` | When the welcome credit promo ends |
| `REFERRAL_BONUS_NIS` | `20` | Paid to the referrer on their referee's first paid order |
| `NODE_VERSION` | `20` | Pins Node major version |

> **Can't find "Environment Variables"?** Some Render layouts hide it inside the service's **Settings** tab. If you only see "Environment Groups", create a group with these vars and link it to the service.

### 5.4 Deploy

Click **Create Web Service** (or **Save Changes** if you already created it). Watch the Logs tab. You're looking for:

```
[auth] Firebase Admin initialized with service account.
[airsnap-server] listening on :4000
```

If you see `FIREBASE_SERVICE_ACCOUNT not set — Firestore writes will fail`, the env var didn't save. Re-add it.

### 5.5 Test the server

Render gives you a URL like `https://airsnap-server-xxxx.onrender.com`. Hit it:

```bash
curl https://airsnap-server-xxxx.onrender.com/health
# {"ok":true,"uptime":...,"hives":0,"drones":0}
```

> **Free tier sleeps after 15 minutes idle.** The first request after sleep takes ~20 seconds — that's normal.

---

## 6. Mobile app: configure & run

### 6.1 Edit firebase config

Open [src/config/firebaseConfig.js](src/config/firebaseConfig.js) and paste in your values from step 3.2 + 3.3:

```js
export const FIREBASE_CONFIG = {
  apiKey: '…',
  authDomain: '…',
  projectId: '…',
  storageBucket: '…',
  messagingSenderId: '…',
  appId: '…',
};

export const GOOGLE_WEB_CLIENT_ID = '….apps.googleusercontent.com';

export const ADMIN_EMAILS = [
  'you@example.com',   // must match the email you set on the server
];

export const ADMIN_PROMO_PASS = 'Alon132';   // must match ADMIN_PROMO_PASS on the server
```

> The Firebase web API key is **not a secret** — it's a project identifier. Safe to commit. (Real security is enforced by Firebase Auth + Firestore rules + server middleware.)

### 6.2 Point the app at your Render server

Open [src/config/serverConfig.js](src/config/serverConfig.js) and set:

```js
export const API_BASE_URL = 'https://airsnap-server-xxxx.onrender.com';
export const SOCKET_URL  = 'https://airsnap-server-xxxx.onrender.com';
```

### 6.3 Start Expo

```bash
npx expo start --tunnel
```

`--tunnel` lets your phone reach Metro even if you're on a different network than your laptop.

On your phone:

- **iPhone:** Camera app → point at the QR → tap the Expo banner
- **Android:** Open Expo Go → "Scan QR code"

The app should load. First boot takes ~30 seconds.

---

## 7. Verify everything works

Walk through this checklist. If anything fails, see [§10 Troubleshooting](#10-troubleshooting).

### 7.1 Auth + signup bonus

1. Sign up with a brand-new email (not your admin one). Verify the email via the link sent to your inbox.
2. Open **Profile → Credits & Referrals**.
3. You should see **₪5** balance with a **Welcome bonus** ledger entry.

### 7.2 Admin unlimited credits

1. Sign in with the admin email (from `ADMIN_EMAILS`).
2. Open **Profile → Credits & Referrals**.
3. Balance should show **Unlimited**.

### 7.3 Place a hive

1. As admin, **Profile → Manage Hives (admin)**.
2. Tap the map to place a hive within 500m of where you'll test orders.

### 7.4 Place a free order (as admin)

1. From Home, tap "Order now".
2. Pick a package, continue.
3. The Payment screen should show "Place Order — Free (admin)". Tap it.
4. Drone simulation starts. Wait ~1 minute for delivery.
5. **Gallery** + **Order History** should show the new content.

### 7.5 Referral flow

1. Copy admin's referral code from Credits & Referrals.
2. **Sign out**. Sign up a third account, entering the admin code in the "Referral code (optional)" field.
3. As that new user, place + pay (use the "Pay" stop-gap button) for an order.
4. Sign back in as admin → Credits & Referrals → ledger should show a **Referral bonus** entry.

### 7.6 Promo code (admin → user)

1. As admin, **Profile → Promo Codes (admin)** → enter `Alon132`.
2. Create a code: `TEST20`, type `balance`, amount `20`.
3. Sign in as your regular test user. Credits & Referrals → "Redeem a code" → enter `TEST20`.
4. Balance should jump by ₪20.

---

## 8. Admin features

### 8.1 Who is an admin?

Anyone whose email is in:

- The server's `ADMIN_EMAILS` env var (the source of truth — server-enforced)
- The mobile app's `ADMIN_EMAILS` array in [src/config/firebaseConfig.js](src/config/firebaseConfig.js) (UI gate only)

Both should match. The server check is the real security; the mobile array just decides whether to show admin menu items.

### 8.2 Admin powers

| Feature | Where | Auth |
|---|---|---|
| Place / merge / delete hives | Profile → Manage Hives | Server: `requireAdmin` (email check) |
| Mint / list / deactivate promo codes | Profile → Promo Codes (admin) | Server: `requireAdmin` + `X-Admin-Pass` header |
| Unlimited credits — orders are always free | Any order flow | Server: `splitPayment(...isAdmin=true)` |

The **Promo Codes** screen is double-gated: the mobile app requires the passcode `Alon132` to unlock the screen (UX layer), and the server requires the same value as an `X-Admin-Pass` HTTP header on every promo endpoint (real security). Even if someone steals an admin Firebase token, they can't mint codes without the passcode.

### 8.3 Promo code types

| Type | Behavior |
|---|---|
| **balance** | Redeemed from the Credits screen. Adds `amount` to the user's balance. |
| **discount** | Applied at checkout (PaymentScreen field). Reduces the order total by `amount` for that one order. |

Each code can have:
- Optional expiry date
- Max total redemptions
- "One per user" toggle (recommended on)

---

## 9. Rotating the service account

If your service account JSON was ever exposed (committed, posted in chat, emailed, etc.), rotate it:

1. Firebase Console → ⚙️ Project Settings → **Service accounts** tab
2. Scroll down → **Manage all service accounts** → opens Google Cloud Console
3. Find `firebase-adminsdk-*@<project>.iam.gserviceaccount.com` → click → **Keys** tab
4. Delete the compromised key (matched by ID against the `private_key_id` field in the old JSON)
5. **Add Key → Create new key → JSON** → download
6. Base64-encode the new JSON (§4.1)
7. Render → service → Environment → update `FIREBASE_SERVICE_ACCOUNT` → Save (this triggers a redeploy)
8. Delete the old JSON file from your laptop

User credits / referrals / promo codes are unaffected — Firestore data persists across credential rotation.

---

## 10. Troubleshooting

### "Sign Up Failed" / `auth/network-request-failed`

Your phone can't reach Firebase. Check the phone has internet. If you're on a VPN, try without it.

### Mobile shows "User init failed" or "Insufficient credits" on every order

The server can't write to Firestore. In Render logs you'll see Firestore errors. Most likely:

- `FIREBASE_SERVICE_ACCOUNT` env var is missing or malformed → re-paste
- Firestore not enabled in Firebase Console → §3.4
- Service account from a different project than `FIREBASE_PROJECT_ID` → regenerate from the right project

### "Out of delivery range" even though I'm at the hive

The hive needs to be within 500m of where the order is placed. As admin, drop a new hive directly on your current location: **Profile → Manage Hives** → tap your location dot.

### Drone sim never starts; mobile shows "Could not place order"

Render free tier is asleep — the first call after 15+ minutes idle takes ~20 seconds. Wait and retry. If it still fails, check Render Logs.

### "Invalid or missing admin passcode" on promo creation

The passcode in `src/config/firebaseConfig.js` (`ADMIN_PROMO_PASS`) doesn't match the server's `ADMIN_PROMO_PASS` env var. Make them identical.

### Promo Code admin screen shows "Wrong passcode" immediately

The mobile constant doesn't match what you typed. The default is `Alon132` — case-sensitive.

### Google sign-in returns `redirect_uri_mismatch`

You skipped §3.5. Add the redirect URI in Google Cloud Console.

### `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`

See [§2](#2-clone--install) — corporate / AV TLS interception. Use the `strict-ssl` workaround.

### Render redeploys on every push and breaks env vars

Render preserves env vars across deploys. If they vanished, you set them inside `render.yaml` with `sync: true` instead of `sync: false`. Service-level env vars on the dashboard take precedence and are stable.

### Server shows `FIREBASE_PROJECT_ID env var is required` on boot

Render didn't pick up the env var. Re-add `FIREBASE_PROJECT_ID` in the dashboard, trigger a manual redeploy.

---

## Glossary

- **Hive** — a physical (simulated) drone base station. Has fleet of drones with battery + charging state.
- **Ledger** — append-only log of every credit movement per user. Lives at `users/{uid}/ledger/{auto-id}`.
- **Stop-gap payment** — the temporary `POST /orders/:id/confirm-payment` endpoint that simulates a successful card capture. Will be replaced by the real Meshulam webhook when it lands.
- **Splitter** — the `splitPayment(total, balance, isAdmin)` helper that decides how much comes from credits vs. card. Admin → always free.
- **Bootstrap** — the idempotent `POST /users/me` call made on every app start to ensure the Firestore user doc exists, signup bonus is granted, and referral linkage is recorded.
