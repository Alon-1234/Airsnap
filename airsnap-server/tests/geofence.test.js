const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineDistanceMeters, llToEnuMeters, enuMetersToLatLng } = require('../geofence');

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b} ±${tol}, got ${a}`);

test('haversine — zero, symmetric, 1° of latitude', () => {
  const a = { latitude: 31.8312, longitude: 35.1286 };
  const b = { latitude: 31.8355, longitude: 35.1330 };
  assert.equal(haversineDistanceMeters(a, a), 0);
  near(haversineDistanceMeters(a, b), haversineDistanceMeters(b, a), 1e-9);
  near(haversineDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }), 111194.9, 0.5);
  // Known pair used in the sim smoke test: ~620 m.
  near(haversineDistanceMeters(a, b), 620, 30);
});

test('haversine — missing input is infinitely far (never "in range")', () => {
  assert.equal(haversineDistanceMeters(null, { latitude: 0, longitude: 0 }), Infinity);
  assert.equal(haversineDistanceMeters({ latitude: 0, longitude: 0 }, undefined), Infinity);
});

test('haversine — antipodal points', () => {
  near(haversineDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }), Math.PI * 6371000, 1);
});

test('ENU — round trip within a few cm at delivery-zone scale', () => {
  const origin = { latitude: 31.8312, longitude: 35.1286 };
  for (const [e, n] of [[0, 0], [500, 0], [0, -500], [350, 350], [-420, 260]]) {
    const ll = enuMetersToLatLng(origin, { east: e, north: n });
    const back = llToEnuMeters(origin, ll);
    near(back.east, e, 0.05, 'east');
    near(back.north, n, 0.05, 'north');
    // And the flat-earth offset agrees with great-circle distance.
    near(Math.hypot(back.east, back.north), haversineDistanceMeters(origin, ll), 0.5, 'dist');
  }
});

test('ENU — east/north sign convention', () => {
  const origin = { latitude: 10, longitude: 10 };
  const p = llToEnuMeters(origin, { latitude: 10.001, longitude: 10.001 });
  assert.ok(p.east > 0 && p.north > 0);
});

test('ENU — longitude delta is wrapped across the antimeridian', () => {
  const origin = { latitude: -17.8, longitude: 179.9995 };
  const p = llToEnuMeters(origin, { latitude: -17.8, longitude: -179.9995 });
  // 0.001° of longitude at 17.8°S ≈ 106 m east — not 40,000 km west.
  near(p.east, 105.9, 1, 'east');
  near(p.east, haversineDistanceMeters(origin, { latitude: -17.8, longitude: -179.9995 }), 1, 'vs haversine');
});
