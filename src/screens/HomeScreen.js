/**
 * ============================================================
 *  AirSnap — HomeScreen (Map-First)
 * ============================================================
 *  Lime-style full-screen map experience.
 *
 *  Behavior:
 *    • Entire screen is the map
 *    • One 500m delivery circle around each hive (live from server)
 *    • Order button uses current location when user is in range
 *      of ANY hive that has an available drone
 *    • Help icon runs demo tour when user is in range
 *    • Hive map updates in real time as admins place/remove hives
 * ============================================================
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import MapView, { Marker, Circle as MapCircle } from 'react-native-maps';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CopilotProvider,
  CopilotStep,
  walkthroughable,
  useCopilot,
} from 'react-native-copilot';

import { ScreenWrapper, GradientButton, TourTooltip, tourTooltipShellStyle } from '../components/common';
import { useTheme, useLocation, useTour } from '../context';
import { Spacing } from '../theme';
import { DELIVERY_ZONE_RADIUS_METERS } from '../constants';
import { haversineDistanceMeters } from '../utils/geofence';
import { simApi, getSimClient } from '../services/SimClient';

const WalkthroughableView = walkthroughable(View);

// Fallback view when no hives are configured yet (so the map isn't blank).
const DEFAULT_REGION = { latitude: 31.8312, longitude: 35.1286, latitudeDelta: 0.05, longitudeDelta: 0.05 };

const DroneHiveMarker = React.memo(function DroneHiveMarker({ fill = '#0A84FF', available = 0, capacity = 0 }) {
  return (
    <Svg width={40} height={40} viewBox="0 0 40 40">
      <Circle cx="20" cy="20" r="19" fill={fill} stroke="#fff" strokeWidth="1.5" />
      <Path d="M20 7L31 14V26L20 33L9 26V14L20 7Z" fill="#FFFFFF" />
      <Circle cx="20" cy="20" r="5" fill="#00D4AA" />
    </Svg>
  );
});

const UserLiveMarker = React.memo(function UserLiveMarker() {
  return (
    <Svg width={30} height={30} viewBox="0 0 30 30">
      <Circle cx="15" cy="15" r="14" fill="rgba(0, 212, 170, 0.25)" />
      <Circle cx="15" cy="15" r="8" fill="#00D4AA" />
      <Circle cx="15" cy="15" r="3" fill="#FFFFFF" />
    </Svg>
  );
});

function HomeMapContent({ navigation }) {
  const { colors } = useTheme();
  const {
    permissionStatus,
    position,
    error: locationError,
    requestPermissionAndRetry,
    openLocationSettings,
  } = useLocation();
  const { start, copilotEvents } = useCopilot();
  const { startTour, endTour } = useTour();

  const FIRST_LAUNCH_KEY = 'tour:home:seen:v2';
  const mapRef = useRef(null);
  const autoStartedRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [currentGuideStepName, setCurrentGuideStepName] = useState(null);
  const [hives, setHives] = useState([]);

  // ── Live hives from server ──────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await simApi.listHives();
        if (mounted) setHives(res.hives || []);
      } catch (_) { /* offline → empty list, geofence will say "no hives" */ }
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

  const userCoords = useMemo(() => {
    if (!position) return null;
    return { latitude: position.latitude, longitude: position.longitude };
  }, [position]);

  // ── Nearest hive to the user ────────────────────────────
  const nearestHiveEntry = useMemo(() => {
    if (!userCoords || !hives.length) return null;
    let best = null;
    for (const h of hives) {
      const d = haversineDistanceMeters(userCoords, h);
      if (!best || d < best.distanceMeters) best = { hive: h, distanceMeters: d };
    }
    return best;
  }, [userCoords, hives]);

  const distanceToHiveMeters = nearestHiveEntry?.distanceMeters ?? null;
  const isInsideDeliveryZone = useMemo(() => {
    if (distanceToHiveMeters == null) return false;
    return distanceToHiveMeters <= DELIVERY_ZONE_RADIUS_METERS;
  }, [distanceToHiveMeters]);

  // ── Order CTA + helper text ────────────────────────────
  const nearestHive = nearestHiveEntry?.hive;
  const nearestHiveAvailable = nearestHive?.available ?? 0;
  const handleOrderFromLiveLocation = useCallback(() => {
    if (!userCoords || !isInsideDeliveryZone) return;
    navigation.navigate('PackageSelect', {
      locationType: 'live',
      siteName: 'Live Location',
      latitude: userCoords.latitude,
      longitude: userCoords.longitude,
    });
  }, [navigation, userCoords, isInsideDeliveryZone]);

  const isOrderEnabled = Boolean(
    userCoords && isInsideDeliveryZone && nearestHiveAvailable > 0
  );

  // ── Compute camera target for tour transitions ─────────
  const cameraTarget = useMemo(() => {
    if (nearestHive) return { latitude: nearestHive.latitude, longitude: nearestHive.longitude };
    if (hives.length) return { latitude: hives[0].latitude, longitude: hives[0].longitude };
    if (userCoords) return userCoords;
    return { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude };
  }, [nearestHive, hives, userCoords]);

  const getCircleFitCoordinates = useCallback(() => {
    if (!nearestHive) return [cameraTarget];
    const latOffset = DELIVERY_ZONE_RADIUS_METERS / 111320;
    const latRad = (nearestHive.latitude * Math.PI) / 180;
    const metersPerDegreeLng = 111320 * Math.cos(latRad);
    const lngOffset = DELIVERY_ZONE_RADIUS_METERS / metersPerDegreeLng;
    return [
      { latitude: nearestHive.latitude, longitude: nearestHive.longitude },
      { latitude: nearestHive.latitude + latOffset, longitude: nearestHive.longitude },
      { latitude: nearestHive.latitude - latOffset, longitude: nearestHive.longitude },
      { latitude: nearestHive.latitude, longitude: nearestHive.longitude + lngOffset },
      { latitude: nearestHive.latitude, longitude: nearestHive.longitude - lngOffset },
    ];
  }, [nearestHive, cameraTarget]);

  useEffect(() => {
    if (!copilotEvents) return undefined;
    const onStepChange = (step) => {
      if (!mapRef.current || !step?.name) return;
      setCurrentGuideStepName(step.name);
      if (step.name === 'hiveMarker') {
        mapRef.current.animateToRegion(
          { ...cameraTarget, latitudeDelta: 0.028, longitudeDelta: 0.028 },
          520
        );
      }
      if (step.name === 'border') {
        mapRef.current.fitToCoordinates(getCircleFitCoordinates(), {
          edgePadding: { top: 100, right: 90, bottom: 180, left: 90 },
          animated: true,
        });
      }
    };
    const onStart = () => setCurrentGuideStepName('hiveMarker');
    const onStop = () => {
      setCurrentGuideStepName(null);
      endTour();
    };
    copilotEvents.on('start', onStart);
    copilotEvents.on('stepChange', onStepChange);
    copilotEvents.on('stop', onStop);
    return () => {
      copilotEvents.off('start', onStart);
      copilotEvents.off('stepChange', onStepChange);
      copilotEvents.off('stop', onStop);
    };
  }, [copilotEvents, endTour, getCircleFitCoordinates, cameraTarget]);

  const startGuide = useCallback(() => {
    if (!isMapReady) {
      Alert.alert('Map is loading', 'Please wait a moment for the map to finish loading.');
      return;
    }
    mapRef.current?.animateToRegion(
      { ...cameraTarget, latitudeDelta: 0.08, longitudeDelta: 0.08 },
      280
    );
    setTimeout(() => start(), 320);
  }, [isMapReady, start, cameraTarget]);

  const baseHiveColor = '#0A84FF';
  const focusedHiveColor = '#FF3B30';
  const hiveMarkerColor = currentGuideStepName === 'hiveMarker' ? focusedHiveColor : baseHiveColor;
  const borderStrokeColor =
    currentGuideStepName === 'border' ? 'rgba(255,59,48,0.98)' : 'rgba(10,132,255,0.95)';
  const borderFillColor =
    currentGuideStepName === 'border' ? 'rgba(255,59,48,0.16)' : 'rgba(10,132,255,0.12)';

  const handleGuidePress = useCallback(() => {
    if (!isInsideDeliveryZone) {
      Alert.alert('Unable to start demo', 'Be in range of a drone hive to start the demo.');
      return;
    }
    startTour();
    startGuide();
  }, [isInsideDeliveryZone, startGuide, startTour]);

  useEffect(() => {
    if (autoStartedRef.current || !isMapReady || !isInsideDeliveryZone) return;
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
        if (cancelled || seen) return;
        autoStartedRef.current = true;
        await AsyncStorage.setItem(FIRST_LAUNCH_KEY, '1');
        startTour();
        startGuide();
      } catch { /* ignore — tour is non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [isMapReady, isInsideDeliveryZone, startGuide, startTour]);

  // ── Helper text ────────────────────────────────────────
  let orderHelperText = 'Waiting for high-accuracy location lock...';
  if (permissionStatus !== 'granted') {
    orderHelperText = 'Location permission is required to check delivery eligibility.';
  } else if (!hives.length) {
    orderHelperText = 'No hives configured yet. Ask an admin to place one.';
  } else if (userCoords && !isInsideDeliveryZone) {
    orderHelperText = 'You are currently outside the delivery zone.';
  } else if (isInsideDeliveryZone && nearestHiveAvailable === 0) {
    orderHelperText = 'In range, but all drones at this hive are recharging.';
  } else if (isOrderEnabled) {
    orderHelperText = `You are inside the delivery zone. ${nearestHiveAvailable} drone${nearestHiveAvailable === 1 ? '' : 's'} ready.`;
  }

  return (
    <ScreenWrapper scroll={false} style={styles.fullScreenContent}>
      <View style={styles.mapRoot}>
        <MapView
          ref={mapRef}
          style={styles.fullMap}
          initialRegion={
            hives.length
              ? { latitude: hives[0].latitude, longitude: hives[0].longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
              : DEFAULT_REGION
          }
          mapType="mutedStandard"
          showsUserLocation
          showsMyLocationButton
          showsCompass
          showsScale
          scrollEnabled
          zoomEnabled
          rotateEnabled={false}
          onMapReady={() => setIsMapReady(true)}
        >
          {hives.map((hive) => (
            <React.Fragment key={hive.id}>
              <MapCircle
                center={hive}
                radius={DELIVERY_ZONE_RADIUS_METERS}
                strokeColor={borderStrokeColor}
                fillColor={borderFillColor}
                strokeWidth={2}
              />
              <Marker coordinate={hive} tracksViewChanges={false}>
                <DroneHiveMarker
                  fill={hive.id === nearestHive?.id ? hiveMarkerColor : baseHiveColor}
                  available={hive.available}
                  capacity={hive.capacity}
                />
              </Marker>
            </React.Fragment>
          ))}

          {userCoords && (
            <Marker coordinate={userCoords} tracksViewChanges={false}>
              <UserLiveMarker />
            </Marker>
          )}
        </MapView>

        {/* Top-right help/demo icon */}
        <TouchableOpacity
          style={[styles.helpBtn, { backgroundColor: colors.bgCard + 'E6' }]}
          onPress={handleGuidePress}
          activeOpacity={0.85}
        >
          <Ionicons name="help-circle" size={26} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* Hidden anchors keep step order stable while map color/zoom drives the demo focus. */}
        <CopilotStep text="This is your nearest drone hive." order={1} name="hiveMarker">
          <WalkthroughableView pointerEvents="none" style={styles.hiddenGuideAnchorTop} />
        </CopilotStep>

        <CopilotStep
          text="This ring defines the 500 meters border, and you are currently inside it."
          order={2}
          name="border"
        >
          <WalkthroughableView pointerEvents="none" style={styles.hiddenGuideAnchorMid} />
        </CopilotStep>

        {/* Bottom status panel */}
        <View style={[styles.bottomPanel, { backgroundColor: colors.bgCard + 'EE' }]}>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {nearestHive ? `Nearest hive: ${nearestHive.name}` : `${hives.length} hive${hives.length === 1 ? '' : 's'} placed`}
            </Text>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>500 m active border</Text>
          </View>

          <View style={[styles.statusPill, { backgroundColor: isInsideDeliveryZone ? colors.success + '22' : colors.warning + '22' }]}>
            <Ionicons
              name={isInsideDeliveryZone ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={isInsideDeliveryZone ? colors.success : colors.warning}
            />
            <Text style={[styles.statusPillText, { color: isInsideDeliveryZone ? colors.success : colors.warning }]}>
              {isInsideDeliveryZone ? 'Inside delivery border' : 'Outside delivery border'}
            </Text>
          </View>

          <Text style={[styles.orderHelper, { color: colors.textMuted }]}>
            {distanceToHiveMeters == null
              ? orderHelperText
              : `${orderHelperText} Distance ${(distanceToHiveMeters / 1000).toFixed(2)} km`}
          </Text>

          {permissionStatus !== 'granted' && (
            <View style={styles.permissionActionsRow}>
              <GradientButton
                title="Grant GPS Permission"
                icon="locate"
                onPress={requestPermissionAndRetry}
                style={styles.permissionBtn}
              />
              <GradientButton
                title="Open Settings"
                icon="settings"
                onPress={openLocationSettings}
                style={styles.permissionBtn}
              />
            </View>
          )}

          {!!locationError && (
            <Text style={[styles.errorText, { color: colors.error }]}>{locationError}</Text>
          )}

          <CopilotStep text="Tap here to order when you are in range." order={3} name="orderButton">
            <WalkthroughableView>
              <GradientButton
                title="Order Drone"
                icon="paper-plane"
                onPress={handleOrderFromLiveLocation}
                disabled={!isOrderEnabled}
                style={styles.orderButton}
              />
            </WalkthroughableView>
          </CopilotStep>
        </View>
      </View>
    </ScreenWrapper>
  );
}

export default function HomeScreen(props) {
  return (
    <CopilotProvider
      labels={{ previous: 'Back', next: 'Next', skip: 'Skip', finish: 'Done' }}
      tooltipComponent={TourTooltip}
      tooltipStyle={tourTooltipShellStyle}
      stepNumberComponent={() => null}
      arrowSize={0}
      arrowColor="transparent"
      backdropColor="transparent"
      animated
      verticalOffset={0}
    >
      <HomeMapContent {...props} />
    </CopilotProvider>
  );
}

const styles = StyleSheet.create({
  fullScreenContent: { flex: 1 },
  mapRoot: { flex: 1, position: 'relative' },
  fullMap: { ...StyleSheet.absoluteFillObject },

  helpBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },

  hiddenGuideAnchorTop: {
    position: 'absolute',
    width: 4, height: 4,
    left: Spacing.md, top: 92,
    backgroundColor: 'transparent',
    opacity: 0.01,
  },
  hiddenGuideAnchorMid: {
    position: 'absolute',
    width: 4, height: 4,
    left: Spacing.md, top: 150,
    backgroundColor: 'transparent',
    opacity: 0.01,
  },

  bottomPanel: {
    position: 'absolute',
    left: Spacing.md, right: Spacing.md, bottom: Spacing.md,
    borderRadius: Spacing.radiusLg,
    padding: Spacing.md,
    zIndex: 30,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { fontSize: 12, fontWeight: '600', flex: 1, marginRight: 8 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6,
    marginTop: Spacing.xs,
  },
  statusPillText: { fontSize: 12, fontWeight: '700', marginLeft: 6 },

  errorText: { marginTop: Spacing.xs, fontSize: 12, lineHeight: 18 },

  permissionActionsRow: { marginTop: Spacing.md },
  permissionBtn: { marginBottom: Spacing.sm },

  orderButton: { marginTop: Spacing.md },
  orderHelper: { marginTop: Spacing.xs, fontSize: 12 },
});
