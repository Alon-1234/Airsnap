/**
 * ============================================================
 *  AirSnap — OrderHistoryScreen
 * ============================================================
 *  Shows the user's past orders with:
 *    • Order ID, date, location, package, price
 *    • Delivered status badge
 *    • Thumbnail previews of the captured content
 *
 *  Data flow:
 *    1. Reads cached orders from AsyncStorage immediately
 *    2. In parallel, asks the server for fresh orders
 *    3. Reloads on tab focus + pull-to-refresh
 *
 *  AsyncStorage cache is populated by ContentDeliveryScreen so
 *  history works offline (and surfaces even when the Render
 *  free tier is asleep for the first 20s).
 * ============================================================
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

import { ScreenWrapper, Card, StatusBadge } from '../components/common';
import { useTheme } from '../context';
import { Typography, Spacing } from '../theme';
import { simApi } from '../services/SimClient';

const ORDERS_KEY = '@airsnap_orders';

function normalizeServerOrder(o) {
  // Server shape -> view shape used by this screen.
  // An abandoned order has abandonedAt set but no deliveredAt — without
  // this check it falls through to 'processing' and looks stuck forever.
  const abandoned = !!o.abandonedAt;
  const stampMs = o.abandonedAt || o.deliveredAt || o.createdAt;
  return {
    id: o.id,
    date: new Date(stampMs).toISOString().slice(0, 10),
    site: o.siteName || o.hive?.name || 'Live Location',
    package: o.package?.name || 'Package',
    price: o.package?.price ?? 0,
    status: abandoned ? 'cancelled' : o.deliveredAt ? 'delivered' : 'processing',
    abandoned,
    cancellationFee: o.cancellationFee || 0,
    refundAmount: o.refundAmount || 0,
    thumbnails: o.media?.photos?.slice(0, 3) || [],
    media: o.media || null,
    hiveName: o.hive?.name || null,
  };
}

export default function OrderHistoryScreen({ navigation }) {
  const { colors } = useTheme();
  const [orders, setOrders] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Read cache first — instant render.
    let cached = [];
    try {
      const raw = await AsyncStorage.getItem(ORDERS_KEY);
      cached = raw ? JSON.parse(raw) : [];
    } catch (_) {}
    setOrders(cached);

    // Fetch fresh from server, merge, persist.
    try {
      const res = await simApi.listOrders();
      const fresh = (res.orders || []).map(normalizeServerOrder);
      const byId = new Map();
      // Server wins for fields it knows about; local cache fills the gaps.
      for (const o of cached) byId.set(o.id, o);
      for (const o of fresh) byId.set(o.id, { ...byId.get(o.id), ...o });
      const merged = Array.from(byId.values())
        .sort((a, b) => (b.date < a.date ? -1 : 1));
      setOrders(merged);
      await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(merged));
    } catch (_) {
      // Offline — cache stays in view.
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ── Render a single order card ─────────────────────────
  const renderOrder = ({ item }) => (
    <Card style={styles.orderCard}>
      <View style={styles.headerRow}>
        <Text style={[Typography.bodySemibold, { color: colors.textPrimary }]}>{item.id}</Text>
        <StatusBadge status={item.status} />
      </View>

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
          {item.package} — ₪{item.price.toFixed(2)}
        </Text>
      </View>

      {/* Cancellation receipt — only for abandoned orders */}
      {item.abandoned && (
        <View style={[styles.receiptBox, { borderColor: colors.error + '55', backgroundColor: colors.error + '11' }]}>
          <View style={styles.receiptRow}>
            <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>Cancellation fee (10%)</Text>
            <Text style={[Typography.bodySemibold, { color: colors.error }]}>−₪{item.cancellationFee.toFixed(2)}</Text>
          </View>
          <View style={styles.receiptRow}>
            <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>Refunded to credits</Text>
            <Text style={[Typography.bodySemibold, { color: colors.success }]}>+₪{item.refundAmount.toFixed(2)}</Text>
          </View>
          <Text style={[Typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
            Flight cancelled before recording — no footage captured.
          </Text>
        </View>
      )}

      {item.thumbnails?.length > 0 && (
        <View style={styles.thumbRow}>
          {item.thumbnails.map((uri, idx) => (
            <Image key={idx} source={{ uri }} style={styles.thumb} />
          ))}
        </View>
      )}
    </Card>
  );

  return (
    <ScreenWrapper
      title="Order History"
      onBack={() => navigation.goBack()}
      scroll={false}
    >
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={56} color={colors.textMuted} />
            <Text style={[Typography.h3, { marginTop: Spacing.md, color: colors.textPrimary }]}>
              No orders yet
            </Text>
            <Text style={[Typography.bodySmall, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
              Order a drone session from the Home tab to see it here.
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
    flexGrow: 1,
  },
  orderCard: { marginBottom: Spacing.md },
  receiptBox: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Spacing.radiusSm,
    borderWidth: 1,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
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
  detailText: { marginLeft: 8 },
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
    paddingHorizontal: Spacing.xl,
  },
});
