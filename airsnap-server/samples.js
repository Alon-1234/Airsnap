/**
 * ============================================================
 *  AirSnap — Delivered media generation
 * ============================================================
 *  Photos are REAL aerial imagery of the exact ordered location,
 *  served straight from the free ESRI World Imagery tile service
 *  (no API key). We compute slippy-map tiles around the order's
 *  target coordinates at a few zoom levels with small spiral
 *  offsets so every "shot" shows a distinct view of the area.
 *
 *  Videos stay as real CC0 aerial drone clips (Pexels CDN) —
 *  one is picked deterministically per order.
 * ============================================================
 */

const SAMPLE_VIDEOS = [
  // Public-domain / CC0 sample MP4s on Pexels CDN
  'https://videos.pexels.com/video-files/2169307/2169307-hd_1920_1080_30fps.mp4',
  'https://videos.pexels.com/video-files/3214448/3214448-hd_1920_1080_25fps.mp4',
  'https://videos.pexels.com/video-files/857195/857195-hd_1920_1080_25fps.mp4',
  'https://videos.pexels.com/video-files/2099560/2099560-hd_1920_1080_30fps.mp4',
  'https://videos.pexels.com/video-files/4763824/4763824-hd_1920_1080_30fps.mp4',
];

// Zoom rotation: mostly 18 (sharp but reliably available), some 17
// (wider context) and 19 (close-up; patchy in some regions — if test
// shots come back as "no data" tiles, change the 19 to an 18).
const ZOOMS = [18, 17, 19];

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ── Web Mercator slippy-tile math ─────────────────────────
function latLngToTile(lat, lng, z) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1) };
}

// NOTE: ESRI's path order is z/y/x (row before column).
function esriTileUrl(z, y, x) {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) {
    h = (h * 31 + String(str).charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Build a media bundle of real aerial imagery around the order's
 * target location.
 *   order.targetLat / order.targetLng — where the drone shot
 *   order.package.photos — photo count (10 / 25 / 50)
 *   order.package.video  — whether to include a video
 */
function generateMedia(order) {
  const lat = Number(order?.targetLat);
  const lng = Number(order?.targetLng);
  const pkg = order?.package || {};
  const count = clamp(Math.round(pkg.photos || 10), 1, 50);

  const photos = [];
  const seen = new Set();
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const latRad = (lat * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      const zoom = ZOOMS[i % ZOOMS.length];
      // Golden-angle spiral: each shot points at a different spot
      // 40–320 m around the target, so neighboring tiles differ.
      let radiusM = 40 + (i % 5) * 70;
      const angle = i * 2.399963;
      for (let attempt = 0; attempt < 6; attempt++) {
        const dLat = (radiusM * Math.cos(angle)) / 111320;
        const dLng = (radiusM * Math.sin(angle)) / (111320 * Math.cos(latRad));
        const { x, y } = latLngToTile(lat + dLat, lng + dLng, zoom);
        const key = `${zoom}/${y}/${x}`;
        if (!seen.has(key)) {
          seen.add(key);
          photos.push(esriTileUrl(zoom, y, x));
          break;
        }
        radiusM += 90; // collision with an earlier shot — push outward
      }
    }
  }
  // Safety net: never deliver an empty photo set.
  if (photos.length === 0) {
    const { x, y } = latLngToTile(lat || 0, lng || 0, 17);
    photos.push(esriTileUrl(17, y, x));
  }

  const videos = pkg.video
    ? [SAMPLE_VIDEOS[hashString(order?.id || '') % SAMPLE_VIDEOS.length]]
    : [];

  return { photos, videos };
}

module.exports = { SAMPLE_VIDEOS, generateMedia, latLngToTile, esriTileUrl };
