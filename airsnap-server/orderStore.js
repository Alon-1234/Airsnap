/**
 * In-memory order store. Orders live for the duration of one flight then
 * stay around so the client can still query final state.
 */

const orders = new Map(); // id -> order

let counter = 1;

function genOrderId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `ORD-${stamp}-${String(counter++).padStart(3, '0')}`;
}

function createOrder({ userId, userEmail, targetLat, targetLng, siteName, pkg, paymentMethod, hive }) {
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
    createdAt: Date.now(),
  };
  orders.set(id, order);
  return order;
}

function getOrder(id) {
  return orders.get(id) || null;
}

function listActiveOrderIds() {
  return Array.from(orders.keys());
}

module.exports = { createOrder, getOrder, listActiveOrderIds };
