/**
 * ============================================================
 *  In-memory hive store with per-drone fleet + battery/charging
 * ============================================================
 *  Each hive owns a fleet of drone slots. Every drone has its
 *  own battery and one of three statuses:
 *    'idle'      — sitting at the hive, ready to dispatch
 *    'flying'    — currently out on an order
 *    'charging'  — back at the hive, recharging
 *
 *  Placing a hive within MERGE_RADIUS_METERS of an existing one
 *  just adds a drone slot to that hive (no new marker).
 *
 *  charge() is called externally on a 1 Hz tick (see index.js
 *  startChargingTick) — it advances battery on every 'charging'
 *  drone and flips it to 'idle' when full. Returns the IDs of
 *  hives that changed so the caller can broadcast updates.
 *
 *  Persistence: hive STRUCTURE (name, location, drone count) is
 *  mirrored to the Firestore `hives` collection so hives survive
 *  server restarts (Render free tier restarts on every deploy
 *  and idle spin-down). Runtime state (battery, flying/charging)
 *  is not persisted — after a restart every drone wakes up idle
 *  at 100%. Call loadPersistedHives() once at boot.
 * ============================================================
 */

const { haversineDistanceMeters } = require('./geofence');
const { getDb } = require('./auth');

const PERSIST_COLLECTION = 'hives';

const hives = new Map();
let nextHiveId = 1;

const MERGE_RADIUS_METERS = 25;
const MIN_DEPLOY_BATTERY  = 30;   // can't dispatch a drone below this
const CHARGE_RATE_PER_SEC = 4;    // % per second  →  full in ~25 s

// ── Internal helpers ─────────────────────────────────────
function genHiveId()  { return `hive_${Date.now()}_${nextHiveId++}`; }

function makeDrone(hiveId, index) {
  return {
    id: `${hiveId}_d${index}`,
    battery: 100,
    status: 'idle',
  };
}

function computeAvailable(hive) {
  return hive.drones.filter(
    (d) => d.status === 'idle' && d.battery >= MIN_DEPLOY_BATTERY
  ).length;
}

// ── Firestore persistence (fire-and-forget) ──────────────
function persistHive(hive) {
  try {
    getDb()
      .collection(PERSIST_COLLECTION)
      .doc(hive.id)
      .set({
        id: hive.id,
        name: hive.name,
        latitude: hive.latitude,
        longitude: hive.longitude,
        droneCount: hive.drones.length,
        createdAt: hive.createdAt,
        createdBy: hive.createdBy || 'admin',
      })
      .catch((err) => console.warn('[hives] persist failed:', err.message));
  } catch (err) {
    console.warn('[hives] persist skipped:', err.message);
  }
}

function removePersistedHive(id) {
  try {
    getDb()
      .collection(PERSIST_COLLECTION)
      .doc(id)
      .delete()
      .catch((err) => console.warn('[hives] unpersist failed:', err.message));
  } catch (err) {
    console.warn('[hives] unpersist skipped:', err.message);
  }
}

/**
 * Restore hives from Firestore at boot. Drones come back idle at
 * 100% battery. Never throws — a server without Firestore creds
 * just runs in-memory like before.
 */
async function loadPersistedHives() {
  try {
    const snap = await getDb().collection(PERSIST_COLLECTION).get();
    let count = 0;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') continue;
      const id = data.id || doc.id;
      if (hives.has(id)) continue;
      const droneCount = Math.max(1, Math.min(50, Math.round(data.droneCount || 1)));
      hives.set(id, {
        id,
        name: (data.name || 'Hive').toString().slice(0, 80),
        latitude: data.latitude,
        longitude: data.longitude,
        drones: Array.from({ length: droneCount }, (_, i) => makeDrone(id, i + 1)),
        createdAt: data.createdAt || Date.now(),
        updatedAt: Date.now(),
        createdBy: data.createdBy || 'admin',
      });
      count += 1;
    }
    console.log(`[hives] restored ${count} hive(s) from Firestore`);
    return count;
  } catch (err) {
    console.warn('[hives] restore failed (continuing in-memory):', err.message);
    return 0;
  }
}

/**
 * Decorate a hive with computed fields the clients consume:
 *   capacity   — total drones
 *   available  — drones ready to dispatch right now
 *   activeDrones — backwards-compat alias for clients that
 *                  still read activeDrones (=capacity-idle).
 */
function snapshot(hive) {
  if (!hive) return null;
  const idle = hive.drones.filter((d) => d.status === 'idle').length;
  return {
    ...hive,
    capacity: hive.drones.length,
    available: computeAvailable(hive),
    activeDrones: hive.drones.length - idle,
  };
}

// ── Hive CRUD ────────────────────────────────────────────

/**
 * Create a hive at (latitude, longitude). If another hive is
 * within MERGE_RADIUS_METERS, add a drone slot to it instead.
 * Returns { hive: snapshot, merged: bool }.
 */
function createHive({ name, latitude, longitude, createdBy }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('latitude and longitude must be numbers');
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('latitude must be within ±90 and longitude within ±180');
  }

  // Merge into the NEAREST hive in range, not just the first one found.
  let nearest = null;
  let nearestDist = Infinity;
  for (const existing of hives.values()) {
    const d = haversineDistanceMeters({ latitude, longitude }, existing);
    if (d <= MERGE_RADIUS_METERS && d < nearestDist) {
      nearest = existing;
      nearestDist = d;
    }
  }
  if (nearest) {
    nearest.drones.push(makeDrone(nearest.id, nearest.drones.length + 1));
    nearest.updatedAt = Date.now();
    persistHive(nearest);
    return { hive: snapshot(nearest), merged: true };
  }

  const id = genHiveId();
  const hive = {
    id,
    name: (name || 'Unnamed Hive').toString().slice(0, 80),
    latitude,
    longitude,
    drones: [makeDrone(id, 1)],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: createdBy || 'admin',
  };
  hives.set(id, hive);
  persistHive(hive);
  return { hive: snapshot(hive), merged: false };
}

function deleteHive(id) {
  const existed = hives.delete(id);
  if (existed) removePersistedHive(id);
  return existed;
}
function getHive(id)   { return snapshot(hives.get(id)); }
function listHives()    { return Array.from(hives.values()).map(snapshot); }

// ── Reservation / release ───────────────────────────────

/**
 * Pick the highest-battery idle drone in the hive and mark it
 * 'flying'. Returns the chosen drone (with battery) or null.
 */
function reserveDrone(hiveId) {
  const hive = hives.get(hiveId);
  if (!hive) return null;
  const candidates = hive.drones
    .filter((d) => d.status === 'idle' && d.battery >= MIN_DEPLOY_BATTERY)
    .sort((a, b) => b.battery - a.battery);
  if (!candidates.length) return null;
  const chosen = candidates[0];
  chosen.status = 'flying';
  hive.updatedAt = Date.now();
  return { hive: snapshot(hive), drone: { ...chosen } };
}

/**
 * Drone returned to base. Mark it 'charging' with whatever
 * battery it landed with so the charging tick takes it the
 * rest of the way back to 100.
 */
function releaseDrone(hiveId, droneId, finalBattery = 0) {
  const hive = hives.get(hiveId);
  if (!hive) return null;
  const drone = hive.drones.find((d) => d.id === droneId);
  if (!drone) return null;
  drone.battery = Math.max(0, Math.min(100, finalBattery));
  drone.status = drone.battery >= 100 ? 'idle' : 'charging';
  hive.updatedAt = Date.now();
  return snapshot(hive);
}

/**
 * Walk every hive, advance charging drones, flip to idle when
 * full. Returns the set of hive IDs that changed.
 */
function tickCharging(dtSec = 1) {
  const changed = new Set();
  for (const hive of hives.values()) {
    for (const drone of hive.drones) {
      if (drone.status !== 'charging') continue;
      drone.battery = Math.min(100, drone.battery + CHARGE_RATE_PER_SEC * dtSec);
      if (drone.battery >= 100) {
        drone.battery = 100;
        drone.status = 'idle';
      }
      changed.add(hive.id);
    }
    if (changed.has(hive.id)) hive.updatedAt = Date.now();
  }
  return changed;
}

// ── Spatial helpers ─────────────────────────────────────

function nearestHive(coord) {
  if (!coord || !hives.size) return null;
  let best = null;
  for (const hive of hives.values()) {
    const d = haversineDistanceMeters(coord, hive);
    if (!best || d < best.distanceMeters) best = { hive: snapshot(hive), distanceMeters: d };
  }
  return best;
}

function nearestAvailableHive(coord) {
  if (!coord || !hives.size) return null;
  let best = null;
  for (const hive of hives.values()) {
    if (computeAvailable(hive) === 0) continue;
    const d = haversineDistanceMeters(coord, hive);
    if (!best || d < best.distanceMeters) best = { hive: snapshot(hive), distanceMeters: d };
  }
  return best;
}

/**
 * Estimate seconds until the soonest drone at this hive is
 * ready (lowest battery charging + time-to-full).
 */
function secondsUntilNextAvailable(hiveId) {
  const hive = hives.get(hiveId);
  if (!hive) return null;
  const charging = hive.drones.filter((d) => d.status === 'charging');
  if (!charging.length) return null;
  const nearest = charging.sort((a, b) => b.battery - a.battery)[0];
  return Math.ceil((100 - nearest.battery) / CHARGE_RATE_PER_SEC);
}

module.exports = {
  createHive,
  deleteHive,
  getHive,
  listHives,
  loadPersistedHives,
  reserveDrone,
  releaseDrone,
  tickCharging,
  nearestHive,
  nearestAvailableHive,
  secondsUntilNextAvailable,
  MERGE_RADIUS_METERS,
  MIN_DEPLOY_BATTERY,
  CHARGE_RATE_PER_SEC,
};
