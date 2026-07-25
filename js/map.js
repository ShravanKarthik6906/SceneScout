// Leaflet map: dark basemap, search-radius circle, listing markers.
// Click anywhere on the map to move the search center.

import { TYPES } from './data.js';

const AMBER = '#c9962b';
const TEAL = '#3e6e6a';

let map, radiusCircle, centerMarker;
const markers = new Map(); // listing id -> L.circleMarker
let selectedId = null;

export function initMap({ onCenterChange, onMarkerClick }) {
  // zoomControl lives bottom-left so it never collides with the top-left
  // exposure-style HUD readout the design brief calls for.
  map = L.map('map2d', { zoomControl: false, attributionControl: true })
    .setView([34.04, -118.25], 10);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  map.on('click', (e) => onCenterChange(e.latlng.lat, e.latlng.lng));

  // the map lives in an absolutely-positioned container; make sure Leaflet
  // measures it once layout settles so tiles fill the pane on first paint.
  setTimeout(() => map.invalidateSize(), 120);

  map._onMarkerClick = onMarkerClick;
  return map;
}

// Rack-focus: on hovering one pin, softly blur every other pin instead of
// glowing the hovered one — the one other deliberate motion moment the
// brief calls for, beyond the search-submit iris wipe.
function blurOtherMarkers(hoveredId) {
  for (const [id, m] of markers) {
    const el = m.getElement();
    if (!el) continue;
    el.style.filter = id === hoveredId ? '' : 'blur(1.5px)';
    el.style.transition = 'filter 0.15s ease';
  }
}
function clearBlur() {
  for (const [, m] of markers) {
    const el = m.getElement();
    if (el) el.style.filter = '';
  }
}

export function updateMap(state, results, allLocations) {
  // Guard: if initMap crashed or hasn't finished, map is undefined — bail
  // instead of throwing on addTo/addLayer.
  if (!map) {
    console.warn('updateMap called before map was initialized — skipping.');
    return;
  }

  const { center, radiusMi } = state;
  const radiusM = radiusMi * 1609.34;

  if (!radiusCircle) {
    radiusCircle = L.circle([center.lat, center.lng], {
      radius: radiusM, color: AMBER, weight: 1.5, opacity: 0.7,
      fillColor: AMBER, fillOpacity: 0.06, interactive: false,
    }).addTo(map);
    centerMarker = L.circleMarker([center.lat, center.lng], {
      radius: 6, color: '#fff', weight: 2, fillColor: AMBER, fillOpacity: 1, interactive: false,
    }).addTo(map);
  } else {
    radiusCircle.setLatLng([center.lat, center.lng]).setRadius(radiusM);
    centerMarker.setLatLng([center.lat, center.lng]);
  }

  const resultIds = new Set(results.map(r => r.id));
  for (const loc of allLocations) {
    const inResults = resultIds.has(loc.id);
    const t = TYPES[loc.type] || { icon: loc._icon || '📍', label: loc._label || 'Location' };
    let m = markers.get(loc.id);
    if (!m) {
      m = L.circleMarker([loc.lat, loc.lng], { radius: 9, weight: 2 }).addTo(map);
      m.bindTooltip(`${t.icon} ${loc.name}`, { direction: 'top', offset: [0, -8] });
      m.on('click', () => map._onMarkerClick(loc.id));
      m.on('mouseover', () => blurOtherMarkers(loc.id));
      m.on('mouseout', clearBlur);
      markers.set(loc.id, m);
    }
    const selected = loc.id === selectedId;
    // Map markers are uniformly teal (secondary data); amber is reserved
    // for the selected pin — the two brand accents never share an element.
    m.setStyle(inResults
      ? {
          color: selected ? AMBER : '#ffffff',
          fillColor: selected ? AMBER : TEAL,
          fillOpacity: 0.95, opacity: 1, radius: selected ? 11 : 9,
        }
      : { color: '#4a4f4f', fillColor: '#262b2b', fillOpacity: 0.7, opacity: 0.6, radius: 6 });
  }
}

// Marks a location's pin as the active selection (amber) — called when its
// detail view opens; cleared when it closes.
export function setSelectedMarker(id) {
  selectedId = id;
  const m = markers.get(id);
  if (m) m.setStyle({ color: AMBER, fillColor: AMBER, radius: 11 });
}
export function clearSelectedMarker() {
  const prev = selectedId;
  selectedId = null;
  const m = prev && markers.get(prev);
  if (m) m.setStyle({ color: '#ffffff', fillColor: TEAL, radius: 9 });
}

export function flyToListing(loc) {
  if (!map) return;
  map.flyTo([loc.lat, loc.lng], 14, { duration: 0.8 });
}

export function fitToRadius(state) {
  if (!map) return;
  const r = state.radiusMi * 1609.34;
  map.fitBounds(L.latLng(state.center.lat, state.center.lng).toBounds(r * 2), { padding: [20, 20] });
}
