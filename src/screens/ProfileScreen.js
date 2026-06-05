/**
 * ============================================================
 *  AirSnap — ProfileScreen (Personal Area)
 * ============================================================
 *  The user's dedicated section containing:
 *    • Avatar, name, and email from AuthContext
 *    • Settings: notifications toggle + dark/light mode toggle
 *    • Quick links: Order History, Gallery, Help, Privacy
 *    • Sign-out button (clears session)
 *
 *  The dark mode toggle is now **functional** — it calls
 *  toggleTheme() from ThemeContext and the entire app re-renders
 *  with the new colour palette.
 * ============================================================
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ScreenWrapper, Card } from '../components/common';
import { useTheme, useAuth, useLocation } from '../context';
import { DELIVERY_ZONE_RADIUS_METERS } from '../constants';
import { haversineDistanceMeters } from '../utils/geofence';
import { Spacing } from '../theme';
import { ADMIN_EMAILS } from '../config/firebaseConfig';
import PartnerTab from '../components/Account/PartnerTab';

export default function ProfileScreen({ navigation }) {
  // ── Auth & theme hooks ────────────────────────────────
  const { user, signOut } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const { position } = useLocation();

  // ── Notification toggle (local state — cosmetic) ──────
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [activeTab, setActiveTab] = useState('account');

  // ── User display data ─────────────────────────────────
  const displayName = user?.name || 'AirSnap User';
  const displayEmail = user?.email || 'user@airsnap.io';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // ── Menu row helper ───────────────────────────────────
  const MenuItem = ({ icon, label, onPress, color }) => (
    <TouchableOpacity style={ds.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[ds.menuIcon, { backgroundColor: (color || colors.primary) + '18' }]}>
        <Ionicons name={icon} size={20} color={color || colors.primary} />
      </View>
      <Text style={[ds.menuLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );

  // ── Dynamic styles ────────────────────────────────────
  const ds = dynamicStyles(colors);

  const handleSelectPartnerSite = (site) => {
    if (!position) {
      Alert.alert('Location unavailable', 'Enable location access to validate partner radius.');
      return;
    }

    const userCoords = {
      latitude: position.latitude,
      longitude: position.longitude,
    };
    const distanceMeters = haversineDistanceMeters(userCoords, site);
    const inRange = distanceMeters <= DELIVERY_ZONE_RADIUS_METERS;

    if (!inRange) {
      Alert.alert(
        'Out of range',
        `You are ${(distanceMeters / 1000).toFixed(2)} km away from ${site.name}. You must be within 0.50 km (500m) to order.`
      );
      return;
    }

    navigation.navigate('Order', {
      screen: 'PackageSelect',
      params: {
        locationType: 'site',
        siteName: site.name,
        latitude: site.latitude,
        longitude: site.longitude,
      },
    });
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <ScreenWrapper title="Personal Area" scroll>
      {/* ─── Profile header card ─────────────────────────── */}
      <Card style={ds.profileCard}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={ds.avatar}
        >
          <Text style={ds.avatarText}>{initials}</Text>
        </LinearGradient>
        <Text style={[ds.nameText, { color: colors.textPrimary }]}>{displayName}</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary }}>{displayEmail}</Text>
      </Card>

      {/* ─── Settings section ────────────────────────────── */}
      <Text style={[ds.sectionTitle, { color: colors.textSecondary }]}>SETTINGS</Text>

      <Card style={ds.settingsCard}>
        {/* Notifications toggle */}
        <View style={ds.toggleRow}>
          <View style={[ds.menuIcon, { backgroundColor: colors.accent + '18' }]}>
            <Ionicons name="notifications" size={20} color={colors.accent} />
          </View>
          <Text style={[ds.menuLabel, { color: colors.textPrimary }]}>Notifications</Text>
          <Switch
            value={notificationsOn}
            onValueChange={setNotificationsOn}
            trackColor={{ false: colors.bgCardLight, true: colors.primary + '55' }}
            thumbColor={notificationsOn ? colors.primary : colors.textMuted}
          />
        </View>

        {/* Dark / Light mode toggle — FUNCTIONAL */}
        <View style={ds.toggleRow}>
          <View style={[ds.menuIcon, { backgroundColor: colors.warning + '18' }]}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={colors.warning} />
          </View>
          <Text style={[ds.menuLabel, { color: colors.textPrimary }]}>
            {isDark ? 'Dark Mode' : 'Light Mode'}
          </Text>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.bgCardLight, true: colors.primary + '55' }}
            thumbColor={isDark ? colors.primary : colors.textMuted}
          />
        </View>
      </Card>

      {/* ─── Quick links section ─────────────────────────── */}
      <Text style={[ds.sectionTitle, { color: colors.textSecondary }]}>ACCOUNT</Text>

      <View style={ds.segmentRow}>
        <TouchableOpacity
          style={[ds.segmentBtn, activeTab === 'account' && { backgroundColor: colors.primary + '20' }]}
          onPress={() => setActiveTab('account')}
        >
          <Text style={[ds.segmentText, { color: activeTab === 'account' ? colors.primary : colors.textSecondary }]}>Overview</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ds.segmentBtn, activeTab === 'partners' && { backgroundColor: colors.primary + '20' }]}
          onPress={() => setActiveTab('partners')}
        >
          <Text style={[ds.segmentText, { color: activeTab === 'partners' ? colors.primary : colors.textSecondary }]}>Partners</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'account' ? (
        <Card style={ds.menuCard}>
          <MenuItem
            icon="wallet"
            label="Credits & Referrals"
            color={colors.success}
            onPress={() => navigation.navigate('Credits')}
          />
          <MenuItem
            icon="receipt"
            label="Order & Invoice History"
            onPress={() => navigation.navigate('OrderHistory')}
          />
          <MenuItem
            icon="images"
            label="My Gallery"
            color={colors.accent}
            onPress={() => navigation.navigate('Gallery')}
          />
          <MenuItem
            icon="help-circle"
            label="Help & Support"
            color={colors.info}
            onPress={() => navigation.navigate('HelpFromProfile')}
          />
          <MenuItem
            icon="shield-checkmark"
            label="Privacy & Terms"
            color={colors.warning}
            onPress={() => navigation.navigate('PrivacyTerms')}
          />
          {user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()) && (
            <>
              <MenuItem
                icon="business"
                label="Manage Hives (admin)"
                color={colors.accent}
                onPress={() => navigation.navigate('HiveAdmin')}
              />
              <MenuItem
                icon="pricetags"
                label="Promo Codes (admin)"
                color={colors.primary}
                onPress={() => navigation.navigate('PromoCodeAdmin')}
              />
            </>
          )}
        </Card>
      ) : (
        <PartnerTab
          onSelectSite={handleSelectPartnerSite}
          onAboutPartners={() => navigation.navigate('PartnersAbout')}
        />
      )}

      {/* ─── Sign out ────────────────────────────────────── */}
      <TouchableOpacity style={ds.signOut} onPress={signOut}>
        <Ionicons name="log-out" size={20} color={colors.error} />
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.error, marginLeft: 8 }}>
          Sign Out
        </Text>
      </TouchableOpacity>
    </ScreenWrapper>
  );
}

// ── Dynamic styles (react to theme changes) ──────────────
const dynamicStyles = (colors) =>
  StyleSheet.create({
    profileCard: {
      alignItems: 'center',
      paddingVertical: Spacing.xl,
      marginBottom: Spacing.lg,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 28,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    nameText: {
      fontSize: 20,
      fontWeight: '700',
      marginTop: Spacing.md,
    },

    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 1,
      marginBottom: Spacing.sm,
      marginTop: Spacing.sm,
    },

    // ── Settings card ──────────────────────────────────────
    settingsCard: {
      marginBottom: Spacing.md,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
    },

    // ── Menu items ────────────────────────────────────────
    menuCard: {
      marginBottom: Spacing.lg,
    },
    segmentRow: {
      flexDirection: 'row',
      marginBottom: Spacing.md,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: Spacing.radiusMd,
      alignItems: 'center',
      marginHorizontal: 4,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '700',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm + 2,
    },
    menuIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.md,
    },
    menuLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
    },

    signOut: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.lg,
    },
  });
