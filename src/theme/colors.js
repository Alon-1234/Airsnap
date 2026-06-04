/**
 * ============================================================
 *  AirSnap — Color Palette
 * ============================================================
 *  Central color definitions used throughout the entire app.
 *  Every screen and component should reference these tokens
 *  instead of hard-coding hex values so the palette can be
 *  changed in one place.
 *
 *  Naming convention:
 *    • primary / accent  — brand blues & teals
 *    • success / warning / error — semantic feedback colours
 *    • bg*   — background shades (dark → light)
 *    • text* — foreground / typography shades
 *    • border / overlay — UI chrome
 * ============================================================
 */

const Colors = {
  // ── Brand ────────────────────────────────────────────────
  primary: '#0A84FF',        // Vibrant sky-blue — main CTA colour
  primaryDark: '#0066CC',    // Pressed / active state
  primaryLight: '#4DA3FF',   // Highlights & light accents
  accent: '#00D4AA',         // Teal-green — secondary brand colour
  accentDark: '#00B894',     // Pressed teal

  // ── Gradient stops (used by LinearGradient wrappers) ─────
  gradientStart: '#0A84FF',
  gradientEnd: '#00D4AA',
  gradientDark: ['#0F0F1A', '#1A1A2E'],  // Dark card gradients

  // ── Backgrounds ──────────────────────────────────────────
  bgDark: '#0F0F1A',        // Deepest background (root screens)
  bgCard: '#1A1A2E',        // Card / surface background
  bgCardLight: '#252540',   // Elevated card (modals, popovers)
  bgInput: '#2A2A45',       // Text input background
  bgOverlay: 'rgba(0,0,0,0.55)',  // Modal overlay

  // ── Text ─────────────────────────────────────────────────
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0B8',
  textMuted: '#6C6C80',
  textOnPrimary: '#FFFFFF',  // Text sitting on primary-coloured bg

  // ── Semantic ─────────────────────────────────────────────
  success: '#34C759',
  warning: '#FFD60A',
  error: '#FF453A',
  info: '#5AC8FA',

  // ── Borders & dividers ──────────────────────────────────
  border: '#2E2E48',
  borderLight: '#3A3A55',
  divider: '#1F1F35',

  // ── Misc  ────────────────────────────────────────────────
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  shadow: 'rgba(0, 0, 0, 0.35)',
};

export default Colors;
