/* global L, io */
/**
 * AirSnap live visualization — fleet + per-drone battery edition.
 *
 * Connects as a "viewer", listens to drone/hive events, draws everything
 * on a Leaflet map, and keeps the right panel synced.
 */

(function () {
  // ── Map setup ────────────────────────────────────────────
  const map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
  }).setView([31.8312, 35.1286], 13);

  // CartoDB Voyager Dark — sleek, no API key needed.
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
    }
  ).addTo(map);

  // ── State stores ────────────────────────────────────────
  const hives = new Map();      // id  -> { marker, data }
  const drones = new Map();     // orderId -> { marker, trail, line, lastState, trailPoints }
  const userMarkers = new Map();// orderId -> L.marker

  // ── Marker factories ────────────────────────────────────
  function makeHiveIcon(hive) {
    const available = hive.available ?? 0;
    const total = hive.capacity ?? 1;
    const size = 32 + Math.min(64, total * 6);
    const anyCharging = (hive.drones || []).some((d) => d.status === 'charging');
    const cls = available === 0
      ? (anyCharging ? 'charging' : 'full')
      : '';
    return L.divIcon({
      className: '',
      html:
        '<div class="hive-marker-wrap">' +
          '<div class="hive-marker ' + cls + '" style="width:' + size + 'px;height:' + size + 'px;">' +
            available + '/' + total +
          '</div>' +
        '</div>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function makeDroneIcon(state) {
    const deg = ((state.heading || 0) * 180) / Math.PI;
    const low = (state.battery || 100) < 40;
    return L.divIcon({
      className: '',
      html:
        '<div class="drone-marker ' + (low ? 'low' : '') + '">' +
          '<div class="rotor tl"></div>' +
          '<div class="rotor tr"></div>' +
          '<div class="rotor bl"></div>' +
          '<div class="rotor br"></div>' +
          '<svg class="body" viewBox="0 0 32 32" fill="' + (low ? '#FF9F2D' : '#4F8EF7') + '" style="transform: rotate(' + deg + 'deg);">' +
            '<path d="M16 4 L19 12 L27 14 L20 18 L23 27 L16 22 L9 27 L12 18 L5 14 L13 12 Z"/>' +
          '</svg>' +
        '</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  const userIcon = L.divIcon({
    className: '',
    html: '<div class="user-marker"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  // ── Panel updates ───────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }

  function dronePillClass(d) {
    if (d.status === 'flying')   return 'flying';
    if (d.status === 'charging') return 'charging';
    if (d.battery < 40)          return 'low';
    return 'idle';
  }

  function renderFleet() {
    let total = 0, idle = 0, flying = 0, charging = 0, batterySum = 0;
    for (const { data } of hives.values()) {
      for (const d of data.drones || []) {
        total++;
        batterySum += d.battery || 0;
        if (d.status === 'flying') flying++;
        else if (d.status === 'charging') charging++;
        else idle++;
      }
    }
    document.getElementById('m-total').textContent    = total;
    document.getElementById('m-idle').textContent     = idle;
    document.getElementById('m-flying').textContent   = flying;
    document.getElementById('m-charging').textContent = charging;
    document.getElementById('m-avg-bat').textContent  =
      total ? Math.round(batterySum / total) + '%' : '—';
  }

  function renderHivesList() {
    const container = document.getElementById('hives-list');
    if (!hives.size) {
      container.innerHTML = '<div class="empty">No hives yet — place one from the app.</div>';
      return;
    }
    const items = [];
    for (const { data } of hives.values()) {
      const pills = (data.drones || []).map((d) => {
        const cls = dronePillClass(d);
        const label =
          d.status === 'charging' ? Math.round(d.battery) + '% ⚡' :
          d.status === 'flying'   ? 'flying'    :
                                     Math.round(d.battery) + '%';
        return (
          '<span class="pill ' + cls + '">' +
            '<span class="dot"></span>' + label +
          '</span>'
        );
      }).join('');
      items.push(
        '<div class="hive-block">' +
          '<div class="hname">' +
            '<span>' + escapeHtml(data.name || 'Hive') + '</span>' +
            '<span class="badge">' + (data.available ?? 0) + '/' + (data.capacity ?? 0) + '</span>' +
          '</div>' +
          '<div class="drone-pills">' + (pills || '<span class="empty">no drones</span>') + '</div>' +
        '</div>'
      );
    }
    container.innerHTML = items.join('');
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
            'Alt <b>' + (s.position?.altitude || 0).toFixed(0) + ' m</b> · ' +
            'Speed <b>' + (s.speed || 0).toFixed(1) + ' m/s</b> · ' +
            'Battery <b>' + (s.battery || 0).toFixed(0) + '%</b><br>' +
            'ETA <b>' + (s.etaSec || 0) + ' s</b> · ' +
            'Dist <b>' + Math.round(s.distanceMeters || 0) + ' m</b>' +
          '</div>' +
        '</div>'
      );
    }
    container.innerHTML = items.join('');
  }

  function rerender() {
    renderFleet();
    renderHivesList();
    renderOrders();
  }

  // ── Hive rendering on map ───────────────────────────────
  function upsertHive(hive) {
    const tooltip = (hive.name || 'Hive') + ' — ' + (hive.available ?? 0) + '/' + (hive.capacity ?? 1) + ' ready';
    const existing = hives.get(hive.id);
    if (existing) {
      existing.marker.setLatLng([hive.latitude, hive.longitude]);
      existing.marker.setIcon(makeHiveIcon(hive));
      existing.marker.unbindTooltip();
      existing.marker.bindTooltip(tooltip, { permanent: false, direction: 'top' });
      existing.data = hive;
    } else {
      const m = L.marker([hive.latitude, hive.longitude], { icon: makeHiveIcon(hive) })
        .bindTooltip(tooltip, { permanent: false, direction: 'top' })
        .addTo(map);
      hives.set(hive.id, { marker: m, data: hive });
    }
    rerender();
  }

  function removeHive(id) {
    const entry = hives.get(id);
    if (!entry) return;
    map.removeLayer(entry.marker);
    hives.delete(id);
    rerender();
  }

  // ── Drone rendering ─────────────────────────────────────
  function upsertDrone(state) {
    if (!state?.position) return;
    const ll = [state.position.latitude, state.position.longitude];
    let entry = drones.get(state.orderId);
    if (!entry) {
      const marker = L.marker(ll, { icon: makeDroneIcon(state) }).addTo(map);
      const trail = L.polyline([ll], { color: '#4F8EF7', weight: 3, opacity: 0.8 }).addTo(map);
      const line = L.polyline([ll, ll], { color: '#00C7FF', weight: 1.5, opacity: 0.5, dashArray: '4,4' }).addTo(map);
      entry = { marker, trail, line, lastState: state, trailPoints: [ll] };
      drones.set(state.orderId, entry);
      if (drones.size === 1) map.setView(ll, 16);
    } else {
      entry.marker.setLatLng(ll);
      entry.marker.setIcon(makeDroneIcon(state));
      entry.lastState = state;
      entry.trailPoints.push(ll);
      if (entry.trailPoints.length > 600) entry.trailPoints.shift();
      entry.trail.setLatLngs(entry.trailPoints);
      const userMarker = userMarkers.get(state.orderId);
      if (userMarker) {
        entry.line.setLatLngs([ll, userMarker.getLatLng()]);
      } else if (state.target) {
        entry.line.setLatLngs([ll, [state.target.latitude, state.target.longitude]]);
      }
    }

    if (state.status === 'delivered') {
      setTimeout(() => {
        if (!entry) return;
        map.removeLayer(entry.marker);
        map.removeLayer(entry.trail);
        map.removeLayer(entry.line);
        drones.delete(state.orderId);
        const u = userMarkers.get(state.orderId);
        if (u) { map.removeLayer(u); userMarkers.delete(state.orderId); }
        rerender();
      }, 5000);
    }
    rerender();
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
