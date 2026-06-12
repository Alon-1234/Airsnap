/**
 * ============================================================
 *  AirSnap — GalleryScreen
 * ============================================================
 *  Media gallery organized as one folder per drone flight.
 *
 *  Two levels:
 *    • Folder grid — one card per order/flight with a cover
 *      photo, site name, date and media counts. Pencil icon
 *      renames the folder (persisted).
 *    • Folder detail — masonry grid of that flight's media
 *      with All / Photos / Videos filter chips. Tap to view
 *      full-screen (videos play with native controls).
 *      "Save all" downloads the whole flight to Photos.
 *
 *  Data sources (AsyncStorage, persisted by ContentDelivery):
 *    @airsnap_gallery      — flat media items { id, uri, type, date, orderId }
 *    @airsnap_orders       — order metadata  { id, site, package, date, ... }
 *    @airsnap_folder_names — user renames    { [folderId]: customName }
 * ============================================================
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Video, ResizeMode } from 'expo-av';

import { ScreenWrapper } from '../components/common';
import MediaViewerModal from '../components/MediaViewerModal';
import { saveMediaToDevice } from '../utils/mediaDownload';
import { useTheme } from '../context';
import { Typography, Spacing } from '../theme';

const GALLERY_KEY = '@airsnap_gallery';
const ORDERS_KEY = '@airsnap_orders';
const FOLDER_NAMES_KEY = '@airsnap_folder_names';

const { width } = Dimensions.get('window');
const COLUMN_GAP = 10;
const TILE_WIDTH = (width - Spacing.screenPadding * 2 - COLUMN_GAP) / 2;

export default function GalleryScreen() {
  // ── State ──────────────────────────────────────────────
  const [filter, setFilter] = useState('all');          // all | photo | video
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);       // { uri, type }
  const [items, setItems] = useState([]);
  const [ordersMeta, setOrdersMeta] = useState({});     // orderId -> order
  const [folderNames, setFolderNames] = useState({});   // folderId -> custom name
  const [openFolderId, setOpenFolderId] = useState(null);
  const [renaming, setRenaming] = useState(null);       // { id, currentName }
  const [renameText, setRenameText] = useState('');
  const [savingAll, setSavingAll] = useState(null);     // null | { done, total }
  const { colors } = useTheme();
  const styles = dynamicStyles(colors);

  // ── Load from AsyncStorage (re-runs on tab focus) ──────
  const reload = useCallback(async () => {
    try {
      const [galleryRaw, ordersRaw, namesRaw] = await Promise.all([
        AsyncStorage.getItem(GALLERY_KEY),
        AsyncStorage.getItem(ORDERS_KEY),
        AsyncStorage.getItem(FOLDER_NAMES_KEY),
      ]);
      setItems(galleryRaw ? JSON.parse(galleryRaw) : []);
      const orders = ordersRaw ? JSON.parse(ordersRaw) : [];
      const meta = {};
      for (const o of orders) meta[o.id] = o;
      setOrdersMeta(meta);
      setFolderNames(namesRaw ? JSON.parse(namesRaw) : {});
    } catch (_) {
      setItems([]);
      setOrdersMeta({});
      setFolderNames({});
    }
  }, []);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  // ── Group flat items into per-flight folders ───────────
  const folders = useMemo(() => {
    const byId = new Map();
    for (const item of items) {
      const key = item.orderId || 'other';
      if (!byId.has(key)) {
        const meta = ordersMeta[key];
        byId.set(key, {
          id: key,
          title:
            folderNames[key] ||
            (key === 'other' ? 'Other media' : meta?.site || 'Drone flight'),
          date: meta?.date || item.date || '',
          packageName: meta?.package || null,
          items: [],
        });
      }
      byId.get(key).items.push(item);
    }
    // Items are persisted newest-first, so first-seen order = newest flight first.
    return Array.from(byId.values()).map((f) => ({
      ...f,
      cover: f.items.find((i) => i.type === 'photo') || f.items[0],
      photoCount: f.items.filter((i) => i.type === 'photo').length,
      videoCount: f.items.filter((i) => i.type === 'video').length,
    }));
  }, [items, ordersMeta, folderNames]);

  const openFolder = folders.find((f) => f.id === openFolderId) || null;
  const folderItems = openFolder
    ? filter === 'all'
      ? openFolder.items
      : openFolder.items.filter((i) => i.type === filter)
    : [];

  // ── Rename ──────────────────────────────────────────────
  const startRename = (folder) => {
    setRenameText(folder.title);
    setRenaming({ id: folder.id, currentName: folder.title });
  };

  const commitRename = async () => {
    const name = renameText.trim();
    if (!renaming) return;
    const next = { ...folderNames };
    if (name && name !== renaming.currentName) {
      next[renaming.id] = name;
    } else if (!name) {
      // Cleared → fall back to the default title.
      delete next[renaming.id];
    }
    setFolderNames(next);
    setRenaming(null);
    try {
      await AsyncStorage.setItem(FOLDER_NAMES_KEY, JSON.stringify(next));
    } catch (_) { /* non-critical — name still applied for this session */ }
  };

  // ── Save all media in the open folder to Photos ────────
  const handleSaveAll = async () => {
    if (!openFolder || savingAll) return;
    const toSave = openFolder.items;
    if (!toSave.length) return;
    setSavingAll({ done: 0, total: toSave.length });
    let failed = 0;
    for (let i = 0; i < toSave.length; i++) {
      try {
        await saveMediaToDevice(toSave[i].uri, toSave[i].type);
      } catch (err) {
        failed += 1;
        // Permission denied → no point continuing the loop.
        if (/permission/i.test(err.message || '')) {
          setSavingAll(null);
          Alert.alert('Could not save', err.message);
          return;
        }
      }
      setSavingAll({ done: i + 1, total: toSave.length });
    }
    setSavingAll(null);
    Alert.alert(
      failed ? 'Partially saved' : 'Saved',
      failed
        ? `${toSave.length - failed} of ${toSave.length} items saved to Photos (${failed} failed).`
        : `All ${toSave.length} items saved to your Photos.`,
    );
  };

  // ── Tile renderers ──────────────────────────────────────
  const renderFolder = ({ item: folder }) => (
    <TouchableOpacity
      style={styles.folderCard}
      activeOpacity={0.85}
      onPress={() => {
        setFilter('all');
        setOpenFolderId(folder.id);
      }}
      onLongPress={() => startRename(folder)}
    >
      {folder.cover?.type === 'video' ? (
        <Video
          source={{ uri: folder.cover.uri }}
          style={styles.folderCover}
          resizeMode={ResizeMode.COVER}
          shouldPlay={false}
          isMuted
        />
      ) : folder.cover ? (
        <Image source={{ uri: folder.cover.uri }} style={styles.folderCover} />
      ) : (
        <View style={[styles.folderCover, styles.folderCoverEmpty]}>
          <Ionicons name="images-outline" size={28} color={colors.textMuted} />
        </View>
      )}

      {/* Rename (pencil) — also reachable via long-press on the card */}
      <TouchableOpacity
        style={styles.renameBtn}
        onPress={() => startRename(folder)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="pencil" size={14} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.folderInfo}>
        <Text style={[Typography.bodySemibold, { color: colors.textPrimary }]} numberOfLines={1}>
          {folder.title}
        </Text>
        <Text style={[Typography.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
          {folder.date}
          {folder.packageName ? ` • ${folder.packageName}` : ''}
        </Text>
        <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
          {folder.photoCount} photos{folder.videoCount ? ` • ${folder.videoCount} video` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );

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

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary}
    />
  );

  // ── Rename modal (shared by grid + detail) ──────────────
  const renameModal = (
    <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
      <View style={styles.renameBackdrop}>
        <View style={styles.renameCard}>
          <Text style={[Typography.bodySemibold, { color: colors.textPrimary, marginBottom: Spacing.sm }]}>
            Rename folder
          </Text>
          <TextInput
            style={styles.renameInput}
            value={renameText}
            onChangeText={setRenameText}
            placeholder="Folder name"
            placeholderTextColor={colors.textMuted}
            autoFocus
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={commitRename}
          />
          <View style={styles.renameActions}>
            <TouchableOpacity style={styles.renameCancel} onPress={() => setRenaming(null)}>
              <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.renameSave, { backgroundColor: colors.primary }]} onPress={commitRename}>
              <Text style={[Typography.bodySmall, { color: '#FFFFFF', fontWeight: '700' }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ── Render: folder detail ───────────────────────────────
  if (openFolder) {
    return (
      <ScreenWrapper title="My Gallery" scroll={false}>
        <View style={styles.folderHeader}>
          <TouchableOpacity
            style={styles.folderHeaderBack}
            onPress={() => setOpenFolderId(null)}
          >
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text style={[Typography.bodySemibold, { color: colors.textPrimary }]} numberOfLines={1}>
                {openFolder.title}
              </Text>
              <Text style={[Typography.caption, { color: colors.textMuted }]}>
                {openFolder.date} • {openFolder.items.length} items
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => startRename(openFolder)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={handleSaveAll}
            disabled={!!savingAll}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {savingAll ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="download-outline" size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {savingAll && (
          <Text style={[Typography.caption, { color: colors.textMuted, paddingHorizontal: Spacing.screenPadding, marginBottom: Spacing.xs }]}>
            Saving {savingAll.done}/{savingAll.total} to Photos…
          </Text>
        )}

        <View style={styles.chipRow}>
          <Chip label="All" value="all" />
          <Chip label="Photos" value="photo" />
          <Chip label="Videos" value="video" />
        </View>

        {folderItems.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={64} color={colors.textMuted} />
            <Text style={[Typography.bodySmall, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
              Nothing here for this filter.
            </Text>
          </View>
        ) : (
          <FlatList
            data={folderItems}
            keyExtractor={(item) => item.id}
            renderItem={renderTile}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          />
        )}

        <MediaViewerModal item={selected} onClose={() => setSelected(null)} />
        {renameModal}
      </ScreenWrapper>
    );
  }

  // ── Render: folder grid ─────────────────────────────────
  return (
    <ScreenWrapper title="My Gallery" scroll={false}>
      {folders.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={64} color={colors.textMuted} />
          <Text style={[Typography.h3, { color: colors.textPrimary, marginTop: Spacing.md }]}>No content yet</Text>
          <Text style={[Typography.bodySmall, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
            Order a drone session and your aerial shots will appear here, one folder per flight.
          </Text>
        </View>
      ) : (
        <FlatList
          data={folders}
          keyExtractor={(folder) => folder.id}
          renderItem={renderFolder}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        />
      )}
      {renameModal}
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

  // ── Folder grid ─────────────────────────────────────────
  folderCard: {
    width: TILE_WIDTH,
    borderRadius: Spacing.radiusMd,
    backgroundColor: colors.bgCard,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  folderCover: {
    width: '100%',
    height: 120,
    backgroundColor: colors.bgCardLight,
  },
  folderCoverEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderInfo: {
    padding: Spacing.sm,
  },
  renameBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenPadding,
    marginBottom: Spacing.md,
  },
  folderHeaderBack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.xs,
  },

  // ── Rename modal ────────────────────────────────────────
  renameBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  renameCard: {
    width: '100%',
    borderRadius: Spacing.radiusMd,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
  },
  renameInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Spacing.radiusSm,
    backgroundColor: colors.bgCardLight,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.md,
  },
  renameCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: Spacing.sm,
  },
  renameSave: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Spacing.radiusFull,
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
