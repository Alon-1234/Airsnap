/**
 * ============================================================
 *  AirSnap — CreditsScreen
 * ============================================================
 *  Shows the user's credit balance, their referral code (share-able),
 *  a redeem-promo input, and the recent credit ledger.
 *
 *  Admins see "Unlimited" instead of a number because the server
 *  special-cases them in splitPayment — they're never charged and
 *  their ledger never moves.
 *
 *  Data:
 *    - `me` from AuthContext (cached + refreshable)
 *    - GET /users/me/ledger on focus
 * ============================================================
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

import { ScreenWrapper, Card } from '../components/common';
import { useTheme, useAuth } from '../context';
import { Typography, Spacing } from '../theme';
import { simApi } from '../services/SimClient';

function formatBalance(me) {
  if (!me) return '—';
  if (me.isAdmin) return 'Unlimited';
  const v = Number(me.credits || 0);
  return `₪${v.toFixed(2)}`;
}

function ledgerIcon(type, reason) {
  switch (type) {
    case 'signup_bonus':   return { icon: 'sparkles',     color: '#F2C744' };
    case 'referral_bonus': return { icon: 'people',       color: '#5BC0EB' };
    case 'promo_redeem':   return { icon: 'gift',         color: '#A076F9' };
    case 'order_spend':    return { icon: 'paper-plane',  color: '#FF8A65' };
    case 'admin_adjust':
      // adminAdjust is also used for abandon-order refunds — surface them as such.
      if (reason && /refund|abandon/i.test(reason)) {
        return { icon: 'arrow-undo', color: '#5BC0EB' };
      }
      return { icon: 'construct', color: '#9E9E9E' };
    default:               return { icon: 'wallet',       color: '#9E9E9E' };
  }
}

function ledgerLabel(type, reason) {
  switch (type) {
    case 'signup_bonus':   return 'Welcome bonus';
    case 'referral_bonus': return 'Referral bonus';
    case 'promo_redeem':   return 'Promo code';
    case 'order_spend':    return 'Order payment';
    case 'admin_adjust':
      if (reason && /refund|abandon/i.test(reason)) return 'Order refund';
      return 'Adjustment';
    default:               return type;
  }
}

function formatDate(serverTs) {
  if (!serverTs) return '';
  // Firestore Timestamp serializes as { _seconds, _nanoseconds }
  const sec = serverTs._seconds ?? serverTs.seconds ?? null;
  const ms = sec != null ? sec * 1000 : Date.parse(serverTs);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleDateString();
}

export default function CreditsScreen({ navigation }) {
  const { colors } = useTheme();
  const { me, refreshMe } = useAuth();
  const ds = dynamicStyles(colors);

  const [ledger, setLedger] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [promo, setPromo] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshMe();
      const res = await simApi.getLedger();
      setLedger(res?.entries || []);
    } catch (err) {
      // Silent — cached `me` is still rendered.
      console.log('[Credits] reload error:', err.message);
    } finally {
      setRefreshing(false);
    }
  }, [refreshMe]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const onShareCode = async () => {
    if (!me?.referralCode) return;
    try {
      await Share.share({
        message:
          `Join me on AirSnap and we both win — use my code ${me.referralCode} to sign up.`,
      });
    } catch (_) {}
  };

  const onRedeem = async () => {
    const code = promo.trim().toUpperCase();
    if (!code) return;
    setRedeeming(true);
    try {
      const result = await simApi.redeemPromo(code);
      if (result?.type === 'balance') {
        Alert.alert(
          'Promo redeemed!',
          `₪${result.creditsAdded.toFixed(2)} added to your balance.`,
        );
        setPromo('');
        await reload();
      } else if (result?.type === 'discount') {
        Alert.alert(
          'Discount code',
          `Use this code at checkout — it'll take ₪${result.amount.toFixed(2)} off your next order.`,
        );
      }
    } catch (err) {
      Alert.alert('Could not redeem', err.message || 'Unknown error');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <ScreenWrapper title="Credits" onBack={() => navigation.goBack()} scroll>
      {/* ─── Balance hero ─────────────────────────────────── */}
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={ds.balanceCard}
      >
        <Text style={ds.balanceLabel}>Available balance</Text>
        <Text style={ds.balanceValue}>{formatBalance(me)}</Text>
        {me?.isAdmin && (
          <Text style={ds.balanceSub}>Admin — orders are free</Text>
        )}
      </LinearGradient>

      {/* ─── Referral code ────────────────────────────────── */}
      <Text style={[ds.sectionTitle, { color: colors.textSecondary }]}>YOUR REFERRAL CODE</Text>
      <Card style={ds.refCard}>
        <View style={ds.refRow}>
          <View style={ds.refCodeBox}>
            <Text style={[ds.refCode, { color: colors.textPrimary }]}>
              {me?.referralCode || '------'}
            </Text>
          </View>
          <TouchableOpacity style={[ds.iconBtn, { backgroundColor: colors.accent + '22' }]} onPress={onShareCode}>
            <Ionicons name="share-social-outline" size={20} color={colors.accent} />
          </TouchableOpacity>
        </View>
        <Text style={[Typography.bodySmall, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
          When a friend signs up with your code and places their first paid order, you earn ₪20.
        </Text>
      </Card>

      {/* ─── Redeem promo code ────────────────────────────── */}
      <Text style={[ds.sectionTitle, { color: colors.textSecondary }]}>REDEEM A CODE</Text>
      <Card style={ds.redeemCard}>
        <View style={ds.redeemRow}>
          <TextInput
            style={[ds.redeemInput, { color: colors.textPrimary, backgroundColor: colors.bgInput, borderColor: colors.border }]}
            value={promo}
            onChangeText={(t) => setPromo(t.toUpperCase())}
            placeholder="Enter code"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            maxLength={32}
          />
          <TouchableOpacity
            style={[ds.redeemBtn, { backgroundColor: colors.primary }]}
            onPress={onRedeem}
            disabled={redeeming || !promo.trim()}
          >
            {redeeming ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={ds.redeemBtnText}>Redeem</Text>
            )}
          </TouchableOpacity>
        </View>
      </Card>

      {/* ─── Recent activity ──────────────────────────────── */}
      <Text style={[ds.sectionTitle, { color: colors.textSecondary }]}>RECENT ACTIVITY</Text>
      <Card style={ds.ledgerCard}>
        {ledger.length === 0 ? (
          <Text style={[Typography.bodySmall, { color: colors.textSecondary, textAlign: 'center', paddingVertical: Spacing.lg }]}>
            {refreshing ? 'Loading…' : 'No credit activity yet.'}
          </Text>
        ) : (
          ledger.slice(0, 10).map((entry) => {
            const meta = ledgerIcon(entry.type, entry.reason);
            const isCredit = (entry.amount || 0) >= 0;
            return (
              <View key={entry.id} style={ds.ledgerRow}>
                <View style={[ds.ledgerIcon, { backgroundColor: meta.color + '22' }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[Typography.bodySemibold, { color: colors.textPrimary }]}>
                    {ledgerLabel(entry.type, entry.reason)}
                  </Text>
                  <Text style={[Typography.caption, { color: colors.textMuted }]}>
                    {formatDate(entry.createdAt)}
                    {entry.promoCode ? ` • ${entry.promoCode}` : ''}
                    {entry.orderId ? ` • ${entry.orderId}` : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    Typography.bodySemibold,
                    { color: isCredit ? colors.success : colors.error },
                  ]}
                >
                  {isCredit ? '+' : '−'}₪{Math.abs(entry.amount || 0).toFixed(2)}
                </Text>
              </View>
            );
          })
        )}
      </Card>
    </ScreenWrapper>
  );
}

const dynamicStyles = (colors) =>
  StyleSheet.create({
    balanceCard: {
      borderRadius: Spacing.radiusLg || 18,
      padding: Spacing.xl,
      alignItems: 'center',
      marginBottom: Spacing.lg,
    },
    balanceLabel: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 1,
    },
    balanceValue: {
      color: '#FFFFFF',
      fontSize: 42,
      fontWeight: '800',
      marginTop: Spacing.sm,
    },
    balanceSub: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: 13,
      fontWeight: '600',
      marginTop: 4,
    },

    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      marginBottom: Spacing.sm,
      marginTop: Spacing.sm,
    },

    refCard: { marginBottom: Spacing.lg },
    refRow: { flexDirection: 'row', alignItems: 'center' },
    refCodeBox: {
      flex: 1,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      borderRadius: Spacing.radiusMd,
      backgroundColor: colors.bgCardLight,
      marginRight: Spacing.sm,
    },
    refCode: { fontSize: 24, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 4,
    },

    redeemCard: { marginBottom: Spacing.lg },
    redeemRow: { flexDirection: 'row', alignItems: 'center' },
    redeemInput: {
      flex: 1,
      borderWidth: 1,
      borderRadius: Spacing.radiusMd,
      paddingHorizontal: Spacing.md,
      height: 48,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 1,
      marginRight: Spacing.sm,
    },
    redeemBtn: {
      paddingHorizontal: Spacing.lg,
      height: 48,
      borderRadius: Spacing.radiusMd,
      alignItems: 'center',
      justifyContent: 'center',
    },
    redeemBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

    ledgerCard: { marginBottom: Spacing.xl },
    ledgerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    },
    ledgerIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
  });
