/**
 * Sim server endpoints.
 *
 * For local dev (laptop server + phone on same Wi-Fi), point at your
 * laptop's LAN IP. For production / cellular phones, deploy the server
 * to Render and use the https URL.
 *
 *   const API_BASE_URL = 'https://airsnap-sim.onrender.com';
 */

// Laptop LAN IP — update if your router assigns a new one (run `ipconfig`).
export const API_BASE_URL = 'http://192.168.68.62:4000';
export const SOCKET_URL = API_BASE_URL;

// Legacy exports kept for backwards compatibility.
export const SERVER_IP = '192.168.68.62';
export const SERVER_PORT = 4000;
