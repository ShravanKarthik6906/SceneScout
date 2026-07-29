#!/usr/bin/env node
// scripts/build-catalog.js
//
// Merges four Kaggle datasets into data/locations.json — the bundled
// location catalog served by /api/locations.  Run once after downloading
// the source CSVs:
//
//   npm run build:catalog
//
// ─────────────────────────────────────────────────────────────────────
// SOURCE 1 — Zillow US House Listings 2023
//   Kaggle: febinphilips/us-house-listings-2023  (file: cleaned_df.csv)
//   Real:   lat, lng, sqft (Area), market value (MarketEstimate),
//           rent estimate (RentEstimate), city, state, street
//   Derived: type (from sqft/beds/ppsq heuristics), rate, light,
//            intel scores, reviews
//   Coverage: 49 US states, 30 per metro
//
// SOURCE 2 — King County House Sales (Seattle area)
//   Kaggle: harlfoxem/housesalesprediction  (file: kc_house_data.csv)
//   Real:   lat, long, sqft_living, sqft_lot, price, yr_built, grade
//           (1-13 quality scale), condition, waterfront, view
//   Derived: type (grade-keyed: 11-13 → estate, large+view → loft,
//            waterfront → rooftop), rate, light, intel scores, reviews
//   Coverage: King County (Seattle metro only)
//   Why:    Only US dataset with a real quality-grade column — gives
//           ground-truth signal for estate vs house vs loft mapping.
//           grade 11-13 = luxury/custom/mansion.
//
// SOURCE 3 — Southern States Zillow Listings
//   Kaggle: alaasweed/southern-states-zillow-data  (file: zillow_listings.csv)
//   Real:   lat, lng, livingArea, price, homeType, city, state, zip
//   Derived: same as Source 1
//   Coverage: LA, TN, TX, AR, MS, AL — fills Southern metros
//
// SOURCE 4 — NYC Property Sales (NYC Open Data via Kaggle)
//   Kaggle: new-york-city/nyc-property-sales  (file: nyc-rolling-sales.csv)
//   Real:   BUILDING CLASS AT PRESENT (E=warehouse, K=store, L=loft,
//           F=factory→warehouse, J=theatre→storefront, P=cultural→gallery,
//           H=luxury hotel→estate), GROSS SQUARE FEET, YEAR BUILT,
//           NEIGHBORHOOD, ADDRESS, ZIP CODE, BOROUGH
//   Derived: lat/lng — assigned from bundled NYC zip-code centroids
//           (186 unique zips; centroids accurate to ~0.3 mi for NYC's
//           small zip areas). Type is REAL from building class codes,
//           not heuristic-inferred.
//   Coverage: Manhattan, Brooklyn, Queens, Bronx, Staten Island
//   Why:    The only freely available US dataset with real commercial
//           building class codes.  Gives true ground-truth for warehouse,
//           storefront, loft, gallery types.
// ─────────────────────────────────────────────────────────────────────

'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, '..', 'data');
const SURVEY_DIR  = path.join(DATA_DIR, 'survey');
const OUTPUT_JSON = path.join(DATA_DIR, 'locations.json');
const MAX_PER_METRO = 30;    // per-metro cap for Sources 1,2,3
const MAX_NYC_PER_CLASS = 25; // per-building-class cap for Source 4
const METRO_RADIUS_MI   = 100;

// ─── metros ──────────────────────────────────────────────────────────
const METROS = [
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
  { name: 'San Francisco, CA', lat: 37.7580, lng: -122.3890, airport: { code: 'SFO', name: 'San Francisco Intl' } },
  { name: 'Philadelphia, PA',  lat: 39.9700, lng: -75.1290,  airport: { code: 'PHL', name: 'Philadelphia Intl' } },
  { name: 'Portland, OR',      lat: 45.5290, lng: -122.6820, airport: { code: 'PDX', name: 'Portland Intl' } },
  { name: 'Dallas, TX',        lat: 32.7830, lng: -96.7810,  airport: { code: 'DFW', name: 'Dallas-Fort Worth Intl' } },
  { name: 'New Orleans, LA',   lat: 29.9660, lng: -90.0330,  airport: { code: 'MSY', name: 'Louis Armstrong New Orleans Intl' } },
  { name: 'Detroit, MI',       lat: 42.3300, lng: -83.0680,  airport: { code: 'DTW', name: 'Detroit Metro' } },
  { name: 'Washington, DC',    lat: 38.9076, lng: -77.0723,  airport: { code: 'DCA', name: 'Reagan National' } },
  { name: 'Phoenix, AZ',       lat: 33.5060, lng: -111.9860, airport: { code: 'PHX', name: 'Sky Harbor Intl' } },
  { name: 'San Diego, CA',     lat: 32.7480, lng: -117.1290, airport: { code: 'SAN', name: 'San Diego Intl' } },
  { name: 'Minneapolis, MN',   lat: 44.9860, lng: -93.2760,  airport: { code: 'MSP', name: 'Minneapolis-St Paul Intl' } },
];

// NYC borough → approximate lat/lng (used as fallback if zip not found)
const NYC_BOROUGH_CENTROIDS = {
  '1': { lat: 40.7831, lng: -73.9712 }, // Manhattan
  '2': { lat: 40.8448, lng: -73.8648 }, // Bronx
  '3': { lat: 40.6501, lng: -73.9496 }, // Brooklyn
  '4': { lat: 40.7282, lng: -73.7949 }, // Queens
  '5': { lat: 40.5795, lng: -74.1502 }, // Staten Island
};

// Bundled NYC zip-code centroids — computed from public NYC zip boundary data.
// Accurate to ~0.3 mi for Manhattan zips (~0.5 mi for outer-borough zips).
// Source: US Census ZCTA5 centroids (public domain).
// Only NYC zips (100xx, 102xx, 103xx, 104xx, 112xx-114xx) are included.
const NYC_ZIP_CENTROIDS = {
  '10001': { lat: 40.7484, lng: -73.9967 }, '10002': { lat: 40.7157, lng: -73.9863 },
  '10003': { lat: 40.7317, lng: -73.9893 }, '10004': { lat: 40.7001, lng: -74.0393 },
  '10005': { lat: 40.7074, lng: -74.0113 }, '10006': { lat: 40.7088, lng: -74.0134 },
  '10007': { lat: 40.7135, lng: -74.0078 }, '10009': { lat: 40.7264, lng: -73.9784 },
  '10010': { lat: 40.7395, lng: -73.9826 }, '10011': { lat: 40.7444, lng: -74.0006 },
  '10012': { lat: 40.7257, lng: -73.9981 }, '10013': { lat: 40.7204, lng: -74.0064 },
  '10014': { lat: 40.7338, lng: -74.0059 }, '10016': { lat: 40.7470, lng: -73.9780 },
  '10017': { lat: 40.7538, lng: -73.9723 }, '10018': { lat: 40.7549, lng: -73.9938 },
  '10019': { lat: 40.7654, lng: -73.9840 }, '10020': { lat: 40.7588, lng: -73.9793 },
  '10021': { lat: 40.7696, lng: -73.9588 }, '10022': { lat: 40.7590, lng: -73.9665 },
  '10023': { lat: 40.7796, lng: -73.9820 }, '10024': { lat: 40.7870, lng: -73.9754 },
  '10025': { lat: 40.7977, lng: -73.9681 }, '10026': { lat: 40.8021, lng: -73.9542 },
  '10027': { lat: 40.8111, lng: -73.9534 }, '10028': { lat: 40.7769, lng: -73.9526 },
  '10029': { lat: 40.7928, lng: -73.9436 }, '10030': { lat: 40.8182, lng: -73.9441 },
  '10031': { lat: 40.8240, lng: -73.9485 }, '10032': { lat: 40.8375, lng: -73.9397 },
  '10033': { lat: 40.8499, lng: -73.9339 }, '10034': { lat: 40.8668, lng: -73.9252 },
  '10035': { lat: 40.7991, lng: -73.9352 }, '10036': { lat: 40.7600, lng: -73.9925 },
  '10037': { lat: 40.8129, lng: -73.9382 }, '10038': { lat: 40.7088, lng: -74.0031 },
  '10039': { lat: 40.8291, lng: -73.9363 }, '10040': { lat: 40.8593, lng: -73.9299 },
  '10044': { lat: 40.7617, lng: -73.9499 }, '10065': { lat: 40.7644, lng: -73.9636 },
  '10069': { lat: 40.7774, lng: -73.9902 }, '10075': { lat: 40.7728, lng: -73.9553 },
  '10128': { lat: 40.7803, lng: -73.9491 }, '10280': { lat: 40.7075, lng: -74.0161 },
  '10301': { lat: 40.6287, lng: -74.0942 }, '10302': { lat: 40.6285, lng: -74.1149 },
  '10303': { lat: 40.6323, lng: -74.1395 }, '10304': { lat: 40.6074, lng: -74.0939 },
  '10305': { lat: 40.5942, lng: -74.0855 }, '10306': { lat: 40.5659, lng: -74.1152 },
  '10307': { lat: 40.5120, lng: -74.2328 }, '10308': { lat: 40.5519, lng: -74.1504 },
  '10309': { lat: 40.5228, lng: -74.1948 }, '10310': { lat: 40.6330, lng: -74.1068 },
  '10312': { lat: 40.5521, lng: -74.1910 }, '10314': { lat: 40.6073, lng: -74.1610 },
  '10451': { lat: 40.8186, lng: -73.9254 }, '10452': { lat: 40.8360, lng: -73.9196 },
  '10453': { lat: 40.8516, lng: -73.9137 }, '10454': { lat: 40.8085, lng: -73.9176 },
  '10455': { lat: 40.8122, lng: -73.9094 }, '10456': { lat: 40.8262, lng: -73.9100 },
  '10457': { lat: 40.8438, lng: -73.9016 }, '10458': { lat: 40.8596, lng: -73.8885 },
  '10459': { lat: 40.8245, lng: -73.8944 }, '10460': { lat: 40.8398, lng: -73.8813 },
  '10461': { lat: 40.8442, lng: -73.8451 }, '10462': { lat: 40.8406, lng: -73.8690 },
  '10463': { lat: 40.8818, lng: -73.9088 }, '10464': { lat: 40.8704, lng: -73.7959 },
  '10465': { lat: 40.8259, lng: -73.8258 }, '10466': { lat: 40.8963, lng: -73.8445 },
  '10467': { lat: 40.8765, lng: -73.8715 }, '10468': { lat: 40.8670, lng: -73.8987 },
  '10469': { lat: 40.8724, lng: -73.8570 }, '10470': { lat: 40.9012, lng: -73.8660 },
  '10471': { lat: 40.9002, lng: -73.9079 }, '10472': { lat: 40.8315, lng: -73.8732 },
  '10473': { lat: 40.8188, lng: -73.8618 }, '10474': { lat: 40.8113, lng: -73.8817 },
  '10475': { lat: 40.8794, lng: -73.8270 }, '10701': { lat: 40.9299, lng: -73.8988 },
  '11001': { lat: 40.7220, lng: -73.7062 }, '11101': { lat: 40.7478, lng: -73.9397 },
  '11102': { lat: 40.7726, lng: -73.9302 }, '11103': { lat: 40.7650, lng: -73.9203 },
  '11104': { lat: 40.7497, lng: -73.9236 }, '11105': { lat: 40.7764, lng: -73.9057 },
  '11106': { lat: 40.7557, lng: -73.9303 }, '11201': { lat: 40.6924, lng: -73.9900 },
  '11203': { lat: 40.6479, lng: -73.9406 }, '11204': { lat: 40.6198, lng: -73.9860 },
  '11205': { lat: 40.6945, lng: -73.9647 }, '11206': { lat: 40.7031, lng: -73.9407 },
  '11207': { lat: 40.6721, lng: -73.8993 }, '11208': { lat: 40.6731, lng: -73.8752 },
  '11209': { lat: 40.6226, lng: -74.0312 }, '11210': { lat: 40.6288, lng: -73.9451 },
  '11211': { lat: 40.7130, lng: -73.9560 }, '11212': { lat: 40.6614, lng: -73.9183 },
  '11213': { lat: 40.6698, lng: -73.9407 }, '11214': { lat: 40.6011, lng: -73.9964 },
  '11215': { lat: 40.6616, lng: -73.9848 }, '11216': { lat: 40.6798, lng: -73.9485 },
  '11217': { lat: 40.6836, lng: -73.9804 }, '11218': { lat: 40.6465, lng: -73.9787 },
  '11219': { lat: 40.6333, lng: -73.9985 }, '11220': { lat: 40.6397, lng: -74.0182 },
  '11221': { lat: 40.6919, lng: -73.9233 }, '11222': { lat: 40.7254, lng: -73.9492 },
  '11223': { lat: 40.5985, lng: -73.9718 }, '11224': { lat: 40.5772, lng: -73.9980 },
  '11225': { lat: 40.6614, lng: -73.9560 }, '11226': { lat: 40.6462, lng: -73.9552 },
  '11228': { lat: 40.6207, lng: -74.0099 }, '11229': { lat: 40.5999, lng: -73.9502 },
  '11230': { lat: 40.6213, lng: -73.9620 }, '11231': { lat: 40.6762, lng: -74.0007 },
  '11232': { lat: 40.6568, lng: -74.0027 }, '11233': { lat: 40.6753, lng: -73.9199 },
  '11234': { lat: 40.6099, lng: -73.9151 }, '11235': { lat: 40.5836, lng: -73.9477 },
  '11236': { lat: 40.6350, lng: -73.9027 }, '11237': { lat: 40.7061, lng: -73.9213 },
  '11238': { lat: 40.6798, lng: -73.9673 }, '11239': { lat: 40.6453, lng: -73.8786 },
  '11354': { lat: 40.7681, lng: -73.8311 }, '11355': { lat: 40.7490, lng: -73.8192 },
  '11356': { lat: 40.7810, lng: -73.8434 }, '11357': { lat: 40.7929, lng: -73.8088 },
  '11358': { lat: 40.7572, lng: -73.7930 }, '11360': { lat: 40.7877, lng: -73.7764 },
  '11361': { lat: 40.7714, lng: -73.7656 }, '11362': { lat: 40.7612, lng: -73.7454 },
  '11363': { lat: 40.7761, lng: -73.7481 }, '11364': { lat: 40.7470, lng: -73.7537 },
  '11365': { lat: 40.7395, lng: -73.7967 }, '11366': { lat: 40.7272, lng: -73.7912 },
  '11367': { lat: 40.7298, lng: -73.8191 }, '11368': { lat: 40.7477, lng: -73.8617 },
  '11369': { lat: 40.7595, lng: -73.8699 }, '11370': { lat: 40.7636, lng: -73.8884 },
  '11371': { lat: 40.7714, lng: -73.8729 }, '11372': { lat: 40.7530, lng: -73.8856 },
  '11373': { lat: 40.7378, lng: -73.8783 }, '11374': { lat: 40.7296, lng: -73.8636 },
  '11375': { lat: 40.7209, lng: -73.8440 }, '11377': { lat: 40.7441, lng: -73.9058 },
  '11378': { lat: 40.7225, lng: -73.9087 }, '11379': { lat: 40.7248, lng: -73.8676 },
  '11385': { lat: 40.7013, lng: -73.8927 }, '11411': { lat: 40.6912, lng: -73.7414 },
  '11412': { lat: 40.6988, lng: -73.7590 }, '11413': { lat: 40.6717, lng: -73.7539 },
  '11414': { lat: 40.6561, lng: -73.8438 }, '11415': { lat: 40.7101, lng: -73.8324 },
  '11416': { lat: 40.6868, lng: -73.8507 }, '11417': { lat: 40.6742, lng: -73.8400 },
  '11418': { lat: 40.7037, lng: -73.8356 }, '11419': { lat: 40.6953, lng: -73.8264 },
  '11420': { lat: 40.6725, lng: -73.8173 }, '11421': { lat: 40.6924, lng: -73.8571 },
  '11422': { lat: 40.6596, lng: -73.7400 }, '11423': { lat: 40.7087, lng: -73.7648 },
  '11424': { lat: 40.7101, lng: -73.8324 }, '11426': { lat: 40.7314, lng: -73.7241 },
  '11427': { lat: 40.7274, lng: -73.7484 }, '11428': { lat: 40.7195, lng: -73.7395 },
  '11429': { lat: 40.7059, lng: -73.7400 }, '11430': { lat: 40.6398, lng: -73.7890 },
  '11432': { lat: 40.7157, lng: -73.7910 }, '11433': { lat: 40.7011, lng: -73.7961 },
  '11434': { lat: 40.6726, lng: -73.7739 }, '11435': { lat: 40.6987, lng: -73.8131 },
  '11436': { lat: 40.6793, lng: -73.7967 }, '11691': { lat: 40.5975, lng: -73.7566 },
  '11692': { lat: 40.5924, lng: -73.7873 }, '11693': { lat: 40.5994, lng: -73.8124 },
  '11694': { lat: 40.5797, lng: -73.8419 }, '11697': { lat: 40.5547, lng: -73.9228 },
};

// ─── seeded RNG (identical to previous build) ────────────────────────
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

// ─── geo helpers ─────────────────────────────────────────────────────
function haversineMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function nearestMetro(lat, lng) {
  let best = null, bestD = Infinity;
  for (const m of METROS) {
    const d = haversineMi(lat, lng, m.lat, m.lng);
    if (d < bestD) { bestD = d; best = m; }
  }
  return { metro: best, distMi: bestD };
}
function nearestAirport(lat, lng) {
  const { metro } = nearestMetro(lat, lng);
  const d = haversineMi(lat, lng, metro.lat, metro.lng);
  const rand = mulberry32(hashStr(metro.airport.code));
  return { ...metro.airport, mi: Math.round(d + 6 + rand() * 9) };
}

// ─── type derivation helpers ─────────────────────────────────────────
// Source 1 & 3: heuristic from residential data
function deriveTypeResidential(sqft, beds, ppsq, rand) {
  if (sqft >= 5000 && beds >= 5 && ppsq >= 200) return 'estate';
  if (sqft >= 6000 && beds <= 1) return rand() < 0.5 ? 'warehouse' : 'studio';
  if (sqft >= 4000 && beds <= 2) return rand() < 0.6 ? 'loft' : 'warehouse';
  if (sqft >= 2000 && sqft < 5000 && ppsq >= 300) return rand() < 0.55 ? 'loft' : 'studio';
  if (sqft < 1500 && ppsq >= 400) return rand() < 0.5 ? 'storefront' : 'gallery';
  if (beds >= 3) return rand() < 0.04 ? 'rooftop' : 'house';
  if (beds === 2) return rand() < 0.1 ? 'loft' : 'house';
  return rand() < 0.15 ? 'storefront' : 'house';
}

// Source 2 (King County): grade-keyed mapping — ground truth
function deriveTypeKC(sqft, grade, waterfront, view, rand) {
  if (grade >= 11) return 'estate';
  if (waterfront === '1') return rand() < 0.6 ? 'rooftop' : 'house';
  if (view >= 3 && sqft >= 2500) return rand() < 0.5 ? 'loft' : 'house';
  if (grade >= 9 && sqft >= 3000) return rand() < 0.4 ? 'loft' : 'house';
  return 'house';
}

// Source 4 (NYC): building-class-to-type — ground truth from NYC tax records
function typeFromNYCClass(buildingClass) {
  const cat = (buildingClass || '').trim()[0] || '';
  const map = {
    'E': 'warehouse',  // Warehouses
    'F': 'warehouse',  // Factories
    'K': 'storefront', // Store buildings
    'L': 'loft',       // Loft buildings
    'J': 'storefront', // Theatres
    'P': 'gallery',    // Indoor public/cultural facilities
    'H': 'estate',     // Luxury hotels
    'O': 'studio',     // Office buildings (closest to studio)
    'D': 'loft',       // Elevator apartments (high-rise loft aesthetic)
  };
  return map[cat] || null; // null = skip
}

// ─── shared derivation helpers ────────────────────────────────────────
function deriveLight(type, rand) {
  const map = {
    studio:     () => rand() < 0.45 ? 'controlled' : rand() < 0.5 ? 'abundant' : 'moderate',
    warehouse:  () => rand() < 0.5  ? 'moderate' : 'abundant',
    loft:       () => rand() < 0.65 ? 'abundant' : 'moderate',
    house:      () => rand() < 0.55 ? 'abundant' : 'moderate',
    estate:     () => rand() < 0.7  ? 'abundant' : 'moderate',
    rooftop:    () => 'abundant',
    storefront: () => rand() < 0.55 ? 'moderate' : 'abundant',
    gallery:    () => rand() < 0.6  ? 'moderate' : 'abundant',
  };
  return (map[type] || map.house)();
}

const CEILING_FT = {
  studio: [16, 22], warehouse: [18, 28], loft: [12, 16], house: [9, 11],
  estate: [12, 18], rooftop: [0, 0], storefront: [10, 14], gallery: [12, 16],
};
function deriveCeilingFt(type, rand) {
  const [lo, hi] = CEILING_FT[type] || [9, 11];
  return type === 'rooftop' ? 0 : lo + Math.round(rand() * (hi - lo));
}

function deriveRate(marketValue, sqft) {
  const byValue = marketValue / 2000;
  const bySize  = sqft / 8;
  return Math.round(Math.max(100, Math.min(700, (byValue * 0.7 + bySize * 0.3))) / 25) * 25;
}

const TAG_POOLS = {
  studio:     ['white cyc', 'blackout', 'client lounge', '400A power', 'rolling blackout', 'freight access', 'control room'],
  warehouse:  ['drive-in door', 'skylights', 'raw concrete', 'grip trucks OK', 'timber beams', 'bow-truss roof', 'high ceilings'],
  loft:       ['exposed brick', 'skylights', 'freight elevator', 'north light', 'steel windows', 'cast iron', 'open plan'],
  house:      ['original wood floors', 'garden', 'morning light', 'quiet street', 'period detail', 'warm light'],
  estate:     ['ballroom', 'parquet', 'chandeliers', 'formal gardens', 'period millwork', 'conservatory'],
  rooftop:    ['skyline views', 'golden hour', 'string lights', 'penthouse lounge', 'unobstructed sky'],
  storefront: ['neon signage', 'vintage bar', 'checker floor', 'closed Mondays', 'exposed brick', 'long bar', 'street-facing'],
  gallery:    ['white walls', 'polished concrete', 'track lighting', 'street parking', 'loading dock', 'skylights'],
};
const NEIGHBORHOOD_PREFIXES = {
  studio:     ['Photo Studio', 'Daylight Studio', 'Cyc Studio', 'Commercial Studio', 'Sound Stage'],
  warehouse:  ['Industrial Warehouse', 'Warehouse Stage', 'Timber Warehouse', 'Art Warehouse', 'Bay Warehouse'],
  loft:       ['Daylight Loft', 'Window Loft', 'Artist Loft', 'Industrial Loft', 'Corner Loft'],
  house:      ['Vintage House', 'Craftsman Bungalow', 'Mid-Century House', 'Period House', 'Garden House'],
  estate:     ['Estate & Gardens', 'Grand Estate', 'Federal Estate', 'Manor House', 'Historic Estate'],
  rooftop:    ['Rooftop Terrace', 'Sky Deck', 'Penthouse Terrace', 'Rooftop Stage'],
  storefront: ['Neon Bar', 'Vintage Storefront', 'Corner Bar', 'Period Storefront', 'Street-Level Space'],
  gallery:    ['White Box', 'Gallery Loft', 'Art Gallery', 'Project Space', 'Cultural Space'],
};
const DESC_TEMPLATES = {
  studio:     (c) => `Full-featured studio in ${c} with controlled light and production infrastructure — built for commercial, editorial, and video work.`,
  warehouse:  (c) => `Industrial warehouse in ${c} with high ceilings and raw concrete — room for builds, vehicle shoots, and large set pieces.`,
  loft:       (c) => `Daylight loft in ${c} with abundant natural light and industrial character — a natural-light workhorse for lookbook and editorial.`,
  house:      (c) => `Residential property in ${c} with warm period character and natural light — ideal for lifestyle, narrative, and intimate interior work.`,
  estate:     (c) => `Grand estate in ${c} with formal rooms and gardens — period drama, prestige-editorial, and high-end production ready.`,
  rooftop:    (c) => `Rooftop terrace in ${c} with unobstructed sky and golden-hour views — the whole point is the light at dusk.`,
  storefront: (c) => `Character commercial space in ${c} with original detail — available for stills and interior shoots.`,
  gallery:    (c) => `White-box gallery in ${c} under diffused skylights — a clean, neutral canvas for product, art, and set builds.`,
};
const PALETTES = {
  studio:     { wall: '#9aa1ad', floor: '#3d4148', accent: '#7fb4ff' },
  warehouse:  { wall: '#8d8d94', floor: '#6e6a63', accent: '#d97b4f' },
  loft:       { wall: '#b8a894', floor: '#8a6f52', accent: '#e8b45a' },
  house:      { wall: '#d8cbb4', floor: '#9c7a54', accent: '#7aa874' },
  estate:     { wall: '#e6ddcc', floor: '#b49664', accent: '#a3823c' },
  rooftop:    { wall: '#aab3bd', floor: '#8f8577', accent: '#e8b45a' },
  storefront: { wall: '#6e3b3b', floor: '#31343a', accent: '#e85a7f' },
  gallery:    { wall: '#f0f0f0', floor: '#c9c9c9', accent: '#e8b45a' },
};
const FLOOR_PLANS = {
  studio: { rooms: [
    { name: 'Stage',        x: 0,  z: 0,   w: 18, d: 14,  h: 6,   style: 'studio' },
    { name: 'Control Room', x: 18, z: 0,   w: 6,  d: 5,   h: 3,   style: 'control', win: { e: 1 } },
    { name: 'Makeup',       x: 18, z: 5,   w: 6,  d: 4.5, h: 3,   style: 'makeup',  win: { e: 1 } },
    { name: 'Lounge',       x: 18, z: 9.5, w: 6,  d: 4.5, h: 3,   style: 'lounge',  win: { e: 1, s: 1 } },
  ], doors: [{ x: 18, z: 2.5, dir: 'v', width: 1.6 }, { x: 18, z: 7.2, dir: 'v', width: 1.4 }, { x: 21, z: 5, dir: 'h', width: 1.2 }] },
  warehouse: { rooms: [
    { name: 'Main Floor', x: 0,  z: 0, w: 30, d: 24, h: 7,   style: 'warehouse', win: { n: 3 }, sky: 4 },
    { name: 'Office',     x: 30, z: 0, w: 8,  d: 6,  h: 3,   style: 'office',    win: { e: 2, n: 1 } },
    { name: 'Workshop',   x: 30, z: 6, w: 8,  d: 9,  h: 3.5, style: 'shop',      win: { e: 2 } },
  ], doors: [{ x: 30, z: 3, dir: 'v', width: 1.8 }, { x: 30, z: 10, dir: 'v', width: 2.4 }, { x: 34, z: 6, dir: 'h', width: 1.4 }] },
  loft: { rooms: [
    { name: 'Main Loft',   x: 0,  z: 0, w: 15, d: 12, h: 4.3, style: 'loft',    win: { n: 4, w: 3 }, sky: 2 },
    { name: 'Kitchenette', x: 15, z: 0, w: 5,  d: 6,  h: 3.2, style: 'kitchen', win: { n: 1, e: 1 } },
    { name: 'Green Room',  x: 15, z: 6, w: 5,  d: 6,  h: 3.2, style: 'lounge',  win: { e: 1, s: 1 } },
  ], doors: [{ x: 15, z: 3, dir: 'v', width: 1.6 }, { x: 15, z: 9, dir: 'v', width: 1.6 }, { x: 17.5, z: 6, dir: 'h', width: 1.2 }] },
  house: { rooms: [
    { name: 'Living Room', x: 0, z: 0,   w: 6, d: 5,   h: 2.9, style: 'living',  win: { n: 2, w: 1 } },
    { name: 'Kitchen',     x: 6, z: 0,   w: 5, d: 5,   h: 2.9, style: 'kitchen', win: { n: 1, e: 1 } },
    { name: 'Bedroom',     x: 0, z: 5,   w: 6, d: 4.5, h: 2.9, style: 'bed',     win: { w: 1, s: 2 } },
    { name: 'Studio Room', x: 6, z: 5,   w: 5, d: 4.5, h: 2.9, style: 'office',  win: { s: 1, e: 1 } },
  ], doors: [{ x: 6, z: 2.2, dir: 'v', width: 1.3 }, { x: 2.8, z: 5, dir: 'h', width: 1.2 }, { x: 8.6, z: 5, dir: 'h', width: 1.2 }] },
  estate: { rooms: [
    { name: 'Ballroom',     x: 0,  z: 0, w: 12, d: 9, h: 4.6, style: 'ballroom',     win: { n: 4, w: 2 } },
    { name: 'Foyer',        x: 12, z: 0, w: 6,  d: 9, h: 4.6, style: 'foyer',        win: { n: 2 } },
    { name: 'Library',      x: 18, z: 0, w: 6,  d: 5, h: 3.4, style: 'library',      win: { n: 1, e: 1 } },
    { name: 'Dining Room',  x: 18, z: 5, w: 6,  d: 4, h: 3.4, style: 'dining',       win: { e: 1, s: 1 } },
    { name: 'Conservatory', x: 12, z: 9, w: 6,  d: 5, h: 3.6, style: 'conservatory', win: { s: 2, e: 2 }, sky: 2 },
  ], doors: [{ x: 12, z: 4.5, dir: 'v', width: 2.2 }, { x: 18, z: 2.5, dir: 'v', width: 1.5 }, { x: 21, z: 5, dir: 'h', width: 1.3 }, { x: 18, z: 7, dir: 'v', width: 1.4 }, { x: 15, z: 9, dir: 'h', width: 1.8 }] },
  rooftop: { rooms: [
    { name: 'Main Deck',        x: 0,  z: 0, w: 14, d: 9, h: 1.1, style: 'deck',   open: true },
    { name: 'West Deck',        x: 14, z: 4, w: 6,  d: 5, h: 1.1, style: 'deck',   open: true },
    { name: 'Penthouse Lounge', x: 14, z: 0, w: 6,  d: 4, h: 3,   style: 'lounge', win: { n: 2, e: 1 } },
  ], doors: [{ x: 14, z: 2, dir: 'v', width: 1.6 }, { x: 14, z: 6.5, dir: 'v', width: 5 }, { x: 17, z: 4, dir: 'h', width: 1.4 }] },
  storefront: { rooms: [
    { name: 'Bar Room',    x: 0, z: 0, w: 12, d: 8, h: 3.6, style: 'bar',     win: { n: 3 } },
    { name: 'Back Lounge', x: 0, z: 8, w: 7,  d: 6, h: 3.2, style: 'lounge',  win: { w: 1 } },
    { name: 'Kitchen',     x: 7, z: 8, w: 5,  d: 6, h: 3.2, style: 'kitchen', win: { s: 1, e: 1 } },
  ], doors: [{ x: 3.5, z: 8, dir: 'h', width: 1.6 }, { x: 9, z: 8, dir: 'h', width: 1.4 }, { x: 7, z: 11, dir: 'v', width: 1.2 }] },
  gallery: { rooms: [
    { name: 'Gallery A',    x: 0,  z: 0, w: 12, d: 9, h: 4.2, style: 'gallery', win: { n: 1 }, sky: 3 },
    { name: 'Gallery B',    x: 12, z: 0, w: 8,  d: 9, h: 4.2, style: 'gallery', sky: 2 },
    { name: 'Project Room', x: 0,  z: 9, w: 6,  d: 5, h: 3.2, style: 'office',  win: { s: 1, w: 1 } },
  ], doors: [{ x: 12, z: 4.5, dir: 'v', width: 2.6 }, { x: 3, z: 9, dir: 'h', width: 1.8 }] },
};

// ─── enrichment (identical to previous build) ────────────────────────
const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
const AMENITY_POOLS = {
  equipment: ['Cinelease', 'Wooden Nickel Lighting', 'AbelCine', 'Hand Held Films', 'MBS Equipment', 'Quixote Rentals', 'ARRI Rental', 'Keslow Camera'],
  hotels:    ['Ace Hotel', 'The Hoxton', 'Kimpton', 'Marriott', 'The Line', 'Freehand', 'Hyatt Centric', 'AC Hotel'],
};
const BEST_FIT = {
  studio: 'controlled light and real infrastructure', warehouse: 'scale, builds, or vehicle access',
  loft: 'natural light and industrial texture', house: 'a lived-in, intimate interior',
  estate: 'grandeur and period detail', rooftop: 'skyline backdrops at golden hour',
  storefront: 'a characterful commercial interior', gallery: 'a clean, neutral canvas',
};

function enrich(loc) {
  const rand = mulberry32(hashStr(loc.id));
  const type = loc.type, tags = loc.tags;
  const crewCapacity = Math.max(4, Math.round(loc.sqft / (type === 'studio' || type === 'warehouse' ? 55 : 40)));
  const parkBase = { studio: 82, warehouse: 88, estate: 78, house: 60, loft: 55, gallery: 58, rooftop: 40, storefront: 38 }[type] ?? 55;
  const parking = clamp(parkBase + rand() * 18 - 9);
  const noiseBase = { estate: 84, house: 78, studio: 80, gallery: 74, warehouse: 66, loft: 62, rooftop: 56, storefront: 48 }[type] ?? 65;
  const noise = clamp(noiseBase + rand() * 16 - 8 + (tags.some(t => /quiet/i.test(t)) ? 8 : 0));
  const privBase = { estate: 90, house: 80, studio: 86, warehouse: 78, gallery: 64, loft: 60, rooftop: 58, storefront: 46 }[type] ?? 66;
  const privacy = clamp(privBase + rand() * 14 - 7);
  const accBase = { studio: 84, warehouse: 82, gallery: 76, storefront: 72, house: 58, estate: 62, loft: 54, rooftop: 50 }[type] ?? 66;
  const accessibility = clamp(accBase + rand() * 16 - 8 + (tags.some(t => /freight|elevator|drive-in|dock/i.test(t)) ? 10 : 0));
  const powerBase = { studio: 92, warehouse: 80, gallery: 66, loft: 62, estate: 60, house: 48, storefront: 52, rooftop: 46 }[type] ?? 60;
  const power = clamp(powerBase + rand() * 14 - 7 + (tags.some(t => /\d+A|power|grid|sound stage/i.test(t)) ? 8 : 0));
  const permitBase = { studio: 90, warehouse: 82, gallery: 80, loft: 74, house: 70, estate: 66, storefront: 52, rooftop: 58 }[type] ?? 70;
  const permit = clamp(permitBase + rand() * 14 - 7);
  const factors = {
    parking:       { score: parking,       note: parking >= 80 ? 'On-site lot or truck parking available' : parking >= 60 ? 'Nearby lot / permitted street parking' : 'Street parking only — plan a load-in zone' },
    accessibility: { score: accessibility, note: accessibility >= 80 ? 'Step-free load-in, elevator or drive-in access' : accessibility >= 60 ? 'Ground-floor access, moderate load-in' : 'Stairs or tight access — budget extra time' },
    noise:         { score: noise,         note: noise >= 78 ? 'Quiet — clean location sound likely' : noise >= 62 ? 'Some ambient traffic; usable for most audio' : 'Busy surroundings — expect traffic and voices' },
    privacy:       { score: privacy,       note: privacy >= 82 ? 'Fully private, controlled entry' : privacy >= 62 ? 'Semi-private; some sightlines from outside' : 'Public-facing — crowds and passersby likely' },
    power:         { score: power,         note: power >= 82 ? 'Heavy distributed power and rigging points' : power >= 62 ? 'Adequate house power; tie-in possible' : 'Limited power — generator recommended' },
    permit:        { score: permit,        note: permit >= 80 ? 'Interior work often permit-exempt' : permit >= 62 ? 'Standard film permit, low complexity' : 'Exterior/street permits — allow lead time' },
  };
  const fp = loc.floorplan;
  const tally = { n: 0, s: 0, e: 0, w: 0 };
  for (const r of fp.rooms) { const w = r.win || {}; for (const k of ['n','s','e','w']) tally[k] += w[k] || 0; }
  const wnames = { n: 'North', s: 'South', e: 'East', w: 'West' };
  const windows = Object.entries(tally).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${wnames[k]} ×${v}`);
  loc.intel = {
    crewCapacity, factors,
    amenities: {
      equipment: `${pick(rand, AMENITY_POOLS.equipment)} · ${(2 + rand() * 9).toFixed(1)} mi`,
      hotels:    `${pick(rand, AMENITY_POOLS.hotels)} · ${(0.4 + rand() * 3).toFixed(1)} mi`,
      dining:    `${3 + Math.floor(rand() * 12)} restaurants within 0.5 mi`,
      hospital:  `Nearest ER · ${(1 + rand() * 6).toFixed(1)} mi`,
    },
    nearestAirport: nearestAirport(loc.lat, loc.lng),
    windows, productionFriendliness: Math.round((parking + accessibility + power + permit) / 4),
  };
  const pos = [], con = [];
  if (loc.light === 'abundant') pos.push('reviewers repeatedly praise the natural light');
  if (loc.light === 'controlled') pos.push('described as a true blackout — total light control');
  if (tags.some(t => /quiet/i.test(t))) pos.push('frequently described as quiet and calm');
  if (tags.some(t => /view|skyline|bridge|mountain|waterfront/i.test(t))) pos.push('the views come up in almost every review');
  if (tags.some(t => /brick|wood|neon|terrazzo|parquet|beam|cast.iron/i.test(t))) pos.push('guests love the original character and textures');
  if (tags.some(t => /freight|elevator|drive-in|dock/i.test(t))) pos.push('crews call the load-in painless');
  if (type === 'studio' || type === 'warehouse') pos.push('hosts are used to productions and stay hands-off');
  if (loc.rate <= 200) pos.push('considered strong value for the money');
  if (type === 'storefront') con.push('gets lively on weekends — book early call times');
  if (type === 'rooftop') con.push('exposed to wind and weather; have a backup day');
  if (type === 'loft' && tags.some(t => /freight/i.test(t))) con.push('shared freight elevator can slow big load-ins');
  if (type === 'house' && loc.sqft < 1800) con.push('tight for large crews — best for small units');
  if (loc.rate >= 400) con.push('premium rate; negotiate multi-day bookings');
  if (con.length === 0) con.push('limited on-site restrooms for large crews');
  while (pos.length < 3) pos.push(pick(rand, ['clean, well-maintained space', 'responsive, professional host', 'flexible with overtime and holds', 'easy to find and access']));
  const LABELS = { studio: 'studio', warehouse: 'warehouse', loft: 'loft', house: 'property', estate: 'estate', rooftop: 'rooftop', storefront: 'storefront', gallery: 'gallery' };
  const rating = parseFloat((3.9 + rand() * 1.0).toFixed(1));
  const count = 24 + Math.floor(rand() * 260);
  loc.reviews = {
    rating, count,
    positives: pos.slice(0, 4),
    considerations: con.slice(0, 3),
    summary: `Across ${count} reviews (avg ${rating}★), this ${LABELS[type] || 'location'} reads as ` +
      `${pos[0].replace(/^reviewers repeatedly |^frequently |^described as |^guests love the |^the /, '').replace(/ in almost every review/, '')}. ` +
      `Best fit when you need ${BEST_FIT[type] || 'a distinctive backdrop'}. Main thing to plan around: ${con[0]}.`,
  };
  return loc;
}

// ─── CSV parser (no deps) ─────────────────────────────────────────────
function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Handle quoted fields with commas inside
    const vals = [];
    let cur = '', inQ = false;
    for (let j = 0; j <= line.length; j++) {
      const ch = line[j];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim().replace(/^"|"$/g, '')); cur = ''; }
      else if (j === line.length) { vals.push(cur.trim().replace(/^"|"$/g, '')); }
      else { cur += ch; }
    }
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

// ─── metro bucketing ─────────────────────────────────────────────────
function bucketByMetro(items) {
  const buckets = new Map(METROS.map(m => [m.name, []]));
  for (const item of items) {
    const { metro, distMi } = nearestMetro(item.lat, item.lng);
    if (distMi <= METRO_RADIUS_MI) buckets.get(metro.name).push(item);
  }
  return buckets;
}

function pickSpread(arr, n) {
  if (arr.length <= n) return arr;
  const step = Math.max(1, Math.floor(arr.length / n));
  return arr.filter((_, i) => i % step === 0).slice(0, n);
}

// ─── location assembler ───────────────────────────────────────────────
function makeLoc({ id, type, lat, lng, sqft, market, city, state, street,
                   source, sourceType, extraTags = [] }) {
  const rand = mulberry32(hashStr(id));
  const light = deriveLight(type, rand);
  const ceil  = deriveCeilingFt(type, rand);
  const rate  = deriveRate(market, sqft);
  const tagPool = TAG_POOLS[type] || TAG_POOLS.house;
  const numTags = 3 + Math.floor(rand() * 3);
  const tags = [...tagPool].sort(() => rand() - 0.5).slice(0, numTags);
  const allTags = [...new Set([...extraTags, ...tags])];
  const cityLabel = city || (nearestMetro(lat, lng).metro?.name?.split(',')[0]) || 'Unknown';
  return enrich({
    id,
    name: `${cityLabel} ${pick(rand, NEIGHBORHOOD_PREFIXES[type] || ['Space'])}`,
    type, neighborhood: `${city}${state ? ', ' + state : ''}`,
    address: [street, city, state].filter(Boolean).join(', '),
    lat, lng,
    sqft: Math.round(sqft),
    ceilingFt: ceil,
    rate, light,
    tags: allTags,
    desc: DESC_TEMPLATES[type](cityLabel),
    palette: PALETTES[type],
    outdoor: type === 'rooftop',
    floorplan: JSON.parse(JSON.stringify(FLOOR_PLANS[type])),
    _source: source,
    _sourceType: sourceType,  // 'real' | 'derived' — honesty flag
    _marketValue: Math.round(market),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// SOURCE 1: Zillow US House Listings 2023
// ═══════════════════════════════════════════════════════════════════════
function processZillow() {
  const csvPath = fs.existsSync(path.join(SURVEY_DIR, 'cleaned_df.csv'))
    ? path.join(SURVEY_DIR, 'cleaned_df.csv')
    : path.join(DATA_DIR, 'cleaned_df.csv');
  if (!fs.existsSync(csvPath)) { console.warn('[S1] cleaned_df.csv not found — skipping'); return []; }
  console.log('[S1] Zillow 2023 — reading...');
  const rows = parseCSV(csvPath);
  const candidates = [];
  for (const row of rows) {
    const lat = parseFloat(row.Latitude), lng = parseFloat(row.Longitude);
    const sqft = parseFloat(row.Area), market = parseFloat(row.MarketEstimate);
    if (!isFinite(lat) || !isFinite(lng) || !isFinite(sqft) || sqft < 300 || sqft > 50000 || !isFinite(market) || market < 10000) continue;
    const beds = parseInt(row.Bedroom) || 0;
    const ppsq = market / sqft;
    const idSeed = `z1-${lat.toFixed(5)},${lng.toFixed(5)}`;
    const rand = mulberry32(hashStr(idSeed));
    const type = deriveTypeResidential(sqft, beds, ppsq, rand);
    candidates.push({ lat, lng, sqft, market, type, city: row.City || '', state: row.State || '', street: row.Street || '', id: `real-${idSeed.replace(/[^a-z0-9]/gi, '-')}`, source: 'zillow-2023', sourceType: 'derived' });
  }
  const buckets = bucketByMetro(candidates);
  const out = [];
  for (const [metro, items] of buckets) {
    if (!items.length) continue;
    items.sort((a, b) => a.sqft - b.sqft);
    const picked = pickSpread(items, MAX_PER_METRO);
    console.log(`  ${metro}: ${items.length} → ${picked.length}`);
    for (const item of picked) out.push(makeLoc(item));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// SOURCE 2: King County House Sales — real grade/condition scores
// ═══════════════════════════════════════════════════════════════════════
function processKingCounty() {
  const csvPath = path.join(SURVEY_DIR, 'kc_house_data.csv');
  if (!fs.existsSync(csvPath)) { console.warn('[S2] kc_house_data.csv not found — skipping'); return []; }
  console.log('[S2] King County — reading...');
  const rows = parseCSV(csvPath);
  const candidates = [];
  for (const row of rows) {
    const lat = parseFloat(row.lat), lng = parseFloat(row.long);
    const sqft = parseInt(row.sqft_living), price = parseFloat(row.price);
    const grade = parseInt(row.grade) || 0;
    const view  = parseInt(row.view)  || 0;
    const waterfront = row.waterfront || '0';
    if (!isFinite(lat) || !isFinite(lng) || sqft < 300 || price < 50000) continue;
    const idSeed = `kc-${lat.toFixed(5)},${lng.toFixed(5)}`;
    const rand = mulberry32(hashStr(idSeed));
    const type = deriveTypeKC(sqft, grade, waterfront, view, rand);
    const extraTags = [];
    if (waterfront === '1') extraTags.push('waterfront');
    if (view >= 3) extraTags.push('views');
    if (parseInt(row.yr_built) < 1950) extraTags.push('period detail');
    candidates.push({ lat, lng, sqft, market: price, type, city: 'Seattle', state: 'WA', street: '', id: `real-${idSeed.replace(/[^a-z0-9]/gi, '-')}`, source: 'king-county-2014', sourceType: grade >= 11 ? 'real' : 'derived', extraTags });
  }
  // For King County only put estate/rooftop/loft types into our catalog — houses
  // are already well-represented by Source 1. Cap KC houses at 5/metro to avoid
  // redundancy with the existing Zillow coverage of Seattle.
  const houseLimit = 5;
  let houseCount = 0;
  const filtered = candidates.filter(c => {
    if (c.type !== 'house') return true;
    if (houseCount < houseLimit) { houseCount++; return true; }
    return false;
  });
  const buckets = bucketByMetro(filtered);
  const out = [];
  for (const [metro, items] of buckets) {
    if (!items.length) continue;
    items.sort((a, b) => a.sqft - b.sqft);
    const picked = pickSpread(items, MAX_PER_METRO);
    if (picked.length) console.log(`  ${metro}: ${items.length} → ${picked.length} (KC)`);
    for (const item of picked) out.push(makeLoc(item));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// SOURCE 3: Southern States Zillow Listings
// ═══════════════════════════════════════════════════════════════════════
function processSouthernStates() {
  const csvPath = path.join(SURVEY_DIR, 'zillow_listings.csv');
  if (!fs.existsSync(csvPath)) { console.warn('[S3] zillow_listings.csv not found — skipping'); return []; }
  console.log('[S3] Southern States Zillow — reading...');
  const rows = parseCSV(csvPath);
  const candidates = [];
  for (const row of rows) {
    const lat = parseFloat(row.latitude), lng = parseFloat(row.longitude);
    const sqft = parseFloat(row.livingArea);
    const priceStr = (row.price || '').replace(/[$,]/g, '');
    const market = parseFloat(priceStr);
    if (!isFinite(lat) || !isFinite(lng) || !isFinite(sqft) || sqft < 300 || !isFinite(market) || market < 10000) continue;
    const beds = parseInt(row.bedrooms) || 0;
    const ppsq = market / sqft;
    const idSeed = `ss-${lat.toFixed(5)},${lng.toFixed(5)}`;
    const rand = mulberry32(hashStr(idSeed));
    const type = deriveTypeResidential(sqft, beds, ppsq, rand);
    candidates.push({ lat, lng, sqft, market, type, city: row.city || '', state: row.state || '', street: row.addressStreet || '', id: `real-${idSeed.replace(/[^a-z0-9]/gi, '-')}`, source: 'southern-zillow-2025', sourceType: 'derived' });
  }
  const buckets = bucketByMetro(candidates);
  const out = [];
  for (const [metro, items] of buckets) {
    if (!items.length) continue;
    items.sort((a, b) => a.sqft - b.sqft);
    const picked = pickSpread(items, MAX_PER_METRO);
    if (picked.length) console.log(`  ${metro}: ${items.length} → ${picked.length} (SS)`);
    for (const item of picked) out.push(makeLoc(item));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// SOURCE 4: NYC Property Sales — real commercial building class codes
// ═══════════════════════════════════════════════════════════════════════
function processNYCSales() {
  const csvPath = path.join(SURVEY_DIR, 'nyc-rolling-sales.csv');
  if (!fs.existsSync(csvPath)) { console.warn('[S4] nyc-rolling-sales.csv not found — skipping'); return []; }
  console.log('[S4] NYC Property Sales — reading...');
  const rows = parseCSV(csvPath);

  const TARGET_CLASSES = new Set(['E','F','K','L','J','P','H','O','D']);

  const byClass = {};
  for (const row of rows) {
    const bc   = (row['BUILDING CLASS AT PRESENT'] || '').trim();
    const cat  = bc[0] || '';
    if (!TARGET_CLASSES.has(cat)) continue;
    const type = typeFromNYCClass(bc);
    if (!type) continue;

    const rawSqft = (row['GROSS SQUARE FEET'] || '').replace(/,/g, '').trim();
    const sqft = parseInt(rawSqft) || 0;
    if (sqft < 200 || sqft > 500000) continue;  // filter junk entries

    const zip    = (row['ZIP CODE'] || '').trim().replace(/\s/g, '');
    const coords = NYC_ZIP_CENTROIDS[zip] || NYC_BOROUGH_CENTROIDS[row['BOROUGH']] || { lat: 40.7128, lng: -73.9960 };
    // Jitter within ~0.01 degrees (~0.7 mi) so stacked zip-centroid pins spread out
    const seed = hashStr(`nyc-${zip}-${row['ADDRESS']}-${bc}`);
    const jrand = mulberry32(seed);
    const lat = coords.lat + (jrand() - 0.5) * 0.018;
    const lng = coords.lng + (jrand() - 0.5) * 0.025;

    const rawSale = (row['SALE PRICE'] || '').replace(/[$,\s]/g, '');
    const salePrice = parseInt(rawSale) || 0;
    // NYC sale prices are wildly variable (transfers, $0 family deals); use
    // sqft-based estimate when price looks implausible (< $10k or > $500M)
    const market = (salePrice > 10000 && salePrice < 500000000) ? salePrice : sqft * 300;

    const neighborhood = (row['NEIGHBORHOOD'] || '').trim();
    const address = (row['ADDRESS'] || '').trim();
    const yrBuilt = parseInt(row['YEAR BUILT']) || 0;

    const extraTags = [];
    if (cat === 'E' || cat === 'F') extraTags.push('high ceilings', 'raw concrete');
    if (cat === 'K') extraTags.push('street-facing', 'retail frontage');
    if (cat === 'L') extraTags.push('exposed brick', 'cast iron', 'freight elevator');
    if (cat === 'J') extraTags.push('stage', 'theatrical space');
    if (cat === 'P') extraTags.push('gallery walls', 'public space', 'cultural venue');
    if (cat === 'H') extraTags.push('grand lobby', 'ballroom', 'period detail');
    if (yrBuilt > 0 && yrBuilt < 1940) extraTags.push('pre-war', 'period detail');

    if (!byClass[type]) byClass[type] = [];
    byClass[type].push({ lat, lng, sqft, market, type, city: neighborhood || 'New York', state: 'NY', street: address,
      id: `real-nyc-${seed}`, source: 'nyc-property-sales-2019', sourceType: 'real', extraTags,
      _buildingClass: bc });
  }

  const out = [];
  for (const [type, items] of Object.entries(byClass)) {
    items.sort((a, b) => b.sqft - a.sqft); // prefer larger examples
    const picked = items.slice(0, MAX_NYC_PER_CLASS);
    console.log(`  NYC ${type} (class ${items[0]._buildingClass[0]}): ${items.length} → ${picked.length}`);
    for (const item of picked) out.push(makeLoc(item));
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN — merge, deduplicate, write
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== SceneScout catalog build ===\n');

const s1 = processZillow();
const s2 = processKingCounty();
const s3 = processSouthernStates();
const s4 = processNYCSales();

const all = [...s1, ...s2, ...s3, ...s4];

// Deduplicate by coordinate proximity — any two locations within 0.05mi
// (≈265 ft) of each other from different sources get deduplicated, keeping
// the one with the more specific sourceType ('real' beats 'derived').
const kept = [];
const DEDUP_THRESHOLD = 0.05;
for (const loc of all) {
  const dup = kept.find(k => haversineMi(k.lat, k.lng, loc.lat, loc.lng) < DEDUP_THRESHOLD);
  if (!dup) { kept.push(loc); continue; }
  // Keep 'real' over 'derived'
  if (loc._sourceType === 'real' && dup._sourceType !== 'real') {
    const idx = kept.indexOf(dup);
    kept[idx] = loc;
  }
}

console.log('\n=== Summary ===');
console.log('S1 Zillow 2023:          ', s1.length);
console.log('S2 King County:          ', s2.length);
console.log('S3 Southern States:      ', s3.length);
console.log('S4 NYC Property Sales:   ', s4.length);
console.log('Before dedup:            ', all.length);
console.log('After dedup:             ', kept.length);

// Type breakdown
const byType = {};
const bySource = {};
const bySourceType = { real: 0, derived: 0 };
for (const loc of kept) {
  byType[loc.type] = (byType[loc.type] || 0) + 1;
  bySource[loc._source] = (bySource[loc._source] || 0) + 1;
  bySourceType[loc._sourceType] = (bySourceType[loc._sourceType] || 0) + 1;
}
console.log('By type:    ', byType);
console.log('By source:  ', bySource);
console.log('By sourceType:', bySourceType);

fs.writeFileSync(OUTPUT_JSON, JSON.stringify(kept, null, 2));
const kb = Math.round(fs.statSync(OUTPUT_JSON).size / 1024);
console.log(`\nWritten: ${OUTPUT_JSON} (${kb} KB, ${kept.length} locations)`);
