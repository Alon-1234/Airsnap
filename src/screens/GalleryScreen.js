/**
 * ============================================================
 *  AirSnap — GalleryScreen
 * ============================================================
 *  Auto-updating media gallery that displays all the aerial
 *  content the user has received.
 *
 *  Features:
 *    • Masonry-style 2-column image grid
 *    • Filter chips: All / Photos / Videos
 *    • Pull-to-refresh (simulated)
 *    • Tap a thumbnail to view full-screen (videos play with
 *      native controls)
 *    • Empty-state illustration when no content exists
 *
 *  Data source: AsyncStorage gallery persisted by
 *  ContentDeliveryScreen after each order.
 * ============================================================
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';

import { ScreenWrapper } from '../components/common';
import MediaViewerModal from '../components/MediaViewerModal';
import { useTheme } from '../context';
import { Typography, Spacing } from '../theme';

const GALLERY_KEY = '@airsnap_gallery';

const { width } = Dimensions.get('window');
const COLUMN_GAP = 10;
const TILE_WIDTH = (width - Spacing.screenPadding * 2 - COLUMN_GAP) / 2;

export default function GalleryScreen() {
  // ── State ──────────────────────────────────────────────
  const [filter, setFilter] = useState('all');          // all | photo | video
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);       // { uri, type }
  const [items, setItems] = useState([]);
  const { colors } = useTheme();
  const styles = dynamicStyles(colors);

  // ── Load from AsyncStorage (re-runs on tab focus) ──────
  const reload = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(GALLERY_KEY);
      setItems(raw ? JSON.parse(raw) : []);
    } catch (_) { setItems([]); }
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const data =
    filter === 'all' ? items : items.filter((item) => item.type === filter);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  // ── Render a single gallery tile ──────────────────────
  const renderTile = ({ item, index }) => {
    // Alternate tile heights for a masonry effect
    const tileHeight = index % 3 === 0 ? 220 : 160;

    return (
      <TouchableOpacity
        style={[styles.tile, { height: tileHeight }]}
        activeOpacity={0.85}
        onPress={() => setSelected({ uri: item.uri, type: item.type })}
      >
        {item.type === 'video' ? (
          // A paused Video renders the clip's first frame — an <Image>
          // pointed at an MP4 URL would stay blank.
          <Video
            source={{ uri: item.uri }}
            style={styles.tileImage}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            isMuted
          />
        ) : (
          <Image source={{ uri: item.uri }} style={styles.tileImage} />
        )}

        {/* Date overlay */}
        <View style={styles.tileOverlay}>
          <Text style={styles.tileDate}>{item.date}</Text>
          {item.type === 'video' && (
            <Ionicons name="play-circle" size={20} color={colors.white} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ── Filter chip helper ────────────────────────────────
  const Chip = ({ label, value }) => {
    const isActive = filter === value;
    return (
      <TouchableOpacity
        style={[styles.chip, isActive && styles.chipActive]}
        onPress={() => setFilter(value)}
      >
        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <ScreenWrapper title="My Gallery" scroll={false}>
      {/* Filter chips row */}
      <View style={styles.chipRow}>
        <Chip label="All" value="all" />
        <Chip label="Photos" value="photo" />
        <Chip label="Videos" value="video" />
      </View>

      {data.length === 0 ? (
        /* ── Empty state ─────────────────────────────────── */
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={64} color={colors.textMuted} />
          <Text style={[Typography.h3, { color: colors.textPrimary, marginTop: Spacing.md }]}>No content yet</Text>
          <Text style={[Typography.bodySmall, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
            Order a drone session and your aerial shots will appear here.
          </Text>
        </View>
      ) : (
        /* ── Grid ────────────────────────────────────────── */
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderTile}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {/* ── Full-screen preview (photos + playable videos) ── */}
      <MediaViewerModal item={selected} onClose={() => setSelected(null)} />
    </ScreenWrapper>
  );
}

// ── Styles ────────────────────────────────────────────────
const dynamicStyles = (colors) => StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.md,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Spacing.radiusFull,
    backgroundColor: colors.bgCard,
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary + '22',
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.primary,
  },

  // ── Grid ────────────────────────────────────────────────
  grid: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.xxl,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: COLUMN_GAP,
  },
  tile: {
    width: TILE_WIDTH,
    borderRadius: Spacing.radiusMd,
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tileDate: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Empty state ─────────────────────────────────────────
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
