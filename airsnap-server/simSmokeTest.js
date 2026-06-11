/**
 * Headless smoke test for the drone sim glitch fixes.
 * Drives Drone._tick() directly (no timers, no server) through a full
 * flight: PENDING → EN_ROUTE → ARRIVED → RECORDING → RETURNING →
 * PROCESSING → DELIVERED, asserting on each fixed behavior.
 *
 * Run: node airsnap-server/simSmokeTest.js
 */

const { Drone, STATUS } = require('./droneSim');

const hive = { latitude: 31.8312, longitude: 35.1286 };
const target = { latitude: 31.8355, longitude: 35.1330 }; // ~640 m away

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
};

const drone = new Drone({
  orderId: 'TEST-1',
  droneId: 'test_d1',
  hive,
  target,
  durationSec: 5,
  startBattery: 100,
  onState: () => {},
  onStatus: () => {},
  onSessionProgress: () => {},
});

const tickFor = (seconds) => {
  for (let i = 0; i < seconds * 30; i++) drone._tick();
};

// 1. ETA must be > 0 right after dispatch, even at zero speed.
tickFor(1.1); // through PENDING into EN_ROUTE
let snap = drone.snapshot();
check('status EN_ROUTE after pending', snap.status === STATUS.EN_ROUTE, snap.status);
check('ETA > 0 while far + slow', snap.etaSec > 0, `etaSec=${snap.etaSec}, dist=${Math.round(snap.distanceMeters)}m`);

// 2. Fly until arrival (640 m at ~18 m/s ≈ 40 s; give 120 s max).
let arrived = false;
for (let s = 0; s < 120 && !arrived; s++) {
  tickFor(1);
  if (drone.status === STATUS.ARRIVED) arrived = true;
}
check('reaches ARRIVED', arrived, `status=${drone.status}`);

// 3. Hover stability: GPS noise on the raw target must not move the
//    drone more than a few cm per tick once settled.
tickFor(5); // settle
const settled = { ...drone.pos };
let maxDrift = 0;
for (let s = 0; s < 10; s++) {
  // simulate noisy phone GPS: ±8 m jumps every second
  drone.updateUserTarget({
    latitude: target.latitude + (Math.random() - 0.5) * 0.00015,
    longitude: target.longitude + (Math.random() - 0.5) * 0.00015,
  });
  tickFor(1);
  const d = Math.hypot(drone.pos.east - settled.east, drone.pos.north - settled.north);
  if (d > maxDrift) maxDrift = d;
}
check('hover drift under GPS noise < 3 m', maxDrift < 3, `maxDrift=${maxDrift.toFixed(2)}m`);
drone.updateUserTarget(target);

// 4. Battery never negative even on a very long mission.
drone.battery = 0.01;
tickFor(2);
check('battery clamped at 0', drone.battery === 0, `battery=${drone.battery}`);
drone.battery = 80;

// 5. Record + return + deliver via the guarded timeout.
drone.startSession();
check('RECORDING after startSession', drone.status === STATUS.RECORDING, drone.status);
tickFor(6); // 5 s session
check('RETURNING after session', drone.status === STATUS.RETURNING, drone.status);
let landed = false;
for (let s = 0; s < 120 && !landed; s++) {
  tickFor(1);
  if (drone.status === STATUS.PROCESSING) landed = true;
}
check('reaches PROCESSING (landed)', landed, `status=${drone.status}`);

setTimeout(() => {
  check('DELIVERED after processing timeout', drone.status === STATUS.DELIVERED, drone.status);

  // 6. Guarded timeout: a second drone stopped during PROCESSING must
  //    never emit DELIVERED.
  const drone2 = new Drone({
    orderId: 'TEST-2', droneId: 'test_d2', hive,
    target: { latitude: hive.latitude + 0.0004, longitude: hive.longitude },
    durationSec: 2, startBattery: 100,
    onState: () => {}, onStatus: () => {}, onSessionProgress: () => {},
  });
  const tick2 = (seconds) => { for (let i = 0; i < seconds * 30; i++) drone2._tick(); };
  tick2(1.1);
  for (let s = 0; s < 60 && drone2.status !== STATUS.ARRIVED; s++) tick2(1);
  drone2.startSession();
  tick2(3);
  for (let s = 0; s < 60 && drone2.status !== STATUS.PROCESSING; s++) tick2(1);
  check('drone2 reaches PROCESSING', drone2.status === STATUS.PROCESSING, drone2.status);
  drone2.stop(); // external stop before the 2 s deliver timer fires

  setTimeout(() => {
    check('stopped drone never flips to DELIVERED', drone2.status === STATUS.PROCESSING, drone2.status);
    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  }, 2500);
}, 2500);
