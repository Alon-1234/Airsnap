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
 *    • Tap a hive in the list → Delete confirm
 *    • Floating action: "Place at my location" — uses GPS
 *    • Per-drone status pills (idle / flying / charging) with
 *      live battery percentage, updated by server hive:updated
 *      events on a 1 Hz heartbeat.
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
  ScrollView,
} from 'react-native';
import MapView, { Marker, Circle as MapCircle } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import { useTheme, useLocation } from '../context';
import { Spacing } from '../theme';
import { simApi, getSimClient } from '../services/SimClient';
import { haversineDistanceMeters } from '../utils/geofence';
import { DELIVERY_ZONE_RADIUS_METERS } from '../constants';

const MERGE_RADIUS_METERS = 25;

function dronePillColor(drone, colors) {
  if (drone.status === 'flying')   return { bg: colors.primary + '22', fg: colors.primary };
  if (drone.status === 'charging') return { bg: '#5AC8FA22', fg: '#5AC8FA' };
  if (drone.battery < 40)          return { bg: colors.warning + '22', fg: colors.warning };
  return { bg: colors.success + '22', fg: colors.success };
}

function pillLabel(drone) {
  if (drone.status === 'flying')   return 'flying';
  if (drone.status === 'charging') return `${Math.round(drone.battery)}% ⚡`;
  return `${Math.round(drone.battery)}%`;
}

export default function HiveAdminScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = dynamicStyles(colors);
  const { position } = useLocation();

  const [hives, setHives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [placePrompt, setPlacePrompt] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const mapRef = useRef(null);

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
      offCreate(); offUpdate(); offDelete();
    };
  }, []);

  const initialRegion = position
    ? { latitude: position.latitude, longitude: position.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : hives.length
    ? { latitude: hives[0].latitude, longitude: hives[0].longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : { latitude: 31.8312, longitude: 35.1286, latitudeDelta: 0.05, longitudeDelta: 0.05 };

  const promptPlace = (latitude, longitude) => {
    setName('');
    setPlacePrompt({ latitude, longitude });
  };

  const nearbyHive = placePrompt && hives.find(
    (h) => haversineDistanceMeters(placePrompt, h) <= MERGE_RADIUS_METERS
  );

  const handleConfirmPlace = async () => {
    if (!placePrompt) return;
    setSaving(true);
    try {
      const { hive, merged } = await simApi.createHive({
        name: name.trim() || 'Unnamed Hive',
        latitude: placePrompt.latitude,
        longitude: placePrompt.longitude,
      });
      setHives((prev) => {
        const exists = prev.some((h) => h.id === hive.id);
        return exists ? prev.map((h) => (h.id === hive.id ? hive : h)) : [...prev, hive];
      });
      setPlacePrompt(null);
      setName('');
      if (merged) {
        Alert.alert('Drone added', `${hive.name} now has ${hive.capacity} drones.`);
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
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Manage Hives</Text>
          <Text style={styles.subtitle}>{hives.length} hive{hives.length === 1 ? '' : 's'} · Tap map to add</Text>
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
          <React.Fragment key={hive.id}>
            <MapCircle
              center={hive}
              radius={DELIVERY_ZONE_RADIUS_METERS}
              strokeColor="rgba(255, 210, 77, 0.7)"
              fillColor="rgba(255, 210, 77, 0.12)"
              strokeWidth={1.5}
            />
            <Marker
              coordinate={{ latitude: hive.latitude, longitude: hive.longitude }}
              title={hive.name}
              description={
                position
                  ? `${(haversineDistanceMeters(position, hive) / 1000).toFixed(2)} km from you`
                  : `${hive.available}/${hive.capacity} available`
              }
              pinColor={colors.accent}
            />
          </React.Fragment>
        ))}
      </MapView>

      <TouchableOpacity style={styles.fab} onPress={placeAtCurrentLocation}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.fabInner}
        >
          <Ionicons name="locate" size={20} color="#fff" />
          <Text style={styles.fabText}>Place at my location</Text>
        </LinearGradient>
      </TouchableOpacity>

      <View style={styles.bottomSheet}>
        <View style={styles.handle} />
        <Text style={styles.panelTitle}>Active fleet</Text>
        {hives.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={42} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No hives placed yet</Text>
            <Text style={styles.emptySub}>Tap a spot on the map to place your first hive.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 12 }}>
            {hives.map((item) => {
              const isFull = (item.available || 0) === 0;
              return (
                <LinearGradient
                  key={item.id}
                  colors={
                    isFull
                      ? [colors.bgCardLight, colors.bgCard]
                      : [colors.primary + '15', colors.bgCard]
                  }
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={[styles.hiveCard, isFull && styles.hiveCardFull]}
                >
                  <View style={styles.hiveCardHeader}>
                    <Ionicons name="business" size={20} color={isFull ? colors.textMuted : colors.accent} />
                    <View style={[styles.capacityPill, isFull && styles.capacityPillFull]}>
                      <Text style={[styles.capacityText, isFull && styles.capacityTextFull]}>
                        {item.available || 0}/{item.capacity || 0}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.hiveName} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.dronePillsRow}>
                    {(item.drones || []).map((d) => {
                      const c = dronePillColor(d, colors);
                      return (
                        <View key={d.id} style={[styles.dronePill, { backgroundColor: c.bg }]}>
                          <View style={[styles.dronePillDot, { backgroundColor: c.fg }]} />
                          <Text style={[styles.dronePillText, { color: c.fg }]}>{pillLabel(d)}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.hiveCoords}>
                    {item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}
                  </Text>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                    <Ionicons name="trash-outline" size={14} color={colors.error} />
                    <Text style={styles.deleteText}>Delete hive</Text>
                  </TouchableOpacity>
                </LinearGradient>
              );
            })}
          </ScrollView>
        )}
      </View>

      <Modal
        visible={!!placePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setPlacePrompt(null)}
      >
        <BlurView intensity={40} tint="dark" style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <LinearGradient
              colors={[colors.gradientStart, colors.gradientEnd]}
              style={styles.modalIconCircle}
            >
              <Ionicons name={nearbyHive ? 'add-circle' : 'business'} size={32} color="#fff" />
            </LinearGradient>

            <Text style={styles.modalTitle}>
              {nearbyHive ? `Add a drone to "${nearbyHive.name}"?` : 'Place a new hive'}
            </Text>
            {nearbyHive ? (
              <Text style={styles.modalCoords}>
                Capacity will go from {nearbyHive.capacity} to {nearbyHive.capacity + 1}.
              </Text>
            ) : placePrompt ? (
              <Text style={styles.modalCoords}>
                {placePrompt.latitude.toFixed(5)}, {placePrompt.longitude.toFixed(5)}
              </Text>
            ) : null}

            {!nearbyHive && (
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

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={() => setPlacePrompt(null)}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmWrap}
                onPress={handleConfirmPlace}
                disabled={saving}
              >
                <LinearGradient
                  colors={[colors.gradientStart, colors.gradientEnd]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.modalConfirm}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalConfirmText}>
                      {nearbyHive ? 'Add drone' : 'Place hive'}
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
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
      paddingTop: Spacing.xl + 4,
      paddingBottom: Spacing.sm,
      paddingHorizontal: Spacing.md,
      backgroundColor: colors.bgDark,
    },
    backBtn: { padding: 6, marginRight: 6 },
    title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
    subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

    map: { flex: 1 },

    fab: {
      position: 'absolute',
      bottom: 240,
      alignSelf: 'center',
      borderRadius: 28,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 6,
    },
    fabInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 28,
    },
    fabText: { color: '#fff', fontWeight: '700', marginLeft: 8 },

    bottomSheet: {
      backgroundColor: colors.bgCard,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: Spacing.md,
      paddingTop: 8,
      paddingBottom: Spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    handle: {
      width: 40, height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 8,
    },
    panelTitle: {
      fontSize: 12, fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 10,
      marginLeft: 4,
    },

    emptyState: {
      alignItems: 'center',
      paddingVertical: Spacing.lg,
    },
    emptyTitle: {
      fontSize: 15, fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 8,
    },
    emptySub: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
      paddingHorizontal: Spacing.lg,
    },

    hiveCard: {
      borderRadius: 16,
      padding: 12,
      marginRight: 10,
      width: 220,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hiveCardFull: { opacity: 0.7 },
    hiveCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    capacityPill: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: colors.accent + '33',
    },
    capacityPillFull: { backgroundColor: colors.error + '33' },
    capacityText: {
      fontSize: 12, fontWeight: '800',
      color: colors.accent,
      fontVariant: ['tabular-nums'],
    },
    capacityTextFull: { color: colors.error },
    hiveName: {
      fontSize: 15, fontWeight: '700',
      color: colors.textPrimary,
      marginTop: 6,
    },
    dronePillsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 8,
      marginBottom: 8,
    },
    dronePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      marginRight: 5,
      marginBottom: 5,
    },
    dronePillDot: {
      width: 6, height: 6, borderRadius: 3,
      marginRight: 5,
    },
    dronePillText: {
      fontSize: 11, fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    hiveCoords: {
      fontSize: 10.5, color: colors.textMuted,
      marginTop: 2,
    },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },
    deleteText: {
      fontSize: 12,
      color: colors.error,
      fontWeight: '600',
      marginLeft: 4,
    },

    modalOverlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
    },
    modalCard: {
      width: '100%',
      backgroundColor: colors.bgCard,
      borderRadius: 24,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.5,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 16 },
      alignItems: 'center',
    },
    modalIconCircle: {
      width: 56, height: 56, borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    modalTitle: {
      fontSize: 18, fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    modalCoords: {
      fontSize: 13, color: colors.textMuted,
      marginBottom: Spacing.md,
      textAlign: 'center',
    },
    input: {
      width: '100%',
      backgroundColor: colors.bgInput,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: Spacing.md,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
    },
    modalBtn: {
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 12,
      flex: 1,
      marginHorizontal: 4,
      alignItems: 'center',
    },
    modalCancel: { backgroundColor: colors.bgCardLight },
    modalCancelText: { color: colors.textSecondary, fontWeight: '700' },
    modalConfirmWrap: { flex: 1, marginHorizontal: 4 },
    modalConfirm: {
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    modalConfirmText: { color: '#fff', fontWeight: '800' },
  });
