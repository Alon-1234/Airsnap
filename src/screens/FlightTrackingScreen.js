/**
 * ============================================================
 *  AirSnap — FlightTrackingScreen
 * ============================================================
 *  Once the order is placed the user watches the drone fly
 *  toward their location on a live map. State is driven by the
 *  simulation server (Socket.IO) — no local timers.
 *
 *  Tap the drone marker to open the live FPV camera view (what
 *  the drone sees right now).
 *
 *  Route params received:
 *    • latitude, longitude, siteName
 *    • package, paymentMethod, orderId, hive
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Alert, Modal, SafeAreaView } from 'react-native';
import MapView, { Marker, Polyline, AnimatedRegion } from 'react-native-maps';
import Svg, { Circle as SvgCircle, Path as SvgPath } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

import { ScreenWrapper, Card, StatusBadge, GradientButton } from '../components/common';
import DroneCameraView from '../components/DroneCameraView';
import { useTheme, useAuth } from '../context';
import { Typography, Spacing } from '../theme';
import { DRONE_STATUS } from '../constants';
import { getSimClient, simApi } from '../services/SimClient';

const radToDeg = (rad) => ((rad * 180) / Math.PI + 360) % 360;

// Quadcopter icon for the live drone marker. The marker is rotated to
// the drone's heading, so the white nose triangle points where it flies.
const DroneMarkerIcon = React.memo(function DroneMarkerIcon({ color = '#0A84FF' }) {
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36">
      <SvgPath d="M10 10L26 26M26 10L10 26" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
      <SvgCircle cx="9" cy="9" r="6" fill={color} stroke="#FFFFFF" strokeWidth="1.5" />
      <SvgCircle cx="27" cy="9" r="6" fill={color} stroke="#FFFFFF" strokeWidth="1.5" />
      <SvgCircle cx="9" cy="27" r="6" fill={color} stroke="#FFFFFF" strokeWidth="1.5" />
      <SvgCircle cx="27" cy="27" r="6" fill={color} stroke="#FFFFFF" strokeWidth="1.5" />
      <SvgCircle cx="18" cy="18" r="6.5" fill="#FFFFFF" />
      <SvgCircle cx="18" cy="18" r="4.5" fill={color} />
      <SvgPath d="M18 12.5L20.5 17H15.5Z" fill="#FFFFFF" />
    </Svg>
  );
});

// Same hexagon hive marker used on the home map, just smaller.
const HiveMarkerIcon = React.memo(function HiveMarkerIcon({ color = '#0A84FF' }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 40 40">
      <SvgCircle cx="20" cy="20" r="19" fill={color} stroke="#fff" strokeWidth="1.5" />
      <SvgPath d="M20 7L31 14V26L20 33L9 26V14L20 7Z" fill="#FFFFFF" />
      <SvgCircle cx="20" cy="20" r="5" fill="#00D4AA" />
    </Svg>
  );
});

const TIMELINE = [
  { key: 'dispatch', label: 'Assigning Drone',     statuses: [DRONE_STATUS.PENDING] },
  { key: 'enroute',  label: 'Drone En Route',      statuses: [DRONE_STATUS.EN_ROUTE] },
  { key: 'arrived',  label: 'Arrived at Location', statuses: [DRONE_STATUS.ARRIVED, DRONE_STATUS.RECORDING, DRONE_STATUS.RETURNING, DRONE_STATUS.PROCESSING, DRONE_STATUS.DELIVERED] },
];

const TERMINAL_AFTER_ARRIVAL = [
  DRONE_STATUS.ARRIVED, DRONE_STATUS.RECORDING, DRONE_STATUS.RETURNING,
  DRONE_STATUS.PROCESSING, DRONE_STATUS.DELIVERED,
];

export default function FlightTrackingScreen({ navigation, route }) {
  const { latitude, longitude, siteName, package: pkg, orderId, hive } = route.params;

  const { colors } = useTheme();
  const { refreshMe } = useAuth();
  const styles = dynamicStyles(colors);

  const [droneState, setDroneState] = useState(null);
  const [currentStatus, setCurrentStatus] = useState(DRONE_STATUS.PENDING);
  const [showCamera, setShowCamera] = useState(false);
  // Tracks whether the user has chosen to abandon — once true, we let the
  // navigation through without re-prompting (or once recording starts and
  // we're on our way to LiveSession, also let it through).
  const allowLeaveRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mapRef = useRef(null);

  // Animated coordinate interpolates between the 10 Hz server samples so
  // the marker glides instead of stepping. AnimatedRegion drives native
  // props, so useNativeDriver must stay false.
  const droneCoord = useRef(
    new AnimatedRegion({
      latitude: hive?.latitude ?? latitude,
      longitude: hive?.longitude ?? longitude,
      latitudeDelta: 0,
      longitudeDelta: 0,
    })
  ).current;

  // ── Subscribe to drone state for this order ─────────────
  useEffect(() => {
    const sim = getSimClient();
    let mounted = true;

    sim.connect().catch(() => {});
    sim.joinOrder(orderId).catch(() => {});

    const offState = sim.onDroneState((state) => {
      if (!mounted || state.orderId !== orderId) return;
      setDroneState(state);
      setCurrentStatus(state.status);
      droneCoord
        .timing({
          latitude: state.position.latitude,
          longitude: state.position.longitude,
          duration: 110,
          useNativeDriver: false,
        })
        .start();
    });
    const offStatus = sim.onOrderStatus((payload) => {
      if (!mounted || payload.orderId !== orderId) return;
      setCurrentStatus(payload.status);
    });

    return () => {
      mounted = false;
      offState();
      offStatus();
    };
  }, [orderId]);

  // ── Marker pulse animation ──────────────────────────────
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // ── Intercept back navigation: confirm + abandon w/ 10% fee ──
  // Without this, leaving the screen while the drone is still en-route
  // or hovering at the customer leaves the hive slot locked until the
  // drone returns on its own — blocking any new order.
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      // 1. We've already decided to let this nav through.
      if (allowLeaveRef.current) return;
      // 2. Forward navigation (Start Session, auto-complete) is fine.
      if (e.data.action.type !== 'GO_BACK' && e.data.action.type !== 'POP') return;
      // 3. Drone is past the point of abandonment — let it through.
      const safeToLeave = [
        DRONE_STATUS.RECORDING,
        DRONE_STATUS.RETURNING,
        DRONE_STATUS.PROCESSING,
        DRONE_STATUS.DELIVERED,
      ];
      if (safeToLeave.includes(currentStatus)) return;

      e.preventDefault();
      Alert.alert(
        'Abandon this order?',
        'The drone is still on its way (or waiting for you to start). ' +
        'If you leave now we\'ll bring it back — a 10% cancellation fee will be ' +
        'kept and the rest credited to your balance.',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Abandon order',
            style: 'destructive',
            onPress: async () => {
              try {
                const res = await simApi.abandonOrder(orderId);
                refreshMe();
                allowLeaveRef.current = true;
                Alert.alert(
                  'Order abandoned',
                  `Cancellation fee: ₪${Number(res.cancellationFee || 0).toFixed(2)}.\n` +
                  `Refunded to credits: ₪${Number(res.refundAmount || 0).toFixed(2)}.`,
                  [{ text: 'OK', onPress: () => navigation.dispatch(e.data.action) }],
                );
              } catch (err) {
                Alert.alert('Could not abandon', err.message || 'Unknown error');
              }
            },
          },
        ],
      );
    });
    return sub;
  }, [navigation, currentStatus, orderId, refreshMe]);

  // ── Derived view-model from server state ────────────────
  const etaSec = droneState?.etaSec ?? 0;
  const distanceMeters = droneState?.distanceMeters ?? 0;
  const battery = droneState?.battery ?? 100;
  const altitude = droneState?.position?.altitude ?? 0;
  const distanceKm = distanceMeters / 1000;
  const showStart = currentStatus === DRONE_STATUS.ARRIVED;

  // ── Map view-model ───────────────────────────────────────
  const hiveLat = hive?.latitude ?? latitude;
  const hiveLng = hive?.longitude ?? longitude;
  const initialRegion = {
    latitude: (hiveLat + latitude) / 2,
    longitude: (hiveLng + longitude) / 2,
    latitudeDelta: Math.max(Math.abs(hiveLat - latitude) * 2.5, 0.01),
    longitudeDelta: Math.max(Math.abs(hiveLng - longitude) * 2.5, 0.01),
  };
  // Where the flight line points: back home when returning, else the target.
  const lineTo =
    currentStatus === DRONE_STATUS.RETURNING
      ? { latitude: hiveLat, longitude: hiveLng }
      : droneState?.target || { latitude, longitude };
  const showFlightLine =
    droneState &&
    [DRONE_STATUS.EN_ROUTE, DRONE_STATUS.RETURNING].includes(currentStatus);

  const handleStartSession = () => {
    allowLeaveRef.current = true;
    navigation.navigate('LiveSession', {
      latitude,
      longitude,
      siteName,
      package: pkg,
      orderId,
      hive,
    });
  };

  // ── Timeline step renderer ──────────────────────────────
  const renderTimelineStep = (step, idx) => {
    const isActive = step.statuses.includes(currentStatus);
    const isDone =
      // earlier steps are done if current status is in a later step's bucket
      (idx === 0 && currentStatus !== DRONE_STATUS.PENDING) ||
      (idx === 1 && TERMINAL_AFTER_ARRIVAL.includes(currentStatus));

    return (
      <View key={step.key} style={styles.timelineStep}>
        <View style={styles.timelineDotCol}>
          {isActive ? (
            <Animated.View
              style={[styles.dotActive, { transform: [{ scale: pulseAnim }] }]}
            />
          ) : (
            <View style={[styles.dot, isDone && styles.dotDone]} />
          )}
          {idx < TIMELINE.length - 1 && (
            <View style={[styles.timelineLine, isDone && styles.timelineLineDone]} />
          )}
        </View>
        <Text
          style={[
            Typography.bodySemibold,
            { color: colors.textPrimary },
            styles.timelineLabel,
            !isDone && !isActive && { color: colors.textMuted },
          ]}
        >
          {step.label}
        </Text>
      </View>
    );
  };

  return (
    <ScreenWrapper title="Drone on the Way" scroll>
      <StatusBadge status={currentStatus} style={styles.badge} />

      <Card style={styles.mapCard}>
        <MapView
          ref={mapRef}
          style={styles.map}
          mapType="mutedStandard"
          initialRegion={initialRegion}
          showsUserLocation
          showsPointsOfInterest={false}
          onMapReady={() => {
            mapRef.current?.fitToCoordinates(
              [
                { latitude: hiveLat, longitude: hiveLng },
                { latitude, longitude },
              ],
              {
                edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
                animated: false,
              },
            );
          }}
        >
          {/* Hive (home base) */}
          <Marker
            coordinate={{ latitude: hiveLat, longitude: hiveLng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            title={hive?.name || 'Hive'}
          >
            <HiveMarkerIcon color={colors.primary} />
          </Marker>

          {/* Destination */}
          <Marker
            coordinate={{ latitude, longitude }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
            title={siteName || 'Your spot'}
          >
            <Ionicons name="location" size={30} color={colors.accent} />
          </Marker>

          {/* Flight line */}
          {showFlightLine && (
            <Polyline
              coordinates={[
                {
                  latitude: droneState.position.latitude,
                  longitude: droneState.position.longitude,
                },
                lineTo,
              ]}
              strokeColor={colors.primary}
              strokeWidth={2}
              lineDashPattern={[6, 6]}
            />
          )}

          {/* Live drone — tap for FPV camera */}
          <Marker.Animated
            coordinate={droneCoord}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={radToDeg(droneState?.heading || 0)}
            tracksViewChanges={false}
            zIndex={10}
            onPress={() => setShowCamera(true)}
          >
            <DroneMarkerIcon color={colors.primary} />
          </Marker.Animated>
        </MapView>

        <View style={styles.mapHint}>
          <Ionicons name="videocam" size={14} color={colors.accent} />
          <Text style={[Typography.caption, { color: colors.textSecondary, marginLeft: 6 }]}>
            Tap the drone to see its live camera
          </Text>
        </View>
      </Card>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Ionicons name="time" size={26} color={colors.primary} />
          <Text style={[Typography.h2, styles.statValue, { color: colors.textPrimary }]}>
            {currentStatus === DRONE_STATUS.ARRIVED
              ? '0:00'
              : `${Math.floor(etaSec / 60)}:${String(etaSec % 60).padStart(2, '0')}`}
          </Text>
          <Text style={[Typography.caption, { color: colors.textMuted }]}>Est. Arrival</Text>
        </Card>

        <Card style={styles.statCard}>
          <Ionicons name="speedometer" size={26} color={colors.accent} />
          <Text style={[Typography.h2, styles.statValue, { color: colors.textPrimary }]}>
            {distanceKm.toFixed(2)}
          </Text>
          <Text style={[Typography.caption, { color: colors.textMuted }]}>km Away</Text>
        </Card>

        <Card style={styles.statCard}>
          <Ionicons name="battery-charging" size={26} color={colors.success} />
          <Text style={[Typography.h2, styles.statValue, { color: colors.textPrimary }]}>
            {Math.round(battery)}%
          </Text>
          <Text style={[Typography.caption, { color: colors.textMuted }]}>Battery</Text>
        </Card>
      </View>

      <Card style={styles.timelineCard}>
        <Text style={[Typography.label, { marginBottom: Spacing.md, color: colors.textSecondary }]}>Progress</Text>
        {TIMELINE.map((s, i) => renderTimelineStep(s, i))}

        <Text style={[Typography.caption, { color: colors.textMuted, marginTop: Spacing.sm }]}>
          Altitude: {altitude.toFixed(0)} m
        </Text>
      </Card>

      {showStart && (
        <GradientButton
          title="Start Session"
          icon="play"
          onPress={handleStartSession}
          style={styles.startBtn}
        />
      )}

      {/* ── Full-screen FPV camera (tap drone marker) ─────── */}
      <Modal
        visible={showCamera}
        animationType="slide"
        onRequestClose={() => setShowCamera(false)}
      >
        <SafeAreaView style={styles.cameraModal}>
          <DroneCameraView
            droneState={droneState}
            isRecording={currentStatus === DRONE_STATUS.RECORDING}
            onClose={() => setShowCamera(false)}
          />
        </SafeAreaView>
      </Modal>
    </ScreenWrapper>
  );
}

// ── Styles ────────────────────────────────────────────────
const dynamicStyles = (colors) => StyleSheet.create({
  badge: { marginBottom: Spacing.md },
  mapCard: { padding: 0, overflow: 'hidden', marginBottom: Spacing.lg },
  map: {
    height: 240,
    width: '100%',
  },
  mapHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    backgroundColor: colors.bgCard,
  },
  cameraModal: {
    flex: 1,
    backgroundColor: '#05050C',
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
    paddingVertical: Spacing.lg,
  },
  statValue: { marginVertical: 4 },

  timelineCard: { marginBottom: Spacing.lg },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  timelineDotCol: {
    alignItems: 'center',
    width: 24,
    marginRight: Spacing.sm,
  },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: colors.bgCardLight,
    borderWidth: 2, borderColor: colors.borderLight,
  },
  dotDone: { backgroundColor: colors.success, borderColor: colors.success },
  dotActive: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: colors.primary,
  },
  timelineLine: { width: 2, height: 28, backgroundColor: colors.borderLight },
  timelineLineDone: { backgroundColor: colors.success },
  timelineLabel: { paddingTop: 0 },

  startBtn: { marginTop: Spacing.sm },
});
