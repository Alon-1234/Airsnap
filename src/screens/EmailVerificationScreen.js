/**
 * ============================================================
 *  AirSnap — EmailVerificationScreen
 * ============================================================
 *  Shown when a user is signed in but their email isn't
 *  verified yet. Blocks access to the main app until they
 *  click the link in their Firebase verification email.
 *
 *  Provides:
 *    • "I verified — refresh" button (reloads user from Firebase)
 *    • "Resend verification email" button
 *    • "Sign out" button to back out
 * ============================================================
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth, useTheme } from '../context';
import { Spacing } from '../theme';

export default function EmailVerificationScreen() {
  const { user, reloadUser, resendVerificationEmail, signOut } = useAuth();
  const { colors } = useTheme();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  // ── Auto-poll Firebase every 5s in case the user verified ──
  useEffect(() => {
    const interval = setInterval(() => {
      reloadUser().catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [reloadUser]);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await reloadUser();
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerificationEmail();
      Alert.alert('Sent', 'Check your inbox for a new verification link.');
    } catch (err) {
      Alert.alert('Could not resend', err.message);
    } finally {
      setResending(false);
    }
  };

  const ds = dynamicStyles(colors);

  return (
    <View style={ds.container}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={ds.iconCircle}
      >
        <Ionicons name="mail-open" size={42} color="#FFFFFF" />
      </LinearGradient>

      <Text style={ds.heading}>Verify your email</Text>
      <Text style={ds.body}>
        We sent a verification link to{'\n'}
        <Text style={ds.email}>{user?.email}</Text>
      </Text>
      <Text style={ds.subtle}>
        Click the link in that email to finish creating your account. This screen
        will refresh automatically once you do.
      </Text>

      <TouchableOpacity onPress={handleCheck} disabled={checking}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={ds.primaryBtn}
        >
          {checking ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={ds.primaryText}>I verified — continue</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity
        style={ds.secondaryBtn}
        onPress={handleResend}
        disabled={resending}
      >
        {resending ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={ds.secondaryText}>Resend verification email</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={ds.signOutBtn} onPress={signOut}>
        <Ionicons name="log-out-outline" size={18} color={colors.error} />
        <Text style={ds.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const dynamicStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgDark,
      paddingHorizontal: Spacing.screenPadding,
      paddingVertical: Spacing.xxl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.xl,
    },
    heading: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: Spacing.md,
      textAlign: 'center',
    },
    body: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 24,
      marginBottom: Spacing.md,
    },
    email: {
      color: colors.primary,
      fontWeight: '700',
    },
    subtle: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: Spacing.xl,
      paddingHorizontal: Spacing.md,
    },
    primaryBtn: {
      borderRadius: Spacing.radiusMd,
      paddingVertical: 16,
      paddingHorizontal: 48,
      alignItems: 'center',
      marginBottom: Spacing.md,
      minWidth: 260,
    },
    primaryText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    secondaryBtn: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      alignItems: 'center',
      marginBottom: Spacing.xl,
    },
    secondaryText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    signOutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    signOutText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.error,
      marginLeft: 6,
    },
  });
