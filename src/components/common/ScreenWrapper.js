/**
 * ============================================================
 *  AirSnap — ScreenWrapper
 * ============================================================
 *  Provides consistent screen scaffolding:
 *    • SafeAreaView with the app's background (dark or light)
 *    • Optional header with back arrow + title
 *    • ScrollView or plain View child wrapper
 *
 *  Reads colours from ThemeContext so it automatically adapts
 *  when the user toggles dark / light mode.
 *
 *  Props:
 *    • title       (string)  — Optional header title
 *    • scroll      (bool)    — Wrap children in ScrollView?
 *    • onBack      (func)    — If provided, shows back arrow
 *    • style       (object)  — Inner content style overrides
 *    • rightAction (node)    — Optional component on header right
 * ============================================================
 */

import React from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context';
import { Spacing } from '../../theme';

export default function ScreenWrapper({
  children,
  title,
  scroll = true,
  onBack,
  style,
  rightAction,
}) {
  const { colors, isDark } = useTheme();
  const Wrapper = scroll ? ScrollView : View;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safe, { backgroundColor: colors.bgDark }]}> 
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* ── Header ─────────────────────────────────────────── */}
      {(title || onBack) && (
        <View style={styles.header}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtn} />
          )}

          {title && (
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {title}
            </Text>
          )}

          {rightAction || <View style={styles.backBtn} />}
        </View>
      )}

      {/* ── Content ────────────────────────────────────────── */}
      <Wrapper
        style={[styles.content, style]}
        contentContainerStyle={scroll ? styles.scrollContent : undefined}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </Wrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.screenPadding,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenPadding,
    paddingBottom: Spacing.xxl,
  },
});
