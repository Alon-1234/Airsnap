/**
 * ============================================================
 *  AirSnap — App Entry Point
 * ============================================================
 *  This is the root component rendered by Expo.
 *
 *  Provider hierarchy (outer → inner):
 *    1. GestureHandlerRootView  — required by react-navigation
 *    2. ThemeProvider            — dark / light mode state
 *    3. AuthProvider             — authentication + terms state
 *    4. AppNavigator             — full navigation tree
 * ============================================================
 */

import './web-shims/polyfills'; // web-only fixes (no-op on phones)
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, AuthProvider, LocationProvider, TourProvider } from './src/context';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <LocationProvider>
          <AuthProvider>
            <TourProvider>
              <AppNavigator />
            </TourProvider>
          </AuthProvider>
        </LocationProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
