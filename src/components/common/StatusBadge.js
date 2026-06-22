/**
 * ============================================================
 *  AirSnap — StatusBadge
 * ============================================================
 *  A small coloured pill that shows the drone's current status.
 *  Colour is derived automatically from the status string.
 *
 *  Props:
 *    • status  (string) — One of DRONE_STATUS values
 *    • style   (object) — Optional overrides
 * ============================================================
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../context';
import { Spacing } from '../../theme';
import { DRONE_STATUS } from '../../constants';

// Human-readable labels
const STATUS_LABELS = {
  [DRONE_STATUS.PENDING]: 'Assigning Drone',
  [DRONE_STATUS.EN_ROUTE]: 'On the Way',
  [DRONE_STATUS.ARRIVED]: 'Arrived',
  [DRONE_STATUS.RECORDING]: 'Recording',
  [DRONE_STATUS.RETURNING]: 'Returning',
  [DRONE_STATUS.PROCESSING]: 'Processing',
  [DRONE_STATUS.DELIVERED]: 'Delivered',
  cancelled: 'Cancelled',
};

export default function StatusBadge({ status, style }) {
  const { colors } = useTheme();

  // Map each status to a colour from the current theme
  const statusColors = {
    [DRONE_STATUS.PENDING]: colors.warning,
    [DRONE_STATUS.EN_ROUTE]: colors.info,
    [DRONE_STATUS.ARRIVED]: colors.primary,
    [DRONE_STATUS.RECORDING]: colors.error,
    [DRONE_STATUS.RETURNING]: colors.info,
    [DRONE_STATUS.PROCESSING]: colors.warning,
    [DRONE_STATUS.DELIVERED]: colors.success,
    cancelled: colors.error,
  };

  const bg = statusColors[status] || colors.textMuted;
  const label = STATUS_LABELS[status] || status;

  return (
    <View style={[styles.badge, { backgroundColor: bg + '22' }, style]}>
      {/* Tiny dot indicator */}
      <View style={[styles.dot, { backgroundColor: bg }]} />
      <Text style={[styles.label, { color: bg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Spacing.radiusFull,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
});
