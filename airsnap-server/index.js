/**
 * ============================================================
 *  AirSnap simulation server
 * ============================================================
 *  Express HTTP API + Socket.IO real-time channel.
 *
 *  Routes
 *    GET  /health                       — liveness check
 *    GET  /hives                        — list all hives + fleet
 *    POST /hives                        — admin only, create / merge
 *    DELETE /hives/:id                  — admin only, delete
 *    POST /orders                       — authed, reserve drone + sim
 *    GET  /orders                       — authed, list this user's orders
 *    GET  /orders/:id                   — authed, fetch one order
 *    POST /orders/:id/confirm-payment   — authed, stop-gap "card cleared"
 *    POST /spatial/validate-geofence    — open, distance to nearest hive
 *
 *    Users & credits:
 *    POST /users/me                     — authed, idempotent bootstrap
 *    GET  /users/me                     — authed, returns user + isAdmin
 *    GET  /users/me/ledger              — authed, last 20 credit moves
 *
 *    Promo codes:
 *    POST /promos/redeem                — authed, balance OR discount
 *    POST /admin/promos                 — admin+pass, create
 *    GET  /admin/promos                 — admin+pass, list
 *    DELETE /admin/promos/:code         — admin+pass, deactivate
 *
 *    Future:
 *    POST /payments/webhook             — Meshulam will call this (TODO)
 *
 *  Socket events (server -> client)
 *    drone:state, order:status, session:progress,
 *    hive:created, hive:updated, hive:deleted, hives:snapshot,
 *    order:delivered, order:paid, user:location
 *
 *  Socket events (client -> server)
 *    order:join, user:location, session:start, session:end,
 *    hello:viewer
 * ============================================================
 */

require('dotenv').config();
const path = require('path');
const http = require('http');
const cors = require('cors');
const express = require('express');
const { Server: SocketIOServer } = require('socket.io');

const {
  requireAuth,
  requireAdmin,
  requireAdminPass,
  initFirebase,
  isAdminEmail,
} = require('./auth');
const hiveStore = require('./hiveStore');
const orderStore = require('./orderStore');
const userStore = require('./userStore');
const promoStore = require('./promoStore');
const { Drone, STATUS } = require('./droneSim');
const { generateMedia } = require('./samples');
const { splitPayment, round2 } = require('./credits');

const PORT = Number(process.env.PORT) || 4000;
const DELIVERY_ZONE_RADIUS_METERS = 500;
const ABANDON_FEE_FRACTION = 0.10;     // 10% cancellation fee

// ── Express app ──────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Per-order Drone instance.
const drones = new Map();

// ── HTTP routes ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    hives: hiveStore.listHives().length,
    drones: drones.size,
  });
});

app.get('/hives', (req, res) => {
  res.json({ hives: hiveStore.listHives() });
});

app.post('/hives', requireAdmin, (req, res) => {
  const { name, latitude, longitude } = req.body || {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'latitude and longitude (numbers) required' });
  }
  try {
    const { hive, merged } = hiveStore.createHive({ name, latitude, longitude, createdBy: req.user.email });
    io.emit(merged ? 'hive:updated' : 'hive:created', hive);
    res.status(201).json({ hive, merged });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/hives/:id', requireAdmin, (req, res) => {
  const ok = hiveStore.deleteHive(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Hive not found' });
  io.emit('hive:deleted', { id: req.params.id });
  res.json({ ok: true });
});

app.post('/spatial/validate-geofence', (req, res) => {
  const user = req.body?.user;
  if (!user || typeof user.latitude !== 'number' || typeof user.longitude !== 'number') {
    return res.status(400).json({ error: 'user.latitude and user.longitude required' });
  }
  const nearest = hiveStore.nearestHive(user);
  if (!nearest) {
    return res.status(404).json({
      inBounds: false,
      available: false,
      distanceMeters: null,
      radiusMeters: DELIVERY_ZONE_RADIUS_METERS,
      hive: null,
      message: 'No hives configured yet. Ask an admin to place one.',
    });
  }
  const inRange = nearest.distanceMeters <= DELIVERY_ZONE_RADIUS_METERS;
  const available = inRange && (nearest.hive.available > 0);
  res.json({
    inBounds: inRange,
    available,
    distanceMeters: nearest.distanceMeters,
    radiusMeters: DELIVERY_ZONE_RADIUS_METERS,
    hive: nearest.hive,
    secondsUntilNextAvailable: inRange && !available
      ? hiveStore.secondsUntilNextAvailable(nearest.hive.id) ?? null
      : null,
    message: inRange && !available
      ? `All drones at "${nearest.hive.name}" are recharging.`
      : undefined,
  });
});

// ── Users & credits ──────────────────────────────────────

/**
 * Idempotent bootstrap. Called on every app start with the user's
 * optional referral code (only honored on first creation).
 */
app.post('/users/me', requireAuth, async (req, res) => {
  try {
    const referralCodeUsedAtSignup = req.body?.referralCode;
    const displayName = req.body?.displayName;
    const u = await userStore.getOrCreateUser(
      req.user.uid,
      req.user.email,
      displayName,
      { referralCodeUsedAtSignup },
    );
    res.json({
      user: serializeUser(u, req.user),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/users/me', requireAuth, async (req, res) => {
  try {
    const u = await userStore.getUser(req.user.uid);
    if (!u) return res.status(404).json({ error: 'User not found — call POST /users/me to bootstrap' });
    res.json({ user: serializeUser(u, req.user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/users/me/ledger', requireAuth, async (req, res) => {
  try {
    const entries = await userStore.getLedger(req.user.uid, 20);
    res.json({ entries });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function serializeUser(u, authUser) {
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    credits: u.credits || 0,
    referralCode: u.referralCode,
    referredBy: u.referredBy || null,
    hasMadeFirstOrder: !!u.hasMadeFirstOrder,
    signupBonusGranted: !!u.signupBonusGranted,
    isAdmin: !!(authUser && authUser.isAdmin),
  };
}

// ── Promo codes ──────────────────────────────────────────

/**
 * User-facing redeem (Credits screen). For 'balance' codes the credit is
 * applied immediately. For 'discount' codes nothing is consumed — the
 * response is informational ("use this at checkout") and the code stays
 * redeemable when the user actually places an order with it.
 */
app.post('/promos/redeem', requireAuth, async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  try {
    const result = await promoStore.redeemPromo(code, req.user.uid, {
      expectType: 'balance',
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/admin/promos', requireAdminPass, async (req, res) => {
  try {
    const promo = await promoStore.createPromo(req.body || {}, req.user.uid);
    res.status(201).json({ promo });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/admin/promos', requireAdminPass, async (req, res) => {
  try {
    const promos = await promoStore.listPromos();
    res.json({ promos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/admin/promos/:code', requireAdminPass, async (req, res) => {
  try {
    const result = await promoStore.deactivatePromo(req.params.code);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Orders ───────────────────────────────────────────────

app.post('/orders', requireAuth, async (req, res) => {
  const {
    targetLat,
    targetLng,
    siteName,
    package: pkg,
    paymentMethod,
    discountCode,
  } = req.body || {};
  if (typeof targetLat !== 'number' || typeof targetLng !== 'number') {
    return res.status(400).json({ error: 'targetLat and targetLng required' });
  }
  if (!pkg || typeof pkg.durationSec !== 'number') {
    return res.status(400).json({ error: 'package.durationSec required' });
  }
  if (typeof pkg.price !== 'number' || pkg.price < 0) {
    return res.status(400).json({ error: 'package.price required' });
  }

  const target = { latitude: targetLat, longitude: targetLng };
  const candidate = hiveStore.nearestAvailableHive(target);
  if (!candidate) {
    const closest = hiveStore.nearestHive(target);
    if (!closest) {
      return res.status(409).json({ error: 'No hives configured — ask an admin to place one first.' });
    }
    if (closest.distanceMeters <= DELIVERY_ZONE_RADIUS_METERS) {
      const seconds = hiveStore.secondsUntilNextAvailable(closest.hive.id);
      return res.status(409).json({
        error: seconds
          ? `All drones at "${closest.hive.name}" are recharging — back in ~${seconds}s.`
          : `All drones at "${closest.hive.name}" are currently in use.`,
      });
    }
    return res.status(409).json({
      error: `Out of delivery range (${Math.round(closest.distanceMeters)} m from nearest hive).`,
    });
  }
  if (candidate.distanceMeters > DELIVERY_ZONE_RADIUS_METERS) {
    return res.status(409).json({
      error: `Out of delivery range (${Math.round(candidate.distanceMeters)} m from nearest available hive).`,
      distanceMeters: candidate.distanceMeters,
      hive: candidate.hive,
    });
  }

  // Bootstrap-on-demand so we never charge a user who somehow skipped /users/me.
  let me;
  try {
    me = await userStore.getOrCreateUser(req.user.uid, req.user.email, null);
  } catch (e) {
    return res.status(500).json({ error: `User init failed: ${e.message}` });
  }

  // Pre-allocate an order ID so the promo redemption can reference it
  // and so we can write the order doc in the same logical step.
  const orderId = orderStore.genOrderId();

  // Apply discount code if provided. Discounts are written to the
  // user's redemption record now — partial-flow rollback is acceptable
  // because the user is committing to this order.
  let promoDiscount = 0;
  let promoCode = null;
  if (discountCode) {
    try {
      // expectType makes a wrong-type code throw BEFORE the redemption is
      // consumed (a balance code stays redeemable from the Credits screen).
      const result = await promoStore.redeemPromo(
        String(discountCode).trim().toUpperCase(),
        req.user.uid,
        { orderId, expectType: 'discount' },
      );
      if (result.type === 'discount') {
        promoDiscount = result.amount;
        promoCode = result.code;
      } else {
        return res.status(400).json({
          error: `Code ${result.code} is a balance code — redeem it from the Credits screen, not at checkout.`,
        });
      }
    } catch (e) {
      return res.status(400).json({ error: `Promo failed: ${e.message}` });
    }
  }

  const subtotal = Math.max(0, round2(pkg.price - promoDiscount));
  const split = splitPayment(subtotal, me.credits || 0, !!req.user.isAdmin);

  // Spend credits BEFORE reserving the drone so a failure here doesn't
  // leave a drone in flight unpaid.
  if (split.creditsApplied > 0) {
    try {
      await userStore.spendOnOrder(req.user.uid, split.creditsApplied, orderId);
    } catch (e) {
      return res.status(400).json({ error: `Credit deduction failed: ${e.message}` });
    }
  }

  const reservation = hiveStore.reserveDrone(candidate.hive.id);
  if (!reservation) {
    // Refund the credits we just spent so we don't strand the user.
    if (split.creditsApplied > 0) {
      try {
        await userStore.adminAdjust(
          req.user.uid,
          split.creditsApplied,
          `Refund — drone unavailable for order ${orderId}`,
          'system',
        );
      } catch (_) { /* best-effort */ }
    }
    return res.status(409).json({ error: 'That hive just filled up — try again.' });
  }
  io.emit('hive:updated', reservation.hive);

  const paymentStatus = split.cardCharge > 0 ? 'awaiting_card' : 'paid';

  const order = orderStore.createOrder({
    id: orderId,
    userId: req.user.uid,
    userEmail: req.user.email,
    targetLat,
    targetLng,
    siteName,
    pkg,
    paymentMethod,
    hive: reservation.hive,
    droneId: reservation.drone.id,
    paymentStatus,
    creditsApplied: split.creditsApplied,
    cardCharge: split.cardCharge,
    promoCode,
    promoDiscount,
  });
  startDroneForOrder(order, reservation.drone.battery);

  // Fully-paid orders (admin OR full credits OR free) trigger referral immediately.
  if (paymentStatus === 'paid') {
    onPaymentSucceeded(order.id).catch((e) =>
      console.warn('[payments] onPaymentSucceeded failed:', e.message),
    );
  }

  res.status(201).json({
    orderId: order.id,
    hive: reservation.hive,
    drone: reservation.drone,
    paymentStatus,
    creditsApplied: split.creditsApplied,
    cardCharge: split.cardCharge,
    promoDiscount,
    promoCode,
    adminFree: split.adminFree,
  });
});

app.get('/orders', requireAuth, (req, res) => {
  const orders = orderStore.listOrdersForUser(req.user.uid);
  res.json({ orders });
});

app.get('/orders/:id', requireAuth, (req, res) => {
  const order = orderStore.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.userId !== req.user.uid) return res.status(403).json({ error: 'Not your order' });
  const drone = drones.get(order.id);
  res.json({ order, drone: drone ? drone.snapshot() : null });
});

/**
 * Stop-gap until Meshulam is wired. The mobile app calls this after
 * the user completes the (placeholder) payment screen. Owner-only.
 *
 * TODO: remove once /payments/webhook is verifying real Meshulam
 * signatures and the mobile app launches their SDK directly.
 */
app.post('/orders/:id/confirm-payment', requireAuth, async (req, res) => {
  const order = orderStore.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.userId !== req.user.uid) return res.status(403).json({ error: 'Not your order' });
  if (order.paymentStatus === 'paid') {
    return res.json({ ok: true, alreadyPaid: true, order });
  }
  orderStore.setPaymentStatus(order.id, 'paid');
  try {
    await onPaymentSucceeded(order.id);
  } catch (e) {
    console.warn('[payments] onPaymentSucceeded (confirm) failed:', e.message);
  }
  io.to(`order:${order.id}`).emit('order:paid', { orderId: order.id });
  res.json({ ok: true, order: orderStore.getOrder(order.id) });
});

/**
 * Abandon an order BEFORE recording starts (drone is still en-route or
 * hovering at the customer waiting for the "Start Session" tap).
 *
 * Charges a 10% cancellation fee on the amount already paid; refunds
 * the remaining 90% to the user's credit balance (regardless of original
 * payment method — for the stop-gap card flow we treat any card portion
 * as goodwill credit).
 *
 * No-ops with 409 if the drone is already recording, returning, or done.
 */
app.post('/orders/:id/abandon', requireAuth, async (req, res) => {
  const order = orderStore.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.userId !== req.user.uid) return res.status(403).json({ error: 'Not your order' });
  if (order.abandonedAt) {
    return res.status(409).json({ error: 'Order already abandoned' });
  }
  if (order.deliveredAt) {
    return res.status(409).json({ error: 'Order already delivered' });
  }

  const drone = drones.get(order.id);
  if (!drone) {
    return res.status(409).json({ error: 'No active drone for this order' });
  }
  const abandoned = drone.abandonBeforeRecording();
  if (!abandoned) {
    return res.status(409).json({
      error: 'Too late — the session has already started or the drone is on its way back.',
      status: drone.status,
    });
  }

  // Compute fee on the amount already paid. For orders where cardCharge
  // hasn't cleared yet (paymentStatus !== 'paid'), only the credit portion
  // counts as paid — the card was never captured.
  const paidTotal = order.paymentStatus === 'paid'
    ? round2((order.creditsApplied || 0) + (order.cardCharge || 0))
    : round2(order.creditsApplied || 0);

  const cancellationFee = round2(paidTotal * ABANDON_FEE_FRACTION);
  const refundAmount = round2(paidTotal - cancellationFee);

  let newBalance = null;
  if (refundAmount > 0 && !req.user.isAdmin) {
    try {
      newBalance = await userStore.adminAdjust(
        req.user.uid,
        refundAmount,
        `Refund (90%) — order ${order.id} abandoned`,
        'system',
      );
    } catch (e) {
      // The drone is already heading home; we still want to mark the order
      // abandoned so callers don't retry forever. Log and proceed.
      console.warn(`[abandon] refund failed for ${order.id}:`, e.message);
    }
  }

  orderStore.markAbandoned(order.id, { cancellationFee, refundAmount });
  io.to(`order:${order.id}`).emit('order:abandoned', {
    orderId: order.id,
    cancellationFee,
    refundAmount,
  });
  io.to('viewers').emit('order:abandoned', {
    orderId: order.id,
    cancellationFee,
    refundAmount,
  });
  res.json({
    ok: true,
    cancellationFee,
    refundAmount,
    newBalance,
    feeFraction: ABANDON_FEE_FRACTION,
  });
});

/**
 * Meshulam will POST here when a card charge clears. Scaffolded — not
 * yet wired. Verify signature when the integration lands.
 */
app.post('/payments/webhook', async (req, res) => {
  // TODO: verify Meshulam HMAC using process.env.MESHULAM_WEBHOOK_SECRET.
  const { orderId, status } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId required' });
  const order = orderStore.getOrder(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (status === 'paid') {
    orderStore.setPaymentStatus(orderId, 'paid');
    await onPaymentSucceeded(orderId);
    io.to(`order:${orderId}`).emit('order:paid', { orderId });
  } else if (status === 'failed') {
    orderStore.setPaymentStatus(orderId, 'failed');
  }
  res.json({ ok: true });
});

// Fallback to web viz.
app.get('/', (req, res, next) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// ── HTTP + Socket.IO server ──────────────────────────────
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Drone lifecycle helpers ──────────────────────────────
function startDroneForOrder(order, startBattery) {
  let released = false;
  const releaseHiveSlot = (finalBattery) => {
    if (released) return;
    released = true;
    const updated = hiveStore.releaseDrone(order.hive.id, order.droneId, finalBattery);
    if (updated) io.emit('hive:updated', updated);
  };

  const drone = new Drone({
    orderId: order.id,
    droneId: order.droneId,
    hive: order.hive,
    target: { latitude: order.targetLat, longitude: order.targetLng },
    durationSec: order.package.durationSec,
    startBattery: typeof startBattery === 'number' ? startBattery : 100,
    onState: (state) => {
      io.to(`order:${order.id}`).emit('drone:state', state);
      io.to('viewers').emit('drone:state', state);
    },
    onStatus: (payload) => {
      io.to(`order:${order.id}`).emit('order:status', payload);
      io.to('viewers').emit('order:status', payload);
    },
    onSessionProgress: (payload) => {
      io.to(`order:${order.id}`).emit('session:progress', payload);
      io.to('viewers').emit('session:progress', payload);
    },
  });
  drones.set(order.id, drone);
  drone.start();

  const watcher = setInterval(() => {
    if (drone.status === STATUS.DELIVERED) {
      clearInterval(watcher);
      const current = orderStore.getOrder(order.id);
      if (current?.abandonedAt) {
        // Abandoned order — drone flew home empty. No media, no delivery
        // event, just free up the hive slot.
        releaseHiveSlot(drone.battery);
        setTimeout(() => drones.delete(order.id), 5000);
        return;
      }
      // Real aerial imagery of the actual ordered location.
      const media = generateMedia(order);
      orderStore.markDelivered(order.id, media);
      const deliveredPayload = { orderId: order.id, media, deliveredAt: Date.now() };
      io.to(`order:${order.id}`).emit('order:delivered', deliveredPayload);
      io.to('viewers').emit('order:delivered', deliveredPayload);
      releaseHiveSlot(drone.battery);
      setTimeout(() => drones.delete(order.id), 30000);
    }
  }, 1000);
}

/**
 * Called whenever an order's paymentStatus transitions to 'paid'.
 * Idempotent — safe to call repeatedly; only the first call fires the
 * referral bonus.
 */
async function onPaymentSucceeded(orderId) {
  const order = orderStore.getOrder(orderId);
  if (!order) return;
  try {
    const result = await userStore.markFirstOrderAndPayReferrer(order.userId);
    if (result?.referrerCredited) {
      console.log(
        `[referral] order ${orderId} triggered referral bonus to ${result.referrerUid}`,
      );
    }
  } catch (e) {
    console.warn(`[payments] referral check failed for ${orderId}:`, e.message);
  }
}

// ── Charging tick — 1 Hz, broadcasts updated hives ───────
setInterval(() => {
  const changedIds = hiveStore.tickCharging(1);
  for (const id of changedIds) {
    const hive = hiveStore.getHive(id);
    if (hive) io.emit('hive:updated', hive);
  }
}, 1000);

// ── Socket.IO routing ────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('hello:viewer', () => {
    socket.join('viewers');
    socket.emit('hives:snapshot', { hives: hiveStore.listHives() });
    for (const drone of drones.values()) socket.emit('drone:state', drone.snapshot());
  });

  socket.on('order:join', ({ orderId } = {}) => {
    if (!orderId) return;
    socket.join(`order:${orderId}`);
    const drone = drones.get(orderId);
    if (drone) socket.emit('drone:state', drone.snapshot());
    const order = orderStore.getOrder(orderId);
    if (order?.media) {
      socket.emit('order:delivered', {
        orderId, media: order.media, deliveredAt: order.deliveredAt,
      });
    }
  });

  socket.on('user:location', ({ orderId, latitude, longitude } = {}) => {
    if (!orderId || typeof latitude !== 'number' || typeof longitude !== 'number') return;
    const drone = drones.get(orderId);
    if (!drone) return;
    drone.updateUserTarget({ latitude, longitude });
    io.to('viewers').emit('user:location', { orderId, latitude, longitude });
  });

  socket.on('session:start', ({ orderId } = {}) => {
    const drone = drones.get(orderId);
    if (drone) drone.startSession();
  });

  socket.on('session:end', ({ orderId } = {}) => {
    const drone = drones.get(orderId);
    if (drone) drone.endSessionEarly();
  });
});

// ── Boot ─────────────────────────────────────────────────
try {
  initFirebase();
} catch (e) {
  console.warn('[boot] Firebase Admin init failed:', e.message);
  console.warn('[boot] Auth-gated routes will return 500 until FIREBASE_PROJECT_ID is set.');
}

// Restore hives placed before the last restart (Render free tier
// restarts on deploys and idle spin-down). Never blocks boot.
hiveStore.loadPersistedHives().then((count) => {
  if (count > 0) {
    io.to('viewers').emit('hives:snapshot', { hives: hiveStore.listHives() });
  }
});

server.listen(PORT, () => {
  console.log(`[airsnap-server] listening on :${PORT}`);
  console.log(`[airsnap-server] open http://localhost:${PORT} for the live map`);
});
