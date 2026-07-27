// Production intelligence: real solar math (sunrise / sunset / golden hour /
// blue hour / sun position) computed locally for any lat/lng/date, plus keyless
// geocoding (proxied to LocationIQ) and weather (Open-Meteo). The sun math is
// a compact port of SunCalc (Vladimir Agafonkin, BSD-2) and is genuinely
// accurate — nothing simulated here.

// ------------------------------------------------------------- solar core
const rad = Math.PI / 180;
const dayMs = 864e5, J1970 = 2440588, J2000 = 2451545;
const e = rad * 23.4397; // obliquity of the ecliptic

const toJulian = d => d.valueOf() / dayMs - 0.5 + J1970;
const fromJulian = j => new Date((j + 0.5 - J1970) * dayMs);
const toDays = d => toJulian(d) - J2000;

const solarMeanAnomaly = d => rad * (357.5291 + 0.98560028 * d);
const eclipticLongitude = M => {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372;
  return M + C + P + Math.PI;
};
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));

const J0 = 0.0009;
const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
function getSetJ(h, lw, phi, dec, n, M, L) {
  const w = hourAngle(h, phi, dec);
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

// Returns Date objects for the key light windows on `date` at lat/lng.
export function sunTimes(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);

  const set = (angle) => {
    const Jset = getSetJ(angle * rad, lw, phi, dec, n, M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    return { rise: fromJulian(Jrise), set: fromJulian(Jset) };
  };
  const sun = set(-0.833);      // sunrise / sunset
  const civil = set(-6);        // civil twilight -> blue hour bounds
  const golden = set(6);        // golden hour: end (morning) / start (evening)

  return {
    dawn: civil.rise, sunrise: sun.rise,
    goldenMorningEnd: golden.rise,
    solarNoon: fromJulian(Jnoon),
    goldenEveningStart: golden.set,
    sunset: sun.set, dusk: civil.set,
    valid: !isNaN(sun.rise) && !isNaN(sun.set),
  };
}

// Sun compass azimuth (0=N, 90=E) and altitude in degrees, right now.
export function sunPosition(date, lat, lng) {
  const lw = rad * -lng, phi = rad * lat, d = toDays(date);
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const ra = rightAscension(L, 0);
  const H = siderealTime(d, lw) - ra;
  let az = azimuth(H, phi, dec) / rad + 180; // from south -> compass
  az = (az + 360) % 360;
  return { azimuth: az, altitude: altitude(H, phi, dec) / rad };
}

export const fmtTime = (d) =>
  isNaN(d) ? '—' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Sun instants are absolute; a scout wants them in the LOCATION's local time,
// not the viewer's. Map US longitude bands to IANA zones so Intl handles DST.
export function usTimeZone(lng) {
  if (lng >= -87.5) return 'America/New_York';
  if (lng >= -101.5) return 'America/Chicago';
  if (lng >= -114.5) return 'America/Denver';
  return 'America/Los_Angeles';
}
export const fmtTimeAt = (d, lng) =>
  isNaN(d) ? '—' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: usTimeZone(lng) });

export function tzAbbr(d, lng) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: usTimeZone(lng), timeZoneName: 'short' }).formatToParts(d);
    return parts.find(p => p.type === 'timeZoneName')?.value || '';
  } catch { return ''; }
}

export function compass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// ----------------------------------------------------------- geocoding
// Proxied to LocationIQ via our own server (/api/geocode) — see server.js.
export async function geocode(query) {
  const url = `/api/geocode?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    const hit = data[0];
    return {
      lat: +hit.lat, lng: +hit.lon,
      label: hit.display_name.split(',').slice(0, 3).join(',').trim(),
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ location photos
// Real photos of a location via Wikimedia Commons (falling back to
// Openverse), proxied through our own server — see /api/location-photos.
export async function fetchLocationPhotos(query) {
  try {
    const res = await fetch(`/api/location-photos?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// -------------------------------------------------------------- place info
// Real-world background for a natural/geographic feature via Wikipedia,
// proxied through our own server (see /api/place-info in server.js).
export async function fetchPlaceInfo({ lat, lng, name, wikipedia }) {
  const params = new URLSearchParams({ lat, lng });
  if (name) params.set('name', name);
  if (wikipedia) params.set('wikipedia', wikipedia);
  try {
    const res = await fetch(`/api/place-info?${params}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.found === false ? null : data;
  } catch {
    return null;
  }
}

// -------------------------------------------------------- reverse geocoding
// Used by "explore the globe" mode: turns a clicked lat/lng into a place
// name via our /api/reverse-geocode proxy (LocationIQ).
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;
    return {
      label: data.display_name ? data.display_name.split(',').slice(0, 3).join(',').trim() : `${lat.toFixed(3)}, ${lng.toFixed(3)}`,
      raw: data,
    };
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- weather
const WMO = {
  0: ['Clear', '☀️'], 1: ['Mainly clear', '🌤'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫'], 48: ['Rime fog', '🌫'],
  51: ['Light drizzle', '🌦'], 53: ['Drizzle', '🌦'], 55: ['Heavy drizzle', '🌧'],
  61: ['Light rain', '🌦'], 63: ['Rain', '🌧'], 65: ['Heavy rain', '🌧'],
  71: ['Light snow', '🌨'], 73: ['Snow', '🌨'], 75: ['Heavy snow', '❄️'],
  80: ['Rain showers', '🌦'], 81: ['Showers', '🌧'], 82: ['Violent showers', '⛈'],
  95: ['Thunderstorm', '⛈'], 96: ['Storm + hail', '⛈'], 99: ['Severe storm', '⛈'],
};
export function weatherText(code) { return WMO[code] || ['—', '·']; }

export async function forecast(lat, lng) {
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}`
    + '&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=3';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}