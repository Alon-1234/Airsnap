/**
 * ============================================================
 *  Drone simulation engine
 * ============================================================
 *  One drone instance per order. Ticks at 30 Hz with realistic
 *  acceleration / yaw rate / cruise altitude. Broadcasts state
 *  via a callback at ~10 Hz.
 *
 *  Frame: ENU (east-north-up) meters in a local plane anchored
 *  at the drone's home hive. Converted back to lat/lng on every
 *  state broadcast.
 *
 *  State machine:
 *    PENDING (1 s)
 *      -> EN_ROUTE      (climb to cruise alt, fly to user target)
 *      -> ARRIVED       (hover at user, wait for session:start;
 *                        gives up after ARRIVED_TIMEOUT_SEC → RETURNING)
 *      -> RECORDING     (orbit 15 m around live user GPS)
 *      -> RETURNING     (back to hive)
 *      -> DELIVERED     (done, tick loop stops)
 * ============================================================
 */

const { llToEnuMeters, enuMetersToLatLng, haversineDistanceMeters } = require('./geofence');

// ── Tunable physics constants ─────────────────────────────
const TICK_HZ = 30;
const TICK_DT = 1 / TICK_HZ;
const BROADCAST_EVERY = 3;          // broadcast on every 3rd tick (10 Hz)

const MAX_H_SPEED   = 18;           // m/s (~65 km/h)
const MAX_V_SPEED   = 5;            // m/s
const MAX_H_ACCEL   = 3;            // m/s²
const MAX_V_ACCEL   = 2;            // m/s²
const MAX_YAW_RATE  = (90 * Math.PI) / 180; // 90°/s

const CRUISE_ALT    = 50;           // meters above ground
const RECORD_ALT    = 12;           // hover/orbit altitude during recording
const ORBIT_RADIUS  = 15;           // meters
const ARRIVAL_TOL_M = 3;            // close-enough threshold
const HIVE_LAND_TOL = 2;

// Give up hovering at ARRIVED if nobody taps "Start Session" (app closed,
// payment dialog cancelled…) — otherwise the drone, its 30 Hz loop and its
// hive slot are held forever.
const ARRIVED_TIMEOUT_SEC = 5 * 60;
// Ignore live-GPS fixes this far from the hive (0,0 glitches, spoofed
// coords) — they would send the drone on a flight that never ends.
const MAX_TARGET_RANGE_M = 2000;

// Speed floor used for ETA estimates while the drone is still
// accelerating (or hovering) — without it the ETA reads 0 even
// when the drone is kilometers away.
const ETA_NOMINAL_SPEED = MAX_H_SPEED * 0.8;

// Low-pass factor for the live user GPS target (per 30 Hz tick,
// ~11 s time constant). Raw phone GPS jitters by several meters;
// hovering/orbiting around the raw fix makes the drone twitch.
// Heavy smoothing keeps the hover rock-steady for a stationary
// user; a walking user is still followed within ~10 s, which
// reads as a deliberate cinematic pan during the orbit.
const TARGET_FILTER_ALPHA = 0.003;

const STATUS = {
  PENDING:    'pending',
  EN_ROUTE:   'en_route',
  ARRIVED:    'arrived',
  RECORDING:  'recording',
  RETURNING:  'returning',
  PROCESSING: 'processing',
  DELIVERED:  'delivered',
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function shortestAngle(from, to) {
  let d = to - from;
  while (d >  Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// ── Per-order drone instance ──────────────────────────────
class Drone {
  constructor({ orderId, droneId, hive, target, durationSec, startBattery, onState, onStatus, onSessionProgress }) {
    this.orderId = orderId;
    this.droneId = droneId || null;                     // hive slot id (e.g. hive_x_d1)
    this.hive = hive;                                   // { latitude, longitude }
    this.target = { ...target };                        // { latitude, longitude } raw live GPS
    this.filteredTarget = { ...target };                // low-passed copy used for hover/orbit
    this.durationSec = durationSec || 30;
    this.onState = onState || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onSessionProgress = onSessionProgress || (() => {});

    // Position in ENU meters relative to hive. Drone starts at the hive on
    // the ground.
    this.pos = { east: 0, north: 0, up: 0 };
    this.vel = { east: 0, north: 0, up: 0 };
    this.heading = 0;       // radians, 0 = north
    this.battery = typeof startBattery === 'number' ? startBattery : 100;
    this.status = STATUS.PENDING;

    // Timing
    this.pendingUntilTick = TICK_HZ * 1;  // 1 s of PENDING
    this.sessionStartTick = null;
    this.recordingEndTick = null;
    this.arrivedAtTick = null;
    this.noShow = false;                  // true if ARRIVED timed out (never recorded)
    this.orbitAngle = 0;                  // for circling around user

    this.tickCount = 0;
    this.handle = null;
    this.stopped = false;
    this._deliverTimeout = null;
  }

  // ── Public controls ──
  start() {
    if (this.handle) return;
    this.handle = setInterval(() => this._tick(), TICK_DT * 1000);
  }
  stop() {
    this.stopped = true;
    if (this._deliverTimeout) {
      clearTimeout(this._deliverTimeout);
      this._deliverTimeout = null;
    }
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }
  /** Returns true if the fix was accepted. */
  updateUserTarget({ latitude, longitude } = {}) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
    if (haversineDistanceMeters(this.hive, { latitude, longitude }) > MAX_TARGET_RANGE_M) return false;
    this.target = { latitude, longitude };
    return true;
  }
  startSession() {
    if (this.status !== STATUS.ARRIVED) return;
    this.status = STATUS.RECORDING;
    this.sessionStartTick = this.tickCount;
    this.recordingEndTick = this.tickCount + Math.round(this.durationSec * TICK_HZ);
    this._emitStatus(`Recording started (${this.durationSec}s)`);
  }

  /**
   * User tapped "End Session Early" in the mobile app.
   * Transitions RECORDING → RETURNING immediately. No-op in
   * any other state.
   */
  endSessionEarly() {
    if (this.status !== STATUS.RECORDING) return;
    this.status = STATUS.RETURNING;
    this._emitStatus('Session ended early — returning to hive');
  }

  /**
   * User abandoned the order before recording started — drone is
   * still on the way OR hovering at the customer waiting for the
   * "Start Session" tap. Forces the drone to fly home without
   * recording anything. Allowed in PENDING / EN_ROUTE / ARRIVED.
   * No-op once recording has started or the drone is heading back.
   */
  abandonBeforeRecording() {
    if (
      this.status !== STATUS.PENDING &&
      this.status !== STATUS.EN_ROUTE &&
      this.status !== STATUS.ARRIVED
    ) {
      return false;
    }
    this.status = STATUS.RETURNING;
    this._emitStatus('Order abandoned — returning to hive');
    return true;
  }

  // ── Snapshots ──
  snapshot() {
    const ll = enuMetersToLatLng(this.hive, { east: this.pos.east, north: this.pos.north });
    const horizSpeed = Math.hypot(this.vel.east, this.vel.north);
    let distanceMeters = 0;
    let etaSec = 0;
    // ETA falls back to a nominal cruise speed while the drone is slow
    // (accelerating / hovering) so it never reads 0 with distance left.
    const etaSpeed = Math.max(horizSpeed, ETA_NOMINAL_SPEED);
    if (this.status === STATUS.EN_ROUTE || this.status === STATUS.ARRIVED) {
      distanceMeters = haversineDistanceMeters({ latitude: ll.latitude, longitude: ll.longitude }, this.filteredTarget);
      etaSec = distanceMeters < ARRIVAL_TOL_M ? 0 : Math.round(distanceMeters / etaSpeed);
    } else if (this.status === STATUS.RETURNING) {
      distanceMeters = Math.hypot(this.pos.east, this.pos.north);
      etaSec = distanceMeters < HIVE_LAND_TOL ? 0 : Math.round(distanceMeters / etaSpeed);
    }
    return {
      orderId: this.orderId,
      droneId: this.droneId,
      position: { latitude: ll.latitude, longitude: ll.longitude, altitude: this.pos.up },
      heading: this.heading,
      speed: Math.hypot(horizSpeed, this.vel.up),
      battery: Math.max(0, this.battery),
      status: this.status,
      etaSec,
      distanceMeters,
      // Filtered target so map markers / camera follow the same smoothed
      // point the drone itself is flying to.
      target: { ...this.filteredTarget },
      hive: { latitude: this.hive.latitude, longitude: this.hive.longitude },
    };
  }

  // ── State helpers ──
  _emitStatus(message) {
    this.onStatus({ orderId: this.orderId, status: this.status, message });
  }

  _targetEnu(latLng, altitude) {
    const enu = llToEnuMeters(this.hive, latLng);
    return { east: enu.east, north: enu.north, up: altitude };
  }

  _moveToward(desiredPos) {
    // Horizontal: PD-ish, just clamp toward target.
    const dx = desiredPos.east  - this.pos.east;
    const dy = desiredPos.north - this.pos.north;
    const dz = desiredPos.up    - this.pos.up;
    const horizDist = Math.hypot(dx, dy);

    // Desired velocity = unit vector toward target * (gentle ramp + cap).
    // Slow as we approach so we don't overshoot.
    const slowdownDist = (MAX_H_SPEED ** 2) / (2 * MAX_H_ACCEL); // distance to stop
    const desiredHSpeed = Math.min(MAX_H_SPEED, Math.max(0, horizDist) /
      Math.max(1, slowdownDist) * MAX_H_SPEED);
    const desiredVE = horizDist > 0.01 ? (dx / horizDist) * desiredHSpeed : 0;
    const desiredVN = horizDist > 0.01 ? (dy / horizDist) * desiredHSpeed : 0;
    const desiredVU = clamp(dz, -MAX_V_SPEED, MAX_V_SPEED);

    // Apply acceleration toward desired velocity (clamped).
    this.vel.east  += clamp(desiredVE - this.vel.east,  -MAX_H_ACCEL * TICK_DT, MAX_H_ACCEL * TICK_DT);
    this.vel.north += clamp(desiredVN - this.vel.north, -MAX_H_ACCEL * TICK_DT, MAX_H_ACCEL * TICK_DT);
    this.vel.up    += clamp(desiredVU - this.vel.up,    -MAX_V_ACCEL * TICK_DT, MAX_V_ACCEL * TICK_DT);

    // Integrate.
    this.pos.east  += this.vel.east  * TICK_DT;
    this.pos.north += this.vel.north * TICK_DT;
    this.pos.up    += this.vel.up    * TICK_DT;
    if (this.pos.up < 0) { this.pos.up = 0; this.vel.up = 0; }

    // Heading slews toward velocity direction.
    const hSpeed = Math.hypot(this.vel.east, this.vel.north);
    if (hSpeed > 1) {
      const desiredHeading = Math.atan2(this.vel.east, this.vel.north); // 0 = north
      this.heading += clamp(shortestAngle(this.heading, desiredHeading),
                            -MAX_YAW_RATE * TICK_DT, MAX_YAW_RATE * TICK_DT);
    }
    return { horizDist, vertDist: Math.abs(dz) };
  }

  // ── Tick ──
  _tick() {
    this.tickCount += 1;
    this.battery = Math.max(0, this.battery - 0.05 * TICK_DT);

    // Track the live GPS target with a low-pass filter so phone GPS
    // noise doesn't make the hover/orbit point twitch.
    this.filteredTarget.latitude  += (this.target.latitude  - this.filteredTarget.latitude)  * TARGET_FILTER_ALPHA;
    this.filteredTarget.longitude += (this.target.longitude - this.filteredTarget.longitude) * TARGET_FILTER_ALPHA;

    switch (this.status) {
      case STATUS.PENDING:
        if (this.tickCount >= this.pendingUntilTick) {
          this.status = STATUS.EN_ROUTE;
          this._emitStatus('Drone dispatched');
        }
        break;

      case STATUS.EN_ROUTE: {
        // Two-phase: climb to cruise alt, then go to target; final descent.
        const targetEnu = this._targetEnu(this.filteredTarget, CRUISE_ALT);
        const horizRemaining = Math.hypot(targetEnu.east - this.pos.east, targetEnu.north - this.pos.north);

        // If we're far from target, hold cruise altitude. If close, descend to RECORD_ALT.
        const desiredAlt = horizRemaining < 30 ? RECORD_ALT : CRUISE_ALT;
        const desired = { east: targetEnu.east, north: targetEnu.north, up: desiredAlt };
        const { horizDist } = this._moveToward(desired);
        if (horizDist < ARRIVAL_TOL_M && Math.abs(this.pos.up - RECORD_ALT) < 1.5) {
          this.status = STATUS.ARRIVED;
          this.arrivedAtTick = this.tickCount;
          this._emitStatus('Drone on-site — ready to record');
        }
        break;
      }

      case STATUS.ARRIVED: {
        if (this.tickCount - this.arrivedAtTick >= ARRIVED_TIMEOUT_SEC * TICK_HZ) {
          // No-show: fly home without recording (index.js settles it like
          // an abandon — no media).
          this.noShow = true;
          this.status = STATUS.RETURNING;
          this._emitStatus('No session started — returning to hive');
          break;
        }
        // Hover at target. Once we're basically there and slow, snap and
        // hold — otherwise residual velocity makes the drone bounce around
        // the hover point forever.
        const desired = this._targetEnu(this.filteredTarget, RECORD_ALT);
        const dx = desired.east - this.pos.east;
        const dy = desired.north - this.pos.north;
        const horizDist = Math.hypot(dx, dy);
        const hSpeed = Math.hypot(this.vel.east, this.vel.north);
        if (horizDist < 0.75 && hSpeed < 0.5) {
          this.pos = { ...desired };
          this.vel = { east: 0, north: 0, up: 0 };
          break;
        }
        if (horizDist < ARRIVAL_TOL_M) {
          this.vel.east *= 0.9;
          this.vel.north *= 0.9;
        }
        this._moveToward(desired);
        break;
      }

      case STATUS.RECORDING: {
        // Orbit the user at RECORD_ALT.
        this.orbitAngle += (Math.PI * 2 / 30) * TICK_DT; // one revolution per 30 s
        const base = llToEnuMeters(this.hive, this.filteredTarget);
        const desired = {
          east:  base.east  + Math.cos(this.orbitAngle) * ORBIT_RADIUS,
          north: base.north + Math.sin(this.orbitAngle) * ORBIT_RADIUS,
          up:    RECORD_ALT,
        };
        this._moveToward(desired);

        // Session progress.
        const elapsed = (this.tickCount - this.sessionStartTick) / TICK_HZ;
        this.onSessionProgress({
          orderId: this.orderId,
          elapsedSec: Math.min(elapsed, this.durationSec),
          totalSec: this.durationSec,
          stage: 'filming',
        });

        if (this.tickCount >= this.recordingEndTick) {
          this.status = STATUS.RETURNING;
          this._emitStatus('Returning to hive');
        }
        break;
      }

      case STATUS.RETURNING: {
        // Climb to cruise, fly back to hive (0,0), descend, land.
        const horizFromHive = Math.hypot(this.pos.east, this.pos.north);
        const desiredAlt = horizFromHive < 20 ? 0 : CRUISE_ALT;
        const desired = { east: 0, north: 0, up: desiredAlt };
        const { horizDist } = this._moveToward(desired);
        if (horizDist < HIVE_LAND_TOL && this.pos.up < 0.5) {
          this.vel.east = 0; this.vel.north = 0; this.vel.up = 0;
          this.status = STATUS.PROCESSING;
          this._emitStatus('Processing footage');
          // After 2 s of "processing", mark DELIVERED. Guarded so an
          // external stop() (cleanup, abandon teardown) can't be followed
          // by a ghost "Delivered" emission.
          this._deliverTimeout = setTimeout(() => {
            this._deliverTimeout = null;
            if (this.stopped) return;
            this.status = STATUS.DELIVERED;
            this._emitStatus('Delivered');
            this.onState(this.snapshot());
            this.stop();
          }, 2000);
        }
        break;
      }

      case STATUS.PROCESSING:
      case STATUS.DELIVERED:
        // Idle — nothing to integrate.
        break;
    }

    // Broadcast state at 10 Hz.
    if (this.tickCount % BROADCAST_EVERY === 0) {
      this.onState(this.snapshot());
    }
  }
}

module.exports = { Drone, STATUS };
