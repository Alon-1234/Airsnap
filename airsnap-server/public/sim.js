/* global L, io */
/**
 * AirSnap live visualization.
 *
 * Subscribes to drone:state events as a "viewer" and renders everything on
 * a Leaflet map: hives, active drones (with rotating icons + flight trails),
 * connected users, and a right-side panel.
 */

(function () {
  // ── Map setup ────────────────────────────────────────────
  const map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
  }).setView([31.8312, 35.1286], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  // ── Icon factories ──────────────────────────────────────
  // Hive icon scales with capacity, label = available/total. Goes gray when full.
  function makeHiveIcon(hive) {
    const available = Math.max(0, (hive.capacity || 1) - (hive.activeDrones || 0));
    const total = hive.capacity || 1;
    const size = 30 + Math.min(60, total * 6);
    const full = available === 0;
    return L.divIcon({
      className: '',
      html:
        '<div class="hive-marker' + (full ? ' full' : '') + '" style="width:' + size + 'px;height:' + size + 'px;">' +
          available + '/' + total +
        '</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  const userIcon = L.divIcon({
    className: '',
    html: '<div class="user-marker"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  function droneIconRotated(headingRad) {
    const deg = (headingRad * 180) / Math.PI;
    return L.divIcon({
      className: '',
      html:
        '<div class="drone-marker" style="transform: rotate(' + deg + 'deg);">' +
        '<svg viewBox="0 0 32 32" fill="#4F8EF7">' +
          '<path d="M16 2 L18 12 L28 14 L20 18 L22 28 L16 22 L10 28 L12 18 L4 14 L14 12 Z"/>' +
        '</svg></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  // ── State stores ────────────────────────────────────────
  const hives = new Map();      // id  -> L.marker
  const drones = new Map();     // orderId -> { marker, trail, line, lastState }
  const userMarkers = new Map();// orderId -> L.marker

  function recountStatuses() {
    document.getElementById('hive-count').textContent  = hives.size;
    document.getElementById('drone-count').textContent = drones.size;
    renderOrders();
  }

  function renderOrders() {
    const container = document.getElementById('orders');
    if (!drones.size) {
      container.innerHTML = '<div class="empty">No active orders.</div>';
      return;
    }
    const items = [];
    for (const [orderId, d] of drones) {
      const s = d.lastState || {};
      const status = (s.status || 'pending').toLowerCase();
      items.push(
        '<div class="order-card">' +
          '<div class="id">' + escapeHtml(orderId) + '</div>' +
          '<span class="status ' + status + '">' + escapeHtml(status.replace('_', ' ')) + '</span>' +
          '<div class="stats">' +
            'Alt <span>' + (s.position?.altitude || 0).toFixed(0) + ' m</span> · ' +
            'Speed <span>' + (s.speed || 0).toFixed(1) + ' m/s</span> · ' +
            'Battery <span>' + (s.battery || 0).toFixed(0) + '%</span><br>' +
            'ETA <span>' + (s.etaSec || 0) + ' s</span> · ' +
            'Dist <span>' + Math.round(s.distanceMeters || 0) + ' m</span>' +
          '</div>' +
        '</div>'
      );
    }
    container.innerHTML = items.join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  // ── Hive rendering ──────────────────────────────────────
  function upsertHive(hive) {
    const available = Math.max(0, (hive.capacity || 1) - (hive.activeDrones || 0));
    const tooltip = (hive.name || 'Hive') + ' — ' + available + '/' + (hive.capacity || 1) + ' available';
    if (hives.has(hive.id)) {
      const existing = hives.get(hive.id);
      existing.setLatLng([hive.latitude, hive.longitude]);
      existing.setIcon(makeHiveIcon(hive));
      existing.unbindTooltip();
      existing.bindTooltip(tooltip, { permanent: false, direction: 'top' });
      return;
    }
    const m = L.marker([hive.latitude, hive.longitude], { icon: makeHiveIcon(hive) })
      .bindTooltip(tooltip, { permanent: false, direction: 'top' })
      .addTo(map);
    hives.set(hive.id, m);
    recountStatuses();
  }

  function removeHive(id) {
    const m = hives.get(id);
    if (!m) return;
    map.removeLayer(m);
    hives.delete(id);
    recountStatuses();
  }

  // ── Drone rendering ─────────────────────────────────────
  function upsertDrone(state) {
    if (!state?.position) return;
    const ll = [state.position.latitude, state.position.longitude];
    let entry = drones.get(state.orderId);
    if (!entry) {
      const marker = L.marker(ll, { icon: droneIconRotated(state.heading || 0) }).addTo(map);
      const trail = L.polyline([ll], { color: '#4F8EF7', weight: 2, opacity: 0.7 }).addTo(map);
      const line = L.polyline([ll, ll], { color: '#00C7FF', weight: 1, opacity: 0.4, dashArray: '4,4' }).addTo(map);
      entry = { marker, trail, line, lastState: state, trailPoints: [ll] };
      drones.set(state.orderId, entry);
      // Pan to it the first time.
      if (drones.size === 1) map.setView(ll, 16);
    } else {
      entry.marker.setLatLng(ll);
      entry.marker.setIcon(droneIconRotated(state.heading || 0));
      entry.lastState = state;
      entry.trailPoints.push(ll);
      if (entry.trailPoints.length > 600) entry.trailPoints.shift(); // last 60s @ 10Hz
      entry.trail.setLatLngs(entry.trailPoints);
      // Update line to user if we have one.
      const userMarker = userMarkers.get(state.orderId);
      if (userMarker) {
        entry.line.setLatLngs([ll, userMarker.getLatLng()]);
      } else if (state.target) {
        entry.line.setLatLngs([ll, [state.target.latitude, state.target.longitude]]);
      }
    }

    // Clean up finished drones after a moment.
    if (state.status === 'delivered') {
      setTimeout(() => {
        map.removeLayer(entry.marker);
        map.removeLayer(entry.trail);
        map.removeLayer(entry.line);
        drones.delete(state.orderId);
        const u = userMarkers.get(state.orderId);
        if (u) { map.removeLayer(u); userMarkers.delete(state.orderId); }
        recountStatuses();
      }, 5000);
    }
    recountStatuses();
  }

  function setUser(orderId, latitude, longitude) {
    let m = userMarkers.get(orderId);
    if (!m) {
      m = L.marker([latitude, longitude], { icon: userIcon }).addTo(map);
      userMarkers.set(orderId, m);
    } else {
      m.setLatLng([latitude, longitude]);
    }
  }

  // ── Socket wiring ───────────────────────────────────────
  const socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    document.getElementById('conn-dot').classList.remove('off');
    document.getElementById('conn-text').textContent = 'connected';
    socket.emit('hello:viewer');
  });
  socket.on('disconnect', () => {
    document.getElementById('conn-dot').classList.add('off');
    document.getElementById('conn-text').textContent = 'disconnected';
  });

  socket.on('hives:snapshot', ({ hives: list }) => {
    list.forEach(upsertHive);
  });
  socket.on('hive:created', upsertHive);
  socket.on('hive:updated', upsertHive);
  socket.on('hive:deleted', ({ id }) => removeHive(id));

  socket.on('drone:state', upsertDrone);

  socket.on('user:location', ({ orderId, latitude, longitude }) => {
    setUser(orderId, latitude, longitude);
  });

  socket.on('order:status', ({ orderId, status }) => {
    const entry = drones.get(orderId);
    if (entry && entry.lastState) {
      entry.lastState.status = status;
      renderOrders();
    }
  });
})();
