// SceneScout — AI search, nationwide discovery, suitability scoring, production
// intelligence, review summaries, and the 2D / 3D map toggle. Orchestration
// only; the heavy lifting lives in the focused modules it imports.

import { LOCATIONS, TYPES, CENTERS, LIGHT_LABELS } from './catalog.js';
import { initMap, updateMap, flyToListing, fitToRadius } from './map.js';
import { drawPlanThumb, drawIsoHero } from './thumbs.js';
import { openTour } from './tour.js';
import { parseQuery } from './nlp.js';
import { computeSuitability } from './score.js';
import { sunTimes, sunPosition, fmtTime, fmtTimeAt, tzAbbr, compass, geocode, forecast, weatherText } from './intel.js';
import { ensure3D, resize3D, update3D, flyHome3D, flyToListing3D } from './map3d.js';

const KEY_STORAGE = 'scenescout-gmaps-key';

const state = {
  center: { lat: CENTERS[0].lat, lng: CENTERS[0].lng },
  centerName: CENTERS[0].name,
  radiusMi: 15,
  types: new Set(),
  minSqft: 0,
  maxRate: Infinity,
  light: 'any',
  sort: 'match',
  query: null,     // parsed NLP intent, feeds the suitability score
  view: '2d',
};

const EXAMPLES = [
  'Modern industrial warehouse with large windows near downtown Chicago',
  'Victorian mansion with formal gardens, under $800/day',
  'Coffee shop with warm lighting and exposed brick in Austin',
  'Blackout sound stage that fits a crew of 40 in Atlanta',
  'Bright mid-century house with walls of glass in Seattle',
];

// ------------------------------------------------------------- search core
function haversineMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function runSearch() {
  const results = [];
  for (const loc of LOCATIONS) {
    const distMi = haversineMi(state.center.lat, state.center.lng, loc.lat, loc.lng);
    if (distMi > state.radiusMi) continue;
    const suit = computeSuitability(loc, state, state.query);
    results.push({ ...loc, distMi, score: suit.overall, suit });
  }
  const sorters = {
    match: (a, b) => b.score - a.score || a.distMi - b.distMi,
    distance: (a, b) => a.distMi - b.distMi,
    price: (a, b) => a.rate - b.rate,
    size: (a, b) => b.sqft - a.sqft,
  };
  results.sort(sorters[state.sort]);
  return results;
}

// ---------------------------------------------------------------- results
function render() {
  const results = runSearch();
  document.getElementById('results-meta').innerHTML =
    `<b>${results.length}</b> of ${LOCATIONS.length} locations within ${state.radiusMi} mi of ${escapeHtml(state.centerName)}`;

  const list = document.getElementById('results');
  list.innerHTML = '';
  if (!results.length) {
    list.innerHTML = `<div class="empty">No locations in this radius.<br>Widen the radius, search another city above, or click the map to move the center.</div>`;
  }
  for (const loc of results) {
    const t = TYPES[loc.type];
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <canvas width="300" height="150"></canvas>
      <div class="card-body">
        <div class="card-top">
          <h3>${escapeHtml(loc.name)}</h3>
          <span class="match" style="--pct:${loc.score}">${loc.score}%</span>
        </div>
        <div class="card-sub">${t.icon} ${t.label} · ${escapeHtml(loc.neighborhood)}</div>
        <div class="card-stats">
          <span>${loc.sqft.toLocaleString()} ft²</span>
          <span>${loc.ceilingFt ? loc.ceilingFt + ' ft ceil' : 'open air'}</span>
          <span>$${loc.rate}/hr</span>
          <span>${loc.distMi.toFixed(1)} mi</span>
        </div>
      </div>`;
    drawPlanThumb(loc, card.querySelector('canvas'));
    card.onclick = () => openDetail(loc);
    list.appendChild(card);
  }

  updateMap(state, results, LOCATIONS);
  if (state.view === '3d') update3D(state.center, results);
}

// --------------------------------------------------------------- AI search
function applyParsedToState(q) {
  state.query = q;
  if (q.types.size) state.types = new Set(q.types);
  state.light = q.light || 'any';
  state.minSqft = q.minSqft || 0;
  state.maxRate = q.maxRate ?? Infinity;
  if (q.radiusMi) state.radiusMi = q.radiusMi;
  syncFilterControls();
}

function syncFilterControls() {
  document.querySelectorAll('#type-chips .chip').forEach(chip => {
    chip.classList.toggle('active', state.types.has(chip.dataset.type));
  });
  const sq = document.getElementById('sqft-range');
  sq.value = Math.min(10000, state.minSqft || 0);
  document.getElementById('sqft-label').textContent = state.minSqft ? `${state.minSqft.toLocaleString()}+ ft²` : 'Any';
  const rt = document.getElementById('rate-range');
  rt.value = isFinite(state.maxRate) ? Math.min(600, state.maxRate) : 600;
  document.getElementById('rate-label').textContent = isFinite(state.maxRate) ? `≤ $${state.maxRate}/hr` : 'Any';
  document.getElementById('light-select').value = state.light;
  const rr = document.getElementById('radius-range');
  rr.value = state.radiusMi; document.getElementById('radius-label').textContent = `${state.radiusMi} mi`;
}

function renderInterpreted(q) {
  const box = document.getElementById('ai-interpreted');
  if (!q.raw) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const chips = q.interpreted.length
    ? q.interpreted.map(c => `<span>${escapeHtml(c)}</span>`).join('')
    : `<span class="dim">no specific filters detected — showing best overall matches</span>`;
  box.innerHTML = `<div class="ai-interpreted-head">AI read your brief as</div><div class="ai-chips">${chips}</div>`;
}

async function runAISearch(text) {
  const q = parseQuery(text);
  applyParsedToState(q);
  renderInterpreted(q);

  if (q.locationText) {
    setGeoStatus(`Locating “${q.locationText}”…`);
    const hit = await geocode(q.locationText);
    if (hit) moveCenter(hit.lat, hit.lng, hit.label);
    else setGeoStatus(`Couldn't find “${q.locationText}” — showing ${state.centerName}.`, true);
  }
  render();
  if (state.view === '3d') flyHome3D(state.center);
}

// --------------------------------------------------------------- geocoding
function moveCenter(lat, lng, label) {
  state.center = { lat, lng };
  state.centerName = label || `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  const sel = document.getElementById('center-select');
  const match = CENTERS.find(c => c.name === label);
  sel.value = match ? match.name : '';
  fitToRadius(state);
  setGeoStatus('');
}

function setGeoStatus(msg, warn) {
  const el = document.getElementById('geo-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'geo-status' + (warn ? ' warn' : '');
}

async function runGeoSearch(text) {
  if (!text.trim()) return;
  setGeoStatus(`Searching “${text}”…`);
  const hit = await geocode(text);
  if (hit) { moveCenter(hit.lat, hit.lng, hit.label); render(); if (state.view === '3d') flyHome3D(state.center); }
  else setGeoStatus(`No match for “${text}”.`, true);
}

// ------------------------------------------------------------ detail modal
let currentLoc = null;

function openDetail(loc) {
  currentLoc = loc;
  const t = TYPES[loc.type];
  document.getElementById('detail').classList.remove('hidden');
  flyToListing(loc);
  if (state.view === '3d') flyToListing3D(loc);

  document.getElementById('detail-title').textContent = loc.name;
  document.getElementById('detail-sub').innerHTML =
    `${t.icon} ${t.label} · ${escapeHtml(loc.address)}${loc.distMi != null ? ' · ' + loc.distMi.toFixed(1) + ' mi away' : ''}`;
  document.getElementById('detail-desc').textContent = loc.desc;

  document.getElementById('detail-stats').innerHTML = `
    <div><b>${loc.sqft.toLocaleString()}</b><span>sq ft</span></div>
    <div><b>${loc.ceilingFt || '—'}</b><span>ft ceilings</span></div>
    <div><b>$${loc.rate}</b><span>per hour</span></div>
    <div><b>~${loc.intel.crewCapacity}</b><span>crew capacity</span></div>`;

  document.getElementById('detail-tags').innerHTML =
    `<div class="section-h">Features</div>` + loc.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('');

  const suit = loc.suit || computeSuitability(loc, state, state.query);
  document.getElementById('hero-badge').innerHTML =
    `<b>${suit.overall}%</b><span>match · ${suit.confidence} confidence</span>`;
  renderSuitability(suit);
  renderIntel(loc);
  renderReviews(loc);

  drawIsoHero(loc, document.getElementById('hero-canvas'));
  const sv = document.getElementById('sv-panel');
  sv.classList.add('hidden'); sv.innerHTML = '';
  document.querySelector('.modal').scrollTop = 0;
}

function renderSuitability(suit) {
  const rows = suit.breakdown.map(f => `
    <div class="suit-row">
      <div class="suit-top">
        <span class="suit-label">${f.label}</span>
        <span class="suit-score">${f.score}<i class="conf conf-${f.confidence}" title="${f.confidence} confidence"></i></span>
      </div>
      <div class="suit-bar"><div style="width:${f.score}%;--c:${barColor(f.score)}"></div></div>
      <div class="suit-note">${escapeHtml(f.note)}</div>
    </div>`).join('');
  document.getElementById('detail-suit').innerHTML = `
    <div class="section-h">AI suitability · ${suit.overall}% overall
      <span class="section-sub">${suit.confidence} confidence</span></div>
    <div class="suit-grid">${rows}</div>`;
}

function renderIntel(loc) {
  const now = new Date();
  const s = sunTimes(now, loc.lat, loc.lng);
  const p = sunPosition(now, loc.lat, loc.lng);
  const sunNow = p.altitude > 0
    ? `${p.altitude.toFixed(0)}° up, bearing ${compass(p.azimuth)}`
    : 'below horizon';
  const f = loc.intel.factors;
  const win = loc.intel.windows.length ? loc.intel.windows.join(' · ') : 'interior / no exterior windows';
  const lightWhen = loc.intel.windows.map(w => windowLight(w)).filter(Boolean).join(' · ') || '—';
  const ft = (d) => fmtTimeAt(d, loc.lng);
  const tz = tzAbbr(now, loc.lng);

  document.getElementById('detail-intel').innerHTML = `
    <div class="section-h">Production intelligence <span class="section-sub">local time · ${tz}</span></div>
    <div class="intel-sun">
      <div class="sun-track" id="sun-track"></div>
      <div class="sun-times">
        <div><b>${ft(s.sunrise)}</b><span>sunrise</span></div>
        <div class="gold"><b>${ft(s.goldenEveningStart)}–${ft(s.sunset)}</b><span>golden hour</span></div>
        <div class="blue"><b>${ft(s.sunset)}–${ft(s.dusk)}</b><span>blue hour</span></div>
        <div><b>${ft(s.sunset)}</b><span>sunset</span></div>
      </div>
      <div class="sun-now">☀️ Sun now: ${sunNow} · computed for today at this exact location</div>
    </div>
    <div class="intel-grid">
      ${intelCell('🪟 Window light', win, lightWhen)}
      ${intelCell('👥 Crew capacity', `~${loc.intel.crewCapacity} people`, `${loc.sqft.toLocaleString()} ft² usable`)}
      ${meterCell('🚗 Parking', f.parking)}
      ${meterCell('♿ Accessibility', f.accessibility)}
      ${meterCell('🔊 Noise (quiet)', f.noise)}
      ${meterCell('🔒 Privacy', f.privacy)}
      ${meterCell('⚡ Power', f.power)}
      ${meterCell('📋 Permit (simple)', f.permit)}
      ${intelCell('✈️ Nearest airport', `${loc.intel.nearestAirport.code} · ${loc.intel.nearestAirport.mi} mi`, loc.intel.nearestAirport.name)}
      ${intelCell('🎥 Equipment rental', loc.intel.amenities.equipment, '')}
      ${intelCell('🏨 Lodging', loc.intel.amenities.hotels, '')}
      ${intelCell('🍽 Dining', loc.intel.amenities.dining, '')}
    </div>
    <div class="intel-weather" id="intel-weather">Loading local forecast…</div>`;

  drawSunTrack(document.getElementById('sun-track'), loc, now, s, p);
  loadWeather(loc);
}

function intelCell(label, value, sub) {
  return `<div class="intel-cell"><div class="ic-label">${label}</div>
    <div class="ic-value">${escapeHtml(value)}</div>${sub ? `<div class="ic-sub">${escapeHtml(sub)}</div>` : ''}</div>`;
}
function meterCell(label, factor) {
  return `<div class="intel-cell"><div class="ic-label">${label}</div>
    <div class="ic-meter"><div style="width:${factor.score}%;--c:${barColor(factor.score)}"></div></div>
    <div class="ic-sub">${escapeHtml(factor.note)}</div></div>`;
}

function windowLight(w) {
  const dir = w.split(' ')[0];
  return {
    North: 'N: soft, even all day', South: 'S: strong midday sun',
    East: 'E: direct AM light', West: 'W: direct PM / golden hour',
  }[dir] || '';
}

async function loadWeather(loc) {
  const el = document.getElementById('intel-weather');
  const data = await forecast(loc.lat, loc.lng);
  if (!el || currentLoc !== loc) return;
  if (!data || !data.current) { el.textContent = 'Local forecast unavailable offline.'; return; }
  const [txt, emoji] = weatherText(data.current.weather_code);
  const days = (data.daily?.time || []).slice(0, 3).map((t, i) => {
    const [dtxt, demoji] = weatherText(data.daily.weather_code[i]);
    const day = new Date(t + 'T12:00').toLocaleDateString([], { weekday: 'short' });
    return `<span>${demoji} ${day} ${Math.round(data.daily.temperature_2m_max[i])}°/${Math.round(data.daily.temperature_2m_min[i])}° · ${data.daily.precipitation_probability_max[i] ?? 0}%💧</span>`;
  }).join('');
  el.innerHTML = `<b>${emoji} ${Math.round(data.current.temperature_2m)}° ${txt}</b>
    · ${data.current.cloud_cover}% cloud · ${Math.round(data.current.wind_speed_10m)} mph wind
    <div class="wx-days">${days}</div>
    <div class="ic-sub">Live via Open-Meteo</div>`;
}

function renderReviews(loc) {
  const r = loc.reviews;
  const stars = '★'.repeat(Math.round(r.rating)) + '☆'.repeat(5 - Math.round(r.rating));
  document.getElementById('detail-reviews').innerHTML = `
    <div class="section-h">Review intelligence
      <span class="section-sub">AI summary · modeled signals</span></div>
    <div class="rev-head"><span class="rev-stars">${stars}</span>
      <b>${r.rating.toFixed(1)}</b> <span class="dim">from ${r.count} reviews</span></div>
    <p class="rev-summary">${escapeHtml(r.summary)}</p>
    <div class="rev-cols">
      <div><div class="rev-h up">Strengths</div><ul>${r.positives.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
      <div><div class="rev-h down">Consider</div><ul>${r.considerations.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    </div>`;
}

// draw a simple sun-arc for the day with the current sun marked
function drawSunTrack(el, loc, now, s, p) {
  if (!el) return;
  const W = 320, H = 60;
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  c.style.width = '100%'; c.style.height = H + 'px';
  const g = c.getContext('2d'); g.scale(2, 2);
  // arc
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(8, H - 10);
  for (let i = 0; i <= 40; i++) { const x = 8 + (W - 16) * i / 40; const y = (H - 10) - Math.sin(Math.PI * i / 40) * (H - 22); g.lineTo(x, y); }
  g.stroke();
  const dayLen = s.sunset - s.sunrise;
  const frac = Math.max(0, Math.min(1, (now - s.sunrise) / dayLen));
  const gx = 8 + (W - 16) * frac, gy = (H - 10) - Math.sin(Math.PI * frac) * (H - 22);
  // golden zones
  g.fillStyle = 'rgba(232,180,90,0.9)';
  g.beginPath(); g.arc(gx, gy, p.altitude > 0 ? 5 : 3, 0, 7); g.fill();
  el.innerHTML = ''; el.appendChild(c);
}

// ---------------------------------------------------------------- street view
function toggleStreetView() {
  if (!currentLoc) return;
  const panel = document.getElementById('sv-panel');
  if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
  panel.classList.remove('hidden');
  const key = localStorage.getItem(KEY_STORAGE);
  const { lat, lng } = currentLoc;
  if (key) {
    panel.innerHTML = `
      <iframe src="https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(key)}&location=${lat},${lng}&fov=90"
        allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
      <div class="sv-note">Live Google Street View at this address — drag to look around the exterior.</div>`;
  } else {
    panel.innerHTML = `
      <div class="sv-fallback">
        <p>Embedded Street View needs a free Google Maps API key — add one in <b>⚙ Settings</b> (enable the “Maps Embed API”).</p>
        <div class="sv-links">
          <a class="btn" target="_blank" rel="noopener"
             href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}">Open Street View ↗</a>
          <a class="btn" target="_blank" rel="noopener"
             href="https://earth.google.com/web/search/${lat},${lng}">Open Google Earth ↗</a>
        </div>
      </div>`;
  }
}

function closeDetail() {
  document.getElementById('detail').classList.add('hidden');
  currentLoc = null;
}

// ---------------------------------------------------------------- settings
function openSettings() {
  document.getElementById('settings').classList.remove('hidden');
  document.getElementById('api-key-input').value = localStorage.getItem(KEY_STORAGE) || '';
}
function saveSettings() {
  const v = document.getElementById('api-key-input').value.trim();
  if (v) localStorage.setItem(KEY_STORAGE, v); else localStorage.removeItem(KEY_STORAGE);
  document.getElementById('settings').classList.add('hidden');
}

// ---------------------------------------------------------------- 2D / 3D
async function setView(view) {
  if (view === state.view) return;
  state.view = view;
  document.querySelectorAll('#map-toggle button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const el3d = document.getElementById('map3d');
  const el2d = document.getElementById('map2d');
  if (view === '3d') {
    el3d.style.display = 'block'; el2d.style.visibility = 'hidden';
    const ok = await ensure3D(el3d, (id) => {
      const loc = LOCATIONS.find(l => l.id === id); if (loc) openDetail(loc);
    });
    if (ok) { resize3D(); flyHome3D(state.center); update3D(state.center, runSearch()); }
  } else {
    el3d.style.display = 'none'; el2d.style.visibility = 'visible';
  }
}

// -------------------------------------------------------------------- init
function initAISearch() {
  const input = document.getElementById('ai-input');
  const go = () => runAISearch(input.value);
  document.getElementById('ai-go').onclick = go;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); }
  });
  const ex = document.getElementById('ai-examples');
  for (const text of EXAMPLES) {
    const b = document.createElement('button');
    b.className = 'ex-chip'; b.textContent = text;
    b.onclick = () => { input.value = text; runAISearch(text); };
    ex.appendChild(b);
  }
}

function initFilters() {
  const sel = document.getElementById('center-select');
  for (const c of CENTERS) {
    const o = document.createElement('option');
    o.value = c.name; o.textContent = c.name; sel.appendChild(o);
  }
  sel.onchange = () => {
    const c = CENTERS.find(c2 => c2.name === sel.value);
    if (c) { moveCenter(c.lat, c.lng, c.name); render(); if (state.view === '3d') flyHome3D(state.center); }
  };

  const chipWrap = document.getElementById('type-chips');
  for (const [key, t] of Object.entries(TYPES)) {
    const chip = document.createElement('button');
    chip.className = 'chip'; chip.dataset.type = key;
    chip.innerHTML = `${t.icon} ${t.label}`;
    chip.onclick = () => {
      if (state.types.has(key)) state.types.delete(key); else state.types.add(key);
      chip.classList.toggle('active');
      render();
    };
    chipWrap.appendChild(chip);
  }

  const bindRange = (id, labelId, fmt, apply) => {
    const el = document.getElementById(id);
    const lbl = document.getElementById(labelId);
    el.oninput = () => { lbl.textContent = fmt(+el.value); apply(+el.value); render(); };
    lbl.textContent = fmt(+el.value);
  };
  bindRange('radius-range', 'radius-label', v => `${v} mi`, v => { state.radiusMi = v; });
  bindRange('sqft-range', 'sqft-label', v => v ? `${v.toLocaleString()}+ ft²` : 'Any', v => { state.minSqft = v; });
  bindRange('rate-range', 'rate-label', v => v >= 600 ? 'Any' : `≤ $${v}/hr`, v => { state.maxRate = v >= 600 ? Infinity : v; });

  document.getElementById('light-select').onchange = (e) => { state.light = e.target.value; render(); };
  document.getElementById('sort-select').onchange = (e) => { state.sort = e.target.value; render(); };

  const geoInput = document.getElementById('geo-input');
  document.getElementById('geo-go').onclick = () => runGeoSearch(geoInput.value);
  geoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runGeoSearch(geoInput.value); });
  // status line lives just under the geo box
  const status = document.createElement('div');
  status.id = 'geo-status'; status.className = 'geo-status';
  geoInput.closest('.filter-row').appendChild(status);
}

function init() {
  initAISearch();
  initFilters();
  syncFilterControls();
  initMap({
    onCenterChange: (lat, lng) => { moveCenter(lat, lng); render(); },
    onMarkerClick: (id) => {
      const results = runSearch();
      const loc = results.find(r => r.id === id) || wrapLoc(LOCATIONS.find(l => l.id === id));
      if (loc) openDetail(loc);
    },
  });

  document.getElementById('detail-close').onclick = closeDetail;
  document.getElementById('detail').onclick = (e) => { if (e.target.id === 'detail') closeDetail(); };
  document.getElementById('enter-tour').onclick = () => { if (currentLoc) { const l = currentLoc; closeDetail(); openTour(l); } };
  document.getElementById('fly-tour').onclick = () => { if (currentLoc) { const l = currentLoc; closeDetail(); openTour(l, { mode: 'fly' }); } };
  document.getElementById('toggle-sv').onclick = toggleStreetView;
  document.getElementById('open-earth').onclick = () => {
    if (currentLoc) window.open(`https://earth.google.com/web/search/${currentLoc.lat},${currentLoc.lng}`, '_blank');
  };
  document.getElementById('open-directions').onclick = () => {
    if (currentLoc) window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentLoc.lat},${currentLoc.lng}`, '_blank');
  };

  document.querySelectorAll('#map-toggle button').forEach(b => { b.onclick = () => setView(b.dataset.view); });

  document.getElementById('settings-btn').onclick = openSettings;
  document.getElementById('settings-save').onclick = saveSettings;
  document.getElementById('settings-close').onclick = () => document.getElementById('settings').classList.add('hidden');
  document.getElementById('settings').onclick = (e) => { if (e.target.id === 'settings') e.target.classList.add('hidden'); };

  render();
  fitToRadius(state);
}

function wrapLoc(loc) {
  if (!loc) return null;
  const suit = computeSuitability(loc, state, state.query);
  return { ...loc, distMi: haversineMi(state.center.lat, state.center.lng, loc.lat, loc.lng), score: suit.overall, suit };
}

function barColor(v) { return v >= 75 ? '#7aa874' : v >= 50 ? '#e8b45a' : '#d9744f'; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

init();
