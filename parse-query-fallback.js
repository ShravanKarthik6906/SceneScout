// Simple keyword‑based parser for AI query fallback
const TYPE_SET = new Set(['studio','loft','warehouse','house','rooftop','storefront','gallery','estate']);
const LIGHT_SET = new Set(['abundant','moderate','controlled']);
const STYLE_VOCAB = ['modern','industrial','brick','vintage','minimal','rustic','scandinavian','mid‑century','contemporary'];
// `natural=water` on its own matches every pond, pool, retention basin and
// puddle in the radius — a "lake" search near Denver returned 2,798 of them,
// almost all unnamed. Qualifying with water=lake gives actual lakes;
// findNaturalFeatures() automatically relaxes back to the primary tag alone
// if the pair returns nothing, so specificity here costs no coverage.
const NATURAL_FEATURES = [
  { label:'lake', osmTags:[{key:'natural',value:'water'},{key:'water',value:'lake'}], elementTypes:['way','relation'] },
  { label:'river', osmTags:[{key:'waterway',value:'river'}], elementTypes:['way'] },
  { label:'mountain', osmTags:[{key:'natural',value:'peak'}], elementTypes:['node','way'] },
  { label:'forest', osmTags:[{key:'landuse',value:'forest'}], elementTypes:['way','relation'] },
  { label:'beach', osmTags:[{key:'natural',value:'beach'}], elementTypes:['way','relation'] }
];
const centers = require('./data/offline-centers.json');

function fallbackParseQuery(query) {
  const lower = query.toLowerCase();
  const result = {
    types: [],
    styleWords: [],
    light: null,
    minSqft: null,
    maxRate: null,
    radiusMi: null,
    locationText: null,
    naturalFeature: null,
  };
  // types
  for (const t of TYPE_SET) if (lower.includes(t)) result.types.push(t);
  // style words
  for (const w of STYLE_VOCAB) if (lower.includes(w)) result.styleWords.push(w);
  // light
  for (const l of LIGHT_SET) if (lower.includes(l)) { result.light = l; break; }
  // min sqft
  const sqftMatch = lower.match(/(\d+)\s*(sqft|sq\s*ft|sq\.ft)/);
  if (sqftMatch) result.minSqft = Number(sqftMatch[1]);
  // max rate
  const rateMatch = lower.match(/(?:under\s*)?\$(\d+)(?:\/day| per day)?/);
  if (rateMatch) result.maxRate = Number(rateMatch[1]);
  // radius
  const radiusMatch = lower.match(/(\d+)\s*(mi|miles)/);
  if (radiusMatch) result.radiusMi = Number(radiusMatch[1]);
  // Location text from offline centers. Matching the full stored name only
  // ("Denver, CO") meant a perfectly ordinary query like "lake near Denver"
  // resolved no location at all, so the map never moved and the search ran
  // against wherever the user happened to be. Also accept the bare city,
  // longest first so "New York" can't lose to a shorter substring match.
  const byLongest = [...centers].sort((a, b) => b.name.length - a.name.length);
  for (const c of byLongest) {
    const full = c.name.toLowerCase();
    const city = full.split(',')[0].trim();
    const cityRe = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (lower.includes(full) || cityRe.test(lower)) { result.locationText = c.name; break; }
  }
  // natural feature
  for (const f of NATURAL_FEATURES) if (lower.includes(f.label)) {
    result.naturalFeature = {
      label: f.label,
      icon: '🌿',
      osmTags: f.osmTags,
      elementTypes: f.elementTypes,
      approxSizeFt: null,
    };
    break;
  }
  return result;
}

module.exports = { fallbackParseQuery };
