/**
 * Sim server endpoints.
 *
 * Production = Render deployment (always reachable, HTTPS, WSS).
 * For local dev with a LAN-connected phone, swap the values below
 * for `http://<laptop LAN IP>:4000`.
 */

export const API_BASE_URL = 'https://airsnap-faeg.onrender.com';
export const SOCKET_URL = API_BASE_URL;

// Legacy exports kept for backwards compatibility.
export const SERVER_IP = 'airsnap-faeg.onrender.com';
export const SERVER_PORT = 443;
