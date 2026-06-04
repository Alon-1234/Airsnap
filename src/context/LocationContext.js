/**
 * ============================================================
 *  AirSnap — LocationContext
 * ============================================================
 *  Exposes reactive geolocation state to screens/components.
 * ============================================================
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import LocationService from '../services/LocationService';

const LocationContext = createContext(null);

export function LocationProvider({ children }) {
  const [state, setState] = useState({
    permissionStatus: 'undetermined',
    isTracking: false,
    position: null,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    const unsubscribe = LocationService.subscribe(setState);

    // Start high-accuracy tracking as soon as context mounts.
    LocationService.startTracking();

    return () => {
      unsubscribe();
      LocationService.stopTracking();
    };
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      requestPermissionAndRetry: async () => {
        await LocationService.requestPermission();
        await LocationService.startTracking();
      },
      openLocationSettings: async () => {
        await Linking.openSettings();
      },
      stopTracking: () => LocationService.stopTracking(),
      startTracking: () => LocationService.startTracking(),
    }),
    [state]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocation must be used inside <LocationProvider>');
  }
  return ctx;
}
