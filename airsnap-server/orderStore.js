/**
 * In-memory order store. Orders live for the duration of one
 * flight and stay around so the client can still query final
 * state (and so /orders shows history within this server run).
 *
 * Payment fields:
 *   paymentStatus    'awaiting_card' | 'paid' | 'failed'
 *   creditsApplied   ₪ deducted from the user's balance
 *   cardCharge       ₪ to charge the user's card (0 means fully covered)
 *   paidAt           timestamp when payment cleared
 *   promoCode        UPPERCASE code applied at order-create time (optional)
 *   promoDiscount    ₪ subtracted from the package price by that code
 */

const orders = new Map();
let counter = 1;

function genOrderId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `ORD-${stamp}-${String(counter++).padStart(3, '0')}`;
}

function createOrder({
  id,
  userId,
  userEmail,
  targetLat,
  targetLng,
  siteName,
  pkg,
  paymentMethod,
  hive,
  droneId,
  paymentStatus = 'awaiting_card',
  creditsApplied = 0,
  cardCharge = 0,
  promoCode = null,
  promoDiscount = 0,
}) {
  const orderId = id || genOrderId();
  const order = {
    id: orderId,
    userId,
    userEmail,
    targetLat,
    targetLng,
    siteName,
    package: pkg,
    paymentMethod,
    hive,
    droneId,
    paymentStatus,
    creditsApplied,
    cardCharge,
    promoCode,
    promoDiscount,
    paidAt: paymentStatus === 'paid' ? Date.now() : null,
    abandonedAt: null,
    cancellationFee: 0,
    refundAmount: 0,
    media: null,
    deliveredAt: null,
    createdAt: Date.now(),
  };
  orders.set(orderId, order);
  return order;
}

function getOrder(id) {
  return orders.get(id) || null;
}

function setPaymentStatus(id, status) {
  const order = orders.get(id);
  if (!order) return null;
  order.paymentStatus = status;
  if (status === 'paid' && !order.paidAt) order.paidAt = Date.now();
  return order;
}

function markDelivered(id, media) {
  const order = orders.get(id);
  if (!order) return null;
  order.media = media || { photos: [], videos: [] };
  order.deliveredAt = Date.now();
  return order;
}

/**
 * Marks the order as abandoned, stamping the cancellation fee + refund
 * amount that were already applied to the user's balance.
 */
function markAbandoned(id, { cancellationFee, refundAmount }) {
  const order = orders.get(id);
  if (!order) return null;
  order.abandonedAt = Date.now();
  order.cancellationFee = cancellationFee;
  order.refundAmount = refundAmount;
  order.paymentStatus = 'refunded';
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
  setPaymentStatus,
  markDelivered,
  markAbandoned,
  listOrdersForUser,
  listActiveOrderIds,
  genOrderId,
};
