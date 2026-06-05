/**
 * ============================================================
 *  AirSnap — Sample media for delivered orders
 * ============================================================
 *  Public CDN URLs we hand back as "the photos the drone took."
 *  All from Unsplash (royalty-free) + a handful of public Pexels
 *  video clips. pickMedia(pkg) returns a random sample sized to
 *  match the chosen package.
 * ============================================================
 */

const SAMPLE_PHOTOS = [
  // Aerial landscapes — mountains, cliffs, lakes
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=900&q=80',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=900&q=80',
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=900&q=80',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=900&q=80',
  'https://images.unsplash.com/photo-1509233725247-49e657c54213?w=900&q=80',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=900&q=80',
  'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?w=900&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&q=80',
  'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=900&q=80',
  'https://images.unsplash.com/photo-1485470733090-0aae1788d5af?w=900&q=80',
  // Coastal / ocean
  'https://images.unsplash.com/photo-1493558103817-58b2924bce98?w=900&q=80',
  'https://images.unsplash.com/photo-1542202229-7d93c33f5d07?w=900&q=80',
  'https://images.unsplash.com/photo-1501862700950-18382cd41497?w=900&q=80',
  'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=900&q=80',
  'https://images.unsplash.com/photo-1496950866446-3253e1470e8e?w=900&q=80',
  // Forests / nature
  'https://images.unsplash.com/photo-1448375240586-882707db888b?w=900&q=80',
  'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=900&q=80',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=900&q=80',
  'https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=900&q=80',
  'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=900&q=80',
  // Urban / cityscapes
  'https://images.unsplash.com/photo-1444723121867-7a241cacace9?w=900&q=80',
  'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=900&q=80',
  'https://images.unsplash.com/photo-1496564203457-11bb12075d90?w=900&q=80',
  'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=900&q=80',
  'https://images.unsplash.com/photo-1473625247510-8ceb1760943f?w=900&q=80',
  // Sunsets / golden hour
  'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=900&q=80',
  'https://images.unsplash.com/photo-1490604001847-b712b0c2f967?w=900&q=80',
  'https://images.unsplash.com/photo-1502790671504-542ad42d5189?w=900&q=80',
  'https://images.unsplash.com/photo-1505820013142-f86a3439c5b2?w=900&q=80',
  'https://images.unsplash.com/photo-1429552077091-836152271555?w=900&q=80',
  // Wider variety
  'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=900&q=80',
  'https://images.unsplash.com/photo-1417325384643-aac51acc9e5d?w=900&q=80',
  'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=900&q=80',
  'https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=900&q=80',
  'https://images.unsplash.com/photo-1495343077060-3801c41a01b8?w=900&q=80',
];

const SAMPLE_VIDEOS = [
  // Public-domain / CC0 sample MP4s on Pexels CDN
  'https://videos.pexels.com/video-files/2169307/2169307-hd_1920_1080_30fps.mp4',
  'https://videos.pexels.com/video-files/3214448/3214448-hd_1920_1080_25fps.mp4',
  'https://videos.pexels.com/video-files/857195/857195-hd_1920_1080_25fps.mp4',
  'https://videos.pexels.com/video-files/2099560/2099560-hd_1920_1080_30fps.mp4',
  'https://videos.pexels.com/video-files/4763824/4763824-hd_1920_1080_30fps.mp4',
];

function pickRandom(arr, n) {
  if (n >= arr.length) return arr.slice();
  const copy = arr.slice();
  const out = [];
  while (out.length < n && copy.length) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Pick a random media bundle sized to the chosen package.
 * pkg.photos = total photo count (10, 25, 50)
 * pkg.video  = whether to include a video
 */
function pickMedia(pkg) {
  const photoCount = Math.max(1, Math.min(50, pkg?.photos || 10));
  return {
    photos: pickRandom(SAMPLE_PHOTOS, photoCount),
    videos: pkg?.video ? pickRandom(SAMPLE_VIDEOS, 1) : [],
  };
}

module.exports = { SAMPLE_PHOTOS, SAMPLE_VIDEOS, pickMedia };
