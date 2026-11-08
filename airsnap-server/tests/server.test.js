/**
 * End-to-end tests against a real `node index.js` child process on
 * PORT 4101 (override with TEST_PORT).
 *
 *   Suite 1 — no Firebase env at all: public routes, auth gates, static
 *             viewer, malformed JSON, socket fuzzing.
 *   Suite 2 — auth.js stubbed via tests/helpers/stubAuthPreload.js (fake
 *             tokens + in-memory Firestore) so the full order lifecycle,
 *             credits, promos, referral and abandon paths run for real.
 *
 * socket.io-client is resolved from the repo-root node_modules (the app's).
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_DIR = path.join(__dirname, '..');
const PORT = Number(process.env.TEST_PORT) || 4101;
const BASE = `http://127.0.0.1:${PORT}`;

let ioClient = null;
try {
  ioClient = require(path.join(SERVER_DIR, '..', 'node_modules', 'socket.io-client')).io;
} catch (_) { /* socket tests are skipped */ }

const STRIP_ENV = [
  'FIREBASE_PROJECT_ID', 'FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS',
  'ADMIN_EMAILS', 'ADMIN_PROMO_PASS', 'MESHULAM_WEBHOOK_SECRET', 'NODE_ENV',
  'SIGNUP_BONUS_EXPIRES', 'SIGNUP_BONUS_NIS', 'REFERRAL_BONUS_NIS',
];

function startServer({ preload, env = {} } = {}) {
  const childEnv = { ...process.env };
  for (const k of STRIP_ENV) delete childEnv[k];
  Object.assign(childEnv, { PORT: String(PORT) }, env);
  const args = preload ? ['-r', preload, 'index.js'] : ['index.js'];
  const proc = spawn(process.execPath, args, { cwd: SERVER_DIR, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = { out: '', err: '' };
  let exited = null;
  proc.stdout.on('data', (d) => { logs.out += d; });
  proc.stderr.on('data', (d) => { logs.err += d; });
  proc.on('exit', (code, signal) => { exited = { code, signal }; });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start:\n${logs.out}${logs.err}`)), 15000);
    proc.stdout.on('data', () => {
      if (logs.out.includes(`listening on :${PORT}`)) { clearTimeout(timer); resolve(); }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited (${code}):\n${logs.out}${logs.err}`));
    });
  });
  ready.catch(() => {});
  return {
    logs,
    ready,
    alive: () => exited === null,
    stop: () => new Promise((resolve) => {
      if (exited) return resolve();
      proc.once('exit', () => resolve());
      proc.kill();
    }),
  };
}

async function http(method, p, { body, raw, token, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) {
    payload = raw;
    h['Content-Type'] = h['Content-Type'] || 'application/json';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    h['Content-Type'] = 'application/json';
  }
  const res = await fetch(BASE + p, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* not JSON */ }
  return { status: res.status, json, text, type: res.headers.get('content-type') || '' };
}

function connect() {
  return new Promise((resolve, reject) => {
    const s = ioClient(BASE, { transports: ['websocket'], reconnection: false, forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

function waitEvent(socket, event, pred = () => true, ms = 15000) {
  const p = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, ms);
    function handler(payload) {
      if (!pred(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
  p.catch(() => {}); // a test that fails early must not leave an unhandled rejection
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ERROR_MARKERS = /TypeError|ReferenceError|Unhandled|unhandledRejection|uncaught/i;

// ─────────────────────────────────────────────────────────────
describe('server without Firebase credentials', () => {
  let srv;
  before(async () => {
    srv = startServer();
    await srv.ready;
    await sleep(500); // let the async hive restore attempt finish
  });
  after(async () => { await srv.stop(); });

  test('boots and logs a clear degraded-mode warning', () => {
    assert.match(srv.logs.out + srv.logs.err, /Firebase Admin init failed/);
    assert.match(srv.logs.out + srv.logs.err, /\[hives\] restore failed \(continuing in-memory\)/);
    assert.doesNotMatch(srv.logs.err, ERROR_MARKERS);
  });

  test('GET /health', async () => {
    const r = await http('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.hives, 0);
    assert.equal(r.json.drones, 0);
  });

  test('GET /hives', async () => {
    const r = await http('GET', '/hives');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { hives: [] });
  });

  test('POST /spatial/validate-geofence — valid & invalid bodies', async () => {
    const ok = await http('POST', '/spatial/validate-geofence', { body: { user: { latitude: 31.8, longitude: 35.1 } } });
    assert.equal(ok.status, 404);
    assert.equal(ok.json.inBounds, false);
    assert.equal(ok.json.hive, null);
    assert.equal(ok.json.radiusMeters, 500);
    for (const body of [{}, { user: null }, { user: { latitude: '31.8', longitude: 35.1 } }, { user: { latitude: 31.8 } }, [], 'x']) {
      const r = await http('POST', '/spatial/validate-geofence', { body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.json?.error);
    }
    const noType = await http('POST', '/spatial/validate-geofence', { raw: 'user=1', headers: { 'Content-Type': 'text/plain' } });
    assert.equal(noType.status, 400);
  });

  test('malformed JSON body → 400 JSON (no HTML stack trace)', async () => {
    const r = await http('POST', '/spatial/validate-geofence', { raw: '{"user": {' });
    assert.equal(r.status, 400);
    assert.match(r.type, /application\/json/);
    assert.ok(r.json?.error);
    assert.doesNotMatch(r.text, /at .*\.js:\d+/);
  });

  test('authed routes return 401 without a token', async () => {
    const routes = [
      ['POST', '/users/me'], ['GET', '/users/me'], ['GET', '/users/me/ledger'],
      ['POST', '/promos/redeem'], ['POST', '/orders'], ['GET', '/orders'],
      ['GET', '/orders/ORD-1'], ['POST', '/orders/ORD-1/confirm-payment'],
      ['POST', '/orders/ORD-1/abandon'], ['POST', '/hives'], ['DELETE', '/hives/h1'],
      ['POST', '/admin/promos'], ['GET', '/admin/promos'], ['DELETE', '/admin/promos/X'],
    ];
    for (const [m, p] of routes) {
      const r = await http(m, p, { body: m === 'POST' ? {} : undefined });
      assert.equal(r.status, 401, `${m} ${p}`);
      assert.ok(r.json?.error, `${m} ${p} returns JSON error`);
    }
    const malformed = await http('GET', '/orders', { headers: { Authorization: 'Basic abc' } });
    assert.equal(malformed.status, 401);
  });

  test('bogus bearer token without Firebase config → JSON error, no crash', async () => {
    const r = await http('GET', '/users/me', { token: 'not-a-real-token' });
    assert.ok(r.status === 401 || r.status === 503 || r.status === 500, `status ${r.status}`);
    assert.ok(r.json?.error);
    assert.ok(srv.alive());
  });

  test('unconfigured payments webhook is closed', async () => {
    const r = await http('POST', '/payments/webhook', { body: { orderId: 'ORD-1', status: 'paid' } });
    assert.equal(r.status, 503);
  });

  test('GET / serves the web viewer; /sim.js is served', async () => {
    const page = await http('GET', '/', { headers: { Accept: 'text/html' } });
    assert.equal(page.status, 200);
    assert.match(page.type, /text\/html/);
    assert.match(page.text, /AirSnap/);
    assert.match(page.text, /src="\/sim\.js"/);
    const js = await http('GET', '/sim.js');
    assert.equal(js.status, 200);
    assert.match(js.type, /javascript/);
    assert.match(js.text, /hello:viewer/);
    const missing = await http('GET', '/definitely-not-here');
    assert.equal(missing.status, 404);
  });

  test('socket: viewer handshake', { skip: !ioClient && 'socket.io-client not installed' }, async () => {
    const s = await connect();
    try {
      const snap = waitEvent(s, 'hives:snapshot');
      s.emit('hello:viewer');
      assert.deepEqual(await snap, { hives: [] });
    } finally { s.close(); }
  });

  test('socket: malformed payloads to every client→server event do not crash', { skip: !ioClient && 'socket.io-client not installed' }, async () => {
    const s = await connect();
    const events = ['order:join', 'user:location', 'session:start', 'session:end', 'hello:viewer', 'unknown:event'];
    const payloads = [
      undefined, null, 0, 42, -1, '', 'ORD-x', true, false, [], [null], {}, { orderId: null },
      { orderId: {} }, { orderId: [] }, { orderId: 123 }, { orderId: '__proto__' }, { orderId: 'constructor' },
      { orderId: 'ORD-x', latitude: 'a', longitude: null },
      { orderId: 'ORD-x', latitude: 1e308, longitude: -1e308 },
      { orderId: 'x'.repeat(10000) },
    ];
    try {
      for (const ev of events) {
        for (const p of payloads) s.emit(ev, p);
        s.emit(ev);                    // no payload at all
        s.emit(ev, () => {});          // ack callback only
        s.emit(ev, null, null, null);  // extra args
      }
      await sleep(500);
      assert.ok(s.connected, 'socket still connected');
    } finally { s.close(); }
    await sleep(200);
    assert.ok(srv.alive(), `server died:\n${srv.logs.err}`);
    const h = await http('GET', '/health');
    assert.equal(h.status, 200);
    assert.doesNotMatch(srv.logs.err, ERROR_MARKERS);
  });
});

// ─────────────────────────────────────────────────────────────
describe('order flow (stubbed auth + in-memory Firestore)', { skip: !ioClient && 'socket.io-client not installed' }, () => {
  const HIVE = { latitude: 31.8312, longitude: 35.1286 };
  const NEAR = { latitude: HIVE.latitude + 10 / 111195, longitude: HIVE.longitude }; // 10 m north
  const FAR = { latitude: HIVE.latitude + 0.01, longitude: HIVE.longitude };        // ~1.1 km
  const ADMIN = 'test:admin1:admin@test.com';
  const REF = 'test:ref1:ref1@test.com';
  const U1 = 'test:u1:u1@test.com';
  const U2 = 'test:u2:u2@test.com';
  const PASS = 'test-pass';

  let srv;
  let viewer;
  let hiveId;
  const viewerStates = new Map(); // orderId → last drone:state

  const order = (token, over = {}) => http('POST', '/orders', {
    token,
    body: {
      targetLat: NEAR.latitude,
      targetLng: NEAR.longitude,
      siteName: 'Test site',
      paymentMethod: 'card',
      package: { id: 'basic', durationSec: 1, photos: 3, video: true, price: 10 },
      ...over,
    },
  });
  const me = async (token) => (await http('GET', '/users/me', { token })).json.user;

  before(async () => {
    srv = startServer({
      preload: path.join(__dirname, 'helpers', 'stubAuthPreload.js'),
      env: { ADMIN_EMAILS: 'admin@test.com', ADMIN_PROMO_PASS: PASS },
    });
    await srv.ready;
    viewer = await connect();
    viewer.on('drone:state', (s) => viewerStates.set(s.orderId, s));
  });
  after(async () => {
    if (viewer) viewer.close();
    await srv.stop();
  });

  test('admin places a 3-drone hive (two merges); viewer sees it', async () => {
    assert.equal((await http('POST', '/hives', { token: U1, body: HIVE })).status, 403);
    assert.equal((await http('POST', '/hives', { token: ADMIN, body: { latitude: 'x', longitude: 1 } })).status, 400);
    assert.equal((await http('POST', '/hives', { token: ADMIN, body: { latitude: 95, longitude: 1 } })).status, 400);
    const a = await http('POST', '/hives', { token: ADMIN, body: { name: 'Test Hive', ...HIVE } });
    assert.equal(a.status, 201);
    hiveId = a.json.hive.id;
    for (let i = 0; i < 2; i++) {
      const m = await http('POST', '/hives', { token: ADMIN, body: { latitude: HIVE.latitude + 0.00005, longitude: HIVE.longitude } });
      assert.equal(m.json.merged, true);
    }
    const snap = waitEvent(viewer, 'hives:snapshot');
    viewer.emit('hello:viewer');
    const { hives } = await snap;
    assert.equal(hives.length, 1);
    assert.equal(hives[0].capacity, 3);
    assert.equal(hives[0].available, 3);
    const g = await http('POST', '/spatial/validate-geofence', { body: { user: NEAR } });
    assert.equal(g.status, 200);
    assert.equal(g.json.inBounds, true);
    assert.equal(g.json.available, true);
  });

  test('users bootstrap with signup bonus + referral link', async () => {
    const ref = (await http('POST', '/users/me', { token: REF, body: { displayName: 'Ref' } })).json.user;
    assert.equal(ref.credits, 5);
    const u1 = (await http('POST', '/users/me', { token: U1, body: { referralCode: ref.referralCode } })).json.user;
    assert.equal(u1.referredBy, 'ref1');
    assert.equal(u1.credits, 5);
    const u2 = (await http('POST', '/users/me', { token: U2, body: {} })).json.user;
    assert.equal(u2.credits, 5);
    const admin = (await http('POST', '/users/me', { token: ADMIN, body: {} })).json.user;
    assert.equal(admin.isAdmin, true);
    const ledger = await http('GET', '/users/me/ledger', { token: U1 });
    assert.equal(ledger.json.entries.length, 1);
    assert.equal(ledger.json.entries[0].type, 'signup_bonus');
  });

  test('promos: admin passcode gate, balance redeem, discount informational', async () => {
    assert.equal((await http('POST', '/admin/promos', { token: ADMIN, body: { code: 'BONUS10', type: 'balance', amount: 10 } })).status, 403);
    assert.equal((await http('POST', '/admin/promos', { token: U1, headers: { 'X-Admin-Pass': PASS }, body: {} })).status, 403);
    const c1 = await http('POST', '/admin/promos', { token: ADMIN, headers: { 'X-Admin-Pass': PASS }, body: { code: 'BONUS10', type: 'balance', amount: 10 } });
    assert.equal(c1.status, 201);
    const c2 = await http('POST', '/admin/promos', { token: ADMIN, headers: { 'X-Admin-Pass': PASS }, body: { code: 'DISC2', type: 'discount', amount: 2 } });
    assert.equal(c2.status, 201);
    const bad = await http('POST', '/admin/promos', { token: ADMIN, headers: { 'X-Admin-Pass': PASS }, body: { code: 'NEG', type: 'balance', amount: -5 } });
    assert.equal(bad.status, 400);

    const r = await http('POST', '/promos/redeem', { token: U2, body: { code: ' bonus10 ' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.newBalance, 15);
    assert.equal((await http('POST', '/promos/redeem', { token: U2, body: { code: 'BONUS10' } })).status, 400);
    const info = await http('POST', '/promos/redeem', { token: U1, body: { code: 'DISC2' } });
    assert.equal(info.json.informational, true);
    assert.equal((await http('POST', '/promos/redeem', { token: U1, body: {} })).status, 400);
    const list = await http('GET', '/admin/promos', { token: ADMIN, headers: { 'X-Admin-Pass': PASS } });
    assert.equal(list.json.promos.length, 2);
  });

  test('order validation', async () => {
    assert.equal((await order(U1, { targetLat: 'x' })).status, 400);
    assert.equal((await order(U1, { package: { price: 10 } })).status, 400);
    assert.equal((await order(U1, { package: { durationSec: 5, price: -1 } })).status, 400);
    assert.equal((await order(U1, { package: { durationSec: -5, price: 1 } })).status, 400);
    assert.equal((await order(U1, { package: { durationSec: 1e9, price: 1 } })).status, 400);
    const far = await order(U1, { targetLat: FAR.latitude, targetLng: FAR.longitude });
    assert.equal(far.status, 409);
    assert.match(far.json.error, /Out of delivery range/);
    const badPromo = await order(U1, { discountCode: 'BONUS10' });
    assert.equal(badPromo.status, 400);
    assert.match(badPromo.json.error, /Credits screen/);
    assert.equal((await me(U1)).credits, 5, 'failed attempts spent nothing');
    assert.equal((await http('GET', '/hives')).json.hives[0].available, 3, 'no drone reserved');
  });

  let orderA;
  test('order A: discount + credits + card, confirm payment pays the referrer, full delivery', async () => {
    const r = await order(U1, { discountCode: 'disc2' });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    orderA = r.json.orderId;
    assert.equal(r.json.promoDiscount, 2);
    assert.equal(r.json.creditsApplied, 5);
    assert.equal(r.json.cardCharge, 3);
    assert.equal(r.json.paymentStatus, 'awaiting_card');
    assert.equal((await me(U1)).credits, 0);
    assert.equal((await http('GET', '/hives')).json.hives[0].available, 2);
    assert.equal((await http('GET', `/orders/${orderA}`, { token: U2 })).status, 403);
    assert.equal((await http('GET', '/orders/nope', { token: U1 })).status, 404);
    assert.equal((await http('POST', `/orders/${orderA}/confirm-payment`, { token: U2 })).status, 403);

    const s = await connect();
    try {
      const firstState = waitEvent(s, 'drone:state', (st) => st.orderId === orderA);
      s.emit('order:join', { orderId: orderA });
      await firstState;

      const paid = waitEvent(s, 'order:paid', (p) => p.orderId === orderA);
      const c = await http('POST', `/orders/${orderA}/confirm-payment`, { token: U1 });
      assert.equal(c.status, 200);
      await paid;
      const again = await http('POST', `/orders/${orderA}/confirm-payment`, { token: U1 });
      assert.equal(again.json.alreadyPaid, true);
      assert.equal((await me(REF)).credits, 25, 'referrer got the ₪20 referral bonus');

      await waitEvent(s, 'order:status', (p) => p.orderId === orderA && p.status === 'arrived', 30000);
      const delivered = waitEvent(s, 'order:delivered', (p) => p.orderId === orderA, 60000);
      s.emit('session:start', { orderId: orderA });
      const d = await delivered;
      assert.equal(d.media.photos.length, 3);
      assert.equal(d.media.videos.length, 1);
    } finally { s.close(); }

    const o = (await http('GET', `/orders/${orderA}`, { token: U1 })).json;
    assert.ok(o.order.deliveredAt);
    assert.equal(o.order.paymentStatus, 'paid');
    assert.equal(viewerStates.get(orderA).status, 'delivered', 'viewer saw the final state');
    assert.equal((await http('POST', `/orders/${orderA}/abandon`, { token: U1 })).status, 409);
    const list = await http('GET', '/orders', { token: U1 });
    assert.deepEqual(list.json.orders.map((x) => x.id), [orderA]);
  });

  test('order B: abandon refunds 90%, frees the slot, delivers no media', async () => {
    const r = await order(U2, { package: { durationSec: 5, photos: 3, price: 4 } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const id = r.json.orderId;
    assert.equal(r.json.paymentStatus, 'paid');
    assert.equal(r.json.creditsApplied, 4);
    assert.equal((await me(U2)).credits, 11);

    assert.equal((await http('POST', `/orders/${id}/abandon`, { token: U1 })).status, 403);
    const s = await connect();
    try {
      s.emit('order:join', { orderId: id });
      await sleep(100);
      const ev = waitEvent(s, 'order:abandoned', (p) => p.orderId === id);
      const a = await http('POST', `/orders/${id}/abandon`, { token: U2 });
      assert.equal(a.status, 200, JSON.stringify(a.json));
      assert.equal(a.json.cancellationFee, 0.4);
      assert.equal(a.json.refundAmount, 3.6);
      assert.equal(a.json.newBalance, 14.6);
      await ev;
    } finally { s.close(); }
    assert.equal((await me(U2)).credits, 14.6);
    assert.equal((await http('POST', `/orders/${id}/abandon`, { token: U2 })).status, 409);
    const cp = await http('POST', `/orders/${id}/confirm-payment`, { token: U2 });
    assert.equal(cp.status, 409, 'cannot re-pay an abandoned order');

    // Drone flies home empty → DELIVERED state, but no media for the order.
    for (let i = 0; i < 60 && viewerStates.get(id)?.status !== 'delivered'; i++) await sleep(500);
    assert.equal(viewerStates.get(id)?.status, 'delivered');
    await sleep(1500); // watcher runs at 1 Hz
    const o = (await http('GET', `/orders/${id}`, { token: U2 })).json.order;
    assert.equal(o.media, null);
    assert.equal(o.deliveredAt, null);
    assert.ok(o.abandonedAt);
    assert.equal(o.paymentStatus, 'refunded');
    const hive = (await http('GET', '/hives')).json.hives.find((h) => h.id === hiveId);
    assert.equal(hive.drones.filter((d) => d.status === 'flying').length, 0, 'slot released');
  });

  test('order C: abandoning an UNPAID order waives the fee and restores credits', async () => {
    const start = (await me(U2)).credits; // 14.6
    const r = await order(U2, { package: { durationSec: 5, photos: 3, price: 20 } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.paymentStatus, 'awaiting_card');
    assert.equal(r.json.creditsApplied, start);
    assert.equal((await me(U2)).credits, 0);
    // User cancels the card dialog → app abandons.
    const a = await http('POST', `/orders/${r.json.orderId}/abandon`, { token: U2 });
    assert.equal(a.status, 200, JSON.stringify(a.json));
    assert.equal(a.json.cancellationFee, 0);
    assert.equal(a.json.refundAmount, start);
    assert.equal(a.json.feeFraction, 0);
    assert.equal((await me(U2)).credits, start);
    const o = (await http('GET', `/orders/${r.json.orderId}`, { token: U2 })).json.order;
    assert.equal(o.cancellationFee, 0);
    assert.equal(o.refundAmount, start);
  });

  test('admin orders are free and abandon refunds nothing', async () => {
    const r = await order(ADMIN, { package: { durationSec: 5, photos: 3, price: 39.99 } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.adminFree, true);
    assert.equal(r.json.paymentStatus, 'paid');
    assert.equal(r.json.creditsApplied, 0);
    assert.equal(r.json.cardCharge, 0);
    const a = await http('POST', `/orders/${r.json.orderId}/abandon`, { token: ADMIN });
    assert.equal(a.status, 200);
    assert.equal(a.json.refundAmount, 0);
    assert.equal((await me(ADMIN)).credits, 5);
  });

  test('payments webhook stays closed without a secret', async () => {
    const r = await http('POST', '/payments/webhook', { body: { orderId: orderA, status: 'failed' } });
    assert.equal(r.status, 503);
    const o = (await http('GET', `/orders/${orderA}`, { token: U1 })).json.order;
    assert.equal(o.paymentStatus, 'paid');
  });

  test('admin deletes the hive; server healthy, nothing logged to stderr', async () => {
    const del = waitEvent(viewer, 'hive:deleted', (p) => p.id === hiveId);
    assert.equal((await http('DELETE', `/hives/${hiveId}`, { token: ADMIN })).status, 200);
    await del;
    assert.equal((await http('DELETE', `/hives/${hiveId}`, { token: ADMIN })).status, 404);
    assert.ok(srv.alive());
    assert.doesNotMatch(srv.logs.err, ERROR_MARKERS);
  });
});
