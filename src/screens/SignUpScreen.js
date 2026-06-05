/**
 * ============================================================
 *  AirSnap — SignUpScreen
 * ============================================================
 *  Registration screen for new users.
 *
 *  Fields:
 *    • Full name
 *    • Email address
 *    • Password (with visibility toggle)
 *    • Confirm password
 *
 *  Also provides Google / Apple sign-up as shortcuts.
 *  Has a back arrow to return to the Login screen.
 *
 *  In production, wire up to Firebase createUser or your
 *  own backend registration endpoint.
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

import { useAuth, useTheme } from '../context';
import { Spacing } from '../theme';

export default function SignUpScreen({ navigation }) {
  const { signUp, signInWithGoogle, signInWithApple, setPendingReferralCode } = useAuth();
  const { colors } = useTheme();

  // ── Local form state ──────────────────────────────────
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Validation + sign-up handler ──────────────────────
  const validatePassword = (pw) => {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter.';
    if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter.';
    if (!/[0-9]/.test(pw)) return 'Password must contain a number.';
    return null;
  };

  const handleSignUp = async () => {
    if (!name.trim()) {
      Alert.alert('Missing Info', 'Please enter your name.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Missing Info', 'Please enter your email address.');
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      Alert.alert('Weak Password', pwError);
      return;
    }
    if (password !== confirmPw) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      // Stash referral code BEFORE sign-up so AuthContext's bootstrap
      // picks it up the moment Firebase fires onAuthStateChanged.
      setPendingReferralCode(referralCode);
      await signUp(name.trim(), email.trim(), password);
      // After sign-up, the navigator will automatically show
      // EmailVerificationScreen because user.emailVerified is false.
    } catch (err) {
      Alert.alert('Sign Up Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Dynamic styles based on current theme ─────────────
  const ds = dynamicStyles(colors);

  // ── Render ─────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={ds.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={ds.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Back arrow ─────────────────────────────────── */}
        <TouchableOpacity
          style={ds.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>

        {/* ─── Header ─────────────────────────────────────── */}
        <Text style={ds.heading}>Create Account</Text>
        <Text style={ds.subheading}>
          Join AirSnap and start capturing amazing aerial content.
        </Text>

        {/* ─── Social sign-up shortcuts ───────────────────── */}
        <TouchableOpacity
          style={ds.socialBtn}
          onPress={async () => {
            setLoading(true);
            try {
              await signInWithGoogle();
            } catch (err) {
              Alert.alert('Google Sign Up', err.message || 'Google Sign-In is not ready yet.');
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
        >
          <Ionicons name="logo-google" size={22} color="#DB4437" />
          <Text style={ds.socialText}>Sign up with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={ds.socialBtn}
          onPress={async () => {
            setLoading(true);
            try {
              await signInWithApple();
            } catch (err) {
              Alert.alert('Apple Sign Up', err.message || 'Apple Sign-In is not ready yet.');
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
        >
          <Ionicons name="logo-apple" size={22} color={colors.textPrimary} />
          <Text style={ds.socialText}>Sign up with Apple</Text>
        </TouchableOpacity>

        {/* ─── Divider ────────────────────────────────────── */}
        <View style={ds.dividerRow}>
          <View style={ds.dividerLine} />
          <Text style={ds.dividerText}>or use email</Text>
          <View style={ds.dividerLine} />
        </View>

        {/* ─── Name input ─────────────────────────────────── */}
        <View style={ds.inputWrapper}>
          <Ionicons name="person-outline" size={20} color={colors.textMuted} style={ds.inputIcon} />
          <TextInput
            style={ds.input}
            placeholder="Full name"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            textContentType="name"
          />
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
            placeholder="Password (8+ chars, A-Z, a-z, 0-9)"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            textContentType="newPassword"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </TouchableOpacity>
        </View>

        {/* ─── Confirm password ───────────────────────────── */}
        <View style={ds.inputWrapper}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.textMuted} style={ds.inputIcon} />
          <TextInput
            style={ds.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.textMuted}
            value={confirmPw}
            onChangeText={setConfirmPw}
            secureTextEntry={!showPassword}
            textContentType="newPassword"
          />
        </View>

        {/* ─── Referral code (optional) ───────────────────── */}
        <View style={ds.inputWrapper}>
          <Ionicons name="gift-outline" size={20} color={colors.textMuted} style={ds.inputIcon} />
          <TextInput
            style={ds.input}
            placeholder="Referral code (optional)"
            placeholderTextColor={colors.textMuted}
            value={referralCode}
            onChangeText={(t) => setReferralCode(t.toUpperCase())}
            autoCapitalize="characters"
            maxLength={12}
          />
        </View>

        {/* ─── Create account button ──────────────────────── */}
        <TouchableOpacity onPress={handleSignUp} disabled={loading}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={ds.signUpBtn}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={ds.signUpText}>Create Account</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* ─── Already have account link ──────────────────── */}
        <View style={ds.footer}>
          <Text style={ds.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={ds.footerLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Dynamic styles ───────────────────────────────────────
const dynamicStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bgDark,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: Spacing.screenPadding,
      paddingTop: Spacing.xxl,
      paddingBottom: Spacing.xxl,
    },
    backBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      marginBottom: Spacing.md,
    },
    heading: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
      marginBottom: Spacing.xs,
    },
    subheading: {
      fontSize: 15,
      color: colors.textSecondary,
      marginBottom: Spacing.xl,
      lineHeight: 22,
    },

    // ── Social buttons ──────────────────────────────────
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

    // ── Divider ─────────────────────────────────────────
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

    // ── Inputs ──────────────────────────────────────────
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

    // ── Sign up button ──────────────────────────────────
    signUpBtn: {
      borderRadius: Spacing.radiusMd,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    signUpText: {
      fontSize: 17,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // ── Footer ──────────────────────────────────────────
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
