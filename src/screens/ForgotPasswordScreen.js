/**
 * ============================================================
 *  AirSnap — ForgotPasswordScreen
 * ============================================================
 *  User enters their email address and Firebase emails them
 *  a password-reset link. We do NOT reveal whether the email
 *  exists — the success message is shown either way (Firebase
 *  also throttles enumeration attempts on the server side).
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

export default function ForgotPasswordScreen({ navigation }) {
  const { sendPasswordReset } = useAuth();
  const { colors } = useTheme();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      Alert.alert(
        'Check your inbox',
        'If an account exists for this email, a reset link is on its way.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Reset Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const ds = dynamicStyles(colors);

  return (
    <KeyboardAvoidingView
      style={ds.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={ds.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={ds.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>

        <Text style={ds.heading}>Reset Password</Text>
        <Text style={ds.subheading}>
          Enter your email and we'll send you a link to set a new password.
        </Text>

        <View style={ds.inputWrapper}>
          <Ionicons
            name="mail-outline"
            size={20}
            color={colors.textMuted}
            style={ds.inputIcon}
          />
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

        <TouchableOpacity onPress={handleSend} disabled={loading}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={ds.sendBtn}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={ds.sendText}>Send Reset Link</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <View style={ds.footer}>
          <Text style={ds.footerText}>Remembered it? </Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={ds.footerLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
    sendBtn: {
      borderRadius: Spacing.radiusMd,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: Spacing.sm,
    },
    sendText: {
      fontSize: 17,
      fontWeight: '700',
      color: '#FFFFFF',
    },
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
