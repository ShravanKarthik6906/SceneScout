// 3D map mode — a Google-Earth-style tilted view with extruded 3D buildings,
// powered by MapLibre GL JS + OpenFreeMap vector tiles (both free, no API key).
// Lazy-loaded the first time the user flips to 3D so it never costs the 2D
// experience anything. Falls back to a link out to Google Earth if the library
// or tiles can't load (e.g. offline).
//
// For true photorealistic 3D tiles you'd swap the style source for Google's
// Photorealistic 3D Tiles or Cesium ion here — the rest of the app is unchanged.

import { TYPES } from './catalog.js';

const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

let map = null;         // maplibre map
let loadPromise = null;
let markers = [];
let onMarkerClick = null;
let onMapClick = null;  // fires on any map click when explore mode is active
let failed = false;

function loadLib() {
  if (window.maplibregl) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = MAPLIBRE_CSS;
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = MAPLIBRE_JS;
    s.onload = resolve;
    s.onerror = () => reject(new Error('maplibre load failed'));
    document.head.appendChild(s);
  });
  return loadPromise;
}

function addBuildingLayer() {
  if (!map) return;
  if (map.getLayer('ss-3d-buildings')) return;
  // find a label layer to insert beneath, so labels stay on top
  let firstSymbol;
  for (const l of map.getStyle().layers) {
    if (l.type === 'symbol') { firstSymbol = l.id; break; }
  }
  try {
    map.addLayer({
      id: 'ss-3d-buildings',
      source: 'openmaptiles',
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['get', 'render_height'],
          0, '#2b3345', 40, '#39435c', 120, '#4a577a',
        ],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
      },
    }, firstSymbol);
  } catch { /* style schema without a building layer — skip silently */ }
}

// container: the DOM element to render into. cb: marker click handler.
// mapClickCb: fires with (lat, lng) on any map click — used by "explore
// the globe" mode to let the user click anywhere, not just curated markers.
export async function ensure3D(container, cb, mapClickCb) {
  onMarkerClick = cb;
  onMapClick = mapClickCb || null;
  if (failed) return false;
  try {
    await loadLib();
  } catch {
    failed = true;
    container.innerHTML = fallbackHTML();
    return false;
  }
  if (!map) {
    map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [-98, 39], zoom: 3.5, pitch: 55, bearing: -18,
      antialias: true, attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
    map.on('style.load', addBuildingLayer);
    // the container may still be settling layout when the map is created; a
    // resize once the first frame loads guarantees tiles fill the pane.
    map.on('load', () => map.resize());
    map.on('error', (e) => console.warn('[map3d]', e && e.error && e.error.message));
    map.on('click', (e) => {
      if (onMapClick) onMapClick(e.lngLat.lat, e.lngLat.lng);
    });
  } else {
    // container is reused across toggles — always keep the latest callbacks
    onMarkerClick = cb;
    onMapClick = mapClickCb || null;
  }
  return true;
}

// Switches between a flat map and MapLibre's spherical globe projection.
// Requires MapLibre GL >= 3.6 (this project pins 4.7.1, so it's available).
export function setGlobeMode(enabled) {
  if (!map) return;
  try {
    map.setProjection({ type: enabled ? 'globe' : 'mercator' });
  } catch (e) {
    console.warn('[map3d] setProjection failed (older MapLibre build?):', e.message);
  }
}

// Pulls the camera all the way out to a whole-Earth view for free
// exploration — distinct from flyHome3D, which zooms to a metro-level
// overview around a specific search center.
export function flyToGlobalView() {
  if (!map) return;
  map.flyTo({ center: [0, 20], zoom: 1.3, pitch: 0, bearing: 0, duration: 2000 });
}

export function resize3D() { if (map) map.resize(); }

// A location only has valid, renderable coordinates if both lat/lng are
// real numbers — locations that failed to geocode carry null/undefined,
// which MapLibre rejects outright ("expected number, found null").
function hasValidCoords(loc) {
  return typeof loc.lat === 'number' && !isNaN(loc.lat) &&
    typeof loc.lng === 'number' && !isNaN(loc.lng);
}

export function update3D(center, results) {
  if (!map) return;
  markers.forEach(m => m.remove());
  markers = [];
  for (const loc of results) {
    // Skip locations that failed to geocode — feeding null/undefined lat/lng
    // into MapLibre throws and can break the whole render pass.
    if (!hasValidCoords(loc)) {
      console.warn('[map3d] skipping location with invalid coords:', loc.name || loc.id);
      continue;
    }
    const el = document.createElement('div');
    el.className = 'm3d';
    const t = TYPES[loc.type] || { icon: loc._icon || '📍', label: loc._label || 'Location', color: loc._color || '#7a8a99' };
    el.style.setProperty('--c', t.color);
    el.textContent = t.icon;
    el.title = loc.name;
    el.onclick = () => onMarkerClick && onMarkerClick(loc.id);
    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([loc.lng, loc.lat]).addTo(map);
    markers.push(marker);
  }
}

// Fly the 3D camera to a metro-level overview, orbiting slightly.
export function flyHome3D(center) {
  if (!map) return;
  if (!hasValidCoords(center)) {
    console.warn('[map3d] flyHome3D: invalid center coords, skipping fly');
    return;
  }
  map.flyTo({ center: [center.lng, center.lat], zoom: 14.2, pitch: 60, bearing: -22, duration: 1600 });
}

export function flyToListing3D(loc) {
  if (!map) return;
  if (!hasValidCoords(loc)) {
    console.warn('[map3d] flyToListing3D: invalid coords for', loc.name || loc.id);
    return;
  }
  map.flyTo({ center: [loc.lng, loc.lat], zoom: 16.6, pitch: 62, bearing: 20, duration: 1600 });
}

function fallbackHTML() {
  return `<div class="map3d-fallback">
    <h3>3D view unavailable offline</h3>
    <p>The 3D globe streams vector tiles that aren't reachable right now.
       You can still explore any location in true photorealistic 3D on Google Earth.</p>
  </div>`;
}