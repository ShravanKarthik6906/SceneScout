// 3D map mode — a Google-Earth-style tilted view with extruded 3D buildings,
// powered by MapLibre GL JS + OpenFreeMap vector tiles (both free, no API key).
// MapLibre is a static <script> include in index.html (like Leaflet), always
// present at load rather than fetched on demand, so this module can assume
// window.maplibregl exists. Falls back to a link out to Google Earth if the
// map's tiles can't load (e.g. offline).
//
// For true photorealistic 3D tiles you'd swap the style source for Google's
// Photorealistic 3D Tiles or Cesium ion here — the rest of the app is unchanged.

import { TYPES } from './catalog.js';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

let map = null;         // maplibre map
let markers = [];
let onMarkerClick = null;
let onMapClick = null;  // fires on any map click when explore mode is active
let failed = false;
// The projection that should be active. Stored so it can be re-applied
// automatically whenever the style reloads (e.g. after a satellite toggle).
let pendingProjection = { type: 'mercator' };

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
  if (!map) {
    // antialias moved to canvasContextAttributes in MapLibre GL JS v5.
    map = new maplibregl.Map({
      container,
      style: STYLE,
      center: [-98, 39], zoom: 3.5, pitch: 55, bearing: -18,
      canvasContextAttributes: { antialias: true },
      attributionControl: true,
    });
    // bottom-left, matching the 2D Leaflet map, so it never collides with
    // the top-left exposure-style HUD readout.
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');
    map.on('style.load', () => {
      addBuildingLayer();
      // Re-apply whatever projection was active before this style reload.
      // Covers the case where the user is in Explore Globe mode and then
      // toggles satellite — the new style load must restore globe projection.
      if (pendingProjection.type !== 'mercator') {
        try {
          map.setProjection(pendingProjection);
          console.log(`[map3d] style reloaded — re-applied projection "${pendingProjection.type}"`);
        } catch (e) {
          console.warn('[map3d] re-apply projection on style.load failed:', e.message);
        }
      }
    });
    // the container may still be settling layout when the map is created; a
    // resize once the first frame loads guarantees tiles fill the pane.
    map.on('load', () => map.resize());
    map.on('error', (e) => {
      console.warn('[map3d]', e && e.error && e.error.message);
      // A style/tile fetch failure before the map has ever painted anything
      // (offline, blocked host, ...) leaves a blank pane — fall back to a
      // Google Earth link rather than showing nothing.
      if (!map.isStyleLoaded()) {
        failed = true;
        map.remove();
        map = null;
        container.innerHTML = fallbackHTML();
      }
    });
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
// MapLibre GL JS v5 ships full globe support — the vendor bundle is v5.6.0.
//
// Returns a Promise that resolves once the projection is actually applied.
// If the style is already loaded, it resolves synchronously (microtask).
// If not, it waits for the next 'style.load' event first.
// The caller (enterExploreMode) awaits this before starting the fly-out
// and spin, ensuring the globe is visible before the camera moves.
export function setGlobeMode(enabled) {
  if (!map) return Promise.resolve();
  // `requested` is captured locally so a *later* call to setGlobeMode
  // (e.g. the user clicking Explore Globe again before the style has
  // finished loading) can't overwrite what *this* call is waiting to
  // apply. pendingProjection itself is still updated — that's the shared
  // "what should be active once the style is ready" value the persistent
  // style.load listener in ensure3D re-applies after a satellite toggle —
  // but this call's own deferred apply always uses its own request, not
  // whatever pendingProjection has drifted to by the time style.load fires.
  const requested = { type: enabled ? 'globe' : 'mercator' };
  pendingProjection = requested;

  function applyNow(projection) {
    map.setProjection(projection);
    const ver = maplibregl.getVersion?.() ?? maplibregl.version ?? 'unknown';
    console.log(
      `[map3d] MapLibre v${ver} — projection set to "${projection.type}"`,
      '| style loaded:', map.isStyleLoaded()
    );
  }

  if (map.isStyleLoaded()) {
    applyNow(requested);
    return Promise.resolve();
  }

  // Style not yet loaded — wait for it, then apply this call's own request
  // (not whatever pendingProjection may have become by then).
  return new Promise((resolve) => {
    function onStyleLoad() {
      // addBuildingLayer + re-apply-on-reload are handled by the persistent
      // style.load listener registered in ensure3D; here we just need to
      // apply this call's own request, then resolve so the caller can
      // proceed with fly-out / spin.
      try { applyNow(requested); } catch (e) { console.warn('[map3d] setProjection deferred failed:', e.message); }
      resolve();
    }
    map.once('style.load', onStyleLoad);
  });
}

// Pulls the camera all the way out to a whole-Earth view for free
// exploration — distinct from flyHome3D, which zooms to a metro-level
// overview around a specific search center.
export function flyToGlobalView() {
  if (!map) return;
  map.flyTo({ center: [0, 20], zoom: 1.3, pitch: 0, bearing: 0, duration: 2000 });
}

// Slow auto-rotation for Explore Globe mode — standard MapLibre/Mapbox
// "spinning globe" pattern: nudge the center longitude westward on every
// moveend, which chains into a continuous rotation. Stops the moment the
// user actually interacts (drag/scroll/pinch) rather than fighting them,
// and only spins while zoomed out far enough to still be looking at the
// whole globe — no point spinning once they've zoomed into a region.
let spinEnabled = false;
const SECONDS_PER_REVOLUTION = 180;
const MAX_SPIN_ZOOM = 4;
const SLOW_SPIN_ZOOM = 2.5;
// Delay (ms) before auto-rotation resumes after the user stops interacting.
const RESUME_DELAY_MS = 2000;
let spinResumeTimer = null;

function spinStep() {
  if (!map || !spinEnabled) return;
  const zoom = map.getZoom();
  if (zoom < MAX_SPIN_ZOOM) {
    let distancePerSecond = 360 / SECONDS_PER_REVOLUTION;
    if (zoom > SLOW_SPIN_ZOOM) {
      // ease out as we approach the zoom level where spinning would stop
      distancePerSecond *= (MAX_SPIN_ZOOM - zoom) / (MAX_SPIN_ZOOM - SLOW_SPIN_ZOOM);
    }
    const center = map.getCenter();
    center.lng -= distancePerSecond;
    map.easeTo({ center, duration: 1000, easing: (n) => n });
  }
}

function pauseSpinOnInteraction() {
  spinEnabled = false;
  clearTimeout(spinResumeTimer);
}

// Schedule spin resume ~2 s after the user finishes a gesture.
function scheduleSpinResume() {
  clearTimeout(spinResumeTimer);
  spinResumeTimer = setTimeout(() => {
    if (!map) return;
    spinEnabled = true;
    if (!map.isMoving()) spinStep();
  }, RESUME_DELAY_MS);
}

export function startGlobeSpin() {
  if (!map) return;
  spinEnabled = true;
  map.on('moveend', spinStep);
  // Any of these firing means the user took the wheel — mousedown alone
  // isn't enough (that also fires from a plain click), so key off the
  // drag/zoom/rotate/pitch gestures specifically.
  map.on('dragstart', pauseSpinOnInteraction);
  map.on('zoomstart', pauseSpinOnInteraction);
  map.on('rotatestart', pauseSpinOnInteraction);
  map.on('pitchstart', pauseSpinOnInteraction);
  // Resume spin a couple seconds after each gesture ends.
  map.on('dragend', scheduleSpinResume);
  map.on('zoomend', scheduleSpinResume);
  map.on('rotateend', scheduleSpinResume);
  map.on('pitchend', scheduleSpinResume);
  // If the map is already sitting still, nothing will ever fire moveend to
  // kick the chain off — start it directly. If it's mid-flight (the usual
  // case: this is called right alongside flyToGlobalView()), let that
  // flight's own moveend start the chain instead of fighting it for the
  // camera with a competing easeTo.
  if (!map.isMoving()) spinStep();
}

export function stopGlobeSpin() {
  if (!map) return;
  spinEnabled = false;
  clearTimeout(spinResumeTimer);
  spinResumeTimer = null;
  map.off('moveend', spinStep);
  map.off('dragstart', pauseSpinOnInteraction);
  map.off('zoomstart', pauseSpinOnInteraction);
  map.off('rotatestart', pauseSpinOnInteraction);
  map.off('pitchstart', pauseSpinOnInteraction);
  map.off('dragend', scheduleSpinResume);
  map.off('zoomend', scheduleSpinResume);
  map.off('rotateend', scheduleSpinResume);
  map.off('pitchend', scheduleSpinResume);
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

// ----------------------------------------------------------------- starfield
// A canvas of randomly-placed stars rendered behind the globe in Explore Globe
// mode. Uses requestAnimationFrame for a slow, gentle per-star twinkle.
// pointer-events:none keeps it fully transparent to mouse/touch events.

let starCanvas = null;    // <canvas> element
let starCtx = null;       // 2D context
let starRafId = null;     // rAF handle — non-null only while animating
let stars = [];           // [{x,y,r,baseAlpha,phase,speed}]
const STAR_COUNT = 280;

function buildStars(w, h) {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      // radii weighted toward small: mostly 0.4–1.1 px, occasional slightly larger
      r: 0.4 + Math.pow(Math.random(), 2.5) * 1.4,
      // base brightness: mostly dim (0.25–0.6), a few brighter (up to 0.85)
      baseAlpha: 0.25 + Math.pow(Math.random(), 1.8) * 0.60,
      // twinkle phase offset — each star starts at a different point in its cycle
      phase: Math.random() * Math.PI * 2,
      // twinkle speed: slow (0.2–0.6 rad/s)
      speed: 0.2 + Math.random() * 0.4,
    });
  }
}

function drawStars(ts) {
  if (!starCtx || !starCanvas) return;
  const w = starCanvas.width;
  const h = starCanvas.height;
  starCtx.clearRect(0, 0, w, h);
  const t = ts / 1000; // seconds
  for (const s of stars) {
    // Twinkle: ±20 % of baseAlpha, very slow
    const alpha = s.baseAlpha * (0.80 + 0.20 * Math.sin(t * s.speed + s.phase));
    starCtx.beginPath();
    starCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    starCtx.fillStyle = `rgba(220, 228, 255, ${alpha.toFixed(3)})`;
    starCtx.fill();
  }
}

function starFrame(ts) {
  if (!starCanvas) return;
  drawStars(ts);
  starRafId = requestAnimationFrame(starFrame);
}

export function showStarfield() {
  // Find the #map container so we can insert the canvas inside it, behind map3d.
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  // Reuse existing canvas if it's already in the DOM.
  if (!starCanvas) {
    starCanvas = document.createElement('canvas');
    starCanvas.id = 'starfield-canvas';
    // Insert before #map3d so it sits behind it in paint order.
    const map3dEl = document.getElementById('map3d');
    mapEl.insertBefore(starCanvas, map3dEl);
  }

  // Size to the container.
  const { offsetWidth: w, offsetHeight: h } = mapEl;
  starCanvas.width  = w || 800;
  starCanvas.height = h || 600;
  starCtx = starCanvas.getContext('2d');

  buildStars(starCanvas.width, starCanvas.height);
  starCanvas.style.display = 'block';

  // Start animation loop.
  if (starRafId) cancelAnimationFrame(starRafId);
  starRafId = requestAnimationFrame(starFrame);
}

export function hideStarfield() {
  if (starRafId) { cancelAnimationFrame(starRafId); starRafId = null; }
  if (starCanvas) starCanvas.style.display = 'none';
}

// --------------------------------------------------------------- holo style
// Applies/removes the cyan hologram look for Explore Globe mode.
//
// Strategy: record every original paint/layout value before overwriting it,
// so removeHoloStyle can restore them exactly without reloading the style.
// map.setStyle() is intentionally NOT used — it tears down all custom layers
// (ss-3d-buildings, markers) and triggers a full reload that breaks re-entry.
//
// Paint is applied on the 'idle' event (not 'style.load') so all layers are
// fully registered and queryable before we touch them.

const HOLO = {
  background: '#000810',
  water:      '#010d1a',
  waterLine:  '#061828',
  landDim:    '#007a8a',
  landFaint:  '#004a58',
  roadMajor:  '#0a3a52',
  roadMinor:  '#05202e',
  roadCasing: '#020f18',
  building:   '#00b4cc',
  boundary:   '#00e5ff',
  labelText:  '#00e5ff',
  labelHalo:  '#000810',
};

// [layerId, paintProp, holoValue]  — null holoValue means "hide" (visibility)
const HOLO_OPS = [
  ['background',   'background-color', HOLO.background],
  ['water',        'fill-color',       HOLO.water],
  ['natural_earth','raster-opacity',   0],
  ['waterway_river',  'line-color', HOLO.waterLine],
  ['waterway_other',  'line-color', HOLO.waterLine],
  ['waterway_tunnel', 'line-color', HOLO.waterLine],
  ['landcover_wood',    'fill-color', HOLO.landDim],
  ['landcover_grass',   'fill-color', HOLO.landDim],
  ['landcover_wetland', 'fill-color', HOLO.landDim],
  ['landcover_sand',    'fill-color', HOLO.landDim],
  ['landcover_ice',     'fill-color', HOLO.landDim],
  ['park',              'fill-color', HOLO.landDim],
  ['park_outline',      'line-color', HOLO.landDim],
  ['landuse_residential','fill-color', HOLO.landFaint],
  ['landuse_pitch',      'fill-color', HOLO.landFaint],
  ['landuse_track',      'fill-color', HOLO.landFaint],
  ['landuse_cemetery',   'fill-color', HOLO.landFaint],
  ['landuse_hospital',   'fill-color', HOLO.landFaint],
  ['landuse_school',     'fill-color', HOLO.landFaint],
  ['aeroway_fill',       'fill-color', HOLO.landFaint],
  ['aeroway_runway',     'line-color', HOLO.roadMinor],
  ['aeroway_taxiway',    'line-color', HOLO.roadMinor],
  ['road_motorway',             'line-color', HOLO.roadMajor],
  ['road_trunk_primary',        'line-color', HOLO.roadMajor],
  ['road_secondary_tertiary',   'line-color', HOLO.roadMajor],
  ['road_minor',                'line-color', HOLO.roadMinor],
  ['road_service_track',        'line-color', HOLO.roadMinor],
  ['road_link',                 'line-color', HOLO.roadMinor],
  ['road_motorway_link',        'line-color', HOLO.roadMinor],
  ['road_motorway_casing',           'line-color', HOLO.roadCasing],
  ['road_trunk_primary_casing',      'line-color', HOLO.roadCasing],
  ['road_secondary_tertiary_casing', 'line-color', HOLO.roadCasing],
  ['road_minor_casing',              'line-color', HOLO.roadCasing],
  ['road_service_track_casing',      'line-color', HOLO.roadCasing],
  ['road_link_casing',               'line-color', HOLO.roadCasing],
  ['road_motorway_link_casing',      'line-color', HOLO.roadCasing],
  ['bridge_motorway',            'line-color', HOLO.roadMinor],
  ['bridge_trunk_primary',       'line-color', HOLO.roadMinor],
  ['bridge_secondary_tertiary',  'line-color', HOLO.roadMinor],
  ['bridge_street',              'line-color', HOLO.roadMinor],
  ['bridge_link',                'line-color', HOLO.roadMinor],
  ['bridge_service_track',       'line-color', HOLO.roadMinor],
  ['bridge_motorway_link',       'line-color', HOLO.roadMinor],
  ['bridge_path_pedestrian',     'line-color', HOLO.roadMinor],
  ['tunnel_motorway',            'line-color', HOLO.roadMinor],
  ['tunnel_trunk_primary',       'line-color', HOLO.roadMinor],
  ['tunnel_secondary_tertiary',  'line-color', HOLO.roadMinor],
  ['tunnel_minor',               'line-color', HOLO.roadMinor],
  ['tunnel_service_track',       'line-color', HOLO.roadMinor],
  ['tunnel_link',                'line-color', HOLO.roadMinor],
  ['tunnel_motorway_link',       'line-color', HOLO.roadMinor],
  ['tunnel_path_pedestrian',     'line-color', HOLO.roadMinor],
  ['road_major_rail',             'line-color', HOLO.roadMinor],
  ['road_transit_rail',           'line-color', HOLO.roadMinor],
  ['road_major_rail_hatching',    'line-color', HOLO.roadMinor],
  ['road_transit_rail_hatching',  'line-color', HOLO.roadMinor],
  ['bridge_major_rail',           'line-color', HOLO.roadMinor],
  ['bridge_transit_rail',         'line-color', HOLO.roadMinor],
  ['tunnel_major_rail',           'line-color', HOLO.roadMinor],
  ['tunnel_transit_rail',         'line-color', HOLO.roadMinor],
  ['building',    'fill-color',    HOLO.building],
  ['building',    'fill-opacity',  0.7],
  ['building-3d', 'fill-extrusion-color',   HOLO.building],
  ['building-3d', 'fill-extrusion-opacity', 0.6],
  ['boundary_2', 'line-color',   HOLO.boundary],
  ['boundary_2', 'line-opacity', 0.4],
  ['boundary_3', 'line-color',   HOLO.boundary],
  ['boundary_3', 'line-opacity', 0.4],
  ['boundary_disputed', 'line-color',   HOLO.boundary],
  ['boundary_disputed', 'line-opacity', 0.2],
  ['label_state',        'text-color',      HOLO.labelText],
  ['label_state',        'text-halo-color', HOLO.labelHalo],
  ['label_state',        'text-halo-width', 1.5],
  ['label_city',         'text-color',      HOLO.labelText],
  ['label_city',         'text-halo-color', HOLO.labelHalo],
  ['label_city',         'text-halo-width', 1.5],
  ['label_city_capital', 'text-color',      HOLO.labelText],
  ['label_city_capital', 'text-halo-color', HOLO.labelHalo],
  ['label_city_capital', 'text-halo-width', 1.5],
  ['label_country_1', 'text-color',      HOLO.labelText],
  ['label_country_1', 'text-halo-color', HOLO.labelHalo],
  ['label_country_1', 'text-halo-width', 1.5],
  ['label_country_2', 'text-color',      HOLO.labelText],
  ['label_country_2', 'text-halo-color', HOLO.labelHalo],
  ['label_country_2', 'text-halo-width', 1.5],
  ['label_country_3', 'text-color',      HOLO.labelText],
  ['label_country_3', 'text-halo-color', HOLO.labelHalo],
  ['label_country_3', 'text-halo-width', 1.5],
];

// Symbol layers to hide entirely in holo mode.
const HOLO_HIDE = [
  'poi_r20','poi_r7','poi_r1','poi_transit',
  'highway-name-path','highway-name-minor','highway-name-major',
  'highway-shield-non-us','highway-shield-us-interstate','road_shield_us',
  'road_one_way_arrow','road_one_way_arrow_opposite',
  'airport',
  'waterway_line_label','water_name_point_label','water_name_line_label',
  'label_other','label_village','label_town',
];

// Stored originals — populated by applyHoloPaint, consumed by removeHoloPaint.
let holoOriginals = null;  // { paintOps: [[id, prop, origVal], ...], hideOps: [[id, origVisibility], ...] }

function buildGraticuleGeoJSON() {
  const features = [];
  for (let lng = -180; lng <= 180; lng += 30) {
    const coords = [];
    for (let lat = -90; lat <= 90; lat += 2) coords.push([lng, lat]);
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const coords = [];
    for (let lng = -180; lng <= 180; lng += 2) coords.push([lng, lat]);
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
  }
  return { type: 'FeatureCollection', features };
}

function applyHoloPaint() {
  if (!map) return;

  // Record originals so we can restore them without a style reload.
  const paintOriginals = [];
  for (const [id, prop] of HOLO_OPS) {
    try {
      if (map.getLayer(id)) {
        paintOriginals.push([id, prop, map.getPaintProperty(id, prop)]);
      }
    } catch {}
  }
  const hideOriginals = [];
  for (const id of HOLO_HIDE) {
    try {
      if (map.getLayer(id)) {
        hideOriginals.push([id, map.getLayoutProperty(id, 'visibility') ?? 'visible']);
      }
    } catch {}
  }
  holoOriginals = { paintOriginals, hideOriginals };

  // Apply holo paint.
  for (const [id, prop, val] of HOLO_OPS) {
    try { if (map.getLayer(id)) map.setPaintProperty(id, prop, val); } catch {}
  }
  for (const id of HOLO_HIDE) {
    try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); } catch {}
  }

  // Atmosphere.
  try {
    map.setSky({
      'sky-color':        '#000810',
      'horizon-color':    '#001828',
      'fog-color':        '#000810',
      'fog-ground-blend': 0.02,
      'horizon-fog-blend':0.1,
      'sky-horizon-blend':0.1,
      'atmosphere-blend': ['interpolate',['linear'],['zoom'],0,1,5,0],
    });
  } catch {}

  // Graticule — add once, just toggle visibility.
  try {
    if (!map.getSource('ss-graticule')) {
      map.addSource('ss-graticule', { type: 'geojson', data: buildGraticuleGeoJSON() });
    }
    if (!map.getLayer('ss-graticule-lines')) {
      map.addLayer({
        id: 'ss-graticule-lines', type: 'line', source: 'ss-graticule',
        layout: { visibility: 'visible' },
        paint: { 'line-color': '#00e5ff', 'line-opacity': 0.18, 'line-width': 0.6 },
      }, 'water');
    } else {
      map.setLayoutProperty('ss-graticule-lines', 'visibility', 'visible');
    }
  } catch (e) { console.warn('[map3d] graticule:', e.message); }

  // CSS glow.
  document.getElementById('map3d')?.classList.add('holo-glow');
}

function removeHoloPaint() {
  if (!map) return;

  // Restore every paint property we changed.
  if (holoOriginals) {
    for (const [id, prop, origVal] of holoOriginals.paintOriginals) {
      try {
        if (map.getLayer(id)) {
          if (origVal == null) {
            // No original — remove the override so the style default takes back.
            map.removeFeatureState({ source: id });
          }
          map.setPaintProperty(id, prop, origVal ?? undefined);
        }
      } catch {}
    }
    for (const [id, origVis] of holoOriginals.hideOriginals) {
      try { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', origVis); } catch {}
    }
    holoOriginals = null;
  }

  // Hide graticule without removing it.
  try { map.setLayoutProperty('ss-graticule-lines', 'visibility', 'none'); } catch {}

  // Restore sky to default.
  try { map.setSky(null); } catch {}

  // CSS glow off.
  document.getElementById('map3d')?.classList.remove('holo-glow');
}

export function applyHoloStyle() {
  if (!map) return;
  // Wait for the map to be fully idle (all layers settled) before painting.
  // 'idle' fires after style.load + all tiles rendered, so getPaintProperty
  // is reliable and setPaintProperty takes effect immediately.
  if (map.isStyleLoaded()) {
    map.once('idle', applyHoloPaint);
  } else {
    // Style not loaded yet — wait for idle which fires after style.load settles.
    map.once('idle', applyHoloPaint);
  }
}

export function removeHoloStyle() {
  if (!map) return;
  removeHoloPaint();
}

function fallbackHTML() {
  return `<div class="map3d-fallback">
    <h3>3D view unavailable offline</h3>
    <p>The 3D globe streams vector tiles that aren't reachable right now.
       You can still explore any location in true photorealistic 3D on Google Earth.</p>
  </div>`;
}