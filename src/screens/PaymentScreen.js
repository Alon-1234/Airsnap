/**
 * ============================================================
 *  AirSnap — PaymentScreen
 * ============================================================
 *  Final step before the drone is dispatched.
 *
 *  Shows:
 *    • Order summary (location, package, price in NIS)
 *    • Optional promo / discount code field
 *    • Credit balance + payment breakdown
 *        Subtotal − Credits applied = Card charge
 *    • Payment method selector
 *    • "Place Order" CTA
 *
 *  Flow:
 *    1. createOrder() returns { creditsApplied, cardCharge, paymentStatus }
 *    2. If paymentStatus==='paid' (admin OR fully covered) → straight to FlightTracking.
 *    3. Otherwise the card-charge stage is currently a stop-gap
 *       confirmPayment() call — real Meshulam SDK will replace it.
 * ============================================================
 */

import React, { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenWrapper, Card, GradientButton } from '../components/common';
import { useTheme, useAuth } from '../context';
import { Typography, Spacing } from '../theme';
import { PAYMENT_METHODS } from '../constants';
import { simApi } from '../services/SimClient';

const TAX_RATE = 0.08;
const fmt = (n) => `₪${Number(n || 0).toFixed(2)}`;

export default function PaymentScreen({ navigation, route }) {
  const {
    locationType,
    latitude,
    longitude,
    siteName,
    package: selectedPkg,
  } = route.params;

  const { colors } = useTheme();
  const { me, refreshMe } = useAuth();
  const styles = dynamicStyles(colors);

  const [paymentId, setPaymentId] = useState('apple_pay');
  const [placing, setPlacing] = useState(false);
  // Local-only — server validates + redeems atomically in POST /orders.
  const [discountCode, setDiscountCode] = useState('');

  const subtotal = Number(selectedPkg.price || 0);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const grossTotal = +(subtotal + tax).toFixed(2);
  // Preview shown without discount — the actual discount materializes
  // in the server response. Avoids client/server divergence.
  const preview = computePreview({
    grossTotal,
    discountAmount: 0,
    creditBalance: me?.isAdmin ? Infinity : Number(me?.credits || 0),
    isAdmin: !!me?.isAdmin,
  });

  // Ref guard: `placing` state only updates on the next render, so two
  // quick taps could both pass the check and create two orders/drones.
  const placingRef = useRef(false);
  const finishPlacing = () => {
    placingRef.current = false;
    setPlacing(false);
  };

  const goToTracking = (orderId, hive) => {
    navigation.navigate('FlightTracking', {
      latitude, longitude, siteName,
      package: selectedPkg, paymentMethod: paymentId,
      orderId, hive,
    });
  };

  // The server dispatches the drone as soon as the order is created, so an
  // unpaid (awaiting_card) order we walk away from must be abandoned —
  // otherwise the drone hovers at the user forever and the hive slot stays
  // locked.
  const cancelUnpaidOrder = async (orderId) => {
    try { await simApi.abandonOrder(orderId); } catch (_) { /* best-effort */ }
    refreshMe();
    finishPlacing();
  };

  const promptCardPayment = (orderId, cardCharge, hive) => {
    // Stop-gap until Meshulam: confirm the card charge cleared.
    // Real flow would launch the Meshulam SDK here, then call confirmPayment()
    // (or rely on the /payments/webhook flip).
    Alert.alert(
      'Confirm payment',
      `Card charge: ${fmt(cardCharge)}. Tap "Pay" to simulate a successful Meshulam capture.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => cancelUnpaidOrder(orderId) },
        {
          text: 'Pay',
          onPress: async () => {
            try {
              await simApi.confirmPayment(orderId);
            } catch (err) {
              Alert.alert(
                'Payment failed',
                err.message || 'Unknown error',
                [
                  { text: 'Cancel order', style: 'cancel', onPress: () => cancelUnpaidOrder(orderId) },
                  { text: 'Retry', onPress: () => promptCardPayment(orderId, cardCharge, hive) },
                ],
                { cancelable: false },
              );
              return;
            }
            refreshMe();
            goToTracking(orderId, hive);
            finishPlacing();
          },
        },
      ],
      { cancelable: false },
    );
  };

  const handlePlaceOrder = async () => {
    if (placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    try {
      const orderRes = await simApi.createOrder({
        targetLat: latitude,
        targetLng: longitude,
        siteName,
        package: { ...selectedPkg, price: grossTotal },
        paymentMethod: paymentId,
        discountCode: discountCode.trim() || undefined,
      });
      // Server is the authority on what got charged.
      const { orderId, hive, paymentStatus, cardCharge, creditsApplied, adminFree } = orderRes;

      // Refresh the user's balance so it reflects the deduction.
      refreshMe();

      if (paymentStatus === 'paid' || adminFree) {
        goToTracking(orderId, hive);
        // Reset so the button isn't stuck on "Placing order…" if the user
        // abandons from FlightTracking via hardware back and lands here.
        finishPlacing();
        return;
      }

      promptCardPayment(orderId, cardCharge, hive);
      return;
    } catch (err) {
      Alert.alert('Could not place order', err.message || 'Unknown error');
      finishPlacing();
    }
  };


  return (
    <ScreenWrapper
      title="Confirm & Pay"
      onBack={() => navigation.goBack()}
      scroll
    >
      {/* ─── Order summary ──────────────────────────────────── */}
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
          <Text style={[Typography.bodySemibold, { color: colors.textPrimary }]}>{fmt(subtotal)}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>Tax (8%)</Text>
          <Text style={[Typography.bodySemibold, { color: colors.textPrimary }]}>{fmt(tax)}</Text>
        </View>
        {discountCode.trim() && (
          <View style={styles.priceRow}>
            <Text style={[Typography.bodySmall, { color: colors.success }]}>
              Promo {discountCode.trim().toUpperCase()}
            </Text>
            <Text style={[Typography.bodySemibold, { color: colors.success }]}>
              applied at checkout
            </Text>
          </View>
        )}
        <View style={[styles.priceRow, styles.totalRow]}>
          <Text style={[Typography.h4, { color: colors.textPrimary }]}>Total</Text>
          <Text style={[Typography.h3, { color: colors.accent }]}>
            {fmt(preview.totalAfterDiscount)}
          </Text>
        </View>

        {/* Credit breakdown */}
        <View style={[styles.priceRow, { marginTop: Spacing.sm }]}>
          <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>
            {me?.isAdmin ? 'Admin balance' : 'Credit balance'}
          </Text>
          <Text style={[Typography.bodySemibold, { color: colors.textPrimary }]}>
            {me?.isAdmin ? 'Unlimited' : fmt(me?.credits || 0)}
          </Text>
        </View>
        {!me?.isAdmin && preview.creditsApplied > 0 && (
          <View style={styles.priceRow}>
            <Text style={[Typography.bodySmall, { color: colors.success }]}>Credits applied</Text>
            <Text style={[Typography.bodySemibold, { color: colors.success }]}>
              −{fmt(preview.creditsApplied)}
            </Text>
          </View>
        )}
        <View style={[styles.priceRow, styles.totalRow]}>
          <Text style={[Typography.h4, { color: colors.textPrimary }]}>
            {me?.isAdmin ? 'Charge' : 'Card charge'}
          </Text>
          <Text style={[Typography.h3, { color: me?.isAdmin ? colors.success : colors.textPrimary }]}>
            {me?.isAdmin ? 'Free' : fmt(preview.cardCharge)}
          </Text>
        </View>
      </Card>

      {/* ─── Discount / promo code ─────────────────────────── */}
      <Text style={[Typography.label, styles.sectionLabel, { color: colors.textSecondary }]}>
        Promo Code (optional)
      </Text>
      <Card style={styles.promoCard}>
        <TextInput
          style={[
            styles.promoInput,
            { color: colors.textPrimary, backgroundColor: colors.bgInput, borderColor: colors.border, marginRight: 0 },
          ]}
          value={discountCode}
          onChangeText={(t) => setDiscountCode(t.toUpperCase())}
          placeholder="Enter discount code (validated at checkout)"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          maxLength={32}
        />
        <Text style={[Typography.caption, { color: colors.textMuted, marginTop: Spacing.sm }]}>
          Balance-type codes go in the Credits screen. Discount codes apply here.
        </Text>
      </Card>

      {/* ─── Payment method ─────────────────────────────────── */}
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
        title={
          placing ? 'Placing order…'
          : me?.isAdmin ? 'Place Order — Free (admin)'
          : preview.cardCharge === 0 ? 'Place Order — Free (credits)'
          : `Place Order — ${fmt(preview.cardCharge)}`
        }
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

function computePreview({ grossTotal, discountAmount, creditBalance, isAdmin }) {
  const totalAfterDiscount = Math.max(0, +(grossTotal - discountAmount).toFixed(2));
  if (isAdmin) {
    return { totalAfterDiscount, creditsApplied: 0, cardCharge: 0 };
  }
  const credits = Math.min(creditBalance, totalAfterDiscount);
  const creditsApplied = Math.max(0, +credits.toFixed(2));
  const cardCharge = +(totalAfterDiscount - creditsApplied).toFixed(2);
  return { totalAfterDiscount, creditsApplied, cardCharge };
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

  promoCard: { marginBottom: Spacing.lg },
  promoRow: { flexDirection: 'row', alignItems: 'center' },
  promoInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: Spacing.radiusMd,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
    marginRight: Spacing.sm,
  },
  applyBtn: {
    paddingHorizontal: Spacing.md,
    height: 44,
    borderRadius: Spacing.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  discountActiveRow: { flexDirection: 'row', alignItems: 'center' },

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
