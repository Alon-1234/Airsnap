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
 *    POST /spatial/validate-geofence    — open, distance to nearest hive
 *
 *  Socket events (server -> client)
 *    drone:state, order:status, session:progress,
 *    hive:created, hive:updated, hive:deleted, hives:snapshot,
 *    order:delivered, user:location
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

const { requireAuth, requireAdmin, initFirebase } = require('./auth');
const hiveStore = require('./hiveStore');
const orderStore = require('./orderStore');
const { Drone, STATUS } = require('./droneSim');
const { pickMedia } = require('./samples');

const PORT = Number(process.env.PORT) || 4000;
const DELIVERY_ZONE_RADIUS_METERS = 500;

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

app.post('/orders', requireAuth, (req, res) => {
  const { targetLat, targetLng, siteName, package: pkg, paymentMethod } = req.body || {};
  if (typeof targetLat !== 'number' || typeof targetLng !== 'number') {
    return res.status(400).json({ error: 'targetLat and targetLng required' });
  }
  if (!pkg || typeof pkg.durationSec !== 'number') {
    return res.status(400).json({ error: 'package.durationSec required' });
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

  const reservation = hiveStore.reserveDrone(candidate.hive.id);
  if (!reservation) {
    return res.status(409).json({ error: 'That hive just filled up — try again.' });
  }
  io.emit('hive:updated', reservation.hive);

  const order = orderStore.createOrder({
    userId: req.user.uid,
    userEmail: req.user.email,
    targetLat, targetLng, siteName,
    pkg, paymentMethod,
    hive: reservation.hive,
    droneId: reservation.drone.id,
  });
  startDroneForOrder(order, reservation.drone.battery);
  res.status(201).json({ orderId: order.id, hive: reservation.hive, drone: reservation.drone });
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
      // Pick the media that "the drone shot" and stamp it on the order.
      const media = pickMedia(order.package);
      orderStore.markDelivered(order.id, media);
      const deliveredPayload = { orderId: order.id, media, deliveredAt: Date.now() };
      io.to(`order:${order.id}`).emit('order:delivered', deliveredPayload);
      io.to('viewers').emit('order:delivered', deliveredPayload);
      releaseHiveSlot(drone.battery);
      setTimeout(() => drones.delete(order.id), 30000);
    }
  }, 1000);
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

server.listen(PORT, () => {
  console.log(`[airsnap-server] listening on :${PORT}`);
  console.log(`[airsnap-server] open http://localhost:${PORT} for the live map`);
});
