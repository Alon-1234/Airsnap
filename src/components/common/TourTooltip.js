/**
 * ============================================================
 *  AirSnap — TourTooltip
 * ============================================================
 *  Shared react-native-copilot tooltip component and the style
 *  shell that overrides the library's default white container.
 *  Used by every screen that participates in the guided demo.
 * ============================================================
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useCopilot } from 'react-native-copilot';

import { Spacing } from '../../theme';

export const tourTooltipShellStyle = {
  position: 'absolute',
  left: Spacing.md,
  right: Spacing.md,
  bottom: 24,
  top: 'auto',
  maxWidth: '100%',
  backgroundColor: 'transparent',
  padding: 0,
  borderRadius: 0,
  overflow: 'visible',
};

export default function TourTooltip({ labels }) {
  const {
    currentStep,
    isFirstStep,
    isLastStep,
    goToNext,
    goToPrev,
    stop,
  } = useCopilot();

  if (!currentStep) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.text}>{currentStep.text}</Text>

      <View style={styles.actions}>
        {!isFirstStep && (
          <TouchableOpacity style={styles.btn} onPress={goToPrev}>
            <Text style={styles.btnText}>{labels?.previous || 'Back'}</Text>
          </TouchableOpacity>
        )}

        {!isLastStep ? (
          <>
            <TouchableOpacity style={styles.btn} onPress={stop}>
              <Text style={styles.btnText}>{labels?.skip || 'Skip'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={goToNext}>
              <Text style={styles.btnPrimaryText}>{labels?.next || 'Next'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.btnPrimary} onPress={stop}>
            <Text style={styles.btnPrimaryText}>{labels?.finish || 'Done'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.radiusLg,
    paddingTop: Spacing.md + 2,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginLeft: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  btnText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
  },
  btnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  btnPrimaryText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
});
