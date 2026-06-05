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

async function request(method, path, body, { auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
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
};

// ── Singleton socket client ──────────────────────────────
let _client = null;

function createClient() {
  let socket = null;
  let connectPromise = null;

  function ensureConnected() {
    if (socket && socket.connected) return Promise.resolve(socket);
    if (connectPromise) return connectPromise;
    connectPromise = new Promise((resolve, reject) => {
      socket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 800,
      });
      socket.once('connect', () => {
        connectPromise = null;
        resolve(socket);
      });
      socket.once('connect_error', (err) => {
        connectPromise = null;
        reject(err);
      });
    });
    return connectPromise;
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
    },
    async joinOrder(orderId) {
      const s = await ensureConnected();
      s.emit('order:join', { orderId });
    },
    async sendUserLocation(orderId, latitude, longitude, accuracy) {
      const s = await ensureConnected();
      s.emit('user:location', { orderId, latitude, longitude, accuracy });
    },
    async startSession(orderId) {
      const s = await ensureConnected();
      s.emit('session:start', { orderId });
    },
    async endSession(orderId) {
      const s = await ensureConnected();
      s.emit('session:end', { orderId });
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

  function _on(event, cb) {
    let active = true;
    ensureConnected()
      .then((s) => {
        if (!active) return;
        s.on(event, cb);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (socket) socket.off(event, cb);
    };
  }
}

export function getSimClient() {
  if (!_client) _client = createClient();
  return _client;
}
