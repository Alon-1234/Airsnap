/**
 * ============================================================
 *  AirSnap simulation server
 * ============================================================
 *  Express HTTP API + Socket.IO real-time channel.
 *
 *  Routes
 *    GET  /health                       — liveness check
 *    GET  /hives                        — list all hives
 *    POST /hives                        — admin only, create
 *    DELETE /hives/:id                  — admin only, delete
 *    POST /orders                       — authed, create + start sim
 *    GET  /orders/:id                   — authed, fetch state
 *    POST /spatial/validate-geofence    — open, distance to nearest hive
 *
 *  Socket events
 *    client -> server : order:join { orderId }
 *                       user:location { orderId, latitude, longitude }
 *                       session:start { orderId }
 *                       hello:viewer                  (web viz only)
 *    server -> client : drone:state, order:status, session:progress
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
const { haversineDistanceMeters } = require('./geofence');

const PORT = Number(process.env.PORT) || 4000;
const DELIVERY_ZONE_RADIUS_METERS = 500;

// ── Express app ──────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Per-order Drone instance.
const drones = new Map(); // orderId -> Drone

// ── HTTP routes ──────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), hives: hiveStore.listHives().length, drones: drones.size });
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
    // For a brand-new hive, broadcast hive:created. For a merge (capacity++),
    // broadcast hive:updated so existing clients re-render the same marker.
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
      distanceMeters: null,
      radiusMeters: DELIVERY_ZONE_RADIUS_METERS,
      hive: null,
      message: 'No hives configured yet. Ask an admin to place one.',
    });
  }
  const inRange = nearest.distanceMeters <= DELIVERY_ZONE_RADIUS_METERS;
  const available = inRange && hiveStore.isAvailable(nearest.hive);
  res.json({
    inBounds: inRange,
    available,
    distanceMeters: nearest.distanceMeters,
    radiusMeters: DELIVERY_ZONE_RADIUS_METERS,
    hive: nearest.hive,
    message: inRange && !available
      ? `All ${nearest.hive.capacity} drone(s) at "${nearest.hive.name}" are currently in use.`
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

  // Pick the nearest hive with an available drone.
  const target = { latitude: targetLat, longitude: targetLng };
  const candidate = hiveStore.nearestAvailableHive(target);
  if (!candidate) {
    // Differentiate "no hives at all" vs "all hives at capacity".
    const closest = hiveStore.nearestHive(target);
    if (!closest) {
      return res.status(409).json({ error: 'No hives configured — ask an admin to place one first.' });
    }
    if (closest.distanceMeters <= DELIVERY_ZONE_RADIUS_METERS) {
      return res.status(409).json({
        error: `All ${closest.hive.capacity} drone(s) at "${closest.hive.name}" are currently in use. Try again in a moment.`,
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

  // Reserve a drone slot on this hive.
  const reserved = hiveStore.reserveDrone(candidate.hive.id);
  if (!reserved) {
    // Race: hive just filled up between candidate-pick and reserve.
    return res.status(409).json({ error: 'That hive just filled up — try again.' });
  }
  io.emit('hive:updated', reserved);

  const order = orderStore.createOrder({
    userId: req.user.uid,
    userEmail: req.user.email,
    targetLat, targetLng, siteName,
    pkg, paymentMethod,
    hive: reserved,
  });
  startDroneForOrder(order);
  res.status(201).json({ orderId: order.id, hive: reserved });
});

app.get('/orders/:id', requireAuth, (req, res) => {
  const order = orderStore.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
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
function startDroneForOrder(order) {
  let droneReleased = false;
  const releaseHiveSlot = () => {
    if (droneReleased) return;
    droneReleased = true;
    const updated = hiveStore.releaseDrone(order.hive.id);
    if (updated) io.emit('hive:updated', updated);
  };

  const drone = new Drone({
    orderId: order.id,
    hive: order.hive,
    target: { latitude: order.targetLat, longitude: order.targetLng },
    durationSec: order.package.durationSec,
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

  // Auto-cleanup once DELIVERED so we don't leak memory + free the hive slot.
  const watcher = setInterval(() => {
    if (drone.status === STATUS.DELIVERED) {
      clearInterval(watcher);
      releaseHiveSlot();
      // Keep the drone object around for ~30 s in case the client refetches.
      setTimeout(() => drones.delete(order.id), 30000);
    }
  }, 2000);
}

// ── Socket.IO routing ────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('hello:viewer', () => {
    socket.join('viewers');
    // Send current snapshot of everything.
    socket.emit('hives:snapshot', { hives: hiveStore.listHives() });
    for (const drone of drones.values()) socket.emit('drone:state', drone.snapshot());
  });

  socket.on('order:join', ({ orderId } = {}) => {
    if (!orderId) return;
    socket.join(`order:${orderId}`);
    const drone = drones.get(orderId);
    if (drone) socket.emit('drone:state', drone.snapshot());
  });

  socket.on('user:location', ({ orderId, latitude, longitude } = {}) => {
    if (!orderId || typeof latitude !== 'number' || typeof longitude !== 'number') return;
    const drone = drones.get(orderId);
    if (!drone) return;
    drone.updateUserTarget({ latitude, longitude });
    // Also let viewers see the user dot.
    io.to('viewers').emit('user:location', { orderId, latitude, longitude });
  });

  socket.on('session:start', ({ orderId } = {}) => {
    const drone = drones.get(orderId);
    if (drone) drone.startSession();
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
