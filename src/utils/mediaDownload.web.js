/**
 * ============================================================
 *  AirSnap — mediaDownload (web build)
 * ============================================================
 *  Browser version of saveMediaToDevice: there is no camera
 *  roll on the web, so the file is downloaded through the
 *  browser instead. If the host blocks cross-origin fetches,
 *  fall back to opening the media in a new tab.
 *  Native builds use mediaDownload.js.
 * ============================================================
 */

function triggerDownload(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function saveMediaToDevice(uri, type) {
  const ext = type === 'video' ? '.mp4' : '.jpg';
  const filename = `airsnap_${Date.now()}${ext}`;

  let res;
  try {
    res = await fetch(uri, { mode: 'cors' });
  } catch (_) {
    // CORS / network block — let the browser open it directly.
    window.open(uri, '_blank', 'noopener');
    return;
  }
  if (!res.ok) {
    throw new Error(`Download failed (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  triggerDownload(objectUrl, filename);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
}
