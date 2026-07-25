// Leaflet map: dark basemap, search-radius circle, listing markers.
// Click anywhere on the map to move the search center.

import { TYPES } from './data.js';

let map, radiusCircle, centerMarker;
const markers = new Map(); // listing id -> L.circleMarker

export function initMap({ onCenterChange, onMarkerClick }) {
  map = L.map('map2d', { zoomControl: true, attributionControl: true })
    .setView([34.04, -118.25], 10);

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
      radius: radiusM, color: '#e8b45a', weight: 1.5, opacity: 0.7,
      fillColor: '#e8b45a', fillOpacity: 0.06, interactive: false,
    }).addTo(map);
    centerMarker = L.circleMarker([center.lat, center.lng], {
      radius: 6, color: '#fff', weight: 2, fillColor: '#e8b45a', fillOpacity: 1, interactive: false,
    }).addTo(map);
  } else {
    radiusCircle.setLatLng([center.lat, center.lng]).setRadius(radiusM);
    centerMarker.setLatLng([center.lat, center.lng]);
  }

  const resultIds = new Set(results.map(r => r.id));
  for (const loc of allLocations) {
    const inResults = resultIds.has(loc.id);
    const t = TYPES[loc.type] || { icon: loc._icon || '📍', label: loc._label || 'Location', color: loc._color || '#7a8a99' };
    const color = t.color;
    let m = markers.get(loc.id);
    if (!m) {
      m = L.circleMarker([loc.lat, loc.lng], { radius: 9, weight: 2 }).addTo(map);
      m.bindTooltip(`${t.icon} ${loc.name}`, { direction: 'top', offset: [0, -8] });
      m.on('click', () => map._onMarkerClick(loc.id));
      markers.set(loc.id, m);
    }
    m.setStyle(inResults
      ? { color: '#ffffff', fillColor: color, fillOpacity: 0.95, opacity: 1, radius: 9 }
      : { color: '#555b66', fillColor: '#2a2f3a', fillOpacity: 0.7, opacity: 0.6, radius: 6 });
  }
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