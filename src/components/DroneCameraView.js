/**
 * ============================================================
 *  AirSnap — DroneCameraView
 * ============================================================
 *  Simulated FPV feed: "what the drone sees right now."
 *
 *  A gesture-locked satellite MapView is flown programmatically
 *  from the live drone:state stream — camera centered on the
 *  drone, rotated to its heading, eye-height derived from its
 *  altitude. A DJI-style HUD (REC badge, telemetry strip,
 *  crosshair, corner brackets) is layered on top.
 *
 *  Used full-screen from FlightTrackingScreen (pass onClose)
 *  and inline in LiveSessionScreen (no onClose).
 *
 *  The camera is driven via mapRef.animateCamera() — never a
 *  live `camera` prop, which would re-set the camera every
 *  render and stutter.
 * ============================================================
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import MapView from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { DRONE_STATUS } from '../constants';

// Plain satellite imagery. 'hybridFlyover' renders true 3D but its
// coverage is limited to major cities — swap here if testing in one.
const CAMERA_MAP_TYPE = 'satellite';
const MIN_ANIM_GAP_MS = 120;   // throttle camera moves to ~8 Hz
const ANIM_DURATION_MS = 130;  // slightly over the gap so motion is continuous

const radToDeg = (rad) => ((rad * 180) / Math.PI + 360) % 360;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Map drone altitude (m) to camera eye height. Below ~250 m the
// imagery over-zooms into blur; ×8 keeps climbs/descents visible.
const camAltitudeFor = (alt) => clamp((alt || 0) * 8, 250, 900);

const pitchFor = (status) =>
  status === DRONE_STATUS.ARRIVED || status === DRONE_STATUS.RECORDING ? 50 : 60;

const STATUS_LABEL = {
  [DRONE_STATUS.PENDING]: 'INITIALIZING',
  [DRONE_STATUS.EN_ROUTE]: 'EN ROUTE',
  [DRONE_STATUS.ARRIVED]: 'HOVERING',
  [DRONE_STATUS.RECORDING]: 'FILMING',
  [DRONE_STATUS.RETURNING]: 'RETURNING',
  [DRONE_STATUS.PROCESSING]: 'PROCESSING',
  [DRONE_STATUS.DELIVERED]: 'COMPLETE',
};

export default function DroneCameraView({ droneState, isRecording, onClose, style, children }) {
  const mapRef = useRef(null);
  const lastAnimRef = useRef(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [clock, setClock] = useState(() => new Date());
  // Camera at mount time — set once from the first drone state we see.
  const initialCameraRef = useRef(null);

  if (!initialCameraRef.current && droneState?.position) {
    initialCameraRef.current = {
      center: {
        latitude: droneState.position.latitude,
        longitude: droneState.position.longitude,
      },
      heading: radToDeg(droneState.heading || 0),
      pitch: pitchFor(droneState.status),
      altitude: camAltitudeFor(droneState.position.altitude),
      zoom: 17,
    };
  }

  // ── Fly the camera with each drone state (throttled) ─────
  useEffect(() => {
    if (!droneState?.position || !mapRef.current) return;
    const now = Date.now();
    if (now - lastAnimRef.current < MIN_ANIM_GAP_MS) return;
    lastAnimRef.current = now;
    mapRef.current.animateCamera(
      {
        center: {
          latitude: droneState.position.latitude,
          longitude: droneState.position.longitude,
        },
        heading: radToDeg(droneState.heading || 0),
        pitch: pitchFor(droneState.status),
        altitude: camAltitudeFor(droneState.position.altitude),
      },
      { duration: ANIM_DURATION_MS },
    );
  }, [droneState]);

  // ── REC dot pulse ────────────────────────────────────────
  useEffect(() => {
    if (!isRecording) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isRecording, pulseAnim]);

  // ── 1 Hz HUD clock ───────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const alt = droneState?.position?.altitude ?? 0;
  const speedKmh = (droneState?.speed ?? 0) * 3.6;
  const headingDeg = radToDeg(droneState?.heading || 0);
  const battery = Math.round(droneState?.battery ?? 100);
  const statusLabel = STATUS_LABEL[droneState?.status] || 'LINKING';
  const hh = String(clock.getHours()).padStart(2, '0');
  const mm = String(clock.getMinutes()).padStart(2, '0');
  const ss = String(clock.getSeconds()).padStart(2, '0');

  return (
    <View style={[styles.container, style]}>
      {initialCameraRef.current ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          mapType={CAMERA_MAP_TYPE}
          initialCamera={initialCameraRef.current}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          showsCompass={false}
          showsPointsOfInterest={false}
          toolbarEnabled={false}
        />
      ) : (
        <View style={styles.connecting}>
          <Ionicons name="videocam" size={42} color="rgba(255,255,255,0.35)" />
          <Text style={styles.connectingText}>Connecting to drone camera…</Text>
        </View>
      )}

      {/* ── HUD ───────────────────────────────────────────── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Corner brackets */}
        <View style={[styles.bracket, styles.bracketTL]} />
        <View style={[styles.bracket, styles.bracketTR]} />
        <View style={[styles.bracket, styles.bracketBL]} />
        <View style={[styles.bracket, styles.bracketBR]} />

        {/* Crosshair */}
        <View style={styles.crosshair}>
          <View style={styles.crosshairH} />
          <View style={styles.crosshairV} />
        </View>

        {/* Top row: REC + status + battery */}
        <View style={styles.topRow}>
          {isRecording ? (
            <View style={styles.recBadge}>
              <Animated.View style={[styles.recDot, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={styles.hudTextBold}>REC</Text>
            </View>
          ) : (
            <View style={styles.recBadge}>
              <Ionicons name="videocam-outline" size={13} color="#FFFFFF" />
              <Text style={styles.hudTextBold}> LIVE</Text>
            </View>
          )}
          <Text style={styles.statusText}>{statusLabel}</Text>
          <View style={styles.batteryBadge}>
            <Ionicons
              name={battery > 20 ? 'battery-half' : 'battery-dead'}
              size={14}
              color={battery > 20 ? '#34C759' : '#FF453A'}
            />
            <Text style={styles.hudTextBold}> {battery}%</Text>
          </View>
        </View>

        {/* Bottom telemetry strip */}
        <View style={styles.bottomStrip}>
          <Text style={styles.hudMono}>ALT {alt.toFixed(0)}M</Text>
          <Text style={styles.hudMono}>SPD {speedKmh.toFixed(0)}KM/H</Text>
          <Text style={styles.hudMono}>HDG {headingDeg.toFixed(0)}°</Text>
          <Text style={styles.hudMono}>{hh}:{mm}:{ss}</Text>
        </View>
      </View>

      {children}

      {onClose && (
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close-circle" size={38} color="rgba(255,255,255,0.9)" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const HUD_GREEN = 'rgba(160, 255, 190, 0.95)';
const BRACKET = {
  position: 'absolute',
  width: 26,
  height: 26,
  borderColor: 'rgba(255,255,255,0.55)',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05050C',
    overflow: 'hidden',
  },
  connecting: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectingText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginTop: 8,
  },

  bracket: { ...BRACKET },
  bracketTL: { top: 14, left: 14, borderTopWidth: 2, borderLeftWidth: 2 },
  bracketTR: { top: 14, right: 14, borderTopWidth: 2, borderRightWidth: 2 },
  bracketBL: { bottom: 14, left: 14, borderBottomWidth: 2, borderLeftWidth: 2 },
  bracketBR: { bottom: 14, right: 14, borderBottomWidth: 2, borderRightWidth: 2 },

  crosshair: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: 34,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  crosshairV: {
    position: 'absolute',
    width: 1.5,
    height: 34,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },

  topRow: {
    position: 'absolute',
    top: 20,
    left: 50,
    right: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF453A',
    marginRight: 5,
  },
  batteryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusText: {
    color: HUD_GREEN,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  hudTextBold: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  bottomStrip: {
    position: 'absolute',
    bottom: 18,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hudMono: {
    color: HUD_GREEN,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },

  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 8,
    zIndex: 10,
  },
});
