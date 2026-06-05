/**
 * ============================================================
 *  AirSnap — PromoCodeAdminScreen
 * ============================================================
 *  Admin-only. Gated by:
 *    1. Server email check (requireAdmin middleware)
 *    2. Passcode prompt (UX gate, also enforced server-side via
 *       X-Admin-Pass header on every promo endpoint).
 *
 *  Capabilities:
 *    • List all promo codes (active + deactivated)
 *    • Create new code (balance or discount, with optional limits)
 *    • Deactivate an existing code
 *
 *  The screen is rendered as a passcode modal until unlocked.
 * ============================================================
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import { ScreenWrapper, Card, GradientButton } from '../components/common';
import { useTheme } from '../context';
import { Typography, Spacing } from '../theme';
import { simApi } from '../services/SimClient';
import { ADMIN_PROMO_PASS } from '../config/firebaseConfig';

function formatExpiry(ms) {
  if (!ms) return 'No expiry';
  const d = new Date(ms);
  return d.toLocaleDateString();
}

export default function PromoCodeAdminScreen({ navigation }) {
  const { colors } = useTheme();
  const ds = dynamicStyles(colors);

  const [passInput, setPassInput] = useState('');
  const [unlockedPass, setUnlockedPass] = useState(null); // the actual pass value once unlocked
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = useCallback(async (passOverride) => {
    const pass = passOverride || unlockedPass;
    if (!pass) return;
    setLoading(true);
    try {
      const res = await simApi.listPromos(pass);
      setPromos(res?.promos || []);
    } catch (err) {
      Alert.alert('Could not load codes', err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [unlockedPass]);

  const unlock = async () => {
    const candidate = passInput.trim();
    if (!candidate) {
      Alert.alert('Passcode required', 'Enter the admin passcode to continue.');
      return;
    }
    if (candidate !== ADMIN_PROMO_PASS) {
      Alert.alert('Wrong passcode', 'That passcode is not valid.');
      return;
    }
    // Optimistically unlock the UI, then validate against the server.
    setUnlockedPass(candidate);
    setPassInput('');
    try {
      const res = await simApi.listPromos(candidate);
      setPromos(res?.promos || []);
    } catch (err) {
      // Server rejected — re-lock.
      setUnlockedPass(null);
      Alert.alert('Access denied', err.message || 'Server rejected the passcode.');
    }
  };

  const deactivate = (code) => {
    Alert.alert(
      'Deactivate code',
      `Deactivate ${code}? Users will no longer be able to redeem it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await simApi.deactivatePromo(code, unlockedPass);
              await reload();
            } catch (err) {
              Alert.alert('Could not deactivate', err.message || 'Unknown error');
            }
          },
        },
      ],
    );
  };

  // ── Locked state: passcode prompt ─────────────────────
  if (!unlockedPass) {
    return (
      <ScreenWrapper title="Promo Codes" onBack={() => navigation.goBack()} scroll={false}>
        <View style={ds.lockCenter}>
          <BlurView intensity={20} tint={colors.bgDark === '#FFFFFF' ? 'light' : 'dark'} style={ds.lockBlur} />
          <View style={ds.lockCard}>
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={ds.lockIcon}
            >
              <Ionicons name="lock-closed" size={32} color="#FFFFFF" />
            </LinearGradient>
            <Text style={[Typography.h2, { color: colors.textPrimary, marginTop: Spacing.md, textAlign: 'center' }]}>
              Admin Passcode
            </Text>
            <Text style={[Typography.bodySmall, { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm }]}>
              Enter the passcode to manage promo codes.
            </Text>
            <TextInput
              style={[
                ds.passInput,
                { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgInput },
              ]}
              value={passInput}
              onChangeText={setPassInput}
              placeholder="Passcode"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              onSubmitEditing={unlock}
            />
            <GradientButton title="Unlock" icon="key" onPress={unlock} style={{ width: '100%', marginTop: Spacing.md }} />
          </View>
        </View>
      </ScreenWrapper>
    );
  }

  // ── Unlocked state ─────────────────────────────────────
  return (
    <ScreenWrapper title="Promo Codes" onBack={() => navigation.goBack()} scroll>
      <View style={ds.headerRow}>
        <Text style={[Typography.h3, { color: colors.textPrimary }]}>
          {promos.length} code{promos.length === 1 ? '' : 's'}
        </Text>
        <TouchableOpacity
          style={[ds.newBtn, { backgroundColor: colors.primary }]}
          onPress={() => setCreateOpen(true)}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={ds.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      )}

      {!loading && promos.length === 0 && (
        <Card style={{ alignItems: 'center', paddingVertical: Spacing.xl }}>
          <Ionicons name="ticket-outline" size={48} color={colors.textMuted} />
          <Text style={[Typography.bodySemibold, { color: colors.textPrimary, marginTop: Spacing.md }]}>
            No codes yet
          </Text>
          <Text style={[Typography.bodySmall, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
            Tap “New” to create your first promo code.
          </Text>
        </Card>
      )}

      {promos.map((promo) => (
        <Card key={promo.code} style={[ds.promoCard, !promo.active && { opacity: 0.55 }]}>
          <View style={ds.promoTop}>
            <Text style={[Typography.h3, { color: colors.textPrimary, letterSpacing: 2 }]}>{promo.code}</Text>
            <View style={[
              ds.typeChip,
              { backgroundColor: (promo.type === 'balance' ? colors.success : colors.accent) + '22' },
            ]}>
              <Text style={[ds.typeChipText, { color: promo.type === 'balance' ? colors.success : colors.accent }]}>
                {promo.type}
              </Text>
            </View>
          </View>
          <Text style={[Typography.body, { color: colors.textPrimary }]}>
            ₪{Number(promo.amount || 0).toFixed(2)}
            {promo.type === 'balance' ? ' added to balance' : ' off next order'}
          </Text>
          <View style={ds.promoMetaRow}>
            <Text style={[Typography.caption, { color: colors.textMuted }]}>
              {promo.redemptionCount || 0}
              {promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ' / ∞'} redeemed
              {' • '}
              {formatExpiry(promo.expiresAt)}
              {promo.oneTimePerUser ? ' • one per user' : ''}
            </Text>
            {promo.active ? (
              <TouchableOpacity onPress={() => deactivate(promo.code)}>
                <Text style={[ds.deactivateText, { color: colors.error }]}>Deactivate</Text>
              </TouchableOpacity>
            ) : (
              <Text style={[Typography.caption, { color: colors.textMuted, fontStyle: 'italic' }]}>Inactive</Text>
            )}
          </View>
        </Card>
      ))}

      <CreatePromoModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await reload();
        }}
        adminPass={unlockedPass}
        colors={colors}
      />
    </ScreenWrapper>
  );
}

// ─────────────────────────────────────────────────────────
// Create promo modal
// ─────────────────────────────────────────────────────────

function CreatePromoModal({ visible, onClose, onCreated, adminPass, colors }) {
  const ds = dynamicStyles(colors);
  const [code, setCode] = useState('');
  const [type, setType] = useState('balance');
  const [amount, setAmount] = useState('');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [expiresDays, setExpiresDays] = useState('');
  const [oneTimePerUser, setOneTimePerUser] = useState(true);
  const [busy, setBusy] = useState(false);

  // Reset when the modal opens.
  useEffect(() => {
    if (visible) {
      setCode('');
      setType('balance');
      setAmount('');
      setMaxRedemptions('');
      setExpiresDays('');
      setOneTimePerUser(true);
    }
  }, [visible]);

  const submit = async () => {
    const trimmedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(trimmedCode)) {
      Alert.alert('Invalid code', 'Code must be 3–32 letters/digits/underscore/dash.');
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Enter a positive number.');
      return;
    }
    const maxN = maxRedemptions.trim() ? Math.floor(Number(maxRedemptions)) : null;
    if (maxN !== null && (!Number.isFinite(maxN) || maxN < 1)) {
      Alert.alert('Invalid limit', 'Max redemptions must be a positive integer or blank.');
      return;
    }
    let expiresAt = null;
    if (expiresDays.trim()) {
      const days = Number(expiresDays);
      if (!Number.isFinite(days) || days <= 0) {
        Alert.alert('Invalid expiry', 'Expiry must be a positive number of days or blank.');
        return;
      }
      expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    }

    setBusy(true);
    try {
      await simApi.createPromo(
        {
          code: trimmedCode,
          type,
          amount: amt,
          maxRedemptions: maxN,
          expiresAt,
          oneTimePerUser,
        },
        adminPass,
      );
      await onCreated();
    } catch (err) {
      Alert.alert('Could not create code', err.message || 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={ds.modalBg}>
        <View style={[ds.modalCard, { backgroundColor: colors.bgCard }]}>
          <Text style={[Typography.h2, { color: colors.textPrimary, marginBottom: Spacing.md }]}>
            New promo code
          </Text>

          <Text style={[ds.fieldLabel, { color: colors.textSecondary }]}>Code</Text>
          <TextInput
            style={[ds.field, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgInput }]}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="WELCOME20"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            maxLength={32}
          />

          <Text style={[ds.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.md }]}>Type</Text>
          <View style={ds.typeRow}>
            {[
              { id: 'balance',  label: 'Add to balance' },
              { id: 'discount', label: 'Order discount' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  ds.typePill,
                  { borderColor: colors.border, backgroundColor: colors.bgInput },
                  type === opt.id && { borderColor: colors.primary, backgroundColor: colors.primary + '22' },
                ]}
                onPress={() => setType(opt.id)}
              >
                <Text style={[ds.typePillText, { color: type === opt.id ? colors.primary : colors.textSecondary }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[ds.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.md }]}>Amount (₪)</Text>
          <TextInput
            style={[ds.field, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgInput }]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="20"
            placeholderTextColor={colors.textMuted}
          />

          <View style={ds.row2}>
            <View style={{ flex: 1, marginRight: Spacing.sm }}>
              <Text style={[ds.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.md }]}>Max redemptions</Text>
              <TextInput
                style={[ds.field, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgInput }]}
                value={maxRedemptions}
                onChangeText={setMaxRedemptions}
                keyboardType="numeric"
                placeholder="∞"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={[ds.fieldLabel, { color: colors.textSecondary, marginTop: Spacing.md }]}>Expires (days)</Text>
              <TextInput
                style={[ds.field, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgInput }]}
                value={expiresDays}
                onChangeText={setExpiresDays}
                keyboardType="numeric"
                placeholder="never"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={ds.switchRow}>
            <Text style={[Typography.body, { color: colors.textPrimary, flex: 1 }]}>One per user</Text>
            <Switch
              value={oneTimePerUser}
              onValueChange={setOneTimePerUser}
              trackColor={{ false: colors.bgCardLight, true: colors.primary + '55' }}
              thumbColor={oneTimePerUser ? colors.primary : colors.textMuted}
            />
          </View>

          <View style={ds.modalActions}>
            <TouchableOpacity onPress={onClose} style={ds.cancelBtn}>
              <Text style={[Typography.bodySemibold, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <GradientButton
              title={busy ? 'Creating…' : 'Create code'}
              icon={busy ? null : 'checkmark-circle'}
              onPress={submit}
              disabled={busy}
              style={{ flex: 1, marginLeft: Spacing.sm }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dynamicStyles = (colors) =>
  StyleSheet.create({
    // ── Locked state ─────────────────────────────────────
    lockCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    lockBlur: { ...StyleSheet.absoluteFillObject },
    lockCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.bgCard,
      borderRadius: Spacing.radiusLg,
      padding: Spacing.xl,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    lockIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    passInput: {
      width: '100%',
      height: 48,
      borderWidth: 1,
      borderRadius: Spacing.radiusMd,
      paddingHorizontal: Spacing.md,
      fontSize: 18,
      fontWeight: '600',
      letterSpacing: 2,
      marginTop: Spacing.md,
      textAlign: 'center',
    },

    // ── Header + list ────────────────────────────────────
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 18,
    },
    newBtnText: { color: '#FFFFFF', fontWeight: '700', marginLeft: 4 },
    promoCard: { marginBottom: Spacing.md },
    promoTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.xs,
    },
    typeChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    typeChipText: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    promoMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.sm,
    },
    deactivateText: { fontSize: 13, fontWeight: '700' },

    // ── Modal ────────────────────────────────────────────
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      borderTopLeftRadius: Spacing.radiusLg,
      borderTopRightRadius: Spacing.radiusLg,
      padding: Spacing.lg,
      paddingBottom: Spacing.xl + Spacing.lg,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      marginBottom: 6,
    },
    field: {
      borderWidth: 1,
      borderRadius: Spacing.radiusMd,
      paddingHorizontal: Spacing.md,
      height: 44,
      fontSize: 16,
    },
    row2: { flexDirection: 'row' },
    typeRow: { flexDirection: 'row' },
    typePill: {
      paddingHorizontal: 14,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.sm,
    },
    typePillText: { fontSize: 13, fontWeight: '700' },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.lg,
    },
    modalActions: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: Spacing.lg,
    },
    cancelBtn: {
      paddingHorizontal: Spacing.md,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
