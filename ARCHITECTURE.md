# AirSnap — Architecture Diagrams

Presentation-ready diagrams for the AirSnap drone-photography platform.

---

## 1. System Overview — the two codebases + external services

```
                          ┌───────────────────────────────────────┐
                          │            FIREBASE (Google)           │
                          │   Auth (identity)  ·  Firestore (data) │
                          └───────────────────────────────────────┘
                              ▲                          ▲
              verify ID token │                          │ persist users,
              (Admin SDK)     │                          │ hives, promos
                              │                          │
   ┌──────────────────────────┴───────┐      ┌───────────┴──────────────────────┐
   │      MOBILE APP  (src/)          │      │     SERVER  (airsnap-server/)     │
   │      React Native · Expo Go      │      │     Node.js · Express · Socket.IO │
   │                                  │      │     deployed on Render            │
   │  ┌────────────────────────────┐  │      │  ┌─────────────────────────────┐  │
   │  │ Contexts (global state)    │  │      │  │ droneSim.js  ← PHYSICS ENGINE│  │
   │  │  Auth · Location · Theme   │  │      │  │ index.js     ← API + sockets │  │
   │  └────────────────────────────┘  │      │  │ hiveStore · orderStore       │  │
   │  ┌────────────────────────────┐  │      │  │ userStore · promoStore       │  │
   │  │ Screens (Order flow, etc.) │  │      │  │ auth · geofence · samples    │  │
   │  └────────────────────────────┘  │      │  └─────────────────────────────┘  │
   │  ┌────────────────────────────┐  │      │                                   │
   │  │ SimClient.js  (the door)   │  │      │  ┌─────────────────────────────┐  │
   │  └─────────────┬──────────────┘  │      │  │ public/  ← live web viewer  │  │
   └────────────────┼─────────────────┘      └──────────────┬────────────────────┘
                    │                                        │
                    │   ①  HTTP / REST  (place order, list hives, pay)
                    │◄──────────────────────────────────────►│
                    │                                        │
                    │   ②  WebSocket  (Socket.IO, real-time) │
                    │◄──────────────────────────────────────►│
                    │      drone:state @10Hz ↓                │
                    │      user:location ↑ · session:start ↑  │
                    └────────────────────────────────────────┘

   KEY IDEA: the phone never computes the drone's position.
   The server simulates physics at 30 Hz and streams coordinates
   to the phone 10 times/sec. The phone just draws what it's told.
```

---

## 2. Order Flow — sequence diagram (the end-to-end story)

```
 USER        MOBILE APP            SERVER (index.js)        DRONE SIM (droneSim.js)
  │              │                       │                          │
  │ pick spot    │                       │                          │
  │─────────────►│                       │                          │
  │ pay          │  POST /orders         │                          │
  │─────────────►│──────────────────────►│                          │
  │              │                       │ validate geofence        │
  │              │                       │ deduct credits           │
  │              │                       │ reserveDrone() from hive │
  │              │                       │ startDroneForOrder() ────►│ new Drone()
  │              │  201 { orderId }      │                          │ .start()
  │              │◄──────────────────────│                          │ tick @30Hz
  │              │                       │                          │  PENDING
  │  ── navigate to FlightTracking ──    │                          │
  │              │  WS: order:join       │                          │
  │              │──────────────────────►│                          │
  │              │                       │                          │  EN_ROUTE
  │              │  WS: user:location ↑  │  updateUserTarget() ─────►│ (climb, fly
  │              │──────────────────────►│                          │  to user)
  │              │                       │                          │
  │              │  WS: drone:state ↓ @10Hz (lat,lng,heading,batt)  │
  │  watch drone │◄═════════════════════════════════════════════════│
  │  glide on map│  (marker animates smoothly between samples)      │
  │              │                       │                          │  ARRIVED
  │              │  WS: order:status     │◄─────────────────────────│ (hover)
  │              │◄──────────────────────│                          │
  │ tap "Start"  │  WS: session:start    │                          │
  │─────────────►│──────────────────────►│  startSession() ────────►│  RECORDING
  │              │                       │                          │ (orbit user
  │ watch FPV    │  WS: session:progress │◄─────────────────────────│  15m circle)
  │  camera view │◄──────────────────────│                          │
  │              │                       │                          │  RETURNING
  │              │                       │                          │  (fly home)
  │              │                       │  watcher detects ◄───────│  DELIVERED
  │              │                       │  generateMedia(order)    │
  │              │                       │  → real satellite tiles  │
  │              │  WS: order:delivered  │  + aerial video URLs     │
  │  see photos  │◄──────────────────────│                          │
  │  in gallery  │  save to device       │                          │
  │              │                       │                          │
```

---

## 3. The Drone State Machine (inside droneSim.js)

```
        order placed
             │
             ▼
      ┌────────────┐   1 second
      │  PENDING   │──────────────┐
      └────────────┘              │
                                  ▼
                          ┌────────────┐   climb to 50m cruise alt,
                          │  EN_ROUTE  │   fly toward user's live GPS,
                          └─────┬──────┘   descend to 12m near them
                                │ within 3m of target
                                ▼
                          ┌────────────┐   hover, wait for the user
                          │  ARRIVED   │   to tap "Start Session"
                          └─────┬──────┘
                                │ session:start    ┌──────────────────┐
                                ▼                  │ abandonBefore-   │
                          ┌────────────┐           │ Recording() can  │
                          │ RECORDING  │           │ jump PENDING /   │
                          └─────┬──────┘           │ EN_ROUTE /       │
          orbit user 15m,       │ duration done    │ ARRIVED  ───────►│ RETURNING
          one rev / 30s         │ (or end early)   └──────────────────┘
                                ▼
                          ┌────────────┐   climb, fly back to hive (0,0),
                          │ RETURNING  │   descend, land
                          └─────┬──────┘
                                │ landed
                                ▼
                          ┌────────────┐   2 seconds
                          │ PROCESSING │──────────────┐
                          └────────────┘              │
                                                      ▼
                                              ┌────────────┐
                                              │ DELIVERED  │  tick loop stops,
                                              └────────────┘  media generated,
                                                              hive slot freed
```

---

## 4. Mobile App — navigation tree

```
AppNavigator  (the auth gatekeeper — picks ONE branch)
│
├─ not accepted terms ──────► TermsAcceptanceScreen
├─ not signed in ───────────► AuthStack: Login → SignUp → ForgotPassword
├─ email not verified ──────► EmailVerificationScreen
│
└─ signed in & verified ───► BottomTabs
                              │
                              ├─ [Order]   HomeStack  ◄── the core product flow
                              │            Home → PackageSelect → Payment →
                              │            FlightTracking → LiveSession →
                              │            ContentDelivery
                              │
                              ├─ [Gallery] GalleryScreen  (one folder per flight)
                              │
                              └─ [Profile] ProfileStack
                                           ProfileMain → OrderHistory · Credits ·
                                           Help · PrivacyTerms · HiveAdmin (admin) ·
                                           PromoCodeAdmin (admin)
```

---

## 5. The "vital few" — where the most important logic lives

```
SERVER                                        CLIENT
──────                                        ──────
droneSim.js                                   SimClient.js
  _tick()        physics @30Hz                  simApi.*        all REST calls
  _moveToward()  flight kernel                  getSimClient()  the socket
  snapshot()     what gets sent                  onDroneState() live updates
  state machine  PENDING→DELIVERED
                                              AppNavigator.js
index.js                                        the auth gate + app structure
  startDroneForOrder()  drone lifecycle
  POST /orders          the big endpoint      AuthContext.js
  io.on('connection')   socket router           identity + credits + tokens
                                                bootstrap() / refreshMe()
hiveStore.js
  reserveDrone()   pick best drone            DroneCameraView.js
  tickCharging()   recharge @1Hz                the FPV "what the drone sees"

geofence.js                                   FlightTrackingScreen.js
  haversineDistanceMeters()                     AnimatedRegion marker (smooth)
  llToEnuMeters() / enuMetersToLatLng()
```

---

## Talking points (one-liners for the slide notes)

- **Why a separate physics server?** Keeps the phone a thin client — all drones for all users are simulated centrally, and the same stream feeds the mobile app *and* a live web ops-map.
- **Why 30 Hz simulate but 10 Hz broadcast?** Smooth physics without flooding the network; the phone interpolates between samples with `AnimatedRegion` so it looks like 60 fps.
- **Why ENU meters instead of lat/lng for the math?** Flight physics (acceleration, orbit radius, altitude) are naturally metric and linear; we only convert back to lat/lng at the moment of broadcast.
- **Security model:** the phone proves identity with a Firebase ID token on every request; the server verifies it with the Firebase Admin SDK and never trusts client-claimed identity.
- **Real media:** delivered photos are real ESRI satellite tiles of the *actual* ordered GPS coordinates — not stock images.
```
