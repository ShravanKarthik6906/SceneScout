// Geocode fallback using static offline centers list
const centers = require('./data/offline-centers.json');

function fallbackGeocode(address) {
  const lower = address.trim().toLowerCase();
  const match = centers.find(c => c.name.toLowerCase() === lower);
  if (!match) {
    return { error: 'not found in offline mode' };
  }
  // Mimic LocationIQ response format (array of results)
  return [{
    place_id: 0,
    licence: '',
    osm_type: '',
    osm_id: '',
    lat: String(match.lat),
    lon: String(match.lon),
    display_name: `${match.name}, United States`,
    address: { city: match.name, country: 'United States' }
  }];
}

module.exports = { fallbackGeocode };
