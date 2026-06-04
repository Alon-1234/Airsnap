/**
 * ============================================================
 *  AirSnap — TourContext
 * ============================================================
 *  Global flag that lets the guided demo continue across
 *  screens. When a screen mounts and `isTourActive` is true,
 *  it auto-starts its local copilot tour and programmatically
 *  advances to the next screen on completion.
 * ============================================================
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const TourContext = createContext(null);

export function TourProvider({ children }) {
  const [isTourActive, setIsTourActive] = useState(false);

  const startTour = useCallback(() => setIsTourActive(true), []);
  const endTour = useCallback(() => setIsTourActive(false), []);

  const value = useMemo(
    () => ({ isTourActive, startTour, endTour }),
    [isTourActive, startTour, endTour]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return ctx;
}
