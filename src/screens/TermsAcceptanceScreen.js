/**
 * ============================================================
 *  AirSnap — TermsAcceptanceScreen
 * ============================================================
 *  Shown once, on the very first app launch (before the user
 *  can access anything).
 *
 *  The user must scroll through and accept the Terms &
 *  Conditions before proceeding. The acceptance flag is
 *  persisted in AsyncStorage via AuthContext.acceptTerms().
 *
 *  This screen is NOT shown again after the user accepts.
 * ============================================================
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth, useTheme } from '../context';
import { Spacing } from '../theme';

// ── Full terms text (mock — replace with real legal text) ─
const TERMS_TEXT = `
AirSnap Terms & Conditions
Last updated: March 10, 2026

1. Acceptance of Terms
By downloading, installing, or using the AirSnap application ("App"), you agree to be bound by these Terms & Conditions ("Terms"). If you do not agree, do not use the App.

2. Description of Service
AirSnap provides autonomous drone photography services at partnered tourist sites and parks. Users select a location and package, and an autonomous drone captures aerial photos and/or video at the designated site.

3. User Accounts
You must create an account to use the App. You agree to provide accurate information and are responsible for all activity under your account. You must be at least 18 years old.

4. Payments & Pricing
All prices are listed in USD and are subject to change. Payment is required before a drone session begins. Refunds are handled on a case-by-case basis.

5. Content Ownership
All photos and videos captured during your session are your property. AirSnap may use anonymized, non-identifying content for marketing purposes unless you opt out.

6. Safety & Regulations
Drones operate autonomously within approved airspace. Users must not interfere with drone flight paths. AirSnap complies with all applicable FAA / civil aviation regulations.

7. Limitation of Liability
AirSnap is not liable for injuries, property damage, or data loss resulting from drone operations, except where caused by gross negligence. Maximum liability is limited to the amount paid for the session.

8. Privacy
Your personal data is handled in accordance with our Privacy Policy. We collect name, email, location (during sessions), and payment information. We do not sell personal data.

9. Termination
AirSnap reserves the right to suspend or terminate accounts that violate these Terms.

10. Changes to Terms
We may update these Terms from time to time. Continued use of the App constitutes acceptance of revised Terms.

11. Contact
Questions? Reach us at support@airsnap.io or call 1-800-AIRSNAP.
`.trim();

export default function TermsAcceptanceScreen() {
  const { acceptTerms } = useAuth();
  const { colors } = useTheme();

  // ── Track whether user scrolled to the bottom ─────────
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [checked, setChecked] = useState(false);

  // ── Detect when user reaches the bottom of the scroll ─
  const handleScroll = ({ nativeEvent }) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    const atBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (atBottom) setScrolledToEnd(true);
  };

  // onScroll never fires when the text fits without scrolling (tablet /
  // big screen / browser) — the user could then never accept. Treat
  // "content fits in the viewport" as already scrolled to the end.
  const viewportHRef = useRef(0);
  const contentHRef = useRef(0);
  const checkFits = () => {
    if (viewportHRef.current > 0 && contentHRef.current > 0 &&
        contentHRef.current <= viewportHRef.current + 40) {
      setScrolledToEnd(true);
    }
  };

  // ── Accept handler ────────────────────────────────────
  const handleAccept = async () => {
    if (checked) await acceptTerms();
  };

  // ── Dynamic styles ────────────────────────────────────
  const ds = dynamicStyles(colors);

  return (
    <SafeAreaView style={ds.safe}>
      <StatusBar barStyle={colors.bgDark === '#0F0F1A' ? 'light-content' : 'dark-content'} />

      {/* ─── Header ────────────────────────────────────── */}
      <View style={ds.header}>
        <Ionicons name="document-text" size={28} color={colors.primary} />
        <Text style={ds.headerTitle}>Terms & Conditions</Text>
        <Text style={ds.headerSub}>
          Please read and accept before continuing
        </Text>
      </View>

      {/* ─── Scrollable terms text ────────────────────── */}
      <View style={ds.termsBox}>
        <ScrollView
          style={ds.termsScroll}
          onScroll={handleScroll}
          scrollEventThrottle={200}
          onLayout={(e) => { viewportHRef.current = e.nativeEvent.layout.height; checkFits(); }}
          onContentSizeChange={(w, h) => { contentHRef.current = h; checkFits(); }}
        >
          <Text style={ds.termsText}>{TERMS_TEXT}</Text>
        </ScrollView>
      </View>

      {/* ─── Checkbox row ─────────────────────────────── */}
      <TouchableOpacity
        style={ds.checkRow}
        onPress={() => scrolledToEnd && setChecked(!checked)}
        activeOpacity={0.7}
      >
        <View style={[ds.checkbox, checked && ds.checkboxActive]}>
          {checked && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </View>
        <Text style={[ds.checkLabel, !scrolledToEnd && { color: colors.textMuted }]}>
          {scrolledToEnd
            ? 'I have read and agree to the Terms & Conditions'
            : 'Scroll to the bottom to accept'}
        </Text>
      </TouchableOpacity>

      {/* ─── Accept button ────────────────────────────── */}
      <TouchableOpacity
        onPress={handleAccept}
        disabled={!checked}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={
            checked
              ? [colors.gradientStart, colors.gradientEnd]
              : [colors.bgCardLight, colors.bgCardLight]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={ds.acceptBtn}
        >
          <Text style={[ds.acceptText, !checked && { color: colors.textMuted }]}>
            Accept & Continue
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ── Dynamic styles ───────────────────────────────────────
const dynamicStyles = (colors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.bgDark,
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 12 : Spacing.lg,
    },

    // ── Header ────────────────────────────────────────────
    header: {
      alignItems: 'center',
      marginBottom: Spacing.lg,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.textPrimary,
      marginTop: Spacing.sm,
    },
    headerSub: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },

    // ── Terms box ─────────────────────────────────────────
    termsBox: {
      flex: 1,
      backgroundColor: colors.bgCard,
      borderRadius: Spacing.radiusLg,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: Spacing.md,
    },
    termsScroll: {
      padding: Spacing.md,
    },
    termsText: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textSecondary,
    },

    // ── Checkbox ──────────────────────────────────────────
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.sm + 4,
    },
    checkboxActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkLabel: {
      flex: 1,
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 20,
    },

    // ── Accept button ─────────────────────────────────────
    acceptBtn: {
      borderRadius: Spacing.radiusMd,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: Spacing.xl,
    },
    acceptText: {
      fontSize: 17,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
