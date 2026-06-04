import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../config/serverConfig';

/**
 * Backend-synced geofence validation hook.
 * Debounces coordinate changes and keeps request race-safe.
 */
export function useGeofence(coords) {
  const [state, setState] = useState({
    loading: false,
    inBounds: false,
    distanceMeters: null,
    radiusMeters: null,
    hive: null,
    error: null,
  });

  const seqRef = useRef(0);

  useEffect(() => {
    if (!coords?.latitude || !coords?.longitude) {
      setState((prev) => ({
        ...prev,
        loading: false,
        inBounds: false,
        distanceMeters: null,
      }));
      return;
    }

    const timer = setTimeout(async () => {
      const seq = seqRef.current + 1;
      seqRef.current = seq;

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const response = await fetch(`${API_BASE_URL}/spatial/validate-geofence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: coords }),
        });

        const payload = await response.json();

        // Ignore stale responses if a newer request is in flight.
        if (seq !== seqRef.current) return;

        if (!response.ok) {
          setState((prev) => ({
            ...prev,
            loading: false,
            inBounds: false,
            distanceMeters: payload?.distanceMeters ?? null,
            radiusMeters: payload?.radiusMeters ?? null,
            hive: payload?.hive ?? null,
            error: payload?.message || 'Geofence validation failed',
          }));
          return;
        }

        setState({
          loading: false,
          inBounds: Boolean(payload.inBounds),
          distanceMeters: payload.distanceMeters,
          radiusMeters: payload.radiusMeters,
          hive: payload.hive,
          error: null,
        });
      } catch (error) {
        if (seq !== seqRef.current) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          inBounds: false,
          error: `Geofence API unavailable: ${error.message}`,
        }));
      }
    }, 550);

    return () => clearTimeout(timer);
  }, [coords?.latitude, coords?.longitude]);

  return useMemo(
    () => ({
      ...state,
      isOrderAllowed: state.inBounds && !state.loading,
    }),
    [state]
  );
}
