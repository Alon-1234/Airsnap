/**
 * ============================================================
 *  AirSnap — LocationService
 * ============================================================
 *  Reactive high-accuracy GPS tracker built on expo-location.
 *
 *  Design goals:
 *    • single watcher subscription across the app
 *    • listener-based reactive updates
 *    • throttled and noise-filtered coordinate emissions
 * ============================================================
 */

import * as Location from 'expo-location';
import { haversineDistanceMeters } from '../utils/geofence';

const DEFAULT_OPTIONS = {
  updateThrottleMs: 900,
  minDistanceMeters: 3,
};

class LocationService {
  constructor() {
    this.listeners = new Set();
    this.watchSubscription = null;
    this.startPromise = null;
    this.lastEmitAt = 0;
    this.lastCoords = null;
    this.options = DEFAULT_OPTIONS;

    this.state = {
      permissionStatus: 'undetermined',
      isTracking: false,
      position: null,
      error: null,
      updatedAt: null,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  updateState(patch) {
    this.state = {
      ...this.state,
      ...patch,
      updatedAt: Date.now(),
    };
    this.notify();
  }

  async requestPermission() {
    try {
      const response = await Location.requestForegroundPermissionsAsync();
      this.updateState({
        permissionStatus: response.status,
        error: response.status === 'granted' ? null : 'Location permission denied',
      });
      return response.status;
    } catch (error) {
      this.updateState({
        error: `Permission request failed: ${error.message}`,
      });
      return 'denied';
    }
  }

  async startTracking(customOptions = {}) {
    if (this.watchSubscription) return;
    // Concurrent callers (provider mount + "Grant GPS Permission" tap while
    // the permission prompt is still open) each used to reach
    // watchPositionAsync, leaking an extra watcher. Share one start.
    if (this.startPromise) return this.startPromise;
    this.startPromise = this._startTracking(customOptions).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async _startTracking(customOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...customOptions,
    };

    if (this.state.permissionStatus !== 'granted') {
      const status = await this.requestPermission();
      if (status !== 'granted') return;
    }

    try {
      this.watchSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 700,
          distanceInterval: 1,
          mayShowUserSettingsDialog: true,
        },
        (location) => {
          const now = Date.now();
          const nextPoint = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            heading: location.coords.heading,
            speed: location.coords.speed,
            altitude: location.coords.altitude,
            timestamp: location.timestamp,
          };

          const elapsed = now - this.lastEmitAt;
          const movedDistance = this.lastCoords
            ? haversineDistanceMeters(this.lastCoords, nextPoint)
            : Number.POSITIVE_INFINITY;

          // Reduce map churn by ignoring tiny movement + bursty updates.
          if (
            elapsed < this.options.updateThrottleMs &&
            movedDistance < this.options.minDistanceMeters
          ) {
            return;
          }

          this.lastEmitAt = now;
          this.lastCoords = {
            latitude: nextPoint.latitude,
            longitude: nextPoint.longitude,
          };

          this.updateState({
            isTracking: true,
            error: null,
            position: nextPoint,
          });
        }
      );

      this.updateState({ isTracking: true, error: null });
    } catch (error) {
      this.updateState({
        isTracking: false,
        error: `Failed to start GPS tracking: ${error.message}`,
      });
    }
  }

  stopTracking() {
    if (this.watchSubscription) {
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }

    this.updateState({
      isTracking: false,
    });
  }
}

export default new LocationService();
