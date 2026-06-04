import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenWrapper, Card } from '../components/common';
import { useTheme } from '../context';
import { PARTNER_SITES } from '../constants';
import { Spacing } from '../theme';

export default function PartnersAboutScreen({ navigation }) {
  const { colors } = useTheme();

  return (
    <ScreenWrapper
      title="About Our Partners"
      onBack={() => navigation.goBack()}
      scroll
    >
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        AirSnap partners are verified locations where we support stable drone operations and premium shooting angles.
      </Text>

      {PARTNER_SITES.map((site) => (
        <Card key={site.id} style={styles.card}>
          <Image source={{ uri: site.image }} style={styles.image} />
          <View style={styles.content}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{site.name}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color="#FBBF24" />
                <Text style={styles.ratingText}>{site.rating.toFixed(1)}</Text>
              </View>
            </View>

            <Text style={[styles.description, { color: colors.textSecondary }]}>{site.description || 'Trusted partner location in the AirSnap network.'}</Text>
            <Text style={[styles.coordinates, { color: colors.textMuted }]}>
              {site.latitude.toFixed(4)}, {site.longitude.toFixed(4)}
            </Text>
          </View>
        </Card>
      ))}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: Spacing.md,
  },
  card: {
    marginBottom: Spacing.md,
    overflow: 'hidden',
    padding: 0,
  },
  image: {
    width: '100%',
    height: 150,
  },
  content: {
    padding: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    paddingRight: Spacing.sm,
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
  description: {
    fontSize: 13,
    lineHeight: 19,
  },
  coordinates: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
  },
});
