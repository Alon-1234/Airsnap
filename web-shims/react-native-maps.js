/**
 * ============================================================
 *  AirSnap — react-native-maps for the WEB build
 * ============================================================
 *  react-native-maps has no browser implementation, so on web
 *  metro.config.js swaps it for this file. It re-implements
 *  the subset of the API the app uses on top of Leaflet:
 *
 *    MapView (default) — initialRegion / initialCamera, mapType,
 *                        showsUserLocation, onPress, onMapReady,
 *                        ref: animateToRegion, fitToCoordinates,
 *                             animateCamera, setCamera, getCamera
 *    Marker / Marker.Animated — custom children, title, pinColor,
 *                               anchor, rotation, onPress
 *    Circle, Polyline, AnimatedRegion
 *
 *  Native builds (Expo Go / Android / iOS) never load this file.
 * ============================================================
 */

import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Animated, View } from 'react-native';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const MapContext = createContext(null);

// Keyless tile sources (CARTO basemaps now require an API key).
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const TILE_LAYERS = {
  dark: {
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labels: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    options: {
      maxNativeZoom: 16,
      maxZoom: 20,
      attribution: 'Tiles &copy; Esri',
    },
  },
  light: {
    url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    options: {
      maxNativeZoom: 19,
      maxZoom: 20,
      attribution: 'Tiles &copy; Esri',
    },
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxNativeZoom: 18,
      maxZoom: 20,
      attribution: 'Imagery &copy; Esri',
    },
  },
};

function tilesFor(mapType) {
  switch (mapType) {
    case 'satellite':
    case 'hybrid':
    case 'hybridFlyover':
    case 'satelliteFlyover':
      return TILE_LAYERS.satellite;
    case 'mutedStandard':
      return TILE_LAYERS.dark;
    default:
      return TILE_LAYERS.light;
  }
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const toLatLng = (c) => L.latLng(c.latitude, c.longitude);

function regionBounds(region) {
  const dLat = (region.latitudeDelta || 0.01) / 2;
  const dLng = (region.longitudeDelta || 0.01) / 2;
  return L.latLngBounds(
    [region.latitude - dLat, region.longitude - dLng],
    [region.latitude + dLat, region.longitude + dLng],
  );
}

// Google-style camera altitude (metres) → Leaflet zoom level.
function zoomForAltitude(altitude) {
  return clamp(Math.log2(35200000 / Math.max(altitude || 1000, 1)), 2, 19.5);
}

function altitudeForZoom(zoom) {
  return 35200000 / Math.pow(2, zoom);
}

function fakePressEvent(latlng) {
  return {
    nativeEvent: { coordinate: { latitude: latlng.lat, longitude: latlng.lng } },
    stopPropagation() {},
    preventDefault() {},
  };
}

// ── MapView ──────────────────────────────────────────────
const MapView = forwardRef(function MapView(props, ref) {
  const {
    style,
    children,
    initialRegion,
    region,
    initialCamera,
    mapType = 'standard',
    showsUserLocation,
    showsScale,
    scrollEnabled = true,
    zoomEnabled = true,
    onMapReady,
    onPress,
    onRegionChangeComplete,
  } = props;

  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  // Camera mode = the FPV drone view: the map is rotated to the drone's
  // heading and tilted with CSS, since Leaflet itself can't rotate.
  const cameraMode = !!initialCamera;
  const [camera, setCameraState] = useState(() => ({
    heading: initialCamera?.heading || 0,
    pitch: initialCamera?.pitch || 0,
    duration: 0,
  }));

  // Keep the latest callbacks without re-creating the map.
  const cbRef = useRef({});
  cbRef.current = { onMapReady, onPress, onRegionChangeComplete };

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;

    const m = L.map(el, {
      zoomControl: !cameraMode && zoomEnabled,
      attributionControl: !cameraMode,
      zoomSnap: 0,
      zoomDelta: 0.5,
      dragging: scrollEnabled,
      scrollWheelZoom: zoomEnabled,
      doubleClickZoom: zoomEnabled,
      touchZoom: zoomEnabled,
      boxZoom: zoomEnabled,
      keyboard: false,
      fadeAnimation: !cameraMode,
    });
    mapRef.current = m;

    if (cameraMode && initialCamera?.center) {
      m.setView(toLatLng(initialCamera.center), zoomForAltitude(initialCamera.altitude));
    } else {
      const r = region || initialRegion || {
        latitude: 31.7683, longitude: 35.2137, latitudeDelta: 0.1, longitudeDelta: 0.1,
      };
      m.fitBounds(regionBounds(r), { animate: false });
    }

    if (showsScale) L.control.scale({ position: 'bottomleft' }).addTo(m);

    m.on('click', (e) => cbRef.current.onPress?.(fakePressEvent(e.latlng)));
    m.on('moveend', () => {
      const cb = cbRef.current.onRegionChangeComplete;
      if (!cb) return;
      const b = m.getBounds();
      const c = m.getCenter();
      cb({
        latitude: c.lat,
        longitude: c.lng,
        latitudeDelta: b.getNorth() - b.getSouth(),
        longitudeDelta: b.getEast() - b.getWest(),
      });
    });

    // Layout may not be final on the first frame — re-measure on resize.
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => m.invalidateSize({ pan: false }))
      : null;
    ro?.observe(el);

    setMap(m);
    const readyTimer = setTimeout(() => {
      m.invalidateSize({ pan: false });
      if (!cameraMode && (region || initialRegion)) {
        m.fitBounds(regionBounds(region || initialRegion), { animate: false });
      }
      cbRef.current.onMapReady?.();
    }, 0);

    return () => {
      clearTimeout(readyTimer);
      ro?.disconnect();
      m.remove();
      mapRef.current = null;
    };
    // The map is created once; prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tile layer follows mapType.
  useEffect(() => {
    if (!map) return undefined;
    const { url, labels, options } = tilesFor(mapType);
    const layer = L.tileLayer(url, options).addTo(map);
    const labelLayer = labels
      ? L.tileLayer(labels, { ...options, attribution: undefined }).addTo(map)
      : null;
    return () => {
      layer.remove();
      labelLayer?.remove();
    };
  }, [map, mapType]);

  // Controlled `region` prop.
  useEffect(() => {
    if (!map || !region) return;
    map.fitBounds(regionBounds(region), { animate: false });
  }, [map, region?.latitude, region?.longitude, region?.latitudeDelta, region?.longitudeDelta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Blue "you are here" dot from the browser's geolocation.
  useEffect(() => {
    if (!map || !showsUserLocation || typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }
    let dot = null;
    let halo = null;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
        const acc = pos.coords.accuracy || 0;
        if (!dot) {
          halo = L.circle(ll, {
            radius: acc, color: '#0A84FF', weight: 0, fillColor: '#0A84FF', fillOpacity: 0.12,
            interactive: false,
          }).addTo(map);
          dot = L.circleMarker(ll, {
            radius: 7, color: '#FFFFFF', weight: 3, fillColor: '#0A84FF', fillOpacity: 1,
            interactive: false,
          }).addTo(map);
        } else {
          dot.setLatLng(ll);
          halo.setLatLng(ll).setRadius(acc);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      dot?.remove();
      halo?.remove();
    };
  }, [map, showsUserLocation]);

  useImperativeHandle(ref, () => ({
    animateToRegion(r, duration = 500) {
      const m = mapRef.current;
      if (!m || !r) return;
      m.flyToBounds(regionBounds(r), { duration: Math.max(duration, 1) / 1000 });
    },
    fitToCoordinates(coords = [], options = {}) {
      const m = mapRef.current;
      if (!m || !coords.length) return;
      const pad = options.edgePadding || {};
      const animate = options.animated !== false;
      if (coords.length === 1) {
        m.setView(toLatLng(coords[0]), Math.max(m.getZoom(), 15), { animate });
        return;
      }
      m.fitBounds(L.latLngBounds(coords.map(toLatLng)), {
        animate,
        paddingTopLeft: [pad.left || 0, pad.top || 0],
        paddingBottomRight: [pad.right || 0, pad.bottom || 0],
      });
    },
    animateToCoordinate(coord, duration = 500) {
      mapRef.current?.panTo(toLatLng(coord), { duration: duration / 1000 });
    },
    animateCamera(cam = {}, { duration = 500 } = {}) {
      applyCamera(cam, duration);
    },
    setCamera(cam = {}) {
      applyCamera(cam, 0);
    },
    getCamera() {
      const m = mapRef.current;
      const c = m ? m.getCenter() : { lat: 0, lng: 0 };
      return Promise.resolve({
        center: { latitude: c.lat, longitude: c.lng },
        heading: camera.heading,
        pitch: camera.pitch,
        altitude: m ? altitudeForZoom(m.getZoom()) : 1000,
        zoom: m ? m.getZoom() : 10,
      });
    },
  }));

  function applyCamera(cam, duration) {
    const m = mapRef.current;
    if (!m) return;
    const zoom = cam.altitude != null
      ? zoomForAltitude(cam.altitude)
      : cam.zoom != null ? cam.zoom : m.getZoom();
    if (cam.center) {
      const target = toLatLng(cam.center);
      if (Math.abs(zoom - m.getZoom()) > 0.2) {
        m.setView(target, zoom, { animate: duration > 0 });
      } else {
        m.panTo(target, {
          animate: duration > 0,
          duration: duration / 1000,
          easeLinearity: 1,
          noMoveStart: true,
        });
      }
    }
    if (cam.heading != null || cam.pitch != null) {
      setCameraState((prev) => ({
        heading: cam.heading != null ? cam.heading : prev.heading,
        pitch: cam.pitch != null ? cam.pitch : prev.pitch,
        duration,
      }));
    }
  }

  const hostStyle = cameraMode
    ? {
        position: 'absolute',
        width: '240%',
        height: '240%',
        left: '-70%',
        top: '-70%',
        transformOrigin: '50% 50%',
        transform: `perspective(800px) rotateX(${clamp(camera.pitch * 0.8, 0, 58)}deg) rotate(${-camera.heading}deg)`,
        transition: camera.duration ? `transform ${camera.duration}ms linear` : 'none',
        background: '#0b1a12',
      }
    : { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, background: '#0F0F1A' };

  return (
    <View
      style={[
        { overflow: 'hidden', position: 'relative' },
        cameraMode && { backgroundColor: '#1a2a3a' },
        style,
      ]}
    >
      <div ref={hostRef} style={hostStyle} />
      {cameraMode && (
        <div
          style={{
            position: 'absolute',
            right: 6,
            bottom: 4,
            fontSize: 9,
            color: 'rgba(255,255,255,0.55)',
            pointerEvents: 'none',
            fontFamily: 'sans-serif',
          }}
        >
          Imagery © Esri
        </div>
      )}
      {map && <MapContext.Provider value={map}>{children}</MapContext.Provider>}
    </View>
  );
});

// ── Marker ───────────────────────────────────────────────
function pinSvg(color) {
  return (
    `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${color}" stroke="#fff" stroke-width="2"/>` +
    `<circle cx="14" cy="14" r="5" fill="#fff"/></svg>`
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/**
 * Shared marker logic. `getCoordinate()` returns the current
 * {latitude, longitude}; `subscribe(cb)` (optional) pushes live
 * updates for animated coordinates.
 */
function useLeafletMarker(props, getCoordinate, subscribe) {
  const map = useContext(MapContext);
  const {
    children, title, description, pinColor = '#FF3B30', anchor, rotation = 0, zIndex = 0,
    onPress,
  } = props;
  const hasChildren = React.Children.count(children) > 0;
  const [el] = useState(() => document.createElement('div'));
  const markerRef = useRef(null);
  const pressRef = useRef(onPress);
  pressRef.current = onPress;

  useEffect(() => {
    if (!map) return undefined;
    const icon = L.divIcon({ className: 'airsnap-web-marker', html: el, iconSize: null });
    const marker = L.marker(toLatLng(getCoordinate()), {
      icon,
      zIndexOffset: zIndex * 1000,
      keyboard: false,
    }).addTo(map);
    marker.on('click', (e) => pressRef.current?.(fakePressEvent(e.latlng)));
    markerRef.current = marker;
    const unsubscribe = subscribe?.((c) => marker.setLatLng(toLatLng(c)));
    return () => {
      unsubscribe?.();
      marker.remove();
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Position (static coordinates).
  const coord = getCoordinate();
  useEffect(() => {
    if (!subscribe) markerRef.current?.setLatLng(toLatLng(coord));
  }, [coord.latitude, coord.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    markerRef.current?.setZIndexOffset(zIndex * 1000);
  }, [zIndex]);

  // Popup with title / description (native "callout").
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !title || onPress) return undefined;
    const html = `<strong>${escapeHtml(title)}</strong>${
      description ? `<br/>${escapeHtml(description)}` : ''
    }`;
    marker.bindPopup(html, { offset: [0, hasChildren ? -6 : -36] });
    return () => { marker.unbindPopup(); };
  }, [map, title, description, onPress, hasChildren]);

  // Anchor + rotation on the inner element.
  const ax = (anchor?.x ?? 0.5) * 100;
  const ay = (anchor?.y ?? (hasChildren ? 0.5 : 1)) * 100;
  el.style.position = 'absolute';
  el.style.left = '0';
  el.style.top = '0';
  el.style.transformOrigin = `${ax}% ${ay}%`;
  el.style.transform = `translate(-${ax}%, -${ay}%) rotate(${rotation || 0}deg)`;
  el.style.cursor = onPress || title ? 'pointer' : 'default';
  if (!hasChildren) el.innerHTML = pinSvg(pinColor);

  return hasChildren && map ? createPortal(children, el) : null;
}

function Marker(props) {
  const c = props.coordinate || { latitude: 0, longitude: 0 };
  return useLeafletMarker(props, () => c, null);
}

function AnimatedMarker(props) {
  const coordinate = props.coordinate;
  const isAnimated = coordinate instanceof AnimatedRegion;
  if (isAnimated) {
    return useLeafletMarker(props, () => coordinate.__getRegion(), (cb) => coordinate.addListener(cb));
  }
  const c = coordinate || { latitude: 0, longitude: 0 };
  return useLeafletMarker(props, () => c, null);
}
Marker.Animated = AnimatedMarker;

// ── Circle ───────────────────────────────────────────────
function Circle({ center, radius = 0, strokeColor = '#000', fillColor = 'rgba(0,0,0,0.1)', strokeWidth = 1 }) {
  const map = useContext(MapContext);
  const ref = useRef(null);

  useEffect(() => {
    if (!map) return undefined;
    const c = L.circle(toLatLng(center), {
      radius, color: strokeColor, weight: strokeWidth, opacity: 1,
      fillColor, fillOpacity: 1, interactive: false,
    }).addTo(map);
    ref.current = c;
    return () => { c.remove(); ref.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    ref.current?.setLatLng(toLatLng(center)).setRadius(radius);
  }, [center.latitude, center.longitude, radius]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ref.current?.setStyle({ color: strokeColor, fillColor, weight: strokeWidth });
  }, [strokeColor, fillColor, strokeWidth]);

  return null;
}

// ── Polyline ─────────────────────────────────────────────
function Polyline({ coordinates = [], strokeColor = '#000', strokeWidth = 1, lineDashPattern }) {
  const map = useContext(MapContext);
  const ref = useRef(null);
  const dash = lineDashPattern ? lineDashPattern.join(' ') : null;

  useEffect(() => {
    if (!map) return undefined;
    const p = L.polyline(coordinates.map(toLatLng), {
      color: strokeColor, weight: strokeWidth, dashArray: dash, interactive: false,
    }).addTo(map);
    ref.current = p;
    return () => { p.remove(); ref.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    ref.current?.setLatLngs(coordinates.map(toLatLng));
  }, [JSON.stringify(coordinates)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ref.current?.setStyle({ color: strokeColor, weight: strokeWidth, dashArray: dash });
  }, [strokeColor, strokeWidth, dash]);

  return null;
}

function Polygon() { return null; }
function Callout() { return null; }

// ── AnimatedRegion ───────────────────────────────────────
export class AnimatedRegion {
  constructor({ latitude = 0, longitude = 0, latitudeDelta = 0, longitudeDelta = 0 } = {}) {
    this._region = { latitude, longitude, latitudeDelta, longitudeDelta };
    this.latitude = new Animated.Value(latitude);
    this.longitude = new Animated.Value(longitude);
    this.latitudeDelta = new Animated.Value(latitudeDelta);
    this.longitudeDelta = new Animated.Value(longitudeDelta);
    this.latitude.addListener(({ value }) => { this._region.latitude = value; });
    this.longitude.addListener(({ value }) => { this._region.longitude = value; });
  }

  __getRegion() {
    return { ...this._region };
  }

  addListener(cb) {
    let frame = null;
    const fire = () => {
      if (frame != null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        cb(this.__getRegion());
      });
    };
    const a = this.latitude.addListener(fire);
    const b = this.longitude.addListener(fire);
    return () => {
      this.latitude.removeListener(a);
      this.longitude.removeListener(b);
      if (frame != null) cancelAnimationFrame(frame);
    };
  }

  setValue({ latitude, longitude } = {}) {
    if (latitude != null) this.latitude.setValue(latitude);
    if (longitude != null) this.longitude.setValue(longitude);
  }

  stopAnimation(cb) {
    this.latitude.stopAnimation();
    this.longitude.stopAnimation();
    cb?.(this.__getRegion());
  }

  _animate(kind, config = {}) {
    const { latitude, longitude, latitudeDelta, longitudeDelta, ...rest } = config;
    const anims = [];
    if (latitude != null) {
      anims.push(Animated[kind](this.latitude, { ...rest, toValue: latitude, useNativeDriver: false }));
    }
    if (longitude != null) {
      anims.push(Animated[kind](this.longitude, { ...rest, toValue: longitude, useNativeDriver: false }));
    }
    return Animated.parallel(anims);
  }

  timing(config) { return this._animate('timing', config); }
  spring(config) { return this._animate('spring', config); }
}

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;
export { Marker, Circle, Polyline, Polygon, Callout, MapView };
export default MapView;
