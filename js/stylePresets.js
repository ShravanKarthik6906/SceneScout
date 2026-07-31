// Style presets bundle the "look" decisions — lighting color temperature
// and intensity, material finish (roughness/metalness), window mullion
// pattern, furniture density — that would otherwise be hardcoded once into
// the scene builder. tour.js reads whatever resolvePreset() returns
// generically (preset.sunIntensity, preset.wallFinish, ...); adding a new
// preset means adding one entry to PRESETS below and, optionally, a
// TYPE_DEFAULT_PRESET/TAG_PRESET_HINTS rule — nothing in tour.js changes.

const PRESETS = {
  midCenturyResidential: {
    label: 'Mid-Century Residential',
    lightTempK: 3200, sunIntensity: 1.9, hemiIntensity: 0.9,
    wallFinish: { roughness: 0.85, metalness: 0.02 },
    floorFinish: { roughness: 0.4, metalness: 0.04 },
    windowMullion: 'grid', furnitureDensity: 1.0,
  },
  contemporaryResidential: {
    label: 'Contemporary Residential',
    lightTempK: 4200, sunIntensity: 2.1, hemiIntensity: 1.0,
    wallFinish: { roughness: 0.92, metalness: 0.0 },
    floorFinish: { roughness: 0.55, metalness: 0.02 },
    windowMullion: 'minimal', furnitureDensity: 0.9,
  },
  commercialOffice: {
    label: 'Commercial / Office',
    lightTempK: 4800, sunIntensity: 1.6, hemiIntensity: 1.1,
    wallFinish: { roughness: 0.95, metalness: 0.0 },
    floorFinish: { roughness: 0.7, metalness: 0.05 },
    windowMullion: 'curtainWall', furnitureDensity: 0.7,
  },
  industrial: {
    label: 'Industrial',
    lightTempK: 3800, sunIntensity: 2.4, hemiIntensity: 0.85,
    wallFinish: { roughness: 0.75, metalness: 0.15 },
    floorFinish: { roughness: 0.5, metalness: 0.12 },
    windowMullion: 'steelSash', furnitureDensity: 0.6,
  },
  hospitality: {
    label: 'Hospitality',
    lightTempK: 2900, sunIntensity: 1.7, hemiIntensity: 1.0,
    wallFinish: { roughness: 0.7, metalness: 0.05 },
    floorFinish: { roughness: 0.3, metalness: 0.02 },
    windowMullion: 'grid', furnitureDensity: 1.1,
  },
  default: {
    label: 'Default',
    lightTempK: 3800, sunIntensity: 1.9, hemiIntensity: 0.95,
    wallFinish: { roughness: 0.88, metalness: 0.02 },
    floorFinish: { roughness: 0.6, metalness: 0.03 },
    windowMullion: 'grid', furnitureDensity: 0.85,
  },
};

const TYPE_DEFAULT_PRESET = {
  house: 'midCenturyResidential', loft: 'contemporaryResidential', estate: 'midCenturyResidential',
  studio: 'commercialOffice', warehouse: 'industrial', gallery: 'commercialOffice',
  storefront: 'hospitality', rooftop: 'hospitality',
};

const TAG_PRESET_HINTS = [
  [/industrial|warehouse|factory|timber beam/i, 'industrial'],
  [/mid-?century|craftsman|original wood/i, 'midCenturyResidential'],
  [/contemporary|modern|glass wall/i, 'contemporaryResidential'],
  [/neon|bar|lounge|hotel|hospitality/i, 'hospitality'],
  [/office|gallery|white box|white wall/i, 'commercialOffice'],
];

// Selection is metadata-driven with a defined fallback order: an explicit
// tag hint wins (a "neon bar" loft should still look like hospitality),
// then the type's default, then the generic preset — so a location with an
// unrecognized/missing type never fails to resolve one.
export function resolvePreset(location) {
  const tags = (location.tags || []).join(' ');
  for (const [re, key] of TAG_PRESET_HINTS) {
    if (re.test(tags)) return PRESETS[key];
  }
  const byType = TYPE_DEFAULT_PRESET[location.type];
  return PRESETS[byType] || PRESETS.default;
}

// Rough black-body approximation (Tanner Helland's fit), good enough for a
// lighting tint rather than colorimetric accuracy.
export function colorTempToHex(kelvin) {
  const k = Math.max(1000, Math.min(12000, kelvin)) / 100;
  let r, g, b;
  if (k <= 66) {
    r = 255;
    g = 99.47 * Math.log(k) - 161.12;
  } else {
    r = 329.7 * Math.pow(k - 60, -0.1332);
    g = 288.12 * Math.pow(k - 60, -0.0755);
  }
  b = k >= 66 ? 255 : k <= 19 ? 0 : 138.52 * Math.log(k - 10) - 305.04;
  const c = v => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [c(r), c(g), c(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
