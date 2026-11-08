/**
 * ============================================================
 *  AirSnap — PackageSelectScreen
 * ============================================================
 *  After the user taps "Order Now" or selects a site, they
 *  land here to choose a photography package.
 *
 *  Each package card shows:
 *    • Icon, name, duration
 *    • What's included (photos, video)
 *    • Price
 *    • A "Popular" badge for the recommended option
 *
 *  Selecting a package navigates to the Payment screen.
 *
 *  Route params received:
 *    • locationType ('current' | 'site')
 *    • latitude, longitude
 *    • siteName (optional)
 * ============================================================
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ScreenWrapper, Card, GradientButton } from '../components/common';
import { useTheme } from '../context';
import { Typography, Spacing } from '../theme';
import { PACKAGES } from '../constants';

export default function PackageSelectScreen({ navigation, route }) {
  const { locationType, latitude, longitude, siteName } = route.params;
  const { colors } = useTheme();
  const styles = dynamicStyles(colors);

  const [selectedId, setSelectedId] = useState('standard');
  const selectedPkg = PACKAGES.find((p) => p.id === selectedId);

  const handleContinue = () => {
    navigation.navigate('Payment', {
      locationType,
      latitude,
      longitude,
      siteName,
      package: selectedPkg,
    });
  };

  return (
    <ScreenWrapper
      title="Choose Package"
      onBack={() => navigation.goBack()}
      scroll
    >
      <View style={styles.locationChip}>
        <Ionicons
          name={locationType === 'site' ? 'map' : 'navigate'}
          size={16}
          color={colors.accent}
        />
        <Text style={styles.locationText}>
          {siteName || 'Your Current Location'}
        </Text>
      </View>

      {PACKAGES.map((pkg) => {
        const isSelected = selectedId === pkg.id;
        return (
          <TouchableOpacity
            key={pkg.id}
            activeOpacity={0.85}
            onPress={() => setSelectedId(pkg.id)}
          >
            <Card
              style={[
                styles.pkgCard,
                isSelected && styles.pkgCardSelected,
              ]}
            >
              {pkg.popular && (
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.popularBadge}
                >
                  <Text style={styles.popularText}>Most Popular</Text>
                </LinearGradient>
              )}

              <View style={styles.pkgHeader}>
                <View
                  style={[
                    styles.pkgIconWrap,
                    isSelected && styles.pkgIconWrapSelected,
                  ]}
                >
                  <Ionicons
                    name={pkg.icon}
                    size={24}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                </View>

                <View style={styles.pkgInfo}>
                  <Text style={[Typography.h4, { color: colors.textPrimary }]}>{pkg.name}</Text>
                  <Text style={[Typography.caption, { color: colors.textMuted }]}>{pkg.duration} session</Text>
                </View>

                <Text style={[Typography.h3, styles.pkgPrice, { color: colors.textPrimary }]}>
                  ₪{pkg.price.toFixed(2)}
                </Text>
              </View>

              <Text style={[Typography.bodySmall, styles.pkgDesc, { color: colors.textSecondary }]}>
                {pkg.description}
              </Text>

              <View style={styles.tags}>
                <View style={styles.tag}>
                  <Ionicons name="camera" size={14} color={colors.textSecondary} />
                  <Text style={styles.tagText}>{pkg.photos} Photos</Text>
                </View>
                {pkg.video && (
                  <View style={styles.tag}>
                    <Ionicons name="videocam" size={14} color={colors.textSecondary} />
                    <Text style={styles.tagText}>Video</Text>
                  </View>
                )}
              </View>

              <View style={styles.radioRow}>
                <View
                  style={[
                    styles.radio,
                    isSelected && styles.radioSelected,
                  ]}
                >
                  {isSelected && <View style={styles.radioDot} />}
                </View>
                <Text style={[Typography.bodySmall, { marginLeft: 8, color: colors.textSecondary }]}>
                  {isSelected ? 'Selected' : 'Tap to select'}
                </Text>
              </View>
            </Card>
          </TouchableOpacity>
        );
      })}

      <GradientButton
        title={`Continue — ₪${selectedPkg?.price.toFixed(2)}`}
        icon="arrow-forward"
        onPress={handleContinue}
        style={styles.continueBtn}
      />
    </ScreenWrapper>
  );
}

// ── Styles ────────────────────────────────────────────────
const dynamicStyles = (colors) => StyleSheet.create({
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.accent + '18',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Spacing.radiusFull,
    marginBottom: Spacing.lg,
  },
  locationText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 6,
  },

  pkgCard: {
    marginBottom: Spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  pkgCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },

  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderBottomLeftRadius: Spacing.radiusMd,
  },
  popularText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  pkgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  pkgIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgCardLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pkgIconWrapSelected: {
    backgroundColor: colors.primary + '22',
  },
  pkgInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  pkgPrice: {
    color: colors.accent,
  },
  pkgDesc: {
    marginBottom: Spacing.sm,
  },

  tags: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCardLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Spacing.radiusSm,
    marginRight: Spacing.sm,
  },
  tagText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
    fontWeight: '500',
  },

  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },

  continueBtn: {
    marginTop: Spacing.md,
  },
});
