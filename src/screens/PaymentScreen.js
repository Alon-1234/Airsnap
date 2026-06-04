/**
 * ============================================================
 *  AirSnap — PaymentScreen
 * ============================================================
 *  Final step before the drone is dispatched.
 *
 *  Shows:
 *    • Order summary (location, package, price)
 *    • Payment method selector (Apple Pay, Google Pay, etc.)
 *    • "Place Order" CTA
 *
 *  On confirmation the user is navigated to FlightTracking
 *  where they watch the drone approach in real-time.
 *
 *  Route params received:
 *    • locationType, latitude, longitude, siteName
 *    • package  (the selected PACKAGES object)
 * ============================================================
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenWrapper, Card, GradientButton } from '../components/common';
import { useTheme } from '../context';
import { Typography, Spacing } from '../theme';
import { PAYMENT_METHODS } from '../constants';
import { simApi } from '../services/SimClient';

export default function PaymentScreen({ navigation, route }) {
  const {
    locationType,
    latitude,
    longitude,
    siteName,
    package: selectedPkg,
  } = route.params;

  const [paymentId, setPaymentId] = useState('apple_pay');
  const [placing, setPlacing] = useState(false);

  const tax = selectedPkg.price * 0.08;
  const total = selectedPkg.price + tax;

  const { colors } = useTheme();
  const styles = dynamicStyles(colors);

  const handlePlaceOrder = async () => {
    if (placing) return;
    setPlacing(true);
    try {
      const { orderId, hive } = await simApi.createOrder({
        targetLat: latitude,
        targetLng: longitude,
        siteName,
        package: selectedPkg,
        paymentMethod: paymentId,
      });
      navigation.navigate('FlightTracking', {
        latitude,
        longitude,
        siteName,
        package: selectedPkg,
        paymentMethod: paymentId,
        orderId,
        hive,
      });
    } catch (err) {
      Alert.alert('Could not place order', err.message || 'Unknown error');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <ScreenWrapper
      title="Confirm & Pay"
      onBack={() => navigation.goBack()}
      scroll
    >
      <Card style={styles.summaryCard}>
        <Text style={[Typography.label, styles.sectionLabel, { color: colors.textSecondary }]}>Order Summary</Text>

        <View style={styles.summaryRow}>
          <Ionicons name="location" size={18} color={colors.accent} />
          <Text style={[Typography.body, styles.summaryValue, { color: colors.textSecondary }]}>
            {siteName || 'Current Location'}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Ionicons name={selectedPkg.icon} size={18} color={colors.primary} />
          <Text style={[Typography.body, styles.summaryValue, { color: colors.textSecondary }]}>
            {selectedPkg.name} — {selectedPkg.duration}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.priceRow}>
          <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>Package</Text>
          <Text style={[Typography.bodySemibold, { color: colors.textPrimary }]}>${selectedPkg.price.toFixed(2)}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>Tax (8%)</Text>
          <Text style={[Typography.bodySemibold, { color: colors.textPrimary }]}>${tax.toFixed(2)}</Text>
        </View>
        <View style={[styles.priceRow, styles.totalRow]}>
          <Text style={[Typography.h4, { color: colors.textPrimary }]}>Total</Text>
          <Text style={[Typography.h3, { color: colors.accent }]}>
            ${total.toFixed(2)}
          </Text>
        </View>
      </Card>

      <Text style={[Typography.label, styles.sectionLabel, { color: colors.textSecondary }]}>Payment Method</Text>

      {PAYMENT_METHODS.map((pm) => {
        const isSelected = paymentId === pm.id;
        return (
          <TouchableOpacity
            key={pm.id}
            activeOpacity={0.8}
            onPress={() => setPaymentId(pm.id)}
          >
            <Card
              style={[
                styles.pmCard,
                isSelected && styles.pmCardSelected,
              ]}
            >
              <View style={styles.pmRow}>
                <View
                  style={[
                    styles.pmIconWrap,
                    isSelected && styles.pmIconWrapSelected,
                  ]}
                >
                  <Ionicons
                    name={pm.icon}
                    size={22}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                </View>
                <Text style={[Typography.bodySemibold, { flex: 1, color: colors.textPrimary }]}>
                  {pm.label}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                )}
              </View>
            </Card>
          </TouchableOpacity>
        );
      })}

      <GradientButton
        title={placing ? 'Dispatching drone…' : `Place Order — $${total.toFixed(2)}`}
        icon={placing ? null : 'lock-closed'}
        onPress={handlePlaceOrder}
        disabled={placing}
        style={styles.placeBtn}
      />

      <Text style={[Typography.caption, styles.secureText, { color: colors.textMuted }]}>
        🔒  Your payment is encrypted and secure.
      </Text>
    </ScreenWrapper>
  );
}

// ── Styles ────────────────────────────────────────────────
const dynamicStyles = (colors) => StyleSheet.create({
  summaryCard: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  summaryValue: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: Spacing.md,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  totalRow: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  pmCard: {
    marginBottom: Spacing.sm,
  },
  pmCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  pmRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgCardLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  pmIconWrapSelected: {
    backgroundColor: colors.primary + '22',
  },

  placeBtn: {
    marginTop: Spacing.lg,
  },
  secureText: {
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
