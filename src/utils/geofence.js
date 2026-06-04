/**
 * ============================================================
 *  AirSnap — Geofence Utilities
 * ============================================================
 *  Pure spatial helpers used by the location/map layer.
 *
 *  Includes:
 *    • Haversine distance in meters
 *    • Circular polygon generation around a center point
 *    • Point-in-polygon test for geofence checks
 * ============================================================
 */

const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Compute geodesic distance between two WGS84 points.
 */
export function haversineDistanceMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Build a polygon approximating a circle on Earth's surface.
 */
export function buildCircularPolygon(center, radiusMeters, points = 64) {
  const lat = toRadians(center.latitude);
  const lng = toRadians(center.longitude);
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;

  const polygon = [];
  for (let i = 0; i < points; i += 1) {
    const bearing = (2 * Math.PI * i) / points;

    const pointLat = Math.asin(
      Math.sin(lat) * Math.cos(angularDistance) +
        Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const pointLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat),
        Math.cos(angularDistance) - Math.sin(lat) * Math.sin(pointLat)
      );

    polygon.push({
      latitude: toDegrees(pointLat),
      longitude: toDegrees(pointLng),
    });
  }

  return polygon;
}

/**
 * Ray-casting point in polygon test.
 */
export function isPointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersects =
      yi > point.latitude !== yj > point.latitude &&
      point.longitude < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}
