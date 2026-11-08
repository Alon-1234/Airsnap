/**
 * ============================================================
 *  AirSnap — LiveSessionScreen
 * ============================================================
 *  The most immersive screen in the app. Once the drone has
 *  arrived, the user lands here to watch the live session.
 *
 *  Drives:
 *    • Subscribes to the order's drone state + session progress
 *      from the simulation server.
 *    • Streams the user's live GPS up to the server so the
 *      drone can follow / orbit the user as they walk around.
 *    • When the server marks the order RETURNING/PROCESSING/
 *      DELIVERED, navigates to ContentDelivery.
 *
 *  Route params received:
 *    • latitude, longitude, siteName
 *    • package, orderId, hive
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ScreenWrapper, ProgressBar, StatusBadge } from '../components/common';
import DroneCameraView from '../components/DroneCameraView';
import { useTheme, useLocation } from '../context';
import { Typography, Spacing } from '../theme';
import { DRONE_STATUS } from '../constants';
import { getSimClient } from '../services/SimClient';

const { width } = Dimensions.get('window');

const STAGES = [
  { label: 'Take-off',   fraction: 0.05, icon: 'arrow-up-circle' },
  { label: 'Filming',    fraction: 0.70, icon: 'videocam' },
  { label: 'Final Pass', fraction: 0.90, icon: 'camera' },
  { label: 'Landing',    fraction: 1.0,  icon: 'arrow-down-circle' },
];

function getCurrentStage(progress) {
  for (let i = 0; i < STAGES.length; i++) {
    if (progress <= STAGES[i].fraction) return i;
  }
  return STAGES.length - 1;
}

export default function LiveSessionScreen({ navigation, route }) {
  const { siteName, package: pkg, orderId, hive } = route.params;

  const { colors } = useTheme();
  const styles = dynamicStyles(colors);
  const { position } = useLocation();

  const [droneStatus, setDroneStatus] = useState(DRONE_STATUS.ARRIVED);
  const [droneState, setDroneState] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const totalSec = pkg.durationSec || 30;
  const progress = Math.min(elapsedSec / totalSec, 1);
  const stageIdx = getCurrentStage(progress);

  const sessionStartedRef = useRef(false);
  const navigatedRef = useRef(false);
  const deliveredMediaRef = useRef(null);

  // ── Connect to sim, start the session, subscribe ────────
  useEffect(() => {
    const sim = getSimClient();
    let mounted = true;

    // Not gated on connect() succeeding: if the first connect attempt
    // failed (Render cold start) the old code never sent session:start and
    // the drone hovered forever. startSession is buffered until connected.
    sim.joinOrder(orderId).catch(() => {});
    if (!sessionStartedRef.current) {
      sessionStartedRef.current = true;
      sim.startSession(orderId).catch(() => {});
    }

    const offState = sim.onDroneState((state) => {
      if (!mounted || state.orderId !== orderId) return;
      setDroneStatus(state.status);
      setDroneState(state);
    });
    const offProgress = sim.onSessionProgress(({ orderId: id, elapsedSec: e }) => {
      if (!mounted || id !== orderId) return;
      setElapsedSec(e);
    });
    const offDelivered = sim.onOrderDelivered(({ orderId: id, media }) => {
      if (!mounted || id !== orderId) return;
      deliveredMediaRef.current = media || null;
    });

    return () => {
      mounted = false;
      offState();
      offProgress();
      offDelivered();
    };
  }, [orderId]);

  // ── Stream user GPS up to the server so drone can follow ──
  useEffect(() => {
    if (!position) return;
    const sim = getSimClient();
    sim.sendUserLocation(orderId, position.latitude, position.longitude, position.accuracy)
      .catch(() => {});
  }, [orderId, position?.latitude, position?.longitude]);

  // ── Auto-navigate when the session is done ───────────────
  useEffect(() => {
    if (navigatedRef.current) return;
    if (
      droneStatus === DRONE_STATUS.RETURNING ||
      droneStatus === DRONE_STATUS.PROCESSING ||
      droneStatus === DRONE_STATUS.DELIVERED
    ) {
      // Mark navigated only when the timer actually fires — if the status
      // changes within 1.2 s the cleanup clears this timer, and setting the
      // flag up-front meant the re-run bailed and never navigated.
      const t = setTimeout(() => {
        if (navigatedRef.current) return;
        navigatedRef.current = true;
        navigation.navigate('ContentDelivery', {
          orderId, package: pkg, siteName, hive,
          media: deliveredMediaRef.current,
        });
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [droneStatus, navigation, orderId, pkg, siteName, hive]);

  // ── End-session-early — tell the server, then navigate ──
  const handleEndEarly = () => {
    // Also stops the auto-navigate effect from navigating a second time
    // when the drone flips to RETURNING right after this.
    navigatedRef.current = true;
    const sim = getSimClient();
    sim.endSession(orderId).catch(() => {});
    navigation.navigate('ContentDelivery', {
      orderId, package: pkg, siteName, hive,
      media: deliveredMediaRef.current,
    });
  };

  // ── Back button — recording is already paid for, so leaving just
  //    ends the session early and takes the user to their content. ──
  const confirmEndEarly = () => {
    Alert.alert(
      'End session?',
      'Stop filming and view your content now? The drone will finish up and head home.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'End & view', style: 'destructive', onPress: handleEndEarly },
      ],
    );
  };

  // Hardware back / swipe / tapping the Order tab used to drop the user back
  // on the stale FlightTracking screen mid-recording (content never reached
  // the Gallery). Route them through the same confirm as the back chevron.
  // Once we're heading to ContentDelivery, removal is allowed.
  const confirmEndEarlyRef = useRef(null);
  confirmEndEarlyRef.current = confirmEndEarly;
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (navigatedRef.current) return;
      e.preventDefault();
      confirmEndEarlyRef.current?.();
    });
    return sub;
  }, [navigation]);

  const fmt = (secs) =>
    `${Math.floor(secs / 60)}:${String(Math.round(secs) % 60).padStart(2, '0')}`;
  const remaining = Math.max(0, totalSec - elapsedSec);
  const isRecording = droneStatus === DRONE_STATUS.RECORDING;

  return (
    <ScreenWrapper title="Live Session" scroll={false} onBack={confirmEndEarly}>
      <View style={styles.liveView}>
        <DroneCameraView droneState={droneState} isRecording={isRecording}>
          <View style={styles.pkgTag}>
            <Text style={styles.pkgTagText}>{pkg.name}</Text>
          </View>
        </DroneCameraView>
      </View>

      <View style={styles.panel}>
        <StatusBadge
          status={droneStatus}
          style={styles.statusBadge}
        />

        <View style={styles.timerRow}>
          <Text style={[Typography.h2, { color: colors.textPrimary }]}>{fmt(elapsedSec)}</Text>
          <Text style={[Typography.bodySmall, { color: colors.textMuted }]}>
            {remaining > 0 ? `${fmt(remaining)} remaining` : 'Session complete!'}
          </Text>
        </View>

        <ProgressBar
          progress={progress}
          color={progress >= 1 ? colors.success : colors.primary}
          style={styles.progressBar}
        />

        <View style={styles.stagesRow}>
          {STAGES.map((stage, idx) => {
            const isActive = idx === stageIdx;
            const isDone = progress > stage.fraction;
            return (
              <View key={idx} style={styles.stage}>
                <View
                  style={[
                    styles.stageIcon,
                    isActive && styles.stageIconActive,
                    isDone && styles.stageIconDone,
                  ]}
                >
                  <Ionicons
                    name={stage.icon}
                    size={18}
                    color={
                      isActive
                        ? colors.primary
                        : isDone
                        ? colors.success
                        : colors.textMuted
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.stageLabel,
                    isActive && { color: colors.primary },
                    isDone && { color: colors.success },
                  ]}
                >
                  {stage.label}
                </Text>
              </View>
            );
          })}
        </View>

        {isRecording && (
          <TouchableOpacity style={styles.endBtn} onPress={handleEndEarly}>
            <Ionicons name="stop-circle" size={20} color={colors.error} />
            <Text style={[Typography.bodySmall, { color: colors.textSecondary }, styles.endText]}>
              End Session Early
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScreenWrapper>
  );
}

// ── Styles ────────────────────────────────────────────────
const dynamicStyles = (colors) => StyleSheet.create({
  liveView: {
    width: '100%',
    height: width * 0.6,
    borderBottomLeftRadius: Spacing.radiusLg,
    borderBottomRightRadius: Spacing.radiusLg,
    overflow: 'hidden',
  },
  // Sits inside the FPV feed, tucked above the telemetry strip so it
  // doesn't collide with the HUD's top row.
  pkgTag: {
    position: 'absolute',
    bottom: 56,
    right: 16,
    backgroundColor: 'rgba(10, 132, 255, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Spacing.radiusSm,
  },
  pkgTagText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },

  panel: {
    flex: 1,
    paddingHorizontal: Spacing.screenPadding,
    paddingTop: Spacing.lg,
  },
  statusBadge: { marginBottom: Spacing.md },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  progressBar: { marginBottom: Spacing.lg },

  stagesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  stage: { alignItems: 'center', flex: 1 },
  stageIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bgCardLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  stageIconActive: { backgroundColor: colors.primary + '22' },
  stageIconDone:   { backgroundColor: colors.success + '22' },
  stageLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
  },

  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  endText: {
    color: colors.error,
    marginLeft: 6,
    fontWeight: '600',
  },
});
