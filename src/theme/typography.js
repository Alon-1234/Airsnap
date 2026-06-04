/**
 * ============================================================
 *  AirSnap — Typography Scale
 * ============================================================
 *  Predefined text styles used across every screen.
 *  Import `Typography` wherever you render <Text> so that
 *  font sizes, weights, and line-heights stay consistent.
 *
 *  Usage:
 *    import Typography from '../theme/typography';
 *    <Text style={Typography.h1}>Hello</Text>
 * ============================================================
 */

import { StyleSheet } from 'react-native';
import Colors from './colors';

const Typography = StyleSheet.create({
  // ── Headings ────────────────────────────────────────────
  h1: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  h4: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  // ── Body / paragraph ───────────────────────────────────
  body: {
    fontSize: 16,
    fontWeight: '400',
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  bodySemibold: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    lineHeight: 24,
  },

  // ── Captions & labels ──────────────────────────────────
  caption: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textMuted,
    letterSpacing: 0.4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // ── Buttons ─────────────────────────────────────────────
  button: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textOnPrimary,
    textAlign: 'center',
  },
  buttonSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textOnPrimary,
    textAlign: 'center',
  },
});

export default Typography;
