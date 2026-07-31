// Procedural floor-plan generator.
//
// scripts/build-catalog.js bakes one of 8 fixed room templates into every
// Kaggle-derived listing regardless of its real sqft — a 309 sqft studio and
// a 6,000 sqft house of the same `type` get the identical layout. That's the
// generic-across-899-locations gap this module closes: it derives room
// count, sizing, and adjacency from each location's real sqft/ceilingFt, is
// seeded per-location id so a listing renders identically every time, and
// never produces zero rooms or an empty result regardless of input.
//
// tour.js decides whether to use this (see resolveFloorplan there) — the
// original hand-authored data.js locations keep their authored floorplan;
// every Kaggle-derived listing (anything with `_source` set) is generated
// here instead.

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SQM_PER_SQFT = 0.092903;
const FT_TO_M = 0.3048;
const CORRIDOR_D = 1.7;
const DEFAULT_CEILING_M = 2.7;

// Sane bounds for LAYOUT purposes only (never shown in the UI, which keeps
// using the location's real sqft stat) — the Zillow set has at least one
// obviously-bad row (473,391 sqft for a "house"); without a clamp that
// would generate a building the size of a stadium.
const MIN_TOTAL_SQM = 12;
const MAX_TOTAL_SQM = 1800;

// Target depth (m) per semantic category when packing rows — anchor/public
// rooms read deeper, support rooms shallower, matching how real floor plans
// read.
const CATEGORY_DEPTH = {
  living: 6.2, sleeping: 3.6, cooking: 4.4, bathing: 2.3, work: 4.8,
  circulation: CORRIDOR_D, storage: 2.6, outdoor: 5.4, unknown: 4.2,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ------------------------------------------------------- per-type programs
// Each returns an array of { category, style, areaSqm } sized off the
// clamped total area. Every function is robust to a tiny (or huge) budget:
// optional rooms drop out below their threshold rather than shrinking to
// nothing, and there's always at least one room.
const PROGRAMS = {
  house(sqm) {
    if (sqm < 32) return [{ category: 'living', style: 'living', areaSqm: sqm }];
    const rooms = [
      { category: 'living', style: 'living', areaSqm: clamp(sqm * 0.28, 12, 34) },
      { category: 'cooking', style: 'kitchen', areaSqm: clamp(sqm * 0.16, 9, 22) },
    ];
    const bedBudget = Math.max(0, sqm - rooms[0].areaSqm - rooms[1].areaSqm);
    const bedCount = clamp(Math.round(bedBudget / 42), 1, 6);
    const bedArea = clamp(bedBudget / bedCount, 9, 20);
    for (let i = 0; i < bedCount; i++) rooms.push({ category: 'sleeping', style: 'bed', areaSqm: bedArea });
    const bathCount = clamp(Math.round(bedCount / 2), 1, 3);
    for (let i = 0; i < bathCount; i++) rooms.push({ category: 'bathing', style: 'bath', areaSqm: clamp(sqm * 0.03, 4, 7) });
    if (sqm > 260) rooms.push({ category: 'work', style: 'office', areaSqm: clamp(sqm * 0.08, 9, 16) });
    return rooms;
  },
  studio(sqm) {
    const rooms = [{ category: 'work', style: 'studio', areaSqm: clamp(sqm * 0.58, 30, 260) }];
    if (sqm > 60) rooms.push({ category: 'work', style: 'control', areaSqm: clamp(sqm * 0.14, 12, 30) });
    if (sqm > 90) rooms.push({ category: 'work', style: 'makeup', areaSqm: clamp(sqm * 0.12, 10, 24) });
    if (sqm > 140) rooms.push({ category: 'living', style: 'lounge', areaSqm: clamp(sqm * 0.12, 10, 26) });
    return rooms;
  },
  warehouse(sqm) {
    const rooms = [{ category: 'work', style: 'warehouse', areaSqm: clamp(sqm * 0.72, 40, 900) }];
    if (sqm > 150) rooms.push({ category: 'work', style: 'office', areaSqm: clamp(sqm * 0.1, 12, 40) });
    if (sqm > 300) rooms.push({ category: 'work', style: 'shop', areaSqm: clamp(sqm * 0.14, 16, 60) });
    return rooms;
  },
  loft(sqm) {
    const rooms = [{ category: 'living', style: 'loft', areaSqm: clamp(sqm * 0.68, 26, 260) }];
    if (sqm > 80) rooms.push({ category: 'cooking', style: 'kitchen', areaSqm: clamp(sqm * 0.13, 9, 24) });
    if (sqm > 150) rooms.push({ category: 'living', style: 'lounge', areaSqm: clamp(sqm * 0.13, 10, 26) });
    return rooms;
  },
  estate(sqm) {
    const rooms = [
      { category: 'living', style: 'ballroom', areaSqm: clamp(sqm * 0.3, 20, 120) },
      { category: 'circulation', style: 'foyer', areaSqm: clamp(sqm * 0.14, 10, 40) },
    ];
    if (sqm > 250) rooms.push({ category: 'living', style: 'library', areaSqm: clamp(sqm * 0.11, 12, 32) });
    if (sqm > 250) rooms.push({ category: 'living', style: 'dining', areaSqm: clamp(sqm * 0.1, 10, 28) });
    if (sqm > 400) rooms.push({ category: 'outdoor', style: 'conservatory', areaSqm: clamp(sqm * 0.12, 12, 32) });
    return rooms;
  },
  rooftop(sqm) {
    const rooms = [{ category: 'outdoor', style: 'deck', areaSqm: clamp(sqm * 0.62, 20, 200) }];
    if (sqm > 60) rooms.push({ category: 'living', style: 'lounge', areaSqm: clamp(sqm * 0.18, 10, 30) });
    if (sqm > 100) rooms.push({ category: 'outdoor', style: 'deck', areaSqm: clamp(sqm * 0.2, 12, 60) });
    return rooms;
  },
  storefront(sqm) {
    const rooms = [{ category: 'living', style: 'bar', areaSqm: clamp(sqm * 0.55, 24, 160) }];
    if (sqm > 100) rooms.push({ category: 'living', style: 'lounge', areaSqm: clamp(sqm * 0.2, 12, 40) });
    if (sqm > 150) rooms.push({ category: 'cooking', style: 'kitchen', areaSqm: clamp(sqm * 0.15, 9, 24) });
    return rooms;
  },
  gallery(sqm) {
    const rooms = [{ category: 'living', style: 'gallery', areaSqm: clamp(sqm * 0.5, 24, 160) }];
    if (sqm > 120) rooms.push({ category: 'living', style: 'gallery', areaSqm: clamp(sqm * 0.28, 16, 90) });
    if (sqm > 180) rooms.push({ category: 'work', style: 'office', areaSqm: clamp(sqm * 0.12, 9, 24) });
    return rooms;
  },
  // Any type not in this table (a future TYPES addition, or a synthetic
  // debug/test location) — never crash, never render empty.
  default(sqm) {
    return [{ category: 'unknown', style: 'unknown', areaSqm: sqm }];
  },
};

// ------------------------------------------------------------ row packing
// Places a group of same-row rooms left-to-right at a shared depth (the max
// category depth in the group, so the row reads as a clean rectangle) and
// returns their placed geometry plus the row's total width.
function packRow(items, x0, z0, rand) {
  const depth = clamp(Math.max(...items.map(it => CATEGORY_DEPTH[it.category] || CATEGORY_DEPTH.unknown)), 2.2, 8);
  let x = x0;
  const placed = [];
  for (const it of items) {
    const w = clamp(it.areaSqm / depth, 2.2, 22);
    placed.push({ ...it, x, z: z0, w, d: depth });
    x += w;
  }
  return { placed, width: x - x0, depth };
}

// Distributes rooms into two rows (north/south) balancing total area, so
// neither side runs drastically longer than the other.
function splitRows(items) {
  const north = [], south = [];
  let northArea = 0, southArea = 0;
  for (const it of [...items].sort((a, b) => b.areaSqm - a.areaSqm)) {
    if (northArea <= southArea) { north.push(it); northArea += it.areaSqm; }
    else { south.push(it); southArea += it.areaSqm; }
  }
  return { north, south };
}

// Builds { rooms, doors } for a resolved program. Handles 1, 2-3, and 4+
// room counts with different (but equally robust) strategies; every branch
// guarantees full connectivity from the first room.
function layoutRooms(program, ceilingM, rand) {
  const rooms = [];
  const doors = [];

  if (program.length === 1) {
    const it = program[0];
    const depth = clamp(CATEGORY_DEPTH[it.category] || CATEGORY_DEPTH.unknown, 2.4, 9);
    const w = clamp(it.areaSqm / depth, 2.4, 30);
    rooms.push(mkRoom(it, 0, 0, w, depth, ceilingM, rand));
    return { rooms, doors };
  }

  if (program.length <= 3) {
    const { placed, depth } = packRow(program, 0, 0, rand);
    for (const p of placed) rooms.push(mkRoom(p, p.x, p.z, p.w, p.d ?? depth, ceilingM, rand));
    for (let i = 0; i < rooms.length - 1; i++) {
      const a = rooms[i], b = rooms[i + 1];
      doors.push({ x: b.x, z: (a.z + a.d / 2), dir: 'v', width: Math.min(1.5, a.h > 0 ? Math.min(a.d, b.d) * 0.55 : 1.3) });
    }
    return { rooms, doors };
  }

  // 4+ rooms: spine-corridor layout — every room borders the corridor
  // directly, so connectivity from the spawn point is guaranteed by
  // construction rather than needing a separate reachability check.
  const { north, south } = splitRows(program);
  const nr = packRow(north.length ? north : [program[0]], 0, 0, rand);
  const corridorZ = nr.depth;
  const sr = packRow(south, 0, corridorZ + CORRIDOR_D, rand);
  const corridorW = Math.max(nr.width, sr.width, 4);

  for (const p of nr.placed) {
    const room = mkRoom(p, p.x, 0, p.w, nr.depth, ceilingM, rand, ['n']);
    rooms.push(room);
    doors.push({ x: p.x + p.w / 2, z: nr.depth, dir: 'h', width: Math.min(1.4, p.w * 0.55) });
  }
  for (const p of sr.placed) {
    const room = mkRoom(p, p.x, corridorZ + CORRIDOR_D, p.w, sr.depth, ceilingM, rand, ['s']);
    rooms.push(room);
    doors.push({ x: p.x + p.w / 2, z: corridorZ + CORRIDOR_D, dir: 'h', width: Math.min(1.4, p.w * 0.55) });
  }
  rooms.push(mkRoom(
    { category: 'circulation', style: 'hall', areaSqm: corridorW * CORRIDOR_D },
    0, corridorZ, corridorW, CORRIDOR_D, ceilingM, rand, [],
  ));

  return { rooms, doors };
}

const ROOM_NAMES = {
  living: 'Living Room', lounge: 'Lounge', loft: 'Main Loft', kitchen: 'Kitchen',
  bed: 'Bedroom', bath: 'Bathroom', office: 'Office', control: 'Control Room',
  makeup: 'Makeup', studio: 'Stage', warehouse: 'Main Floor', shop: 'Workshop',
  gallery: 'Gallery', bar: 'Main Room', ballroom: 'Ballroom', foyer: 'Foyer',
  library: 'Library', dining: 'Dining Room', conservatory: 'Conservatory',
  deck: 'Deck', hall: 'Hallway', storage: 'Storage', unknown: 'Room',
};
let roomCounter = 0;

function mkRoom(it, x, z, w, d, ceilingM, rand, exteriorEdges) {
  roomCounter++;
  const outdoor = it.category === 'outdoor';
  const room = {
    name: ROOM_NAMES[it.style] || 'Room',
    x, z, w, d, h: outdoor ? Math.min(ceilingM, 3.2) : ceilingM,
    style: it.style,
  };
  if (outdoor) room.open = true;
  // Windows only on edges we know are exterior (not shared with another
  // room / the corridor); interior circulation gets none.
  const edges = exteriorEdges || ['n', 's', 'e', 'w'];
  if (it.category !== 'circulation' && edges.length) {
    room.win = {};
    const count = clamp(Math.round(Math.max(w, d) / 3.2), 1, 4);
    for (const e of edges) room.win[e] = count;
    if (w > 8 && (it.style === 'studio' || it.style === 'gallery' || it.style === 'warehouse' || it.style === 'loft')) {
      room.sky = clamp(Math.round(w / 6), 1, 3);
    }
  }
  return room;
}

// --------------------------------------------------------------- entry point
export function generateFloorplan(location) {
  const rand = mulberry32(hashStr(String(location.id || location.name || 'listing')));
  const sqft = Number(location.sqft);
  const sqm = clamp((Number.isFinite(sqft) && sqft > 0 ? sqft : 900) * SQM_PER_SQFT, MIN_TOTAL_SQM, MAX_TOTAL_SQM);
  const ceilingFt = Number(location.ceilingFt);
  const ceilingM = clamp((Number.isFinite(ceilingFt) && ceilingFt > 0 ? ceilingFt : 9) * FT_TO_M, 2.3, 10);

  const programFn = PROGRAMS[location.type] || PROGRAMS.default;
  let program = programFn(sqm, rand);
  if (!program.length) program = PROGRAMS.default(sqm); // belt-and-braces: never zero rooms

  return layoutRooms(program, ceilingM, rand);
}

// ------------------------------------------------------------- debug layouts
// Synthetic locations for the debug tour route (see app.js) — used to
// verify generality (1 room, many rooms, tiny, huge) without depending on
// real data.
export const DEBUG_LOCATIONS = {
  studio: mkDebugListing('debug-studio', 'Debug: 1-Room Studio', 'studio', 420, 11, '#7fb4ff'),
  large: mkDebugListing('debug-large-house', 'Debug: Large Multi-Room House', 'house', 6200, 10, '#7aa874'),
  // A wide size spread across 5 very different rooms (huge ballroom next to
  // a small library) so the aggregate footprint reads as genuinely
  // irregular/stepped, not just "a rectangle with more rooms in it".
  irregular: mkDebugListing('debug-irregular', 'Debug: Irregular Estate', 'estate', 5000, 15, '#d4b96a'),
  windowless: mkDebugListing('debug-windowless', 'Debug: Windowless Single Room', 'unknown-type', 260, 9, '#9aa7b8'),
};
// Hand-built edge case, not run through the generator: a single room with
// zero windows on every wall, to verify rendering/lighting never depends on
// a room having at least one window.
DEBUG_LOCATIONS.windowless._forceFloorplan = {
  rooms: [{ name: 'Sealed Room', x: 0, z: 0, w: 5, d: 5, h: 2.7, style: 'unknown', win: {} }],
  doors: [],
};

function mkDebugListing(id, name, type, sqft, ceilingFt, accent) {
  return {
    id, name, type, neighborhood: 'Debug', address: 'Synthetic test location',
    lat: 0, lng: 0, sqft, ceilingFt, rate: 0, light: 'moderate',
    tags: ['debug layout'], desc: 'Synthetic layout for verifying the generator.',
    palette: { wall: '#8d8d94', floor: '#6e6a63', accent },
    outdoor: type === 'rooftop', _source: 'debug',
  };
}
