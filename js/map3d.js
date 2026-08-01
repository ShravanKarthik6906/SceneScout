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

function fallbackHTML() {
  return `<div class="map3d-fallback">
    <h3>3D view unavailable offline</h3>
    <p>The 3D globe streams vector tiles that aren't reachable right now.
       You can still explore any location in true photorealistic 3D on Google Earth.</p>
  </div>`;
}