/**
 * ============================================================
 *  AirSnap — ProgressBar
 * ============================================================
 *  An animated horizontal progress bar used on the
 *  Live Session screen to show filming progress.
 *
 *  Props:
 *    • progress  (number 0-1) — Fraction filled
 *    • color     (string)     — Fill colour (default: primary)
 *    • style     (object)     — Wrapper overrides
 * ============================================================
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../context';
import { Spacing } from '../../theme';

export default function ProgressBar({ progress = 0, color, style }) {
  const { colors } = useTheme();
  const fillColor = color || colors.primary;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  return (
    <View style={[styles.track, { backgroundColor: colors.bgCardLight }, style]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: fillColor,
            width: `${clampedProgress * 100}%`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: Spacing.radiusFull,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Spacing.radiusFull,
  },
});
