import React from 'react';
import { View, Text, Image, FlatList, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '../common';
import { useTheme, useLocation } from '../../context';
import { PARTNER_SITES, DELIVERY_ZONE_RADIUS_METERS } from '../../constants';
import { haversineDistanceMeters } from '../../utils/geofence';
import { Spacing } from '../../theme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - Spacing.screenPadding * 2;

export default function PartnerTab({ onSelectSite, onAboutPartners }) {
  const { colors } = useTheme();
  const { position } = useLocation();

  const renderSiteCard = ({ item }) => {
    const userCoords = position
      ? { latitude: position.latitude, longitude: position.longitude }
      : null;
    const distanceMeters = userCoords ? haversineDistanceMeters(userCoords, item) : null;
    const isInRange = distanceMeters != null && distanceMeters <= DELIVERY_ZONE_RADIUS_METERS;

    return (
      <TouchableOpacity
        style={[styles.siteCard, !isInRange && styles.siteCardDisabled]}
        activeOpacity={isInRange ? 0.88 : 1}
        onPress={() => isInRange && onSelectSite?.(item)}
        disabled={!isInRange}
      >
        <Image source={{ uri: item.image }} style={styles.siteImage} />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.overlay}>
          <Text style={styles.siteName}>{item.name}</Text>
          <View style={styles.row}>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color="#FBBF24" />
              <Text style={styles.ratingText}>{item.rating}</Text>
            </View>
            <View style={[styles.cta, { backgroundColor: isInRange ? colors.primary + '99' : '#6B7280CC' }]}>
              <Text style={styles.ctaText}>{isInRange ? 'Open' : 'Out of range'}</Text>
              <Ionicons name={isInRange ? 'arrow-forward' : 'close'} size={14} color="#fff" />
            </View>
          </View>
          <Text style={styles.distanceText}>
            {distanceMeters == null ? 'Distance unavailable' : `${(distanceMeters / 1000).toFixed(2)} km from you`}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <Card>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Partner Locations</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>Only sites within 500m are clickable for ordering.</Text>

      <FlatList
        data={PARTNER_SITES}
        keyExtractor={(item) => item.id}
        renderItem={renderSiteCard}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + Spacing.md}
        decelerationRate="fast"
      />

      <TouchableOpacity
        style={[styles.aboutBtn, { backgroundColor: colors.bgCardLight }]}
        activeOpacity={0.85}
        onPress={onAboutPartners}
      >
        <Text style={[styles.aboutBtnText, { color: colors.textPrimary }]}>About our partners</Text>
        <Ionicons name="information-circle" size={18} color={colors.primary} />
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    marginBottom: Spacing.md,
  },
  siteCard: {
    width: CARD_WIDTH,
    height: 190,
    borderRadius: Spacing.radiusLg,
    overflow: 'hidden',
    marginRight: Spacing.md,
  },
  siteCardDisabled: {
    opacity: 0.55,
  },
  siteImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  siteName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    marginLeft: 4,
    color: '#FBBF24',
    fontWeight: '700',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ctaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 4,
  },
  distanceText: {
    marginTop: 8,
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  aboutBtn: {
    marginTop: Spacing.md,
    borderRadius: Spacing.radiusMd,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aboutBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
