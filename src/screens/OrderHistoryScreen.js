/**
 * ============================================================
 *  AirSnap — OrderHistoryScreen
 * ============================================================
 *  Shows the user's past orders with:
 *    • Order ID, date, location, package, price
 *    • Delivered status badge
 *    • Thumbnail previews of the captured content
 *
 *  Accessed from the Profile → "Order & Invoice History" link.
 *  Data comes from MOCK_ORDER_HISTORY in constants.
 * ============================================================
 */

import React from 'react';
import { View, Text, Image, FlatList, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenWrapper, Card, StatusBadge } from '../components/common';
import { useTheme } from '../context';
import { Typography, Spacing } from '../theme';
import { MOCK_ORDER_HISTORY, DRONE_STATUS } from '../constants';

export default function OrderHistoryScreen({ navigation }) {
  const { colors } = useTheme();

  // ── Render a single order card ─────────────────────────
  const renderOrder = ({ item }) => (
    <Card style={styles.orderCard}>
      {/* Header row: order ID + status */}
      <View style={styles.headerRow}>
        <Text style={[Typography.bodySemibold, { color: colors.textPrimary }]}>{item.id}</Text>
        <StatusBadge status={item.status} />
      </View>

      {/* Details */}
      <View style={styles.detailRow}>
        <Ionicons name="calendar" size={16} color={colors.textMuted} />
        <Text style={[Typography.bodySmall, styles.detailText, { color: colors.textSecondary }]}>{item.date}</Text>
      </View>
      <View style={styles.detailRow}>
        <Ionicons name="location" size={16} color={colors.textMuted} />
        <Text style={[Typography.bodySmall, styles.detailText, { color: colors.textSecondary }]}>{item.site}</Text>
      </View>
      <View style={styles.detailRow}>
        <Ionicons name="pricetag" size={16} color={colors.textMuted} />
        <Text style={[Typography.bodySmall, styles.detailText, { color: colors.textSecondary }]}>
          {item.package} — ${item.price.toFixed(2)}
        </Text>
      </View>

      {/* Thumbnail previews */}
      {item.thumbnails.length > 0 && (
        <View style={styles.thumbRow}>
          {item.thumbnails.map((uri, idx) => (
            <Image key={idx} source={{ uri }} style={styles.thumb} />
          ))}
        </View>
      )}
    </Card>
  );

  // ── Render ─────────────────────────────────────────────
  return (
    <ScreenWrapper
      title="Order History"
      onBack={() => navigation.goBack()}
      scroll={false}
    >
      <FlatList
        data={MOCK_ORDER_HISTORY}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={56} color={colors.textMuted} />
            <Text style={[Typography.h3, { marginTop: Spacing.md, color: colors.textPrimary }]}>
              No orders yet
            </Text>
          </View>
        }
      />
    </ScreenWrapper>
  );
}

// ── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.xxl,
  },
  orderCard: {
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailText: {
    marginLeft: 8,
  },
  thumbRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
  },
  thumb: {
    width: 80,
    height: 60,
    borderRadius: Spacing.radiusSm,
    marginRight: Spacing.sm,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
});
