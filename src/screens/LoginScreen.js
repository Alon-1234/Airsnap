/**
 * ============================================================
 *  AirSnap — LoginScreen
 * ============================================================
 *  The first screen a user sees if they are not signed in.
 *
 *  Sign-in options:
 *    • Continue with Google   (OAuth mock)
 *    • Continue with Apple    (OAuth mock)
 *    • Email + Password form
 *    • Link to Sign Up screen for new users
 *
 *  In production, replace the mock auth calls in AuthContext
 *  with real OAuth (expo-auth-session) or Firebase Auth.
 * ============================================================
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuth } from '../context';
import { useTheme } from '../context';
import { Spacing } from '../theme';

export default function LoginScreen({ navigation }) {
  const { signInWithGoogle, signInWithApple, signInWithEmail } = useAuth();
  const { colors } = useTheme();

  // ── Local form state ──────────────────────────────────
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Email sign-in handler ─────────────────────────────
  const handleEmailSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Info', 'Please enter both email and password.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err) {
      Alert.alert('Sign In Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Google sign-in handler ────────────────────────────
  const handleGoogle = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      Alert.alert('Google Sign In', err.message || 'Google Sign-In is not ready yet.');
    } finally {
      setLoading(false);
    }
  };

  // ── Apple sign-in handler ─────────────────────────────
  const handleApple = async () => {
    setLoading(true);
    try {
      await signInWithApple();
    } catch (err) {
      Alert.alert('Apple Sign In', err.message || 'Apple Sign-In is not ready yet.');
    } finally {
      setLoading(false);
    }
  };

  // ── Dynamic styles based on current theme ─────────────
  const ds = dynamicStyles(colors);

  // ── Render ─────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[ds.container]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={ds.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Brand header ───────────────────────────────── */}
        <View style={ds.header}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={ds.logoCircle}
          >
            <Ionicons name="paper-plane" size={36} color="#FFFFFF" />
          </LinearGradient>
          <Text style={ds.brand}>AirSnap</Text>
          <Text style={ds.tagline}>Stunning drone photos. Zero effort.</Text>
        </View>

        {/* ─── Social sign-in buttons ─────────────────────── */}
        <TouchableOpacity style={ds.socialBtn} onPress={handleGoogle} disabled={loading}>
          <Ionicons name="logo-google" size={22} color="#DB4437" />
          <Text style={ds.socialText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity style={ds.socialBtn} onPress={handleApple} disabled={loading}>
          <Ionicons name="logo-apple" size={22} color={colors.textPrimary} />
          <Text style={ds.socialText}>Continue with Apple</Text>
        </TouchableOpacity>

        {/* ─── Divider ────────────────────────────────────── */}
        <View style={ds.dividerRow}>
          <View style={ds.dividerLine} />
          <Text style={ds.dividerText}>or sign in with email</Text>
          <View style={ds.dividerLine} />
        </View>

        {/* ─── Email input ────────────────────────────────── */}
        <View style={ds.inputWrapper}>
          <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={ds.inputIcon} />
          <TextInput
            style={ds.input}
            placeholder="Email address"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        </View>

        {/* ─── Password input ─────────────────────────────── */}
        <View style={ds.inputWrapper}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={ds.inputIcon} />
          <TextInput
            style={ds.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            textContentType="password"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        {/* ─── Forgot password link ────────────────────────── */}
        <TouchableOpacity
          style={ds.forgotRow}
          onPress={() => navigation.navigate('ForgotPassword')}
        >
          <Text style={ds.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        {/* ─── Sign in button ─────────────────────────────── */}
        <TouchableOpacity onPress={handleEmailSignIn} disabled={loading}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={ds.signInBtn}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={ds.signInText}>Sign In</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* ─── Sign up link ───────────────────────────────── */}
        <View style={ds.footer}>
          <Text style={ds.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
            <Text style={ds.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Dynamic styles (depend on current theme colors) ──────
const dynamicStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgDark,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: Spacing.screenPadding,
      paddingVertical: Spacing.xxl,
    },

    // ── Brand header ──────────────────────────────────────
    header: {
      alignItems: 'center',
      marginBottom: Spacing.xl + 8,
    },
    logoCircle: {
      width: 72,
      height: 72,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    brand: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.textPrimary,
      letterSpacing: 0.5,
    },
    tagline: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 4,
    },
    // ── Social buttons ────────────────────────────────────
    socialBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgCard,
      borderRadius: Spacing.radiusMd,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      marginBottom: Spacing.sm + 4,
    },
    socialText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      marginLeft: Spacing.sm + 4,
    },

    // ── Divider ────────────────────────────────────────────
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: Spacing.lg,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      fontSize: 13,
      color: colors.textMuted,
      marginHorizontal: Spacing.md,
    },

    // ── Inputs ─────────────────────────────────────────────
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bgInput,
      borderRadius: Spacing.radiusMd,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
      height: 52,
    },
    inputIcon: {
      marginRight: Spacing.sm,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: colors.textPrimary,
    },

    // ── Forgot password link ──────────────────────────────
    forgotRow: {
      alignSelf: 'flex-end',
      paddingVertical: 4,
      marginBottom: Spacing.sm,
    },
    forgotText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },

    // ── Sign in button ────────────────────────────────────
    signInBtn: {
      borderRadius: Spacing.radiusMd,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    signInText: {
      fontSize: 17,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // ── Footer ─────────────────────────────────────────────
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: Spacing.lg,
    },
    footerText: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    footerLink: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.primary,
    },
  });
