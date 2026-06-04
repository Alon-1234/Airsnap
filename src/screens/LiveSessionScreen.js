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
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ScreenWrapper, ProgressBar, StatusBadge } from '../components/common';
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
  const [elapsedSec, setElapsedSec] = useState(0);
  const totalSec = pkg.durationSec || 30;
  const progress = Math.min(elapsedSec / totalSec, 1);
  const stageIdx = getCurrentStage(progress);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const sessionStartedRef = useRef(false);
  const navigatedRef = useRef(false);

  // ── Connect to sim, start the session, subscribe ────────
  useEffect(() => {
    const sim = getSimClient();
    let mounted = true;

    (async () => {
      try {
        await sim.connect();
        await sim.joinOrder(orderId);
        if (!sessionStartedRef.current) {
          await sim.startSession(orderId);
          sessionStartedRef.current = true;
        }
      } catch (_) { /* ignore */ }
    })();

    const offState = sim.onDroneState((state) => {
      if (!mounted || state.orderId !== orderId) return;
      setDroneStatus(state.status);
    });
    const offProgress = sim.onSessionProgress(({ orderId: id, elapsedSec: e }) => {
      if (!mounted || id !== orderId) return;
      setElapsedSec(e);
    });

    return () => {
      mounted = false;
      offState();
      offProgress();
    };
  }, [orderId]);

  // ── Stream user GPS up to the server so drone can follow ──
  useEffect(() => {
    if (!position) return;
    const sim = getSimClient();
    sim.sendUserLocation(orderId, position.latitude, position.longitude, position.accuracy)
      .catch(() => {});
  }, [orderId, position?.latitude, position?.longitude]);

  // ── Recording-dot pulse ──────────────────────────────────
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // ── Auto-navigate when the session is done ───────────────
  useEffect(() => {
    if (navigatedRef.current) return;
    if (
      droneStatus === DRONE_STATUS.RETURNING ||
      droneStatus === DRONE_STATUS.PROCESSING ||
      droneStatus === DRONE_STATUS.DELIVERED
    ) {
      navigatedRef.current = true;
      const t = setTimeout(() => {
        navigation.navigate('ContentDelivery', {
          orderId, package: pkg, siteName, hive,
        });
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [droneStatus, navigation, orderId, pkg, siteName, hive]);

  const fmt = (secs) =>
    `${Math.floor(secs / 60)}:${String(Math.round(secs) % 60).padStart(2, '0')}`;
  const remaining = Math.max(0, totalSec - elapsedSec);
  const isRecording = droneStatus === DRONE_STATUS.RECORDING;

  return (
    <ScreenWrapper title="Live Session" scroll={false}>
      <View style={styles.liveView}>
        <LinearGradient
          colors={['#0a0a1a', '#1a1a3e']}
          style={styles.liveGradient}
        >
          <Ionicons name="videocam" size={44} color={colors.primary + '55'} />
          <Text style={[Typography.bodySmall, { color: colors.textSecondary, marginTop: 8 }]}>
            Drone Camera Feed
          </Text>

          {isRecording && (
            <View style={styles.recBadge}>
              <Animated.View
                style={[styles.recDot, { transform: [{ scale: pulseAnim }] }]}
              />
              <Text style={styles.recText}>REC</Text>
            </View>
          )}

          <View style={styles.pkgTag}>
            <Text style={styles.pkgTagText}>{pkg.name}</Text>
          </View>
        </LinearGradient>
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
          <TouchableOpacity
            style={styles.endBtn}
            onPress={() =>
              navigation.navigate('ContentDelivery', {
                orderId, package: pkg, siteName, hive,
              })
            }
          >
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
  liveGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error + '33',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Spacing.radiusFull,
  },
  recDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.error,
    marginRight: 6,
  },
  recText: {
    color: colors.error,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
  },
  pkgTag: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: colors.primary + '44',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Spacing.radiusSm,
  },
  pkgTagText: {
    color: colors.primary,
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
