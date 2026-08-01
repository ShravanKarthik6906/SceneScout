import { TYPES, METROS } from './catalog.js';

// pdfjs-dist is loaded lazily (only when a PDF is actually parsed), not as a
// static top-level import — a static import is resolved before this whole
// module can even execute, so if the CDN it maps to (see the importmap in
// index.html) is unreachable, app.js's import of this file would fail too
// and take down the entire app, not just the Script Breakdown feature.
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.js').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.2.67/build/pdf.worker.mjs';
      return mod;
    });
  }
  return pdfjsPromise;
}

// Common US cities & landmark location dictionary
const POPULAR_CITIES = [
  'New York City', 'New York', 'Los Angeles', 'Chicago', 'Miami', 'Seattle',
  'San Francisco', 'Austin', 'Atlanta', 'Nashville', 'Denver', 'Boston',
  'Philadelphia', 'Portland', 'Dallas', 'New Orleans', 'Detroit',
  'Washington DC', 'Phoenix', 'San Diego', 'Minneapolis', 'Las Vegas',
  'Brooklyn', 'Manhattan', 'Hollywood', 'Santa Monica', 'Malibu'
];

// Common scenery / location feature keywords in screenplays
const SCENERY_KEYWORDS = [
  'skyscrapers', 'skyscraper', 'beach', 'beaches', 'coastline', 'mountains',
  'mountain', 'palm trees', 'coffee shop', 'busy streets', 'downtown',
  'warehouse', 'rooftop', 'industrial', 'studio', 'loft', 'apartment',
  'penthouse', 'mansion', 'alley', 'subway', 'harbor', 'waterfront', 'park'
];

/**
 * Read a File (PDF) into a Uint8Array.
 */
function readFileAsUint8Array(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extract plain text from all pages of a PDF.
 */
async function pdfToText(file) {
  const { getDocument } = await loadPdfjs();
  const data = await readFileAsUint8Array(file);
  const pdf = await getDocument({ data }).promise;
  const maxPages = pdf.numPages;
  const pageTexts = [];
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const txt = await page.getTextContent();
    const strings = txt.items.map(item => item.str);
    pageTexts.push(strings.join(' '));
  }
  return pageTexts.join('\n');
}

/**
 * Comprehensive screenplay & text location extractor.
 * - Extracts Cities, Metros & Regions (New York City, Miami, Seattle, Los Angeles...)
 * - Extracts Film Scene Headings (EXT. STREET - DAY, INT. WAREHOUSE)
 * - Extracts Property & Building types (Studio, Industrial Loft, Warehouse...)
 * - Extracts Scenery & Environment features (Beaches, Coastline, Skyscrapers, Mountains...)
 * - Extracts Budget & Rate constraints ($500/day...)
 */
export async function parseScript(file) {
  let rawText = '';
  
  // Support both File objects and raw text input
  if (typeof file === 'string') {
    rawText = file;
  } else if (file instanceof File || file instanceof Blob) {
    rawText = await pdfToText(file);
  }

  const lower = rawText.toLowerCase();
  const locations = [];
  const seenNames = new Set();

  function addLoc(name, type, category = 'location') {
    const key = name.toLowerCase().trim();
    if (key && !seenNames.has(key)) {
      seenNames.add(key);
      locations.push({ name: name.trim(), type, category });
    }
  }

  // 1. Match Metros & Cities (e.g. New York City, Miami, Seattle, Los Angeles)
  const allCities = [...new Set([...METROS.map(m => m.name.split(',')[0]), ...POPULAR_CITIES])];
  for (const city of allCities) {
    const regex = new RegExp(`\\b${city.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (regex.test(rawText)) {
      addLoc(city, 'city', 'City / Metro');
    }
  }

  // 2. Match standard screenplay scene headings (e.g. EXT. NEW YORK STREET - DAY, INT. WAREHOUSE)
  const sceneHeadingRegex = /(?:INT\.|EXT\.|INT\/EXT\.|EXT\/INT\.)\s+([A-Z0-9\s,\-\/]+?)(?=\s*-\s*|\n|$)/gi;
  let match;
  while ((match = sceneHeadingRegex.exec(rawText)) !== null) {
    const heading = match[1].trim();
    if (heading.length > 2 && heading.length < 50) {
      addLoc(heading, 'scene', 'Scene Heading');
    }
  }

  // 3. Match Building Types (from catalog TYPES)
  for (const [key, meta] of Object.entries(TYPES)) {
    const label = meta.label;
    if (label) {
      const regex = new RegExp(`\\b${label.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(rawText)) {
        addLoc(label, key, 'Property Type');
      }
    }
  }

  // 4. Match Scenery & Environment Keywords (e.g. skyscrapers, beaches, coastline, mountains)
  for (const kw of SCENERY_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(rawText)) {
      const formatted = kw.charAt(0).toUpperCase() + kw.slice(1);
      addLoc(formatted, 'feature', 'Environment');
    }
  }

  // 5. Match dollar-amount budget patterns (e.g. $500/day or $1,200)
  const dollarRegex = /\$\d{1,3}(?:,\d{3})*(?:\/day)?/gi;
  const budgetMatches = rawText.match(dollarRegex) || [];
  budgetMatches.forEach(m => {
    addLoc(m, 'budget', 'Budget');
  });

  return locations;
}
