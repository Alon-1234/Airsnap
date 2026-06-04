/**
 * ============================================================
 *  AirSnap — ContentDeliveryScreen
 * ============================================================
 *  Ending notification screen. Shown after the drone session
 *  finishes (or the user ends early).
 *
 *  Flow:
 *    1. "Processing…" spinner phase (~5 s simulation)
 *    2. "Content Delivered!" confirmation with check animation
 *    3. CTA buttons to view Gallery or go Home
 *
 *  Route params received:
 *    • orderId, package, siteName
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenWrapper, GradientButton, Card } from '../components/common';
import { useTheme } from '../context';
import { Typography, Spacing } from '../theme';

export default function ContentDeliveryScreen({ navigation, route }) {
  const { orderId, package: pkg, siteName } = route.params;

  const [delivered, setDelivered] = useState(false);

  const spinAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const { colors } = useTheme();
  const styles = dynamicStyles(colors);

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spinAnim]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDelivered(true);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }).start();
    }, 5000);
    return () => clearTimeout(timer);
  }, [scaleAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

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
              Your aerial footage is being enhanced and packaged. This usually takes
              a moment.
            </Text>
          </>
        ) : (
          <>
            <Animated.View style={[styles.checkCircle, { transform: [{ scale: scaleAnim }] }]}>
              <Ionicons name="checkmark" size={56} color={colors.white} />
            </Animated.View>

            <Text style={[Typography.h2, { color: colors.textPrimary }, styles.title]}>Content Delivered! 🎉</Text>
            <Text style={[Typography.body, { color: colors.textSecondary }, styles.subtitle]}>
              Your {pkg.photos} photos{pkg.video ? ' & video' : ''} are now in your gallery.
            </Text>

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
                  {siteName || 'Current Location'}
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
  title: {
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: Spacing.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  checkCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    marginTop: Spacing.xl,
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  summaryText: {
    marginLeft: Spacing.sm,
  },
  galleryBtn: {
    marginTop: Spacing.lg,
    width: '100%',
  },
  homeBtn: {
    marginTop: Spacing.sm,
    width: '100%',
  },
});
