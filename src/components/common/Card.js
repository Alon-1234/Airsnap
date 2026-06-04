/**
 * ============================================================
 *  AirSnap — Card
 * ============================================================
 *  A themed elevated card with rounded corners.
 *  Automatically adapts to dark / light mode via ThemeContext.
 *
 *  Props:
 *    • children  — Content to render inside the card
 *    • style     — Optional style overrides
 *    • onPress   — If provided, the card becomes tappable
 * ============================================================
 */

import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../context';
import { Spacing } from '../../theme';

export default function Card({ children, style, onPress }) {
  const { colors } = useTheme();
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container
      style={[
        styles.card,
        { backgroundColor: colors.bgCard, borderColor: colors.border },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {children}
    </Container>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.radiusLg,
    padding: Spacing.md,
    borderWidth: 1,
  },
});
