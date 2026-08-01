// catalog.js — type taxonomy, metro registry, and airport lookup.
//
// The building inventory (formerly hand-authored here) has been replaced by
// real US property records from the Zillow US House Listings 2023 Kaggle
// dataset (febinphilips/us-house-listings-2023), processed once by
// scripts/build-catalog.js into data/locations.json and served by
// server.js's /api/locations endpoint.
//
// app.js fetches that endpoint on startup and stores the result in a module-
// level LOCATIONS variable — the rest of the app is unchanged.
//
// What remains here: the shared constants every other module still imports.

// Re-export data.js's type/light definitions so score.js and the rest of
// the app keep their existing import paths.
export { TYPES, LIGHT_LABELS } from './data.js';

// ----------------------------------------------------------------- metros
// Used by app.js for the search-area selector, and by catalog-build logic
// for airport proximity. Identical to the old catalog.js list.
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

// Back-compat: the old app referred to CENTERS.
export const CENTERS = METROS;

// nearestAirport is used by the build script but NOT by client code — the
// airport data is already baked into each location's intel.nearestAirport
// field at build time. Kept here as a no-op export guard in case any
// module still imports it.
export function nearestAirport() { return null; }
