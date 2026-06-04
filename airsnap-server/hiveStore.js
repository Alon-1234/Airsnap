/**
 * In-memory hive store with multi-drone capacity.
 *
 * Each hive has:
 *   - capacity:     total drones it can dispatch
 *   - activeDrones: drones currently out on an order
 *
 * Placing a hive within MERGE_RADIUS_METERS of an existing one
 * increments that hive's capacity instead of creating a new marker —
 * which is what the user means by "place a couple of drones in one
 * place and it just appears as one big hive."
 */

const { haversineDistanceMeters } = require('./geofence');

const hives = new Map(); // id -> hive
let nextId = 1;

const MERGE_RADIUS_METERS = 25;   // close placements snap together

function genId() {
  return `hive_${Date.now()}_${nextId++}`;
}

/**
 * Returns { hive, merged } — merged=true means we added a drone to an
 * existing nearby hive instead of creating a new one.
 */
function createHive({ name, latitude, longitude, createdBy }) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error('latitude and longitude must be numbers');
  }

  // Merge into a nearby hive if one exists.
  for (const hive of hives.values()) {
    const d = haversineDistanceMeters({ latitude, longitude }, hive);
    if (d <= MERGE_RADIUS_METERS) {
      hive.capacity += 1;
      hive.updatedAt = Date.now();
      return { hive, merged: true };
    }
  }

  // Otherwise create a fresh hive with capacity 1.
  const id = genId();
  const hive = {
    id,
    name: (name || 'Unnamed Hive').toString().slice(0, 80),
    latitude,
    longitude,
    capacity: 1,
    activeDrones: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdBy: createdBy || 'admin',
  };
  hives.set(id, hive);
  return { hive, merged: false };
}

function deleteHive(id) {
  return hives.delete(id);
}

function getHive(id) {
  return hives.get(id) || null;
}

function listHives() {
  return Array.from(hives.values());
}

/**
 * Increment activeDrones by 1 if there is availability.
 * Returns the updated hive or null if at capacity / not found.
 */
function reserveDrone(id) {
  const h = hives.get(id);
  if (!h) return null;
  if (h.activeDrones >= h.capacity) return null;
  h.activeDrones += 1;
  h.updatedAt = Date.now();
  return h;
}

function releaseDrone(id) {
  const h = hives.get(id);
  if (!h) return null;
  h.activeDrones = Math.max(0, h.activeDrones - 1);
  h.updatedAt = Date.now();
  return h;
}

function isAvailable(h) {
  return h && h.activeDrones < h.capacity;
}

/**
 * Nearest hive to a coord, regardless of availability.
 * Returns { hive, distanceMeters } or null.
 */
function nearestHive(coord) {
  if (!coord || !hives.size) return null;
  let best = null;
  for (const hive of hives.values()) {
    const d = haversineDistanceMeters(coord, hive);
    if (!best || d < best.distanceMeters) best = { hive, distanceMeters: d };
  }
  return best;
}

/**
 * Nearest hive to a coord that has at least one available drone.
 * Returns { hive, distanceMeters } or null.
 */
function nearestAvailableHive(coord) {
  if (!coord || !hives.size) return null;
  let best = null;
  for (const hive of hives.values()) {
    if (!isAvailable(hive)) continue;
    const d = haversineDistanceMeters(coord, hive);
    if (!best || d < best.distanceMeters) best = { hive, distanceMeters: d };
  }
  return best;
}

module.exports = {
  createHive,
  deleteHive,
  getHive,
  listHives,
  reserveDrone,
  releaseDrone,
  isAvailable,
  nearestHive,
  nearestAvailableHive,
  MERGE_RADIUS_METERS,
};
