// Offline fallback for natural-feature search (lakes, rivers, mountains,
// forests, parks, caves) when both Overpass and GeoNames are unavailable —
// e.g. no GeoNames account configured, network egress blocked, or the
// account's daily quota is exhausted. A small curated list of well-known
// real features near major US metros, filtered by distance and the same
// feature-class guess server.js already uses for the real GeoNames call.
const features = require('./data/offline-natural-features.json');

const MI_TO_KM = 1.60934;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fallbackNaturalFeatures(lat, lng, radiusMi, featureClass) {
  const radiusKm = (Number(radiusMi) || 15) * MI_TO_KM;
  return features
    .filter(f => !featureClass || f.featureClass === featureClass)
    .filter(f => haversineKm(lat, lng, f.lat, f.lng) <= radiusKm)
    .map(f => ({
      id: `offline-${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: f.name, lat: f.lat, lng: f.lng,
      countryName: 'United States', adminName: null,
    }));
}

module.exports = { fallbackNaturalFeatures };
