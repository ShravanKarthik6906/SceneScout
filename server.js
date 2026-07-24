// server.js - Geocoding proxy (LocationIQ) + AI query parsing (Groq) with caching
const express = require('express');
const cors = require('cors'); // enable CORS
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3001;

// LocationIQ: free tier, 5,000 requests/day, 2 req/sec.
// Sign up at https://locationiq.com/register to get a key.
const LOCATIONIQ_KEY = process.env.LOCATIONIQ_KEY || 'YOUR_LOCATIONIQ_KEY_HERE';

// Groq: free tier, used to parse natural-language location briefs into
// structured filters. Sign up at https://console.groq.com/keys to get a key.
const GROQ_API_KEY = process.env.GROQ_API_KEY || 'YOUR_GROQ_KEY_HERE';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Simple JSON file cache: address -> result
const CACHE_PATH = path.join(__dirname, 'geocode-cache.json');
let cache = {};
try {
  if (fs.existsSync(CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  }
} catch (e) {
  console.warn('Failed to load cache', e);
}

function saveCache() {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write cache', e);
  }
}

// Serialize all outbound LocationIQ calls through one queue so concurrent
// client requests (e.g. geocoding 20 locations on page load) never exceed
// the free-tier limit of 2 req/sec, no matter how many requests arrive at
// once from the frontend.
let queue = Promise.resolve();
const MIN_INTERVAL = 550; // ms between LocationIQ calls (~1.8/sec, safely under 2/sec)
let lastCall = 0;

function enqueue(fn) {
  const result = queue.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL - (Date.now() - lastCall));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  });
  // Keep the chain alive even if this call fails, so one error doesn't
  // stall every request behind it.
  queue = result.catch(() => { });
  return result;
}

app.get('/api/geocode', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });
  const address = q.trim();

  // Return cached if available — skips the queue entirely.
  if (cache[address]) return res.json(cache[address]);

  if (!LOCATIONIQ_KEY || LOCATIONIQ_KEY === 'YOUR_KEY_HERE') {
    return res.status(500).json({ error: 'LOCATIONIQ_KEY not set. Get a free key at locationiq.com/register' });
  }

  const url = `https://us1.locationiq.com/v1/search`
    + `?key=${LOCATIONIQ_KEY}`
    + `&format=json&limit=1&countrycodes=us`
    + `&q=${encodeURIComponent(address)}`;

  try {
    const data = await enqueue(async () => {
      const response = await fetch(url);
      if (!response.ok) {
        // LocationIQ returns 404 for "no match found" — treat that as an
        // empty result, not an error, so the frontend can handle it gracefully.
        if (response.status === 404) return [];
        const err = new Error('LocationIQ error');
        err.status = response.status;
        throw err;
      }
      return response.json();
    });
    cache[address] = data; // cache even empty results
    saveCache();
    res.json(data);
  } catch (e) {
    console.error('Geocode proxy error', e);
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
});

// ------------------------------------------------------------- Groq parsing
const PARSE_SYSTEM_PROMPT = `You convert a location-scouting brief into structured filters.
Output ONLY a JSON object, no prose, matching exactly this shape:
{
  "types": string[],        // subset of: studio, loft, warehouse, house, rooftop, storefront, gallery, estate
  "styleWords": string[],   // architectural/mood adjectives mentioned, lowercase, e.g. "modern", "industrial", "brick"
  "light": string | null,   // one of "abundant", "moderate", "controlled", or null if not mentioned
  "minSqft": number | null, // minimum square footage implied, or null
  "maxRate": number | null, // max hourly rate in USD implied, or null (if given per day, convert: rate/10)
  "radiusMi": number | null,// search radius in miles if explicitly stated, or null
  "locationText": string | null, // a city/neighborhood/place name if mentioned, or null
  "naturalFeature": {       // set ONLY if the brief describes a natural/geographic feature
                             // NOT covered by the "types" list above (lake, river, beach, mountain,
                             // forest, waterfall, cliff, canyon, cave, desert, park, island, etc).
                             // If the brief matches one of the building types above instead, set this to null.
    "label": string,        // human-readable name, e.g. "Lake", "River", "Beach", "Mountain Peak"
    "icon": string,         // one emoji representing it
    "osmTags": [{ "key": string, "value": string }],
      // REAL OpenStreetMap tag(s) that identify this feature in Overpass API data.
      // Use your knowledge of actual OSM tagging conventions. Examples:
      //   lake/pond   -> [{"key":"natural","value":"water"}]
      //   river       -> [{"key":"waterway","value":"river"}]
      //   beach       -> [{"key":"natural","value":"beach"}]
      //   mountain/peak -> [{"key":"natural","value":"peak"}]
      //   forest/woods -> [{"key":"natural","value":"wood"}]
      //   waterfall   -> [{"key":"waterway","value":"waterfall"}]
      //   cliff       -> [{"key":"natural","value":"cliff"}]
      //   cave        -> [{"key":"natural","value":"cave_entrance"}]
      //   park        -> [{"key":"leisure","value":"park"}]
      //   island      -> [{"key":"place","value":"island"}]
      // If you are not confident of a real OSM tag for the feature, still make your
      // best guess using natural=* or landuse=* conventions rather than returning null here.
    "elementTypes": string[], // which OSM element types typically carry this tag: subset of
                               // ["node","way","relation"]. Point features (peaks, waterfalls,
                               // cave entrances) are usually "node". Areas (lakes, forests, parks)
                               // are usually "way" and "relation". Linear features (rivers) are
                               // usually "way". Include all types that could plausibly apply.
    "approxSizeFt": number | null // a target size in feet (diameter/width/length) if the brief
                                   // gives one (e.g. "300 ft across"), else null — do not invent one
  }
}
Only include a "types" entry if it's clearly implied. Do not invent details not present in the brief.
If the brief is vague, empty, or matches nothing specific (e.g. a single unrelated word with no
clear feature or building type), return all nulls, empty arrays, and naturalFeature: null —
do not guess a category that isn't actually implied.`;

app.post('/api/parse-query', async (req, res) => {
  const { query } = req.body || {};
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Missing query' });
  }

  if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_KEY_HERE') {
    return res.status(500).json({ error: 'GROQ_API_KEY not set. Get a free key at console.groq.com/keys' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: PARSE_SYSTEM_PROMPT },
          { role: 'user', content: query },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Groq API error', response.status, errText);
      return res.status(response.status).json({ error: 'Groq API error' });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return res.status(500).json({ error: 'Empty Groq response' });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse Groq JSON output', content);
      return res.status(500).json({ error: 'Groq returned invalid JSON' });
    }

    res.json(parsed);
  } catch (e) {
    console.error('Groq proxy error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ------------------------------------------------------------- Overpass (lakes)
const OVERPASS_CACHE_PATH = path.join(__dirname, 'overpass-cache.json');
let overpassCache = {};
try {
  if (fs.existsSync(OVERPASS_CACHE_PATH)) {
    overpassCache = JSON.parse(fs.readFileSync(OVERPASS_CACHE_PATH, 'utf8'));
  }
} catch (e) {
  console.warn('Failed to load overpass cache', e);
}
function saveOverpassCache() {
  try {
    fs.writeFileSync(OVERPASS_CACHE_PATH, JSON.stringify(overpassCache, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write overpass cache', e);
  }
}

// Separate queue from the LocationIQ one — Overpass's public instance asks
// for one request at a time, not a fixed req/sec, so we serialize fully.
let overpassQueue = Promise.resolve();
function enqueueOverpass(fn) {
  const result = overpassQueue.then(fn);
  overpassQueue = result.catch(() => { });
  return result;
}

// Simple hash so we don't store the full query text as a JSON key.
function hashQuery(q) {
  let h = 0;
  for (let i = 0; i < q.length; i++) { h = (h * 31 + q.charCodeAt(i)) | 0; }
  return String(h);
}

const { overpass } = require('overpass-ts');
const DDG = require('duck-duck-scrape');

// ------------------------------------------------------------- photo search
// Real photos of a location, via DuckDuckGo image search (duck-duck-scrape —
// the maintained Node equivalent of Python's ddgs/duckduckgo_search).
const PHOTO_CACHE_PATH = path.join(__dirname, 'photo-cache.json');
let photoCache = {};
try {
  if (fs.existsSync(PHOTO_CACHE_PATH)) {
    photoCache = JSON.parse(fs.readFileSync(PHOTO_CACHE_PATH, 'utf8'));
  }
} catch (e) {
  console.warn('Failed to load photo cache', e);
}
function savePhotoCache() {
  try {
    fs.writeFileSync(PHOTO_CACHE_PATH, JSON.stringify(photoCache, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write photo cache', e);
  }
}
// DuckDuckGo's image search is unofficial/scraped — self-throttle
// conservatively to avoid getting blocked, same queue pattern as geocoding.
let photoQueue = Promise.resolve();
let lastPhotoCall = 0;
const PHOTO_MIN_INTERVAL = 1200;
function enqueuePhoto(fn) {
  const result = photoQueue.then(async () => {
    const wait = Math.max(0, PHOTO_MIN_INTERVAL - (Date.now() - lastPhotoCall));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastPhotoCall = Date.now();
    return fn();
  });
  photoQueue = result.catch(() => { });
  return result;
}

app.get('/api/location-photos', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Missing q parameter' });
  const trimmed = q.trim();
  const key = 'photos:' + hashQuery(trimmed);
  if (photoCache[key]) return res.json(photoCache[key]);

  try {
    const result = await enqueuePhoto(() =>
      DDG.searchImages(trimmed, { safeSearch: DDG.SafeSearchType.MODERATE })
    );
    const simplified = (result.results || []).slice(0, 12).map(r => ({
      image: r.image, thumbnail: r.thumbnail, title: r.title,
      source: r.source, width: r.width, height: r.height, url: r.url,
    }));
    photoCache[key] = simplified;
    savePhotoCache();
    res.json(simplified);
  } catch (e) {
    console.error('Photo search error', e.message);
    res.status(500).json({ error: e.message || 'Internal server error' });
  }
});

// ---------------------------------------------------------- reverse geocode
// Used by the "explore the globe" click handler — turns a lat/lng the user
// clicked into a human-readable place name. Shares LocationIQ's existing
// cache/queue with the forward-geocode endpoint above.
app.get('/api/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'Missing lat/lng' });
  if (!LOCATIONIQ_KEY || LOCATIONIQ_KEY === 'YOUR_KEY_HERE') {
    return res.status(500).json({ error: 'LOCATIONIQ_KEY not set' });
  }
  const key = `rev:${(+lat).toFixed(4)},${(+lng).toFixed(4)}`;
  if (cache[key]) return res.json(cache[key]);

  const url = `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lng}&format=json`;
  try {
    const data = await enqueue(async () => {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) return null;
        const err = new Error('LocationIQ reverse error');
        err.status = response.status;
        throw err;
      }
      return response.json();
    });
    cache[key] = data;
    saveCache();
    res.json(data);
  } catch (e) {
    console.error('Reverse geocode error', e.message);
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
});

app.post('/api/overpass', async (req, res) => {
  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Missing query' });

  const key = hashQuery(query);
  if (overpassCache[key]) return res.json(overpassCache[key]);

  try {
    const data = await enqueueOverpass(async () => {
      // overpass-ts handles endpoint retry, rate-limit (429) and gateway
      // timeout (504) backoff internally — no need to hand-roll a mirror
      // loop. It still needs a proper User-Agent, same courtesy requirement
      // as Nominatim.
      return overpass(query, {
        endpoint: 'https://overpass-api.de/api/interpreter',
        rateLimitRetries: 3,
        rateLimitPause: 2000,
        fetchOpts: {
          headers: {
            'User-Agent': 'SceneScout/0.1 (hackathon project; contact: udaya@example.com)',
          },
        },
      });
    });
    overpassCache[key] = data;
    saveOverpassCache();
    res.json(data);
  } catch (e) {
    console.error('Overpass query failed:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'Internal server error' });
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '')));

const server = app.listen(PORT, () =>
  console.log(`Geocode proxy listening on http://localhost:${PORT}`)
);

// Ensure Ctrl+C actually releases the port (avoids EADDRINUSE on restart)
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});