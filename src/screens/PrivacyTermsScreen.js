/**
 * ============================================================
 *  AirSnap — PrivacyTermsScreen
 * ============================================================
 *  A read-only screen accessible from Profile → "Privacy & Terms".
 *
 *  Shows two collapsible sections:
 *    1. Privacy Policy
 *    2. Terms & Conditions
 *
 *  Has a back button to return to the Profile screen.
 *  In production, load the content from a CMS or static HTML.
 * ============================================================
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenWrapper, Card } from '../components/common';
import { useTheme } from '../context';
import { Spacing } from '../theme';

// ── Privacy Policy text ──────────────────────────────────
const PRIVACY_TEXT = `
AirSnap Privacy Policy
Last updated: March 10, 2026

1. Information We Collect
We collect your name, email address, and payment details when you create an account. During drone sessions, we temporarily access your location to dispatch the drone.

2. How We Use Your Data
• To provide and improve the AirSnap service
• To process payments and deliver content
• To send order confirmations and support messages
• For anonymised analytics (no personal data shared)

3. Data Sharing
We do not sell your personal data. We share information only with:
• Payment processors (Stripe, Apple Pay, Google Pay)
• Cloud storage providers (for your photos/videos)
• Law enforcement when legally required

4. Data Retention
Account data is retained while your account is active. You can request deletion at any time by contacting support@airsnap.io.

5. Security
All data is encrypted in transit (TLS) and at rest. Payment information is handled by PCI-compliant processors — we never store card numbers.

6. Your Rights
You may request access to, correction of, or deletion of your personal data. Contact us at support@airsnap.io.
`.trim();

// ── Terms text ───────────────────────────────────────────
const TERMS_TEXT = `
AirSnap Terms & Conditions
Last updated: March 10, 2026

1. Acceptance of Terms
By using AirSnap you agree to these Terms. If you disagree, please uninstall the App.

2. Service Description
AirSnap dispatches autonomous drones to capture aerial photography and video at pre-approved locations.

3. User Responsibilities
• You must be 18+ to use the service
• Do not interfere with drone operations
• You are responsible for your account security

4. Payments
All prices are in USD. Payment is processed before the drone session begins. Cancellation before drone departure is free; after departure, partial charges may apply.

5. Content Ownership
Photos and videos from your sessions belong to you. AirSnap retains a licence to use anonymised content for marketing.

6. Liability
AirSnap liability is limited to the session price paid. We are not liable for weather cancellations or force majeure events.

7. Contact
support@airsnap.io  •  1-800-AIRSNAP
`.trim();

export default function PrivacyTermsScreen({ navigation }) {
  const { colors } = useTheme();

  // ── Which section is expanded ─────────────────────────
  const [openSection, setOpenSection] = useState(null);

  // ── Toggle a section ──────────────────────────────────
  const toggle = (key) => setOpenSection(openSection === key ? null : key);

  // ── Dynamic styles ────────────────────────────────────
  const ds = dynamicStyles(colors);

  return (
    <ScreenWrapper
      title="Privacy & Terms"
      onBack={() => navigation.goBack()}
      scroll
    >
      {/* ─── Privacy Policy section ───────────────────────── */}
      <Card style={ds.sectionCard}>
        <TouchableOpacity
          style={ds.sectionHeader}
          onPress={() => toggle('privacy')}
          activeOpacity={0.8}
        >
          <View style={ds.sectionIcon}>
            <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
          </View>
          <Text style={ds.sectionTitle}>Privacy Policy</Text>
          <Ionicons
            name={openSection === 'privacy' ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {openSection === 'privacy' && (
          <Text style={ds.sectionBody}>{PRIVACY_TEXT}</Text>
        )}
      </Card>

      {/* ─── Terms & Conditions section ──────────────────── */}
      <Card style={ds.sectionCard}>
        <TouchableOpacity
          style={ds.sectionHeader}
          onPress={() => toggle('terms')}
          activeOpacity={0.8}
        >
          <View style={ds.sectionIcon}>
            <Ionicons name="document-text" size={22} color={colors.accent} />
          </View>
          <Text style={ds.sectionTitle}>Terms & Conditions</Text>
          <Ionicons
            name={openSection === 'terms' ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {openSection === 'terms' && (
          <Text style={ds.sectionBody}>{TERMS_TEXT}</Text>
        )}
      </Card>

      {/* ─── Contact info ─────────────────────────────────── */}
      <View style={ds.contactBox}>
        <Ionicons name="mail" size={20} color={colors.primary} />
        <Text style={ds.contactText}>
          Questions? Contact support@airsnap.io
        </Text>
      </View>
    </ScreenWrapper>
  );
}

// ── Dynamic styles ───────────────────────────────────────
const dynamicStyles = (colors) =>
  StyleSheet.create({
    sectionCard: {
      marginBottom: Spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sectionIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: colors.primary + '18',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    sectionTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    sectionBody: {
      marginTop: Spacing.md,
      fontSize: 14,
      lineHeight: 22,
      color: colors.textSecondary,
    },
    contactBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Spacing.md,
      marginBottom: Spacing.xl,
    },
    contactText: {
      fontSize: 14,
      color: colors.textSecondary,
      marginLeft: Spacing.sm,
    },
  });
