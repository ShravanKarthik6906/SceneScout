// Natural-language query parser. Turns a prompt like "modern industrial
// warehouse with large windows near downtown Chicago under $500/day" into a
// structured intent object that drives the filters and the suitability score.
// Fully offline — a rules/lexicon parser, no API. In production this is where
// an LLM call would slot in; the downstream code only consumes the structured
// result, so the swap is isolated.

import { TYPES } from './catalog.js';

const TYPE_LEXICON = {
  studio:     ['studio', 'sound stage', 'soundstage', 'stage', 'cyc', 'photo studio', 'shooting space'],
  loft:       ['loft', 'industrial space', 'brick loft', 'artist loft'],
  warehouse:  ['warehouse', 'industrial warehouse', 'factory', 'hangar', 'garage'],
  house:      ['house', 'home', 'bungalow', 'craftsman', 'cottage', 'residence', 'residential', 'suburban', 'ranch', 'apartment'],
  rooftop:    ['rooftop', 'roof deck', 'terrace', 'roof top', 'penthouse'],
  storefront: ['storefront', 'bar', 'cafe', 'coffee shop', 'coffee', 'diner', 'restaurant', 'shop', 'retail', 'pub', 'saloon'],
  gallery:    ['gallery', 'white box', 'white-box', 'art space', 'showroom'],
  estate:     ['estate', 'mansion', 'ballroom', 'manor', 'villa', 'chateau', 'palace'],
};

// mood / architectural style vocabulary — matched against tags + descriptions
const STYLE_WORDS = [
  'modern', 'industrial', 'victorian', 'mid-century', 'midcentury', 'rustic', 'vintage',
  'minimalist', 'minimal', 'brick', 'exposed brick', 'concrete', 'wood', 'warm', 'moody',
  'bright', 'airy', 'gothic', 'art deco', 'contemporary', 'period', 'ornate', 'neon',
  'glass', 'brutalist', 'coastal', 'desert', 'bohemian', 'clean', 'grand', 'cozy',
  'elegant', 'raw', 'polished', 'skyline', 'garden', '1920s', '1950s', '1970s', '1980s', '1990s',
];

const LIGHT_ABUNDANT = ['natural light', 'daylight', 'sunny', 'bright', 'sunlight', 'big windows', 'large windows', 'huge windows', 'wall of windows', 'lots of light', 'airy', 'golden hour', 'sun-drenched'];
const LIGHT_CONTROLLED = ['blackout', 'black out', 'controlled light', 'no windows', 'dark', 'night interior', 'light control', 'windowless'];

const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function matchAny(text, phrases) {
  for (const p of phrases) if (text.includes(p)) return p;
  return null;
}

export function parseQuery(raw) {
  const text = ' ' + raw.toLowerCase().trim() + ' ';
  const out = {
    raw: raw.trim(),
    types: new Set(),
    styleWords: [],
    light: null,          // 'abundant' | 'moderate' | 'controlled' | null
    minSqft: null,
    maxRate: null,        // hourly
    radiusMi: null,
    locationText: null,
    interpreted: [],      // human-readable chips
  };
  if (!out.raw) return out;

  // ---- types
  for (const [key, words] of Object.entries(TYPE_LEXICON)) {
    if (matchAny(text, words.map(w => ' ' + w))) out.types.add(key);
  }

  // ---- style / mood words
  for (const s of STYLE_WORDS) if (text.includes(s)) out.styleWords.push(s);
  out.styleWords = [...new Set(out.styleWords)];

  // ---- natural light
  if (matchAny(text, LIGHT_CONTROLLED)) out.light = 'controlled';
  else if (matchAny(text, LIGHT_ABUNDANT)) out.light = 'abundant';
  else if (text.includes('moody') || text.includes('warm light') || text.includes('soft light')) out.light = 'moderate';

  // ---- budget:  "$800/day", "under $500", "$300 an hour", "budget", "cheap"
  let m = text.match(/\$?\s?(\d{2,5})\s?(?:\/|\s?(?:per\s)?)?\s?(day|d\b|hour|hr|h\b)/);
  if (m) {
    const amt = +m[1];
    out.maxRate = /d/.test(m[2]) ? Math.round(amt / 10) : amt;   // ~10 shoot-hours/day
  } else if ((m = text.match(/(?:under|below|less than|max|budget of|up to)\s+\$?\s?(\d{2,5})/))) {
    out.maxRate = Math.round(+m[1] / 10 > 60 ? +m[1] / 10 : +m[1]); // assume /day if large
  } else if (/\b(cheap|affordable|budget|inexpensive|low[- ]cost)\b/.test(text)) {
    out.maxRate = 200;
  } else if (/\b(premium|high[- ]end|luxury|top[- ]tier)\b/.test(text)) {
    out.maxRate = null;
  }

  // ---- size
  m = text.match(/(\d{3,6})\s?(?:sq\.?\s?ft|square\s?f(?:ee|oo)t|sf)\b/);
  if (m) out.minSqft = +m[1];
  else if (/\b(huge|massive|enormous|cavernous|expansive|very large|large scale)\b/.test(text)) out.minSqft = 5000;
  else if (/\b(large|spacious|big|roomy)\b/.test(text)) out.minSqft = 3500;
  else if (/\b(small|intimate|cozy|compact|tiny)\b/.test(text)) out.minSqft = null; // no lower bound

  // crew size -> implied square footage
  m = text.match(/(?:crew of|fits?|hold[s]?|up to)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)/);
  if (m) {
    const n = NUM_WORDS[m[1]] || +m[1];
    if (n) out.minSqft = Math.max(out.minSqft || 0, n * 45);
  }

  // ---- radius:  "within 10 miles", "5 mi radius"
  m = text.match(/(?:within|inside|radius of|within a)\s+(\d{1,3})\s?(?:mi|mile)/) || text.match(/(\d{1,3})\s?(?:mi|mile)s?\s+(?:radius|of)/);
  if (m) out.radiusMi = Math.min(60, +m[1]);

  // ---- location:  "near/in/around/close to <place>"
  m = raw.match(/\b(?:near|in|around|close to|by|outside|downtown|within .* of)\s+([A-Za-z][A-Za-z .,'-]{2,40})/i);
  if (m) {
    let place = m[1].trim().replace(/\b(under|with|that|and|for|the space|a space)\b.*$/i, '').trim();
    place = place.replace(/[.,]+$/, '').trim();
    // "downtown X" geocodes unreliably (Nominatim can match a street named X in
    // another city), so resolve on the city/place itself.
    place = place.replace(/^downtown\s+/i, '').trim();
    if (place.length >= 3 && !/^(a|an|the)$/i.test(place)) {
      out.locationText = place;
    }
  }

  // ---- build the "interpreted as" chips
  for (const t of out.types) out.interpreted.push(`${TYPES[t].icon} ${TYPES[t].label}`);
  if (out.light) out.interpreted.push(`💡 ${out.light} light`);
  if (out.minSqft) out.interpreted.push(`📐 ${out.minSqft.toLocaleString()}+ ft²`);
  if (out.maxRate) out.interpreted.push(`💵 ≤ $${out.maxRate}/hr`);
  if (out.radiusMi) out.interpreted.push(`📍 ${out.radiusMi} mi radius`);
  if (out.locationText) out.interpreted.push(`🗺 ${out.locationText}`);
  for (const s of out.styleWords.slice(0, 4)) out.interpreted.push(`✨ ${s}`);

  return out;
}
