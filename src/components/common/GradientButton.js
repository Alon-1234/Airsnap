/**
 * ============================================================
 *  AirSnap — GradientButton
 * ============================================================
 *  A reusable primary call-to-action button with a horizontal
 *  gradient background (primary → accent).
 *
 *  Props:
 *    • title     (string)  — Button label
 *    • onPress   (func)    — Tap handler
 *    • style     (object)  — Optional wrapper overrides
 *    • disabled  (bool)    — Greyed-out state
 *    • icon      (string)  — Optional Ionicons name before label
 * ============================================================
 */

import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context';
import { Spacing } from '../../theme';

export default function GradientButton({
  title,
  onPress,
  style,
  disabled = false,
  icon,
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      style={[styles.wrapper, style]}
    >
      <LinearGradient
        colors={disabled
          ? [colors.bgCardLight, colors.bgCardLight]
          : [colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={colors.textOnPrimary}
            style={styles.icon}
          />
        )}
        <Text style={[styles.btnText, { color: colors.textOnPrimary }, disabled && { color: colors.textMuted }]}>
          {title}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Spacing.radiusMd,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: Spacing.lg,
    borderRadius: Spacing.radiusMd,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  btnText: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
});
