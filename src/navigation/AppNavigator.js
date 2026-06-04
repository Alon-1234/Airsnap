/**
 * ============================================================
 *  AirSnap — Root Navigation
 * ============================================================
 *  Navigation flow:
 *
 *  1. TermsAcceptance  (first launch only — must accept T&C)
 *  2. AuthStack        (Login / SignUp — shown when not signed in)
 *  3. MainTabs         (the real app — shown after sign-in)
 *
 *  MainTabs:
 *  ├── HomeStack      (Order flow: Home → Packages → Payment → Tracking → Session → Delivery)
 *  ├── GalleryScreen  (Content gallery with auto-updating grid)
 *  └── ProfileStack   (Personal area: settings, history, help, privacy)
 *
 *  A Root Stack wraps everything so full-screen modals
 *  (e.g. live-view) can be pushed on top.
 * ============================================================
 */

import React from 'react';
import {
  ActivityIndicator,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useAuth, useTheme } from '../context';
import { ADMIN_EMAILS } from '../config/firebaseConfig';

// ── Screens ────────────────────────────────────────────────
import HomeScreen from '../screens/HomeScreen';
import PackageSelectScreen from '../screens/PackageSelectScreen';
import PaymentScreen from '../screens/PaymentScreen';
import FlightTrackingScreen from '../screens/FlightTrackingScreen';
import LiveSessionScreen from '../screens/LiveSessionScreen';
import ContentDeliveryScreen from '../screens/ContentDeliveryScreen';
import GalleryScreen from '../screens/GalleryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PartnersAboutScreen from '../screens/PartnersAboutScreen';
import OrderHistoryScreen from '../screens/OrderHistoryScreen';
import HelpScreen from '../screens/HelpScreen';
import PrivacyTermsScreen from '../screens/PrivacyTermsScreen';
import HiveAdminScreen from '../screens/HiveAdminScreen';

// ── Auth & onboarding screens ─────────────────────────────
import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import EmailVerificationScreen from '../screens/EmailVerificationScreen';
import TermsAcceptanceScreen from '../screens/TermsAcceptanceScreen';

// ── Stack navigators ──────────────────────────────────────
const AuthStack = createStackNavigator();
const HomeStack = createStackNavigator();
const ProfileStack = createStackNavigator();
const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

/**
 * AuthStackNavigator
 * Login → SignUp flow for unauthenticated users.
 */
function AuthStackNavigator() {
  const { colors } = useTheme();
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.bgDark },
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

/**
 * HomeStackNavigator
 * The main ordering flow — user walks through screens sequentially.
 */
function HomeStackNavigator() {
  const { colors } = useTheme();
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.bgDark },
      }}
    >
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="PackageSelect" component={PackageSelectScreen} />
      <HomeStack.Screen name="Payment" component={PaymentScreen} />
      <HomeStack.Screen name="FlightTracking" component={FlightTrackingScreen} />
      <HomeStack.Screen name="LiveSession" component={LiveSessionScreen} />
      <HomeStack.Screen name="ContentDelivery" component={ContentDeliveryScreen} />
    </HomeStack.Navigator>
  );
}

/**
 * ProfileStackNavigator
 * Personal area — profile settings, order history, help, privacy.
 */
function ProfileStackNavigator() {
  const { colors } = useTheme();
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.bgDark },
      }}
    >
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="PartnersAbout" component={PartnersAboutScreen} />
      <ProfileStack.Screen name="OrderHistory" component={OrderHistoryScreen} />
      <ProfileStack.Screen name="HelpFromProfile" component={HelpScreen} />
      <ProfileStack.Screen name="PrivacyTerms" component={PrivacyTermsScreen} />
      <ProfileStack.Screen name="HiveAdmin" component={HiveAdminScreen} />
    </ProfileStack.Navigator>
  );
}

/**
 * BottomTabs
 * The persistent tab bar visible across the app.
 * Colors update automatically when the user toggles dark/light mode.
 */
function BottomTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bgCard,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Order: 'paper-plane',
            Gallery: 'images',
            Profile: 'person-circle',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Order" component={HomeStackNavigator} />
      <Tab.Screen name="Gallery" component={GalleryScreen} />
      <Tab.Screen name="Profile" component={ProfileStackNavigator} />
    </Tab.Navigator>
  );
}

/**
 * AppNavigator
 * Root-level navigator that decides which flow to show:
 *   1. Loading spinner while checking saved session
 *   2. Terms acceptance (first launch)
 *   3. Auth screens (not signed in)
 *   4. Main app (signed in)
 */
export default function AppNavigator() {
  const { user, isLoading, hasAcceptedTerms } = useAuth();
  const { colors } = useTheme();

  // ── Show loading while checking saved auth ────────────
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgDark }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!hasAcceptedTerms ? (
          /* ── Step 1: Must accept terms first ──────────── */
          <RootStack.Screen name="TermsAcceptance" component={TermsAcceptanceScreen} />
        ) : !user ? (
          /* ── Step 2: Must sign in ────────────────────── */
          <RootStack.Screen name="Auth" component={AuthStackNavigator} />
        ) : !user.emailVerified && !ADMIN_EMAILS.includes((user.email || '').toLowerCase()) ? (
          /* ── Step 3: Must verify email (admins bypass) ── */
          <RootStack.Screen name="EmailVerification" component={EmailVerificationScreen} />
        ) : (
          /* ── Step 4: Signed in + verified — show the app ── */
          <RootStack.Screen name="Main" component={BottomTabs} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
