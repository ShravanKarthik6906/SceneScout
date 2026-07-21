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
export async function ensure3D(container, cb) {
  onMarkerClick = cb;
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
  }
  return true;
}

export function resize3D() { if (map) map.resize(); }

export function update3D(center, results) {
  if (!map) return;
  markers.forEach(m => m.remove());
  markers = [];
  for (const loc of results) {
    const el = document.createElement('div');
    el.className = 'm3d';
    el.style.setProperty('--c', TYPES[loc.type].color);
    el.textContent = TYPES[loc.type].icon;
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
  map.flyTo({ center: [center.lng, center.lat], zoom: 14.2, pitch: 60, bearing: -22, duration: 1600 });
}

export function flyToListing3D(loc) {
  if (!map) return;
  map.flyTo({ center: [loc.lng, loc.lat], zoom: 16.6, pitch: 62, bearing: 20, duration: 1600 });
}

function fallbackHTML() {
  return `<div class="map3d-fallback">
    <h3>3D view unavailable offline</h3>
    <p>The 3D globe streams vector tiles that aren't reachable right now.
       You can still explore any location in true photorealistic 3D on Google Earth.</p>
  </div>`;
}
