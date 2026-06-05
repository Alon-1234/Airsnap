/**
 * In-memory order store. Orders live for the duration of one
 * flight and stay around so the client can still query final
 * state (and so /orders shows history within this server run).
 */

const orders = new Map();
let counter = 1;

function genOrderId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `ORD-${stamp}-${String(counter++).padStart(3, '0')}`;
}

function createOrder({ userId, userEmail, targetLat, targetLng, siteName, pkg, paymentMethod, hive, droneId }) {
  const id = genOrderId();
  const order = {
    id,
    userId,
    userEmail,
    targetLat,
    targetLng,
    siteName,
    package: pkg,
    paymentMethod,
    hive,
    droneId,
    media: null,                // populated when DELIVERED
    deliveredAt: null,
    createdAt: Date.now(),
  };
  orders.set(id, order);
  return order;
}

function getOrder(id) {
  return orders.get(id) || null;
}

/**
 * Stamp the order with its delivered media + timestamp.
 */
function markDelivered(id, media) {
  const order = orders.get(id);
  if (!order) return null;
  order.media = media || { photos: [], videos: [] };
  order.deliveredAt = Date.now();
  return order;
}

function listOrdersForUser(userId, { onlyDelivered = false } = {}) {
  const out = [];
  for (const order of orders.values()) {
    if (order.userId !== userId) continue;
    if (onlyDelivered && !order.deliveredAt) continue;
    out.push(order);
  }
  return out.sort((a, b) => (b.createdAt - a.createdAt));
}

function listActiveOrderIds() {
  return Array.from(orders.keys());
}

module.exports = {
  createOrder,
  getOrder,
  markDelivered,
  listOrdersForUser,
  listActiveOrderIds,
};
