/**
 * ============================================================
 *  AirSnap — HiveAdminScreen (admin-only)
 * ============================================================
 *  Lets an admin place / delete drone hives on a live map.
 *
 *  Visible only when user.email is in ADMIN_EMAILS — the menu
 *  entry in ProfileScreen handles the gate. The server also
 *  enforces admin access on POST/DELETE /hives.
 *
 *  Behaviors:
 *    • Tap on the map → "Place hive here?" prompt → POST
 *    • Long-press an existing marker → "Delete hive?" → DELETE
 *    • Floating action: "Place at my location" — uses GPS
 *    • Live socket updates so multiple admins see changes
 * ============================================================
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useLocation } from '../context';
import { Spacing } from '../theme';
import { simApi, getSimClient } from '../services/SimClient';
import { haversineDistanceMeters } from '../utils/geofence';

// Same constant as server's hiveStore.MERGE_RADIUS_METERS.
const MERGE_RADIUS_METERS = 25;

export default function HiveAdminScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = dynamicStyles(colors);
  const { position } = useLocation();

  const [hives, setHives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [placePrompt, setPlacePrompt] = useState(null); // { latitude, longitude }
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const mapRef = useRef(null);

  // ── Initial load + live updates ─────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await simApi.listHives();
        if (mounted) setHives(res.hives || []);
      } catch (err) {
        if (mounted) Alert.alert('Could not load hives', err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const sim = getSimClient();
    sim.connect().catch(() => {});
    const offCreate = sim.onHiveCreated((hive) => {
      setHives((prev) => (prev.some((h) => h.id === hive.id) ? prev : [...prev, hive]));
    });
    const offUpdate = sim.onHiveUpdated((hive) => {
      setHives((prev) => prev.map((h) => (h.id === hive.id ? hive : h)));
    });
    const offDelete = sim.onHiveDeleted(({ id }) => {
      setHives((prev) => prev.filter((h) => h.id !== id));
    });

    return () => {
      mounted = false;
      offCreate();
      offUpdate();
      offDelete();
    };
  }, []);

  // ── Initial map region ──────────────────────────────────
  const initialRegion = position
    ? {
        latitude: position.latitude,
        longitude: position.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }
    : hives.length
    ? {
        latitude: hives[0].latitude,
        longitude: hives[0].longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : { latitude: 31.8312, longitude: 35.1286, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  // ── Place / delete handlers ─────────────────────────────
  const promptPlace = (latitude, longitude) => {
    setName('');
    setPlacePrompt({ latitude, longitude });
  };

  const handleConfirmPlace = async () => {
    if (!placePrompt) return;
    setSaving(true);
    try {
      const { hive, merged } = await simApi.createHive({
        name: name.trim() || 'Unnamed Hive',
        latitude: placePrompt.latitude,
        longitude: placePrompt.longitude,
      });
      // merged=true means the server folded this into a nearby existing hive
      // (incremented its capacity). Either way the socket listener will
      // refresh the list — but we update optimistically too.
      setHives((prev) => {
        const exists = prev.some((h) => h.id === hive.id);
        return exists ? prev.map((h) => (h.id === hive.id ? hive : h)) : [...prev, hive];
      });
      setPlacePrompt(null);
      setName('');
      if (merged) {
        Alert.alert(
          'Drone added',
          `Added a drone to "${hive.name}". Hive now has ${hive.capacity} drones.`
        );
      }
    } catch (err) {
      Alert.alert('Could not place hive', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (hive) => {
    Alert.alert(
      'Delete hive?',
      `Remove "${hive.name}" permanently?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await simApi.deleteHive(hive.id);
              setHives((prev) => prev.filter((h) => h.id !== hive.id));
            } catch (err) {
              Alert.alert('Could not delete', err.message);
            }
          },
        },
      ]
    );
  };

  const placeAtCurrentLocation = () => {
    if (!position) {
      Alert.alert('Location unavailable', 'Cannot get your current GPS.');
      return;
    }
    promptPlace(position.latitude, position.longitude);
  };

  // ── Render ──────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Manage Hives</Text>
          <Text style={styles.subtitle}>{hives.length} placed · Tap map to add</Text>
        </View>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        onPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          promptPlace(latitude, longitude);
        }}
      >
        {hives.map((hive) => (
          <Marker
            key={hive.id}
            coordinate={{ latitude: hive.latitude, longitude: hive.longitude }}
            title={hive.name}
            description={
              position
                ? `${(haversineDistanceMeters(position, hive) / 1000).toFixed(2)} km from you`
                : undefined
            }
            pinColor={colors.accent}
            onCalloutPress={() => handleDelete(hive)}
          />
        ))}
      </MapView>

      <TouchableOpacity style={styles.fab} onPress={placeAtCurrentLocation}>
        <Ionicons name="locate" size={22} color="#fff" />
        <Text style={styles.fabText}>Place at my location</Text>
      </TouchableOpacity>

      <View style={styles.hiveListPanel}>
        <Text style={styles.panelTitle}>Active hives</Text>
        {hives.length === 0 ? (
          <Text style={styles.panelEmpty}>No hives yet. Tap on the map to place one.</Text>
        ) : (
          <FlatList
            data={hives}
            keyExtractor={(h) => h.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => {
              const available = Math.max(0, (item.capacity || 1) - (item.activeDrones || 0));
              const total = item.capacity || 1;
              const isFull = available === 0;
              return (
                <View style={[styles.hiveCard, isFull && styles.hiveCardFull]}>
                  <View style={styles.hiveCardHeader}>
                    <Ionicons name="business" size={18} color={isFull ? colors.textMuted : colors.accent} />
                    <View style={[styles.capacityPill, isFull && styles.capacityPillFull]}>
                      <Text style={[styles.capacityText, isFull && styles.capacityTextFull]}>
                        {available}/{total}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.hiveName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.hiveCoords}>
                    {item.activeDrones || 0} in use · {item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}
                  </Text>
                  <TouchableOpacity onPress={() => handleDelete(item)}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
      </View>

      <Modal
        visible={!!placePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setPlacePrompt(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {(() => {
              const nearby = placePrompt && hives.find(
                (h) => haversineDistanceMeters(placePrompt, h) <= MERGE_RADIUS_METERS
              );
              return (
                <>
                  <Text style={styles.modalTitle}>
                    {nearby ? `Add a drone to "${nearby.name}"?` : 'Place a hive here?'}
                  </Text>
                  {nearby ? (
                    <Text style={styles.modalCoords}>
                      Capacity will go from {nearby.capacity} to {nearby.capacity + 1}.
                    </Text>
                  ) : placePrompt ? (
                    <Text style={styles.modalCoords}>
                      {placePrompt.latitude.toFixed(5)}, {placePrompt.longitude.toFixed(5)}
                    </Text>
                  ) : null}
                  {!nearby && (
                    <TextInput
                      style={styles.input}
                      placeholder="Hive name (e.g. Central Park Hive)"
                      placeholderTextColor={colors.textMuted}
                      value={name}
                      onChangeText={setName}
                      autoFocus
                      maxLength={60}
                    />
                  )}
                </>
              );
            })()}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={() => setPlacePrompt(null)}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirm]}
                onPress={handleConfirmPlace}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {placePrompt && hives.some(
                      (h) => haversineDistanceMeters(placePrompt, h) <= MERGE_RADIUS_METERS
                    )
                      ? 'Add drone'
                      : 'Place'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const dynamicStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgDark },
    loadingContainer: {
      flex: 1, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.bgDark,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: Spacing.xl,
      paddingBottom: Spacing.md,
      paddingHorizontal: Spacing.md,
      backgroundColor: colors.bgDark,
    },
    backBtn: { padding: 6, marginRight: 6 },
    title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
    subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    map: { flex: 1 },
    fab: {
      position: 'absolute',
      bottom: 140,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
    },
    fabText: { color: '#fff', fontWeight: '700', marginLeft: 8 },

    hiveListPanel: {
      backgroundColor: colors.bgCard,
      borderTopLeftRadius: Spacing.radiusLg,
      borderTopRightRadius: Spacing.radiusLg,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    panelTitle: {
      fontSize: 12, fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    panelEmpty: {
      fontSize: 13, color: colors.textMuted,
      textAlign: 'center', paddingVertical: 8,
    },
    hiveCard: {
      backgroundColor: colors.bgCardLight,
      borderRadius: Spacing.radiusMd,
      padding: 10,
      marginRight: 10,
      width: 180,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hiveCardFull: {
      borderColor: colors.error + '66',
      opacity: 0.8,
    },
    hiveCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    capacityPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: colors.accent + '33',
    },
    capacityPillFull: {
      backgroundColor: colors.error + '33',
    },
    capacityText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.accent,
    },
    capacityTextFull: {
      color: colors.error,
    },
    hiveName: {
      fontSize: 14, fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 4,
    },
    hiveCoords: {
      fontSize: 11, color: colors.textMuted, marginTop: 2,
    },
    deleteText: {
      fontSize: 12, color: colors.error,
      fontWeight: '600', marginTop: 6,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
    },
    modalCard: {
      width: '100%',
      backgroundColor: colors.bgCard,
      borderRadius: Spacing.radiusLg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalTitle: {
      fontSize: 18, fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    modalCoords: {
      fontSize: 12, color: colors.textMuted, marginBottom: 14,
    },
    input: {
      backgroundColor: colors.bgInput,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: Spacing.radiusMd,
      padding: 12,
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: Spacing.md,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    modalBtn: {
      paddingHorizontal: 18, paddingVertical: 10,
      borderRadius: Spacing.radiusMd,
      marginLeft: 8,
      minWidth: 80,
      alignItems: 'center',
    },
    modalCancel: { backgroundColor: colors.bgCardLight },
    modalCancelText: { color: colors.textSecondary, fontWeight: '600' },
    modalConfirm: { backgroundColor: colors.primary },
    modalConfirmText: { color: '#fff', fontWeight: '700' },
  });
