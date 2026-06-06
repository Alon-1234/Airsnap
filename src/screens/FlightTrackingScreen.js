/**
 * ============================================================
 *  AirSnap — FlightTrackingScreen
 * ============================================================
 *  Once the order is placed the user watches the drone fly
 *  toward their location. State is driven by the simulation
 *  server (Socket.IO) — no local timers.
 *
 *  Route params received:
 *    • latitude, longitude, siteName
 *    • package, paymentMethod, orderId, hive
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ScreenWrapper, Card, StatusBadge, GradientButton } from '../components/common';
import { useTheme, useAuth } from '../context';
import { Typography, Spacing } from '../theme';
import { DRONE_STATUS } from '../constants';
import { getSimClient, simApi } from '../services/SimClient';

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
  // Tracks whether the user has chosen to abandon — once true, we let the
  // navigation through without re-prompting (or once recording starts and
  // we're on our way to LiveSession, also let it through).
  const allowLeaveRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

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
        <LinearGradient
          colors={[colors.bgCard, colors.bgCardLight]}
          style={styles.mapPlaceholder}
        >
          <Ionicons name="map" size={48} color={colors.primary + '55'} />
          <Text style={[Typography.caption, { marginTop: 8, color: colors.textMuted }]}>
            Live map — ({latitude.toFixed(4)}, {longitude.toFixed(4)})
          </Text>

          <View style={styles.dronePath}>
            <Ionicons name="navigate" size={22} color={colors.primary} />
            <View style={styles.pathLine} />
            <Ionicons name="location" size={22} color={colors.accent} />
          </View>

          {hive?.name && (
            <Text style={[Typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
              From hive: {hive.name}
            </Text>
          )}
        </LinearGradient>
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
    </ScreenWrapper>
  );
}

// ── Styles ────────────────────────────────────────────────
const dynamicStyles = (colors) => StyleSheet.create({
  badge: { marginBottom: Spacing.md },
  mapCard: { padding: 0, overflow: 'hidden', marginBottom: Spacing.lg },
  mapPlaceholder: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dronePath: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  pathLine: {
    width: 100,
    height: 2,
    backgroundColor: colors.primary + '55',
    marginHorizontal: 8,
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
