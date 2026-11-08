/**
 * Sim server endpoints.
 *
 * Production = Render deployment (always reachable, HTTPS, WSS).
 *
 * To point the app at a server running on your laptop instead, start
 * it with the launcher in local mode (start.bat local), or set
 * EXPO_PUBLIC_API_URL=http://<laptop LAN IP>:4000 before `expo start`.
 * Expo bakes EXPO_PUBLIC_* values into the bundle at start-up.
 */

const PRODUCTION_URL = 'https://airsnap-faeg.onrender.com';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || PRODUCTION_URL).replace(/\/+$/, '');
export const SOCKET_URL = API_BASE_URL;
