/**
 * ============================================================
 *  AirSnap — App-wide Constants
 * ============================================================
 *  Static values that don't change at runtime:
 *    • Drone packages & pricing
 *    • Partner tourist sites
 *    • Payment method types
 *    • Status enums for the drone lifecycle
 *
 *  These would normally come from an API; we keep them here
 *  so every screen has a single source of truth while the
 *  backend is not yet connected.
 * ============================================================
 */

// ── Drone Photography Packages ────────────────────────────
// Each package defines what the customer is ordering.
export const PACKAGES = [
  {
    id: 'basic',
    name: 'Quick Snap',
    duration: '3 min',
    durationSec: 180,
    photos: 10,
    video: false,
    price: 9.99,
    icon: 'camera',                // Ionicons name
    description: '10 high-res aerial photos from multiple angles.',
  },
  {
    id: 'standard',
    name: 'Sky View',
    duration: '7 min',
    durationSec: 420,
    photos: 25,
    video: true,
    price: 19.99,
    icon: 'videocam',
    popular: true,                 // highlighted in the UI
    description: '25 photos + a 60-second cinematic video.',
  },
  {
    id: 'premium',
    name: 'Epic Flight',
    duration: '15 min',
    durationSec: 900,
    photos: 50,
    video: true,
    price: 39.99,
    icon: 'rocket',
    description: '50 photos, 3-minute video, 360° panorama.',
  },
];

// ── Partner Tourist Sites / Parks ──────────────────────────
// Users can pick from popular pre-mapped locations.
export const PARTNER_SITES = [
  {
    id: 'site_5',
    name: 'Har Adar',
    image: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?w=600',
    latitude: 31.8312,
    longitude: 35.1286,
    rating: 5.0,
    description: 'Our flagship local partner near the Hive at Nof Harem 135, ideal for fast dispatch and live orders.',
  },
  {
    id: 'site_1',
    name: 'Sunset Cliffs Viewpoint',
    image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600',
    latitude: 32.7190,
    longitude: -117.2555,
    rating: 4.8,
    description: 'A coastal cliff partner zone known for golden-hour drone sessions and ocean panoramas.',
  },
  {
    id: 'site_2',
    name: 'Mountain Ridge Park',
    image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600',
    latitude: 34.0522,
    longitude: -118.2437,
    rating: 4.6,
    description: 'A mountain-edge partner site optimized for wide-angle sky capture and ridge tracking.',
  },
  {
    id: 'site_3',
    name: 'Lake Mirror Gardens',
    image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600',
    latitude: 28.5494,
    longitude: -81.3725,
    rating: 4.9,
    description: 'A lakeside partner area with stable wind conditions and reflective water compositions.',
  },
  {
    id: 'site_4',
    name: 'Coastal Dunes Reserve',
    image: 'https://images.unsplash.com/photo-1509233725247-49e657c54213?w=600',
    latitude: 36.9741,
    longitude: -122.0308,
    rating: 4.7,
    description: 'A dunes partner route for smooth cinematic passes and textured landscape flyovers.',
  },
];

// ── Geospatial Delivery Constants ───────────────────────────
// Drone Hive is the operational base where autonomous drones dispatch from.
export const DRONE_HIVE = {
  latitude: 31.8312,
  longitude: 35.1286,
  name: 'Har Adar, Nof Harem 135',
};

// Radius in meters used to determine whether live ordering is possible.
export const DELIVERY_ZONE_RADIUS_METERS = 500;

// ── Payment Methods ────────────────────────────────────────
export const PAYMENT_METHODS = [
  { id: 'apple_pay', label: 'Apple Pay', icon: 'logo-apple' },
  { id: 'google_pay', label: 'Google Pay', icon: 'logo-google' },
  { id: 'credit_card', label: 'Credit Card', icon: 'card' },
  { id: 'paypal', label: 'PayPal', icon: 'logo-paypal' },
];

// ── Drone Lifecycle Statuses ──────────────────────────────
// Used by the Flight Tracking & Live Session screens.
export const DRONE_STATUS = {
  PENDING: 'pending',           // Order placed, assigning drone
  EN_ROUTE: 'en_route',         // Drone flying to user location
  ARRIVED: 'arrived',           // Drone on-site, ready to shoot
  RECORDING: 'recording',       // Actively filming / photographing
  RETURNING: 'returning',       // Session done, drone heading home
  PROCESSING: 'processing',     // Content being processed in cloud
  DELIVERED: 'delivered',       // Media delivered to user device
};

// ── Simulated Order History (mock) ─────────────────────────
export const MOCK_ORDER_HISTORY = [
  {
    id: 'ORD-20260301-001',
    date: '2026-03-01',
    site: 'Sunset Cliffs Viewpoint',
    package: 'Sky View',
    price: 19.99,
    status: 'delivered',
    thumbnails: [
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=300',
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=300',
    ],
  },
  {
    id: 'ORD-20260215-002',
    date: '2026-02-15',
    site: 'Mountain Ridge Park',
    package: 'Quick Snap',
    price: 9.99,
    status: 'delivered',
    thumbnails: [
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=300',
    ],
  },
];

// ── Gallery mock data ──────────────────────────────────────
export const MOCK_GALLERY = [
  {
    id: 'g1',
    uri: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600',
    type: 'photo',
    date: '2026-03-01',
    orderId: 'ORD-20260301-001',
  },
  {
    id: 'g2',
    uri: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600',
    type: 'photo',
    date: '2026-03-01',
    orderId: 'ORD-20260301-001',
  },
  {
    id: 'g3',
    uri: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600',
    type: 'photo',
    date: '2026-02-15',
    orderId: 'ORD-20260215-002',
  },
  {
    id: 'g4',
    uri: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600',
    type: 'photo',
    date: '2026-02-10',
    orderId: 'ORD-20260210-003',
  },
  {
    id: 'g5',
    uri: 'https://images.unsplash.com/photo-1509233725247-49e657c54213?w=600',
    type: 'photo',
    date: '2026-01-28',
    orderId: 'ORD-20260128-004',
  },
  {
    id: 'g6',
    uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600',
    type: 'photo',
    date: '2026-01-20',
    orderId: 'ORD-20260120-005',
  },
];
