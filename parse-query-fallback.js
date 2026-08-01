// Simple keyword‑based parser for AI query fallback
const TYPE_SET = new Set(['studio','loft','warehouse','house','rooftop','storefront','gallery','estate']);
const LIGHT_SET = new Set(['abundant','moderate','controlled']);
const STYLE_VOCAB = ['modern','industrial','brick','vintage','minimal','rustic','scandinavian','mid‑century','contemporary'];
const NATURAL_FEATURES = [
  { label:'lake', osmTags:[{key:'natural',value:'water'}], elementTypes:['way','relation'] },
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
  // types — word-boundary match, not plain substring: "warehouse" contains
  // "house", so a naive .includes() would wrongly tag both types for any
  // warehouse query.
  for (const t of TYPE_SET) if (new RegExp(`\\b${t}\\b`).test(lower)) result.types.push(t);
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
  // location text from offline centers
  for (const c of centers) if (lower.includes(c.name.toLowerCase())) { result.locationText = c.name; break; }
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
