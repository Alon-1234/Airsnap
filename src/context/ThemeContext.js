/**
 * ============================================================
 *  AirSnap — ThemeContext
 * ============================================================
 *  Provides app-wide dark / light mode state.
 *
 *  Every screen and component can read the current theme via:
 *    const { colors, isDark, toggleTheme } = useTheme();
 *
 *  `colors` is the full color palette, swapped automatically
 *  depending on whether dark mode is active.
 *
 *  The user's preference is persisted in AsyncStorage so it
 *  survives app restarts.
 * ============================================================
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Storage key ───────────────────────────────────────────
const THEME_KEY = '@airsnap_theme_mode';

// ── Dark palette (original) ──────────────────────────────
const DarkColors = {
  // Brand
  primary: '#0A84FF',
  primaryDark: '#0066CC',
  primaryLight: '#4DA3FF',
  accent: '#00D4AA',
  accentDark: '#00B894',

  // Gradients
  gradientStart: '#0A84FF',
  gradientEnd: '#00D4AA',
  gradientDark: ['#0F0F1A', '#1A1A2E'],

  // Backgrounds
  bgDark: '#0F0F1A',
  bgCard: '#1A1A2E',
  bgCardLight: '#252540',
  bgInput: '#2A2A45',
  bgOverlay: 'rgba(0,0,0,0.55)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0B8',
  textMuted: '#6C6C80',
  textOnPrimary: '#FFFFFF',

  // Semantic
  success: '#34C759',
  warning: '#FFD60A',
  error: '#FF453A',
  info: '#5AC8FA',

  // Borders
  border: '#2E2E48',
  borderLight: '#3A3A55',
  divider: '#1F1F35',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  shadow: 'rgba(0, 0, 0, 0.35)',
};

// ── Light palette ────────────────────────────────────────
const LightColors = {
  // Brand (stays the same)
  primary: '#0A84FF',
  primaryDark: '#0066CC',
  primaryLight: '#4DA3FF',
  accent: '#00D4AA',
  accentDark: '#00B894',

  // Gradients
  gradientStart: '#0A84FF',
  gradientEnd: '#00D4AA',
  gradientDark: ['#E8E8F0', '#F0F0F8'],

  // Backgrounds — light, airy surfaces
  bgDark: '#F2F2F7',
  bgCard: '#FFFFFF',
  bgCardLight: '#E5E5EA',
  bgInput: '#E8E8ED',
  bgOverlay: 'rgba(0,0,0,0.30)',

  // Text — dark on light
  textPrimary: '#1C1C1E',
  textSecondary: '#636366',
  textMuted: '#AEAEB2',
  textOnPrimary: '#FFFFFF',

  // Semantic (untouched — they work on both)
  success: '#34C759',
  warning: '#FFB800',
  error: '#FF3B30',
  info: '#5AC8FA',

  // Borders
  border: '#D1D1D6',
  borderLight: '#C7C7CC',
  divider: '#E0E0E5',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  shadow: 'rgba(0, 0, 0, 0.12)',
};

// ── Context ──────────────────────────────────────────────
const ThemeContext = createContext({
  isDark: true,
  colors: DarkColors,
  toggleTheme: () => {},
});

/**
 * ThemeProvider
 * Wrap the entire app in this to give every child access
 * to the current colour palette and a toggle function.
 */
export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);

  // ── Load saved preference on mount ────────────────────
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_KEY);
        if (saved !== null) setIsDark(saved === 'dark');
      } catch {
        // First launch — default to dark
      }
    })();
  }, []);

  // ── Toggle and persist ────────────────────────────────
  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    try {
      await AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    } catch {
      // Storage write failed — app still works
    }
  };

  const colors = isDark ? DarkColors : LightColors;

  return (
    <ThemeContext.Provider value={{ isDark, colors, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * useTheme hook
 * Convenience hook to access colours + toggle from any component.
 *
 * Usage:
 *   const { colors, isDark, toggleTheme } = useTheme();
 */
export function useTheme() {
  return useContext(ThemeContext);
}
