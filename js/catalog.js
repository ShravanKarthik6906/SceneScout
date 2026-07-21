// Nationwide catalog. Builds on the hand-authored LA inventory in data.js by
// (a) defining US metros with search centers + nearest airports, (b) cloning a
// handful of floor-plan templates into locations across the country, and
// (c) enriching every location with modeled production-intelligence (parking,
// noise, privacy, permits, crew capacity, nearby amenities) and a synthesized
// review profile. All derived data is deterministic per-listing so it is stable
// across reloads. In production these fields would come from licensed feeds,
// GIS datasets, and a real review provider.

import { LOCATIONS as BASE, TYPES, LIGHT_LABELS } from './data.js';

export { TYPES, LIGHT_LABELS };

// --------------------------------------------------------------- seeded RNG
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

// ------------------------------------------------------------------- metros
export const METROS = [
  { name: 'Los Angeles, CA',   lat: 34.0407, lng: -118.2468, airport: { code: 'LAX', name: 'Los Angeles Intl' } },
  { name: 'New York, NY',      lat: 40.7128, lng: -73.9960,  airport: { code: 'JFK', name: 'John F. Kennedy Intl' } },
  { name: 'Chicago, IL',       lat: 41.8843, lng: -87.6503,  airport: { code: 'ORD', name: "O'Hare Intl" } },
  { name: 'Austin, TX',        lat: 30.2637, lng: -97.7213,  airport: { code: 'AUS', name: 'Austin-Bergstrom Intl' } },
  { name: 'Miami, FL',         lat: 25.8010, lng: -80.1990,  airport: { code: 'MIA', name: 'Miami Intl' } },
  { name: 'Seattle, WA',       lat: 47.6062, lng: -122.3321, airport: { code: 'SEA', name: 'Seattle-Tacoma Intl' } },
  { name: 'Atlanta, GA',       lat: 33.7620, lng: -84.3700,  airport: { code: 'ATL', name: 'Hartsfield-Jackson' } },
  { name: 'Nashville, TN',     lat: 36.1627, lng: -86.7816,  airport: { code: 'BNA', name: 'Nashville Intl' } },
  { name: 'Denver, CO',        lat: 39.7392, lng: -104.9903, airport: { code: 'DEN', name: 'Denver Intl' } },
  { name: 'Boston, MA',        lat: 42.3601, lng: -71.0589,  airport: { code: 'BOS', name: 'Logan Intl' } },
];

// Back-compat: the old app referred to CENTERS.
export const CENTERS = METROS;

// nearest-airport lookup by proximity
export function nearestAirport(lat, lng) {
  let best = METROS[0], bestD = Infinity;
  for (const m of METROS) {
    const d = haversineMi(lat, lng, m.lat, m.lng);
    if (d < bestD) { bestD = d; best = m; }
  }
  return { ...best.airport, mi: Math.round(bestD + 6 + (hashStr(best.airport.code) % 9)) };
}

function haversineMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --------------------------------------------------- floor-plan templates
// Reuse the richest hand-authored plans as reusable shells for new cities.
const T = (id) => JSON.parse(JSON.stringify(BASE.find(l => l.id === id).floorplan));

// ------------------------------------------------- nationwide additions
// Each references a template plan so every listing is fully walkable.
const NATIONWIDE = [
  {
    id: 'dumbo-window-loft', name: 'DUMBO Window Loft', type: 'loft',
    neighborhood: 'DUMBO, Brooklyn', address: '55 Washington St, Brooklyn, NY',
    lat: 40.7033, lng: -73.9881, sqft: 2800, ceilingFt: 13, rate: 340, light: 'abundant',
    tags: ['bridge views', 'huge windows', 'freight elevator', 'cast iron'],
    desc: 'Cast-iron loft under the Manhattan Bridge with 12-ft windows framing the skyline — a fashion and editorial favorite with dramatic afternoon light.',
    palette: { wall: '#c3b39b', floor: '#7c6144', accent: '#e8b45a' }, plan: 'arts-district-loft',
  },
  {
    id: 'lic-daylight-studio', name: 'Long Island City Daylight Studio', type: 'studio',
    neighborhood: 'Long Island City, Queens', address: '10-27 46th Rd, Queens, NY',
    lat: 40.7447, lng: -73.9485, sqft: 3400, ceilingFt: 15, rate: 380, light: 'abundant',
    tags: ['cyc wall', 'skyline light', 'freight access', 'client lounge'],
    desc: 'North-facing daylight studio with a hard cyc and a wall of industrial glass — flip from soft daylight to full strobe in minutes.',
    palette: { wall: '#e7eaef', floor: '#c9ced6', accent: '#5aa7e8' }, plan: 'santa-monica-studio',
  },
  {
    id: 'fulton-market-warehouse', name: 'Fulton Market Warehouse', type: 'warehouse',
    neighborhood: 'Fulton Market, Chicago', address: '213 N Morgan St, Chicago, IL',
    lat: 41.8867, lng: -87.6570, sqft: 8600, ceilingFt: 22, rate: 300, light: 'moderate',
    tags: ['timber beams', 'drive-in door', 'skylights', 'grip trucks OK'],
    desc: 'Heavy-timber meatpacking warehouse with bow-truss skylights and a drive-in door — room for builds, car work, and large set pieces.',
    palette: { wall: '#928b81', floor: '#6d675f', accent: '#d97b4f' }, plan: 'frogtown-warehouse',
  },
  {
    id: 'west-loop-gallery', name: 'West Loop White Box', type: 'gallery',
    neighborhood: 'West Loop, Chicago', address: '835 W Washington Blvd, Chicago, IL',
    lat: 41.8843, lng: -87.6503, sqft: 2900, ceilingFt: 14, rate: 250, light: 'moderate',
    tags: ['white walls', 'polished concrete', 'track lighting', 'loading dock'],
    desc: 'Two connected white-box galleries under diffused skylights — a clean canvas for product, art, and set builds a block from transit.',
    palette: { wall: '#f0f0f0', floor: '#cacaca', accent: '#e8b45a' }, plan: 'long-beach-gallery',
  },
  {
    id: 'east-austin-bungalow', name: 'East Austin Bungalow', type: 'house',
    neighborhood: 'East Austin, TX', address: '1305 E Cesar Chavez St, Austin, TX',
    lat: 30.2601, lng: -97.7280, sqft: 1650, ceilingFt: 10, rate: 165, light: 'abundant',
    tags: ['original wood', 'porch', 'warm light', 'quiet street'],
    desc: 'Restored craftsman with warm original wood and a wraparound porch — golden Texas light and an easy footprint for lifestyle and narrative work.',
    palette: { wall: '#d8cbb4', floor: '#9c7a54', accent: '#7aa874' }, plan: 'venice-bungalow',
  },
  {
    id: 'south-congress-bar', name: 'South Congress Neon Bar', type: 'storefront',
    neighborhood: 'South Congress, Austin', address: '1511 S Congress Ave, Austin, TX',
    lat: 30.2489, lng: -97.7501, sqft: 2000, ceilingFt: 12, rate: 230, light: 'moderate',
    tags: ['vintage neon', 'long bar', 'checker floor', 'closed Mondays'],
    desc: 'Working honky-tonk with original neon and a 30-ft bar — available for stills and night interiors on dark days.',
    palette: { wall: '#6e3b3b', floor: '#31343a', accent: '#e85a7f' }, plan: 'echo-park-bar',
  },
  {
    id: 'wynwood-rooftop', name: 'Wynwood Rooftop Terrace', type: 'rooftop',
    neighborhood: 'Wynwood, Miami', address: '250 NW 24th St, Miami, FL',
    lat: 25.8000, lng: -80.1990, sqft: 2200, ceilingFt: 0, rate: 240, light: 'abundant',
    tags: ['skyline views', 'golden hour', 'palm deck', 'penthouse lounge'],
    desc: 'Wraparound rooftop over the Wynwood murals with a glass penthouse lounge and unobstructed western sky — built for golden hour.',
    palette: { wall: '#aab3bd', floor: '#8f8577', accent: '#e8b45a' }, outdoor: true, plan: 'culver-rooftop',
  },
  {
    id: 'little-havana-house', name: 'Little Havana Vintage House', type: 'house',
    neighborhood: 'Little Havana, Miami', address: '1421 SW 8th St, Miami, FL',
    lat: 25.7650, lng: -80.2190, sqft: 1550, ceilingFt: 9, rate: 155, light: 'moderate',
    tags: ['pastel facade', 'terrazzo floors', 'garden', 'budget friendly'],
    desc: 'Untouched mid-century with terrazzo floors and a sun room — a budget-friendly period look with lush garden light.',
    palette: { wall: '#d9c8ae', floor: '#8f6b45', accent: '#7d9c6f' }, plan: 'highland-park-house',
  },
  {
    id: 'georgetown-stage', name: 'Georgetown Sound Stage', type: 'studio',
    neighborhood: 'Georgetown, Seattle', address: '5601 Airport Way S, Seattle, WA',
    lat: 47.5480, lng: -122.3200, sqft: 11000, ceilingFt: 28, rate: 560, light: 'controlled',
    tags: ['sound stage', '1000A power', 'grid at 26ft', 'drive-in door'],
    desc: 'Purpose-built sound stage with full grid and heavy power, production offices down the wall — episodic and feature ready.',
    palette: { wall: '#6b7078', floor: '#41454c', accent: '#ffd166' }, plan: 'burbank-stage-7',
  },
  {
    id: 'capitol-hill-midcentury', name: 'Capitol Hill Glass House', type: 'house',
    neighborhood: 'Capitol Hill, Seattle', address: '1620 15th Ave E, Seattle, WA',
    lat: 47.6250, lng: -122.3120, sqft: 2300, ceilingFt: 11, rate: 265, light: 'abundant',
    tags: ['walls of glass', 'city views', 'post and beam', 'deck'],
    desc: 'Post-and-beam mid-century with glass walls and soft Northwest light all day — a favorite for interviews and fashion stills.',
    palette: { wall: '#e2d6c2', floor: '#a3743f', accent: '#c96f4a' }, plan: 'silverlake-midcentury',
  },
  {
    id: 'old-fourth-ward-loft', name: 'Old Fourth Ward Daylight Loft', type: 'loft',
    neighborhood: 'Old Fourth Ward, Atlanta', address: '675 Ponce De Leon Ave NE, Atlanta, GA',
    lat: 33.7720, lng: -84.3660, sqft: 3000, ceilingFt: 14, rate: 240, light: 'abundant',
    tags: ['exposed brick', 'skylights', 'freight elevator', 'BeltLine access'],
    desc: 'Brick-and-timber loft on the BeltLine with steel windows and two skylights — a natural-light workhorse for lookbook and editorial.',
    palette: { wall: '#b8a894', floor: '#8a6f52', accent: '#e8b45a' }, plan: 'arts-district-loft',
  },
  {
    id: 'the-gulch-estate', name: 'Nashville Estate & Gardens', type: 'estate',
    neighborhood: 'Belle Meade, Nashville', address: '110 Leake Ave, Nashville, TN',
    lat: 36.1050, lng: -86.8580, sqft: 6400, ceilingFt: 14, rate: 480, light: 'abundant',
    tags: ['ballroom', 'parquet', 'chandeliers', 'formal gardens'],
    desc: 'Grand estate with a chandeliered ballroom, paneled library, and glass conservatory — period drama and prestige-TV ready.',
    palette: { wall: '#e6ddcc', floor: '#b49664', accent: '#a3823c' }, plan: 'pasadena-estate',
  },
  {
    id: 'rino-warehouse', name: 'RiNo Art Warehouse', type: 'warehouse',
    neighborhood: 'RiNo, Denver', address: '3542 Walnut St, Denver, CO',
    lat: 39.7660, lng: -104.9820, sqft: 7800, ceilingFt: 21, rate: 290, light: 'moderate',
    tags: ['mural walls', 'drive-in door', 'skylights', 'mountain light'],
    desc: 'Brick art warehouse in the RiNo district with mural walls, skylights, and a drive-in door — builds, car shoots, and large sets.',
    palette: { wall: '#8d8d94', floor: '#6e6a63', accent: '#d97b4f' }, plan: 'frogtown-warehouse',
  },
  {
    id: 'sowa-gallery', name: 'SoWa Gallery Loft', type: 'gallery',
    neighborhood: 'SoWa, Boston', address: '450 Harrison Ave, Boston, MA',
    lat: 42.3430, lng: -71.0670, sqft: 2700, ceilingFt: 13, rate: 260, light: 'moderate',
    tags: ['white walls', 'hardwood', 'track lighting', 'freight elevator'],
    desc: 'Historic mill gallery with white walls and warm hardwood under diffused north light — clean product, art, and portrait work.',
    palette: { wall: '#f0f0f0', floor: '#c9c9c9', accent: '#e8b45a' }, plan: 'long-beach-gallery',
  },
];

// materialize nationwide entries from their template plans
const EXTRA = NATIONWIDE.map(l => {
  const { plan, ...rest } = l;
  return { ...rest, floorplan: T(plan) };
});

// ------------------------------------------------------- enrichment
const AMENITY_POOLS = {
  equipment: ['Cinelease', 'Wooden Nickel Lighting', 'AbelCine', 'Hand Held Films', 'MBS Equipment', 'Quixote Rentals', 'ARRI Rental', 'Keslow Camera'],
  hotels: ['Ace Hotel', 'The Hoxton', 'Kimpton', 'Marriott', 'The Line', 'Freehand', 'Hyatt Centric', 'AC Hotel'],
  restaurants: ['craft-coffee bar', 'taqueria', 'ramen counter', 'diner', 'wine bar', 'pizza window', 'deli', 'brunch spot'],
};

function windowDirs(fp) {
  const tally = { n: 0, s: 0, e: 0, w: 0 };
  for (const r of fp.rooms) {
    const w = r.win || {};
    for (const k of ['n', 's', 'e', 'w']) tally[k] += w[k] || 0;
  }
  const names = { n: 'North', s: 'South', e: 'East', w: 'West' };
  return Object.entries(tally).filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${names[k]} ×${v}`);
}

// score helpers: 0-100 where higher is "better for production"
function enrich(loc) {
  const rand = mulberry32(hashStr(loc.id));
  const fp = loc.floorplan;
  const indoor = !loc.outdoor;

  // crew capacity from usable floor area (~40 sq ft/person working)
  const crewCapacity = Math.max(4, Math.round(loc.sqft / (loc.type === 'studio' || loc.type === 'warehouse' ? 55 : 40)));

  // parking: warehouses/studios/estates tend to have lots; storefronts/rooftops street-only
  const parkBase = { studio: 82, warehouse: 88, estate: 78, house: 60, loft: 55, gallery: 58, rooftop: 40, storefront: 38 }[loc.type] ?? 55;
  const parking = clamp(parkBase + rand() * 18 - 9);

  // noise (higher = quieter): houses/estates quiet, storefronts/rooftops louder
  const noiseBase = { estate: 84, house: 78, studio: 80, gallery: 74, warehouse: 66, loft: 62, rooftop: 56, storefront: 48 }[loc.type] ?? 65;
  const noise = clamp(noiseBase + rand() * 16 - 8 + (loc.tags.some(t => /quiet/i.test(t)) ? 8 : 0));

  // privacy: estates/houses/studios high; street-facing low
  const privBase = { estate: 90, house: 80, studio: 86, warehouse: 78, gallery: 64, loft: 60, rooftop: 58, storefront: 46 }[loc.type] ?? 66;
  const privacy = clamp(privBase + rand() * 14 - 7);

  // accessibility (step-free, elevator, load-in)
  const accBase = { studio: 84, warehouse: 82, gallery: 76, storefront: 72, house: 58, estate: 62, loft: 54, rooftop: 50 }[loc.type] ?? 66;
  const accessibility = clamp(accBase + rand() * 16 - 8 + (loc.tags.some(t => /freight|elevator|drive-in|dock/i.test(t)) ? 10 : 0));

  // power/production infrastructure
  const powerBase = { studio: 92, warehouse: 80, gallery: 66, loft: 62, estate: 60, house: 48, storefront: 52, rooftop: 46 }[loc.type] ?? 60;
  const power = clamp(powerBase + rand() * 14 - 7 + (loc.tags.some(t => /\d+A|power|grid|sound stage/i.test(t)) ? 8 : 0));

  // permit simplicity (higher = simpler): private stages simple, exteriors complex
  const permitBase = { studio: 90, warehouse: 82, gallery: 80, loft: 74, house: 70, estate: 66, storefront: 52, rooftop: 58 }[loc.type] ?? 70;
  const permit = clamp(permitBase + rand() * 14 - 7);

  const factors = {
    parking:       { score: parking,       note: parkNote(parking) },
    accessibility: { score: accessibility, note: accNote(accessibility, loc) },
    noise:         { score: noise,         note: noiseNote(noise) },
    privacy:       { score: privacy,       note: privNote(privacy) },
    power:         { score: power,         note: powerNote(power) },
    permit:        { score: permit,        note: permitNote(permit) },
  };

  const amenities = {
    equipment: `${pick(rand, AMENITY_POOLS.equipment)} · ${(2 + rand() * 9).toFixed(1)} mi`,
    hotels:    `${pick(rand, AMENITY_POOLS.hotels)} · ${(0.4 + rand() * 3).toFixed(1)} mi`,
    dining:    `${3 + Math.floor(rand() * 12)} restaurants within 0.5 mi`,
    hospital:  `Nearest ER · ${(1 + rand() * 6).toFixed(1)} mi`,
  };

  loc.intel = {
    crewCapacity,
    factors,
    amenities,
    nearestAirport: nearestAirport(loc.lat, loc.lng),
    windows: windowDirs(fp),
    productionFriendliness: Math.round((parking + accessibility + power + permit) / 4),
  };
  loc.reviews = synthReviews(loc, rand);
  return loc;
}

function clamp(v) { return Math.max(0, Math.min(100, Math.round(v))); }

const parkNote = s => s >= 80 ? 'On-site lot or truck parking available' : s >= 60 ? 'Nearby lot / permitted street parking' : 'Street parking only — plan a load-in zone';
const accNote = (s, loc) => s >= 80 ? 'Step-free load-in, elevator or drive-in access' : s >= 60 ? 'Ground-floor access, moderate load-in' : 'Stairs or tight access — budget extra time';
const noiseNote = s => s >= 78 ? 'Quiet — clean location sound likely' : s >= 62 ? 'Some ambient traffic; usable for most audio' : 'Busy surroundings — expect traffic and voices';
const privNote = s => s >= 82 ? 'Fully private, controlled entry' : s >= 62 ? 'Semi-private; some sightlines from outside' : 'Public-facing — crowds and passersby likely';
const powerNote = s => s >= 82 ? 'Heavy distributed power and rigging points' : s >= 62 ? 'Adequate house power; tie-in possible' : 'Limited power — generator recommended';
const permitNote = s => s >= 80 ? 'Interior work often permit-exempt' : s >= 62 ? 'Standard film permit, low complexity' : 'Exterior/street permits — allow lead time';

// ------------------------------------------------- synthesized reviews
function synthReviews(loc, rand) {
  const pos = [], con = [];
  const f = loc.intel ? loc.intel.factors : null; // not set yet on first call
  // derive from attributes rather than factor scores (factors set after)
  if (loc.light === 'abundant') pos.push('reviewers repeatedly praise the natural light');
  if (loc.light === 'controlled') pos.push('described as a true blackout — total light control');
  if (loc.tags.some(t => /quiet/i.test(t))) pos.push('frequently described as quiet and calm');
  if (loc.tags.some(t => /view|skyline|bridge|mountain/i.test(t))) pos.push('the views come up in almost every review');
  if (loc.tags.some(t => /brick|wood|neon|terrazzo|parquet|beam/i.test(t))) pos.push('guests love the original character and textures');
  if (loc.tags.some(t => /freight|elevator|drive-in|dock/i.test(t))) pos.push('crews call the load-in painless');
  if (loc.type === 'studio' || loc.type === 'warehouse') pos.push('hosts are used to productions and stay hands-off');
  if (loc.rate <= 200) pos.push('considered strong value for the money');

  if (loc.type === 'storefront') con.push('gets lively on weekends — book early call times');
  if (loc.type === 'rooftop') con.push('exposed to wind and weather; have a backup day');
  if (loc.intel && loc.intel.factors.noise.score < 62) con.push('a few mentions of street noise bleeding in');
  if (loc.type === 'loft' && loc.tags.some(t => /freight/i.test(t))) con.push('shared freight elevator can slow big load-ins');
  if (loc.type === 'house' && loc.sqft < 1800) con.push('tight for large crews — best for small units');
  if (loc.rate >= 400) con.push('premium rate; negotiate multi-day bookings');
  if (con.length === 0) con.push('limited on-site restrooms for large crews');

  while (pos.length < 3) pos.push(pick(rand, [
    'clean, well-maintained space', 'responsive, professional host',
    'flexible with overtime and holds', 'easy to find and access',
  ]));

  const rating = (3.9 + rand() * 1.0).toFixed(1);
  const count = 24 + Math.floor(rand() * 260);
  const summary = `Across ${count} reviews (avg ${rating}★), this ${TYPES[loc.type].label.toLowerCase()} reads as ` +
    `${pos[0].replace(/^reviewers repeatedly |^frequently |^described as |^guests love the |^the /,'').replace(/ in almost every review/,'')}. ` +
    `Best fit when you need ${bestFit(loc)}. Main thing to plan around: ${con[0]}.`;

  return { rating: +rating, count, positives: pos.slice(0, 4), considerations: con.slice(0, 3), summary };
}

function bestFit(loc) {
  return {
    studio: 'controlled light and real infrastructure',
    warehouse: 'scale, builds, or vehicle access',
    loft: 'natural light and industrial texture',
    house: 'a lived-in, intimate interior',
    estate: 'grandeur and period detail',
    rooftop: 'skyline backdrops at golden hour',
    storefront: 'a characterful commercial interior',
    gallery: 'a clean, neutral canvas',
  }[loc.type] || 'a distinctive backdrop';
}

// ------------------------------------------------------ assemble + export
export const LOCATIONS = [...BASE, ...EXTRA].map(enrich);
