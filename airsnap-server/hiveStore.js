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
 * ============================================================
 */

const { haversineDistanceMeters } = require('./geofence');

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
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error('latitude and longitude must be numbers');
  }

  for (const existing of hives.values()) {
    const d = haversineDistanceMeters({ latitude, longitude }, existing);
    if (d <= MERGE_RADIUS_METERS) {
      existing.drones.push(makeDrone(existing.id, existing.drones.length + 1));
      existing.updatedAt = Date.now();
      return { hive: snapshot(existing), merged: true };
    }
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
  return { hive: snapshot(hive), merged: false };
}

function deleteHive(id) { return hives.delete(id); }
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
