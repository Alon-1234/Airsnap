const test = require('node:test');
const assert = require('node:assert/strict');

// Back hive persistence with the in-memory fake so we can assert on it.
const db = require('./helpers/fakeFirestore').install();
const hiveStore = require('../hiveStore');
const { haversineDistanceMeters } = require('../geofence');

const M_PER_DEG_LAT = 111194.93;
const north = (p, m) => ({ latitude: p.latitude + m / M_PER_DEG_LAT, longitude: p.longitude });
const flush = () => new Promise((r) => setImmediate(r));

let base = { latitude: 31.0, longitude: 35.0 };
// Every test gets its own patch of map so hives never merge across tests.
const freshSpot = () => {
  base = { latitude: base.latitude + 0.05, longitude: base.longitude };
  return base;
};

test('createHive — new hive gets one idle drone and is persisted', async () => {
  const spot = freshSpot();
  const { hive, merged } = hiveStore.createHive({ name: 'Alpha', ...spot, createdBy: 'a@x' });
  assert.equal(merged, false);
  assert.equal(hive.name, 'Alpha');
  assert.equal(hive.capacity, 1);
  assert.equal(hive.available, 1);
  assert.equal(hive.activeDrones, 0);
  assert.equal(hive.drones[0].status, 'idle');
  assert.equal(hive.drones[0].battery, 100);
  await flush();
  const persisted = db._docs.get(`hives/${hive.id}`);
  assert.ok(persisted, 'persisted to Firestore');
  assert.equal(persisted.droneCount, 1);
});

test('createHive — rejects non-numeric and out-of-range coordinates', () => {
  assert.throws(() => hiveStore.createHive({ latitude: '31', longitude: 35 }));
  assert.throws(() => hiveStore.createHive({ latitude: 31 }));
  assert.throws(() => hiveStore.createHive({ latitude: 91, longitude: 35 }));
  assert.throws(() => hiveStore.createHive({ latitude: 31, longitude: -181 }));
});

test('createHive — within 25 m merges (adds a drone), beyond 25 m creates a new hive', async () => {
  const spot = freshSpot();
  const a = hiveStore.createHive({ name: 'Merge', ...spot }).hive;
  const m = hiveStore.createHive({ name: 'ignored', ...north(spot, 20) });
  assert.equal(m.merged, true);
  assert.equal(m.hive.id, a.id);
  assert.equal(m.hive.capacity, 2);
  assert.equal(m.hive.name, 'Merge');
  assert.notEqual(m.hive.drones[0].id, m.hive.drones[1].id);
  await flush();
  assert.equal(db._docs.get(`hives/${a.id}`).droneCount, 2);

  const far = hiveStore.createHive({ name: 'Far', ...north(spot, 30) });
  assert.equal(far.merged, false);
  assert.notEqual(far.hive.id, a.id);
});

test('createHive — merges into the NEAREST hive when two are within range', () => {
  const spot = freshSpot();
  const h1 = hiveStore.createHive({ name: 'H1', ...spot }).hive;
  const h2 = hiveStore.createHive({ name: 'H2', ...north(spot, 30) }).hive;
  assert.notEqual(h1.id, h2.id);
  // 20 m from H1, 10 m from H2 → must join H2.
  const r = hiveStore.createHive({ name: 'x', ...north(spot, 20) });
  assert.equal(r.merged, true);
  assert.equal(r.hive.id, h2.id);
});

test('deleteHive', async () => {
  const spot = freshSpot();
  const h = hiveStore.createHive({ name: 'Del', ...spot }).hive;
  await flush();
  assert.ok(db._docs.has(`hives/${h.id}`));
  assert.equal(hiveStore.deleteHive(h.id), true);
  assert.equal(hiveStore.getHive(h.id), null);
  assert.equal(hiveStore.deleteHive(h.id), false);
  await flush();
  assert.equal(db._docs.has(`hives/${h.id}`), false);
});

test('reserve → release → charge → idle', () => {
  const spot = freshSpot();
  const h = hiveStore.createHive({ name: 'Fleet', ...spot }).hive;
  const r = hiveStore.reserveDrone(h.id);
  assert.ok(r);
  assert.equal(r.drone.status, 'flying');
  assert.equal(r.hive.available, 0);
  assert.equal(r.hive.activeDrones, 1);
  assert.equal(hiveStore.reserveDrone(h.id), null, 'only one drone');
  assert.equal(hiveStore.secondsUntilNextAvailable(h.id), null, 'nothing charging yet');

  const rel = hiveStore.releaseDrone(h.id, r.drone.id, 40);
  assert.equal(rel.drones[0].status, 'charging');
  assert.equal(rel.drones[0].battery, 40);
  assert.equal(rel.available, 0);
  assert.equal(hiveStore.secondsUntilNextAvailable(h.id), 15); // 60% at 4%/s

  let ticks = 0;
  while (hiveStore.getHive(h.id).drones[0].status === 'charging' && ticks < 100) {
    const changed = hiveStore.tickCharging(1);
    assert.ok(changed.has(h.id));
    ticks++;
  }
  assert.equal(ticks, 15);
  const after = hiveStore.getHive(h.id);
  assert.equal(after.drones[0].status, 'idle');
  assert.equal(after.drones[0].battery, 100);
  assert.equal(after.available, 1);
  assert.equal(hiveStore.tickCharging(1).has(h.id), false, 'idle drones do not report changes');
});

test('releaseDrone — clamps battery, unknown ids return null', () => {
  const spot = freshSpot();
  const h = hiveStore.createHive({ name: 'Clamp', ...spot }).hive;
  const r = hiveStore.reserveDrone(h.id);
  assert.equal(hiveStore.releaseDrone(h.id, r.drone.id, 150).drones[0].status, 'idle');
  const r2 = hiveStore.reserveDrone(h.id);
  const rel = hiveStore.releaseDrone(h.id, r2.drone.id, -5);
  assert.equal(rel.drones[0].battery, 0);
  assert.equal(rel.drones[0].status, 'charging');
  assert.equal(hiveStore.releaseDrone('nope', r2.drone.id, 50), null);
  assert.equal(hiveStore.releaseDrone(h.id, 'nope', 50), null);
  assert.equal(hiveStore.reserveDrone('nope'), null);
});

test('nearestHive / nearestAvailableHive', () => {
  const spot = freshSpot();
  const busy = hiveStore.createHive({ name: 'Busy', ...spot }).hive;
  const free = hiveStore.createHive({ name: 'Free', ...north(spot, 400) }).hive;
  hiveStore.reserveDrone(busy.id);
  const user = north(spot, 50);
  const n = hiveStore.nearestHive(user);
  assert.equal(n.hive.id, busy.id);
  assert.ok(Math.abs(n.distanceMeters - 50) < 0.5);
  const a = hiveStore.nearestAvailableHive(user);
  assert.equal(a.hive.id, free.id);
  assert.ok(Math.abs(a.distanceMeters - haversineDistanceMeters(user, free)) < 1e-6);
  assert.equal(hiveStore.nearestHive(null), null);
});

test('loadPersistedHives — restores structure, skips bad docs and existing ids', async () => {
  db._docs.set('hives/restored_1', {
    id: 'restored_1', name: 'Restored', latitude: 40, longitude: 40, droneCount: 3, createdAt: 1,
  });
  db._docs.set('hives/bad', { id: 'bad', name: 'Bad', latitude: 'x', longitude: 40 });
  const count = await hiveStore.loadPersistedHives();
  assert.ok(count >= 1);
  const h = hiveStore.getHive('restored_1');
  assert.equal(h.capacity, 3);
  assert.equal(h.available, 3);
  assert.equal(hiveStore.getHive('bad'), null);
  const again = await hiveStore.loadPersistedHives();
  assert.equal(again, 0, 'already-loaded hives are not duplicated');
});
