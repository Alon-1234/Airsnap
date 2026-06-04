/**
 * Pure GIS helpers — ported from src/utils/geofence.js so the server can
 * compute distances without pulling in any RN/Expo modules.
 */

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (deg) => (deg * Math.PI) / 180;
const toDegrees = (rad) => (rad * 180) / Math.PI;

function haversineDistanceMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Local east-north-up offset from `origin` to `point`, in meters.
 * Flat-earth approximation — accurate within ~10 km for the simulation.
 */
function llToEnuMeters(origin, point) {
  const dLat = toRadians(point.latitude - origin.latitude);
  const dLng = toRadians(point.longitude - origin.longitude);
  const meanLat = toRadians((origin.latitude + point.latitude) / 2);
  return {
    east: EARTH_RADIUS_METERS * dLng * Math.cos(meanLat),
    north: EARTH_RADIUS_METERS * dLat,
  };
}

/**
 * Inverse of llToEnuMeters — add a local meter offset to a lat/lng.
 */
function enuMetersToLatLng(origin, { east, north }) {
  const meanLat = toRadians(origin.latitude);
  const dLat = north / EARTH_RADIUS_METERS;
  const dLng = east / (EARTH_RADIUS_METERS * Math.cos(meanLat));
  return {
    latitude: origin.latitude + toDegrees(dLat),
    longitude: origin.longitude + toDegrees(dLng),
  };
}

module.exports = {
  haversineDistanceMeters,
  llToEnuMeters,
  enuMetersToLatLng,
};
