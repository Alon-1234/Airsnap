/**
 * ============================================================
 *  AirSnap — SimClient
 * ============================================================
 *  Singleton wrapper around socket.io-client + a small HTTP
 *  helper. Every authenticated request automatically carries
 *  a fresh Firebase ID token.
 *
 *  HTTP usage:
 *    await simApi.createOrder({...})
 *    await simApi.listHives()
 *    await simApi.createHive({ name, latitude, longitude })
 *    await simApi.deleteHive(id)
 *
 *  Socket usage:
 *    const sim = getSimClient();
 *    sim.connect();
 *    sim.joinOrder(orderId);
 *    const off = sim.onDroneState((state) => {...});
 *    sim.sendUserLocation(orderId, lat, lng);
 *    sim.startSession(orderId);
 *    off(); // unsubscribe
 *    sim.disconnect(); // when done with all orders
 * ============================================================
 */

import { io } from 'socket.io-client';
import { getAuth } from 'firebase/auth';

import { API_BASE_URL, SOCKET_URL } from '../config/serverConfig';

// ── HTTP helpers ─────────────────────────────────────────
async function authHeader() {
  const user = getAuth().currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch (_) {
    return {};
  }
}

async function request(method, path, body, { auth = false, headers: extraHeaders = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (auth) Object.assign(headers, await authHeader());
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { raw: text }; }
  if (!res.ok) {
    const message = payload?.error || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

export const simApi = {
  health: () => request('GET', '/health'),
  listHives: () => request('GET', '/hives'),
  createHive: (body) => request('POST', '/hives', body, { auth: true }),
  deleteHive: (id) => request('DELETE', `/hives/${encodeURIComponent(id)}`, null, { auth: true }),
  createOrder: (body) => request('POST', '/orders', body, { auth: true }),
  getOrder: (id) => request('GET', `/orders/${encodeURIComponent(id)}`, null, { auth: true }),
  listOrders: () => request('GET', '/orders', null, { auth: true }),
  validateGeofence: (coords) => request('POST', '/spatial/validate-geofence', { user: coords }),

  // ── Users & credits ────────────────────────────────────
  bootstrapMe: (body) => request('POST', '/users/me', body || {}, { auth: true }),
  getMe: () => request('GET', '/users/me', null, { auth: true }),
  getLedger: () => request('GET', '/users/me/ledger', null, { auth: true }),

  // ── Promo codes (user-facing) ──────────────────────────
  redeemPromo: (code) => request('POST', '/promos/redeem', { code }, { auth: true }),

  // ── Payment stop-gap (until Meshulam) ──────────────────
  confirmPayment: (orderId) =>
    request('POST', `/orders/${encodeURIComponent(orderId)}/confirm-payment`, null, { auth: true }),

  // ── Abandon order (drone in PENDING/EN_ROUTE/ARRIVED only) ─
  abandonOrder: (orderId) =>
    request('POST', `/orders/${encodeURIComponent(orderId)}/abandon`, null, { auth: true }),

  // ── Admin promo management ─────────────────────────────
  // adminPass is the X-Admin-Pass header value (passcode entered in the
  // mobile gate). Server enforces it independently.
  createPromo: (body, adminPass) =>
    request('POST', '/admin/promos', body, {
      auth: true,
      headers: { 'X-Admin-Pass': adminPass || '' },
    }),
  listPromos: (adminPass) =>
    request('GET', '/admin/promos', null, {
      auth: true,
      headers: { 'X-Admin-Pass': adminPass || '' },
    }),
  deactivatePromo: (code, adminPass) =>
    request('DELETE', `/admin/promos/${encodeURIComponent(code)}`, null, {
      auth: true,
      headers: { 'X-Admin-Pass': adminPass || '' },
    }),
};

// ── Singleton socket client ──────────────────────────────
let _client = null;

function createClient() {
  let socket = null;
  let connectPromise = null;
  // Order rooms this app has joined. Room membership lives on the
  // server-side connection, so after ANY reconnect (network blip,
  // Render restart) we must join again — otherwise drone:state /
  // order:delivered silently stop arriving and the screen freezes.
  const joinedOrders = new Set();
  // True once socket.io exhausted reconnectionAttempts and stopped trying.
  let gaveUp = false;

  // One long-lived socket. Listeners are attached to it directly (even
  // before it connects) so they survive a failed first connect and every
  // auto-reconnect — never replace it with a new io() instance.
  function getSocket() {
    if (!socket) {
      const s = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 800,
      });
      s.on('connect', () => {
        joinedOrders.forEach((orderId) => s.emit('order:join', { orderId }));
      });
      s.io.on('reconnect_failed', () => { gaveUp = true; });
      socket = s;
    }
    return socket;
  }

  function ensureConnected() {
    const s = getSocket();
    if (s.connected) return Promise.resolve(s);
    if (connectPromise) return connectPromise;
    const p = new Promise((resolve, reject) => {
      const cleanup = () => {
        if (connectPromise === p) connectPromise = null;
        s.off('connect', onConnect);
        s.off('connect_error', onError);
      };
      const onConnect = () => { cleanup(); resolve(s); };
      const onError = (err) => { cleanup(); reject(err); };
      s.on('connect', onConnect);
      s.on('connect_error', onError);
      // While socket.io is still (re)connecting on its own, just wait.
      // Kick a fresh attempt only if it gave up or was disconnected.
      if (gaveUp || !s.active) {
        gaveUp = false;
        s.connect();
      }
    });
    connectPromise = p;
    return p;
  }

  // Emit now if connected; otherwise socket.io buffers the packet and
  // flushes it on connect, so a slow / failed first connect (Render cold
  // start) can't drop session:start and leave the drone hovering.
  function emitBuffered(event, payload) {
    const s = getSocket();
    if (!s.connected) ensureConnected().catch(() => {});
    s.emit(event, payload);
  }

  return {
    async connect() {
      await ensureConnected();
    },
    isConnected() {
      return !!(socket && socket.connected);
    },
    disconnect() {
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
      }
      joinedOrders.clear();
    },
    async joinOrder(orderId) {
      if (!orderId) return;
      joinedOrders.add(orderId);
      const s = getSocket();
      if (s.connected) {
        s.emit('order:join', { orderId });
        return;
      }
      // The 'connect' handler joins every tracked room.
      await ensureConnected();
    },
    async sendUserLocation(orderId, latitude, longitude, accuracy) {
      emitBuffered('user:location', { orderId, latitude, longitude, accuracy });
    },
    async startSession(orderId) {
      emitBuffered('session:start', { orderId });
    },
    async endSession(orderId) {
      emitBuffered('session:end', { orderId });
    },
    onDroneState(cb)        { return _on('drone:state', cb); },
    onOrderStatus(cb)       { return _on('order:status', cb); },
    onSessionProgress(cb)   { return _on('session:progress', cb); },
    onOrderDelivered(cb)    { return _on('order:delivered', cb); },
    onHiveCreated(cb)       { return _on('hive:created', cb); },
    onHiveUpdated(cb)       { return _on('hive:updated', cb); },
    onHiveDeleted(cb)       { return _on('hive:deleted', cb); },
    onConnectionChange(cb)  {
      const offConn = _on('connect', () => cb(true));
      const offDis  = _on('disconnect', () => cb(false));
      return () => { offConn(); offDis(); };
    },
  };

  // Attach synchronously: the old version waited for ensureConnected() and
  // silently dropped the listener if the FIRST connect attempt errored,
  // even though socket.io kept reconnecting in the background.
  function _on(event, cb) {
    const s = getSocket();
    s.on(event, cb);
    return () => { s.off(event, cb); };
  }
}

export function getSimClient() {
  if (!_client) _client = createClient();
  return _client;
}
