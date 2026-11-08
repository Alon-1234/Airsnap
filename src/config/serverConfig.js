/**
 * Sim server endpoints.
 *
 * Production = Render deployment (always reachable, HTTPS, WSS).
 *
 * To point the app at a server running on your laptop instead, start
 * it with the launcher in local mode (start.bat local), or set
 * EXPO_PUBLIC_API_URL=http://<laptop LAN IP>:4000 before `expo start`.
 * Expo bakes EXPO_PUBLIC_* values into the bundle at build time.
 *
 * Special value "auto:<port>" (used by the Docker web build): talk to
 * the same machine that served the web page, on <port>. Works for
 * localhost and for other devices on the network alike.
 */

const PRODUCTION_URL = 'https://airsnap-faeg.onrender.com';

function resolveApiUrl(raw) {
  if (raw && raw.startsWith('auto')) {
    const port = raw.split(':')[1] || '4000';
    const loc = typeof window !== 'undefined' ? window.location : null;
    if (loc && loc.hostname) return `${loc.protocol}//${loc.hostname}:${port}`;
    return `http://localhost:${port}`;
  }
  return raw || PRODUCTION_URL;
}

export const API_BASE_URL = resolveApiUrl(process.env.EXPO_PUBLIC_API_URL).replace(/\/+$/, '');
export const SOCKET_URL = API_BASE_URL;
