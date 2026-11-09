# Run AirSnap with Docker

Run the whole AirSnap project on your own computer: the app (in your browser), the
drone simulation server, and the live drone viewer. You only need Docker. No Node.js,
no phone, no setup files.

## 1. Install Docker Desktop (one time)

1. Download it from https://www.docker.com/products/docker-desktop/ and install it.
   On Windows, say yes if it asks to turn on WSL, and restart if it asks.
2. Open **Docker Desktop** and wait until it shows **Engine running**.

## 2. Get AirSnap

- **Easiest:** go to https://github.com/Alon-1234/Airsnap → green **Code** button →
  **Download ZIP** → unzip it anywhere.
- **Or with git:** `git clone https://github.com/Alon-1234/Airsnap.git`

## 3. Start it

- **Windows:** double-click **`Start AirSnap (Docker).bat`**
- **Mac / Linux:** open **Terminal**, go into the folder and run the start script:
  ```sh
  cd ~/Downloads/Airsnap-main   # wherever you unzipped / cloned it
  sh start-docker.sh
  ```
  (On a Mac, `git` asks to install Apple's developer tools the first time. Click
  Install, or just use the ZIP download instead.)

The first time, it asks for **the email you'll sign in with**. On your copy that
account becomes **admin**, so you can place drone hives and order for free.
The first build takes 5–10 minutes; after that it starts in seconds.

When it's ready, two browser tabs open:

| Tab | Address |
|---|---|
| The AirSnap app | http://localhost:8081 |
| Live drone viewer | http://localhost:4000 |

## 4. Try a drone order

1. In the app tab, read and accept the Terms.
2. **Sign Up** with the **same email** you typed in step 3 (password: 8+ characters,
   with an uppercase letter, a lowercase letter and a number).
3. When the browser asks, **allow location**.
4. **Profile → Manage Hives (admin) → Place at my location** (or tap the map).
   This puts a drone hive next to you.
5. Go back to **Order**, tap **Order Drone**, pick a package, then **Place Order — Free (admin)**.
6. Watch the drone fly to you, and on the **live viewer** tab too. Tap the drone
   for the drone camera view. Your photos and videos end up in the **Gallery**.

## 5. Stop it

- **Windows:** double-click **`Stop AirSnap (Docker).bat`**
- **Mac / Linux:** `docker compose down` (in Terminal, inside the AirSnap folder)

Your data (accounts' credits, hives, promo codes) is kept for next time.
To wipe everything and start fresh: `docker compose down -v`.

## Good to know

- **Accounts are real.** Sign-in uses the real AirSnap login system, so the account
  you create also works in the real app. Everything else (credits, hives, orders)
  stays on your computer.
- **"Continue with Google" doesn't work in the browser version.** Use email sign-up.
- **Wrong email, or want to add another admin?** Edit the `.env` file in the folder
  (`ADMIN_EMAILS=you@example.com,friend@example.com`), then start again.
- **Get the newest version:** download the ZIP again (or `git pull`), then start again.
  It rebuilds automatically.
- **"Port is already allocated":** something else uses port 8081 or 4000. Close it
  (for example another AirSnap window), or stop it with `docker compose down`.
- **Something broke?** `docker compose logs` shows what the server and app printed.
