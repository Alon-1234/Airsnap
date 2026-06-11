/**
 * ============================================================
 *  AirSnap — ContentDeliveryScreen
 * ============================================================
 *  Ending notification screen. Shown after the drone session
 *  finishes (or the user ends early).
 *
 *  Flow:
 *    1. "Processing…" spinner phase until we have media
 *    2. "Content Delivered!" with real thumbnails from the server
 *    3. Persists the order + photos to AsyncStorage so Gallery
 *       and OrderHistory show the new content immediately
 *    4. CTAs: View Gallery, Back to Home
 *
 *  Route params received:
 *    • orderId, package, siteName, hive, media
 *    (media may be null at navigation time and arrives via the
 *     order:delivered socket event or a server GET fallback)
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Image,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ScreenWrapper, GradientButton, Card } from '../components/common';
import MediaViewerModal from '../components/MediaViewerModal';
import { useTheme } from '../context';
import { Typography, Spacing } from '../theme';
import { simApi, getSimClient } from '../services/SimClient';

const ORDERS_KEY  = '@airsnap_orders';
const GALLERY_KEY = '@airsnap_gallery';

async function persistDelivery({ orderId, pkg, siteName, hive, media }) {
  if (!orderId || !media) return;
  try {
    const ordersRaw = await AsyncStorage.getItem(ORDERS_KEY);
    const orders = ordersRaw ? JSON.parse(ordersRaw) : [];
    if (!orders.some((o) => o.id === orderId)) {
      orders.unshift({
        id: orderId,
        date: new Date().toISOString().slice(0, 10),
        site: siteName || hive?.name || 'Live Location',
        package: pkg.name,
        price: pkg.price,
        status: 'delivered',
        thumbnails: media.photos.slice(0, 3),
        media,
        hiveName: hive?.name || null,
      });
      await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
    }

    const galleryRaw = await AsyncStorage.getItem(GALLERY_KEY);
    const gallery = galleryRaw ? JSON.parse(galleryRaw) : [];
    const date = new Date().toISOString().slice(0, 10);
    const newItems = [
      ...media.photos.map((uri, i) => ({
        id: `${orderId}_p${i}`,
        uri, type: 'photo', date, orderId,
      })),
      ...(media.videos || []).map((uri, i) => ({
        id: `${orderId}_v${i}`,
        uri, type: 'video', date, orderId,
      })),
    ];
    const existingIds = new Set(gallery.map((g) => g.id));
    const merged = [
      ...newItems.filter((i) => !existingIds.has(i.id)),
      ...gallery,
    ];
    await AsyncStorage.setItem(GALLERY_KEY, JSON.stringify(merged));
  } catch (err) {
    console.log('[delivery] persist error:', err.message);
  }
}

export default function ContentDeliveryScreen({ navigation, route }) {
  const { orderId, package: pkg, siteName, hive, media: initialMedia } = route.params;

  const [media, setMedia] = useState(initialMedia || null);
  const [delivered, setDelivered] = useState(!!initialMedia);
  const [viewer, setViewer] = useState(null); // { uri, type } for full-screen view

  const spinAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(initialMedia ? 1 : 0)).current;
  const { colors } = useTheme();
  const styles = dynamicStyles(colors);

  useEffect(() => {
    if (delivered) return;
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1, duration: 1200,
        easing: Easing.linear, useNativeDriver: true,
      })
    ).start();
  }, [spinAnim, delivered]);

  useEffect(() => {
    if (delivered) return;
    let mounted = true;
    const sim = getSimClient();
    sim.connect().catch(() => {});
    sim.joinOrder(orderId).catch(() => {});

    const offDelivered = sim.onOrderDelivered(({ orderId: id, media: m }) => {
      if (!mounted || id !== orderId || !m) return;
      setMedia(m);
      setDelivered(true);
    });

    // Fallback: if no event after 6 s, poll the server once.
    const pollTimeout = setTimeout(async () => {
      if (!mounted || delivered) return;
      try {
        const res = await simApi.getOrder(orderId);
        if (mounted && res?.order?.media) {
          setMedia(res.order.media);
          setDelivered(true);
        }
      } catch (_) { /* leave spinner */ }
    }, 6000);

    return () => {
      mounted = false;
      offDelivered();
      clearTimeout(pollTimeout);
    };
  }, [orderId, delivered]);

  useEffect(() => {
    if (!delivered || !media) return;
    Animated.spring(scaleAnim, {
      toValue: 1, friction: 4, tension: 120,
      useNativeDriver: true,
    }).start();
    persistDelivery({ orderId, pkg, siteName, hive, media });
  }, [delivered, media, scaleAnim, orderId, pkg, siteName, hive]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1], outputRange: ['0deg', '360deg'],
  });

  const photoCount = media?.photos?.length || 0;
  const previewPhotos = media?.photos?.slice(0, 3) || [];
  const remainingCount = Math.max(0, photoCount - 3);

  return (
    <ScreenWrapper scroll={false}>
      <View style={styles.center}>
        {!delivered ? (
          <>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons name="sync" size={64} color={colors.primary} />
            </Animated.View>
            <Text style={[Typography.h2, { color: colors.textPrimary }, styles.title]}>Processing Content…</Text>
            <Text style={[Typography.body, { color: colors.textSecondary }, styles.subtitle]}>
              Your aerial footage is being enhanced and packaged. This usually takes a moment.
            </Text>
          </>
        ) : (
          <>
            <Animated.View style={[styles.checkCircle, { transform: [{ scale: scaleAnim }] }]}>
              <Ionicons name="checkmark" size={56} color={colors.white} />
            </Animated.View>

            <Text style={[Typography.h2, { color: colors.textPrimary }, styles.title]}>Content Delivered! 🎉</Text>
            <Text style={[Typography.body, { color: colors.textSecondary }, styles.subtitle]}>
              Your {photoCount} photos{pkg.video ? ' & video' : ''} are now in your gallery.
            </Text>

            {previewPhotos.length > 0 && (
              <FlatList
                data={previewPhotos}
                horizontal
                keyExtractor={(uri, i) => `${uri}_${i}`}
                showsHorizontalScrollIndicator={false}
                style={styles.thumbsRow}
                contentContainerStyle={styles.thumbsContent}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setViewer({ uri: item, type: 'photo' })}
                  >
                    <Image source={{ uri: item }} style={styles.thumb} />
                  </TouchableOpacity>
                )}
                ListFooterComponent={
                  <>
                    {(media?.videos?.length || 0) > 0 && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={[styles.thumb, styles.videoTile]}
                        onPress={() => setViewer({ uri: media.videos[0], type: 'video' })}
                      >
                        <Ionicons name="play-circle" size={36} color={colors.white} />
                        <Text style={styles.videoTileText}>Video</Text>
                      </TouchableOpacity>
                    )}
                    {remainingCount > 0 ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={[styles.thumb, styles.moreTile]}
                        onPress={() => navigation.navigate('Gallery')}
                      >
                        <Text style={styles.moreText}>+{remainingCount}</Text>
                        <Text style={styles.moreSub}>more</Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                }
              />
            )}

            <Card style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Ionicons name="receipt" size={18} color={colors.accent} />
                <Text style={[Typography.bodySmall, { color: colors.textSecondary }, styles.summaryText]}>
                  Order {orderId}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Ionicons name="location" size={18} color={colors.accent} />
                <Text style={[Typography.bodySmall, { color: colors.textSecondary }, styles.summaryText]}>
                  {siteName || hive?.name || 'Current Location'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Ionicons name={pkg.icon} size={18} color={colors.accent} />
                <Text style={[Typography.bodySmall, { color: colors.textSecondary }, styles.summaryText]}>
                  {pkg.name} — ${pkg.price.toFixed(2)}
                </Text>
              </View>
            </Card>

            <GradientButton
              title="View Gallery"
              icon="images"
              onPress={() => navigation.navigate('Gallery')}
              style={styles.galleryBtn}
            />
            <GradientButton
              title="Back to Home"
              icon="home"
              onPress={() => navigation.popToTop()}
              style={styles.homeBtn}
            />
          </>
        )}
      </View>

      <MediaViewerModal item={viewer} onClose={() => setViewer(null)} />
    </ScreenWrapper>
  );
}

// ── Styles ────────────────────────────────────────────────
const dynamicStyles = (colors) => StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.screenPadding,
  },
  title: { marginTop: Spacing.lg, textAlign: 'center' },
  subtitle: {
    marginTop: Spacing.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  checkCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbsRow: { flexGrow: 0, marginTop: Spacing.lg },
  thumbsContent: { paddingHorizontal: 4 },
  thumb: {
    width: 90, height: 90,
    borderRadius: 14,
    marginHorizontal: 4,
    backgroundColor: colors.bgCardLight,
  },
  moreTile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '22',
  },
  videoTile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10101E',
  },
  videoTileText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
    marginTop: 2,
  },
  moreText: { fontSize: 22, fontWeight: '800', color: colors.primary },
  moreSub: { fontSize: 11, color: colors.primary, marginTop: 2 },
  summaryCard: { marginTop: Spacing.xl, width: '100%' },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  summaryText: { marginLeft: Spacing.sm },
  galleryBtn: { marginTop: Spacing.lg, width: '100%' },
  homeBtn: { marginTop: Spacing.sm, width: '100%' },
});
