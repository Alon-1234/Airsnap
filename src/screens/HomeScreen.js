/**
 * ============================================================
 *  AirSnap — HomeScreen (Map-First)
 * ============================================================
 *  Lime-style full-screen map experience.
 *
 *  Behavior:
 *    • Entire screen is the map
 *    • 500m delivery circle around the Hive
 *    • Order button uses current location when user is in range
 *    • Help icon runs demo tour when user is out of range
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
import {
  DRONE_HIVE,
  DELIVERY_ZONE_RADIUS_METERS,
} from '../constants';
import { haversineDistanceMeters } from '../utils/geofence';

const WalkthroughableView = walkthroughable(View);

const DroneHiveMarker = React.memo(function DroneHiveMarker({ fill = '#0A84FF' }) {
  return (
    <Svg width={34} height={34} viewBox="0 0 34 34">
      <Circle cx="17" cy="17" r="16" fill={fill} />
      <Path d="M17 6L26 12V22L17 28L8 22V12L17 6Z" fill="#FFFFFF" />
      <Circle cx="17" cy="17" r="4" fill="#00D4AA" />
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

  const userCoords = useMemo(() => {
    if (!position) return null;
    return {
      latitude: position.latitude,
      longitude: position.longitude,
    };
  }, [position]);

  const distanceToHiveMeters = useMemo(() => {
    if (!userCoords) return null;
    return haversineDistanceMeters(userCoords, DRONE_HIVE);
  }, [userCoords]);

  const isInsideDeliveryZone = useMemo(() => {
    if (distanceToHiveMeters == null) return false;
    return distanceToHiveMeters <= DELIVERY_ZONE_RADIUS_METERS;
  }, [distanceToHiveMeters]);

  const handleOrderFromLiveLocation = useCallback(() => {
    if (!userCoords || !isInsideDeliveryZone) return;
    navigation.navigate('PackageSelect', {
      locationType: 'live',
      siteName: 'Live Location',
      latitude: userCoords.latitude,
      longitude: userCoords.longitude,
    });
  }, [navigation, userCoords, isInsideDeliveryZone]);

  const isOrderEnabled = Boolean(userCoords && isInsideDeliveryZone);

  const getCircleFitCoordinates = useCallback(() => {
    const latOffset = DELIVERY_ZONE_RADIUS_METERS / 111320;
    const latRad = (DRONE_HIVE.latitude * Math.PI) / 180;
    const metersPerDegreeLng = 111320 * Math.cos(latRad);
    const lngOffset = DELIVERY_ZONE_RADIUS_METERS / metersPerDegreeLng;

    return [
      DRONE_HIVE,
      { latitude: DRONE_HIVE.latitude + latOffset, longitude: DRONE_HIVE.longitude },
      { latitude: DRONE_HIVE.latitude - latOffset, longitude: DRONE_HIVE.longitude },
      { latitude: DRONE_HIVE.latitude, longitude: DRONE_HIVE.longitude + lngOffset },
      { latitude: DRONE_HIVE.latitude, longitude: DRONE_HIVE.longitude - lngOffset },
    ];
  }, []);

  useEffect(() => {
    if (!copilotEvents) return undefined;

    const onStepChange = (step) => {
      if (!mapRef.current || !step?.name) return;
      setCurrentGuideStepName(step.name);

      if (step.name === 'hiveMarker') {
        mapRef.current.animateToRegion(
          {
            latitude: DRONE_HIVE.latitude,
            longitude: DRONE_HIVE.longitude,
            latitudeDelta: 0.028,
            longitudeDelta: 0.028,
          },
          520
        );
      }

      if (step.name === 'border') {
        mapRef.current.fitToCoordinates(getCircleFitCoordinates(), {
          edgePadding: {
            top: 100,
            right: 90,
            bottom: 180,
            left: 90,
          },
          animated: true,
        });
      }
    };

    const onStart = () => {
      setCurrentGuideStepName('hiveMarker');
    };

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
  }, [copilotEvents, endTour, getCircleFitCoordinates]);

  const startGuide = useCallback(() => {
    if (!isMapReady) {
      Alert.alert('Map is loading', 'Please wait a moment for the map to finish loading.');
      return;
    }
    mapRef.current?.animateToRegion(
      {
        latitude: DRONE_HIVE.latitude,
        longitude: DRONE_HIVE.longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      },
      280
    );

    setTimeout(() => {
      start();
    }, 320);
  }, [isMapReady, start]);

  const hiveMarkerColor =
    currentGuideStepName === 'hiveMarker' ? '#FF3B30' : '#0A84FF';

  const borderStrokeColor =
    currentGuideStepName === 'border'
      ? 'rgba(255,59,48,0.98)'
      : 'rgba(10,132,255,0.95)';

  const borderFillColor =
    currentGuideStepName === 'border'
      ? 'rgba(255,59,48,0.16)'
      : 'rgba(10,132,255,0.12)';

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
      } catch {
        // ignore — tour is non-critical
      }
    })();
    return () => { cancelled = true; };
  }, [isMapReady, isInsideDeliveryZone, startGuide, startTour]);

  let orderHelperText = 'Waiting for high-accuracy location lock...';
  if (permissionStatus !== 'granted') {
    orderHelperText = 'Location permission is required to check delivery eligibility.';
  } else if (userCoords && !isInsideDeliveryZone) {
    orderHelperText = 'You are currently outside the delivery zone.';
  } else if (isOrderEnabled) {
    orderHelperText = 'You are inside the delivery zone.';
  }

  return (
    <ScreenWrapper scroll={false} style={styles.fullScreenContent}>
      <View style={styles.mapRoot}>
        <MapView
          ref={mapRef}
          style={styles.fullMap}
          initialRegion={{
            latitude: DRONE_HIVE.latitude,
            longitude: DRONE_HIVE.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          mapType="mutedStandard"
          showsCompass
          showsScale
          scrollEnabled
          zoomEnabled
          rotateEnabled={false}
          onMapReady={() => {
            setIsMapReady(true);
          }}
        >
          <MapCircle
            center={DRONE_HIVE}
            radius={DELIVERY_ZONE_RADIUS_METERS}
            strokeColor={borderStrokeColor}
            fillColor={borderFillColor}
            strokeWidth={2}
          />

          <Marker coordinate={DRONE_HIVE} tracksViewChanges={false}>
            <DroneHiveMarker fill={hiveMarkerColor} />
          </Marker>

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
        <CopilotStep text="This is the Hive launch point in Har Adar." order={1} name="hiveMarker">
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
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>Hive: Har Adar, Nof Harem 135</Text>
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>500 meters active border</Text>
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
            {distanceToHiveMeters == null ? orderHelperText : `${orderHelperText} Distance ${(distanceToHiveMeters / 1000).toFixed(2)} km`}
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
      labels={{
        previous: 'Back',
        next: 'Next',
        skip: 'Skip',
        finish: 'Done',
      }}
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
  fullScreenContent: {
    flex: 1,
  },
  mapRoot: {
    flex: 1,
    position: 'relative',
  },
  fullMap: {
    ...StyleSheet.absoluteFillObject,
  },

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
    width: 4,
    height: 4,
    left: Spacing.md,
    top: 92,
    backgroundColor: 'transparent',
    opacity: 0.01,
  },
  hiddenGuideAnchorMid: {
    position: 'absolute',
    width: 4,
    height: 4,
    left: Spacing.md,
    top: 150,
    backgroundColor: 'transparent',
    opacity: 0.01,
  },

  bottomPanel: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    bottom: Spacing.md,
    borderRadius: Spacing.radiusLg,
    padding: Spacing.md,
    zIndex: 30,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: Spacing.xs,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },

  errorText: {
    marginTop: Spacing.xs,
    fontSize: 12,
    lineHeight: 18,
  },

  permissionActionsRow: {
    marginTop: Spacing.md,
  },
  permissionBtn: {
    marginBottom: Spacing.sm,
  },

  orderButton: {
    marginTop: Spacing.md,
  },
  orderHelper: {
    marginTop: Spacing.xs,
    fontSize: 12,
  },
});
