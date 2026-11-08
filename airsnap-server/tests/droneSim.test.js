const test = require('node:test');
const assert = require('node:assert/strict');
const { Drone, STATUS } = require('../droneSim');

const HIVE = { latitude: 31.8312, longitude: 35.1286 };
const TARGET = { latitude: 31.8355, longitude: 35.1330 }; // ~620 m

function makeDrone(over = {}) {
  const events = { status: [], state: [], progress: [] };
  const drone = new Drone({
    orderId: 'T-1',
    droneId: 'hive_t_d1',
    hive: HIVE,
    target: TARGET,
    durationSec: 5,
    startBattery: 100,
    onState: (s) => events.state.push(s),
    onStatus: (s) => events.status.push(s),
    onSessionProgress: (p) => events.progress.push(p),
    ...over,
  });
  return { drone, events };
}

// Drive the 30 Hz tick by hand until `pred` holds (or give up).
function tickUntil(drone, pred, maxSec = 300) {
  for (let i = 0; i < maxSec * 30; i++) {
    if (pred()) return true;
    drone._tick();
  }
  return pred();
}
const is = (drone, s) => () => drone.status === s;

test('full lifecycle PENDING → … → DELIVERED', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { drone, events } = makeDrone();
  assert.equal(drone.status, STATUS.PENDING);
  assert.ok(tickUntil(drone, is(drone, STATUS.EN_ROUTE), 2));
  assert.ok(tickUntil(drone, is(drone, STATUS.ARRIVED), 120), `stuck in ${drone.status}`);
  const s = drone.snapshot();
  assert.ok(s.distanceMeters < 3);
  assert.ok(Math.abs(s.position.altitude - 12) < 1.5);

  drone.startSession();
  assert.equal(drone.status, STATUS.RECORDING);
  assert.ok(tickUntil(drone, is(drone, STATUS.RETURNING), 10));
  assert.ok(events.progress.length > 0);
  const last = events.progress[events.progress.length - 1];
  assert.equal(last.totalSec, 5);
  assert.ok(last.elapsedSec <= 5);

  assert.ok(tickUntil(drone, is(drone, STATUS.PROCESSING), 120), `stuck in ${drone.status}`);
  assert.ok(Math.hypot(drone.pos.east, drone.pos.north) < 2);
  t.mock.timers.tick(2000);
  assert.equal(drone.status, STATUS.DELIVERED);
  assert.equal(events.state[events.state.length - 1].status, STATUS.DELIVERED);
  assert.deepEqual(
    [...new Set(events.status.map((e) => e.status))],
    ['en_route', 'arrived', 'recording', 'returning', 'processing', 'delivered'],
  );
  assert.ok(drone.battery > 0 && drone.battery < 100);
});

test('startSession / endSessionEarly only act in the right state', () => {
  const { drone } = makeDrone();
  drone.startSession();
  assert.equal(drone.status, STATUS.PENDING, 'startSession ignored before arrival');
  drone.endSessionEarly();
  assert.equal(drone.status, STATUS.PENDING, 'endSessionEarly ignored when not recording');
  tickUntil(drone, is(drone, STATUS.ARRIVED), 120);
  drone.startSession();
  assert.equal(drone.status, STATUS.RECORDING);
  const endTick = drone.recordingEndTick;
  drone.startSession();
  assert.equal(drone.recordingEndTick, endTick, 'second start does not extend session');
  drone.endSessionEarly();
  assert.equal(drone.status, STATUS.RETURNING);
});

for (const phase of [STATUS.PENDING, STATUS.EN_ROUTE, STATUS.ARRIVED]) {
  test(`abandon from ${phase} flies home and lands`, (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { drone } = makeDrone();
    if (phase === STATUS.EN_ROUTE) {
      tickUntil(drone, is(drone, STATUS.EN_ROUTE), 2);
      for (let i = 0; i < 15 * 30; i++) drone._tick(); // part-way there
      assert.equal(drone.status, STATUS.EN_ROUTE);
    } else if (phase === STATUS.ARRIVED) {
      tickUntil(drone, is(drone, STATUS.ARRIVED), 120);
    }
    assert.equal(drone.abandonBeforeRecording(), true);
    assert.equal(drone.status, STATUS.RETURNING);
    assert.equal(drone.abandonBeforeRecording(), false, 'second abandon is a no-op');
    assert.ok(tickUntil(drone, is(drone, STATUS.PROCESSING), 180), `stuck in ${drone.status}`);
    t.mock.timers.tick(2000);
    assert.equal(drone.status, STATUS.DELIVERED);
  });
}

test('abandon refused once recording / returning', () => {
  const { drone } = makeDrone();
  tickUntil(drone, is(drone, STATUS.ARRIVED), 120);
  drone.startSession();
  assert.equal(drone.abandonBeforeRecording(), false);
  assert.equal(drone.status, STATUS.RECORDING);
  drone.endSessionEarly();
  assert.equal(drone.abandonBeforeRecording(), false);
  assert.equal(drone.status, STATUS.RETURNING);
});

test('drone hovering at ARRIVED with no session:start eventually gives up and returns', () => {
  const { drone, events } = makeDrone();
  tickUntil(drone, is(drone, STATUS.ARRIVED), 120);
  // Nobody taps "Start Session" (app closed, payment dialog cancelled…).
  const returned = tickUntil(drone, is(drone, STATUS.RETURNING), 15 * 60);
  assert.ok(returned, 'drone hovered forever and never freed its hive slot');
  assert.equal(drone.noShow, true);
  assert.ok(events.status.some((e) => e.status === STATUS.RETURNING));
  drone.startSession();
  assert.equal(drone.status, STATUS.RETURNING, 'too late to start once it gave up');
});

test('updateUserTarget ignores garbage and far-away coordinates', () => {
  const { drone } = makeDrone();
  const before = { ...drone.target };
  for (const bad of [
    { latitude: 'x', longitude: 35 },
    { latitude: 31.8 },
    { latitude: 1e308, longitude: 1e308 },
    { latitude: 91, longitude: 35 },
    { latitude: 31.8, longitude: 200 },
    { latitude: 0, longitude: 0 },              // "null island" GPS glitch
    { latitude: 32.5, longitude: 35.1286 },     // ~75 km from the hive
  ]) {
    drone.updateUserTarget(bad);
    assert.deepEqual(drone.target, before, `accepted ${JSON.stringify(bad)}`);
  }
  const moved = { latitude: TARGET.latitude + 0.0005, longitude: TARGET.longitude };
  drone.updateUserTarget(moved);
  assert.deepEqual(drone.target, moved);
});

test('battery never goes negative and snapshot stays finite', () => {
  const { drone } = makeDrone({ startBattery: 0.001 });
  for (let i = 0; i < 90; i++) drone._tick();
  const s = drone.snapshot();
  assert.equal(s.battery, 0);
  for (const v of [s.position.latitude, s.position.longitude, s.speed, s.etaSec, s.distanceMeters]) {
    assert.ok(Number.isFinite(v));
  }
});

test('start() is idempotent and stop() clears timers', async () => {
  const { drone } = makeDrone();
  drone.start();
  const h = drone.handle;
  drone.start();
  assert.equal(drone.handle, h, 'no second interval');
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(drone.tickCount > 0);
  drone.stop();
  assert.equal(drone.handle, null);
  const n = drone.tickCount;
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(drone.tickCount, n, 'ticks stopped');
});
