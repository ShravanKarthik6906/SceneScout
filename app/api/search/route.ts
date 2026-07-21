import { NextRequest, NextResponse } from "next/server";

// Photographic/film location categories
const MOCK_LOCATIONS = [
  {
    place_id: "mock_001",
    name: "Bethlehem Steel Works",
    address: "Bethlehem, PA 18015, USA",
    lat: 40.6148,
    lng: -75.3698,
    photo_url: "https://images.unsplash.com/photo-1545486332-9e0999c535b2?w=800&q=80",
    types: ["warehouse", "establishment"],
    location_category: "industrial",
    size_category: "large",
    sqft: 48000,
    rating: 4.5,
    distance_miles: 4.2,
    street_view_url: null,
    ai_description:
      "A cathedral of rust and ambition — crumbling blast furnaces loom against the sky like the bones of a dead giant.",
    rooms: [
      { label: "Main Furnace Hall", url: "https://images.unsplash.com/photo-1545486332-9e0999c535b2?w=1600&q=85" },
      { label: "Control Room", url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=85" },
      { label: "Loading Bay", url: "https://images.unsplash.com/photo-1566438480900-0609be27a4be?w=1600&q=85" },
      { label: "Rooftop Catwalk", url: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_002",
    name: "Salton Sea Shoreline",
    address: "Salton City, CA 92275, USA",
    lat: 33.3297,
    lng: -115.9124,
    photo_url: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&q=80",
    types: ["natural_feature", "park"],
    location_category: "outdoor",
    size_category: "large",
    sqft: null,
    rating: 3.9,
    distance_miles: 18.7,
    street_view_url: null,
    ai_description:
      "Post-apocalyptic stillness — cracked white earth, bleached fish bones, and a toxic lake shimmering under relentless California sun.",
    rooms: [
      { label: "Shoreline North", url: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1600&q=85" },
      { label: "Abandoned Marina", url: "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_003",
    name: "Bannerman Island Castle",
    address: "Pollepel Island, Hudson River, NY, USA",
    lat: 41.4623,
    lng: -73.9885,
    photo_url: "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=800&q=80",
    types: ["tourist_attraction", "establishment"],
    location_category: "historic",
    size_category: "medium",
    sqft: 12000,
    rating: 4.7,
    distance_miles: 7.1,
    street_view_url: null,
    ai_description:
      "A crumbling Scottish-style castle marooned mid-river — ivy-strangled turrets rising from the Hudson like something half-remembered from a fever dream.",
    rooms: [
      { label: "Great Hall", url: "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=1600&q=85" },
      { label: "East Tower", url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=85" },
      { label: "Courtyard", url: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_004",
    name: "Centralia Mine Fire Ghost Town",
    address: "Centralia, PA 17927, USA",
    lat: 40.7984,
    lng: -76.3402,
    photo_url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    types: ["locality", "natural_feature"],
    location_category: "outdoor",
    size_category: "large",
    sqft: null,
    rating: 4.2,
    distance_miles: 11.3,
    street_view_url: null,
    ai_description:
      "Steam seeps through cracked asphalt on empty streets — a town consumed by an underground fire that has burned since 1962.",
    rooms: [
      { label: "Route 61 Crack", url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=85" },
      { label: "Steam Vents Hill", url: "https://images.unsplash.com/photo-1545486332-9e0999c535b2?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_005",
    name: "Detroit Packard Plant",
    address: "E Grand Blvd, Detroit, MI 48211, USA",
    lat: 42.387,
    lng: -83.0352,
    photo_url: "https://images.unsplash.com/photo-1566438480900-0609be27a4be?w=800&q=80",
    types: ["warehouse", "establishment"],
    location_category: "industrial",
    size_category: "large",
    sqft: 340000,
    rating: 4.1,
    distance_miles: 2.9,
    street_view_url: null,
    ai_description:
      "Forty acres of industrial ruin — graffiti-tagged concrete columns, collapsed floors, and light falling through shattered skylights in cathedral shafts.",
    rooms: [
      { label: "Assembly Floor A", url: "https://images.unsplash.com/photo-1566438480900-0609be27a4be?w=1600&q=85" },
      { label: "Skylight Hall", url: "https://images.unsplash.com/photo-1545486332-9e0999c535b2?w=1600&q=85" },
      { label: "Graffiti Corridor", url: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=1600&q=85" },
      { label: "Rooftop", url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_006",
    name: "Maunsell Sea Forts",
    address: "Thames Estuary, Essex, UK",
    lat: 51.4837,
    lng: 1.0257,
    photo_url: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=800&q=80",
    types: ["tourist_attraction", "natural_feature"],
    location_category: "industrial",
    size_category: "small",
    sqft: 3200,
    rating: 4.4,
    distance_miles: 22.4,
    street_view_url: null,
    ai_description:
      "WWII anti-aircraft platforms standing on spider legs in the sea — rusted, desolate, and utterly otherworldly against a grey North Sea sky.",
    rooms: [
      { label: "Platform Deck", url: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=1600&q=85" },
      { label: "Gun Tower", url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_007",
    name: "Abandoned Beelitz Sanatorium",
    address: "Beelitz, Brandenburg, Germany",
    lat: 52.2337,
    lng: 12.9145,
    photo_url: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800&q=80",
    types: ["establishment", "museum"],
    location_category: "interior",
    size_category: "large",
    sqft: 60000,
    rating: 4.6,
    distance_miles: 15.0,
    street_view_url: null,
    ai_description:
      "Ornate early 20th-century wards draped in peeling paint and silence — where Hitler once convalesced and where time itself seems to have decomposed.",
    rooms: [
      { label: "Main Ward", url: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1600&q=85" },
      { label: "Operating Theatre", url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1600&q=85" },
      { label: "Corridor B", url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=85" },
      { label: "Rooftop Garden", url: "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_008",
    name: "Mojave Air & Space Port Boneyard",
    address: "Mojave, CA 93501, USA",
    lat: 35.0594,
    lng: -118.1517,
    photo_url: "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800&q=80",
    types: ["establishment", "natural_feature"],
    location_category: "outdoor",
    size_category: "large",
    sqft: null,
    rating: 4.3,
    distance_miles: 9.5,
    street_view_url: null,
    ai_description:
      "Rows of decommissioned passenger jets baking under desert sun — a graveyard of aluminum and jet fuel dreams stretching to the horizon.",
    rooms: [
      { label: "Fuselage Row Alpha", url: "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=1600&q=85" },
      { label: "Tail Graveyard", url: "https://images.unsplash.com/photo-1566438480900-0609be27a4be?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_009",
    name: "Volta Redonda Art Deco Theater",
    address: "Rio de Janeiro, Brazil",
    lat: -22.5232,
    lng: -44.1,
    photo_url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
    types: ["establishment", "museum"],
    location_category: "interior",
    size_category: "medium",
    sqft: 8500,
    rating: 4.8,
    distance_miles: 6.4,
    street_view_url: null,
    ai_description:
      "A gilded Art Deco interior frozen in 1940 — velvet seats, ornate plaster balconies, and a ghost-light stage waiting for the curtain that never came down.",
    rooms: [
      { label: "Main Stage", url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1600&q=85" },
      { label: "Mezzanine", url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=85" },
      { label: "Backstage", url: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_010",
    name: "Los Angeles Concrete River Channel",
    address: "Los Angeles River, CA, USA",
    lat: 34.0522,
    lng: -118.2437,
    photo_url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80",
    types: ["natural_feature", "park"],
    location_category: "urban",
    size_category: "large",
    sqft: null,
    rating: 4.0,
    distance_miles: 3.1,
    street_view_url: null,
    ai_description:
      "Miles of raw concrete channeled beneath overpasses and bridges — the quintessential LA car chase backdrop with a dystopian brutalist grandeur.",
    rooms: [
      { label: "Sixth St Bridge Section", url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=85" },
      { label: "Compton Narrows", url: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_011",
    name: "Letchworth Village Ruins",
    address: "Thiells, NY 10984, USA",
    lat: 41.2015,
    lng: -74.0232,
    photo_url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80",
    types: ["establishment", "natural_feature"],
    location_category: "interior",
    size_category: "large",
    sqft: 95000,
    rating: 4.2,
    distance_miles: 8.6,
    street_view_url: null,
    ai_description:
      "The crumbling colony — red-brick dormitories reclaimed by trees, peeling linoleum, and the weight of a deeply troubled American history.",
    rooms: [
      { label: "Dormitory Wing 3", url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1600&q=85" },
      { label: "Chapel Interior", url: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=1600&q=85" },
      { label: "Infirmary Hall", url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=1600&q=85" },
    ],
  },
  {
    place_id: "mock_012",
    name: "Red Hook Grain Terminal",
    address: "Red Hook, Brooklyn, NY 11231, USA",
    lat: 40.6753,
    lng: -74.0182,
    photo_url: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=800&q=80",
    types: ["warehouse", "establishment"],
    location_category: "industrial",
    size_category: "medium",
    sqft: 22000,
    rating: 4.5,
    distance_miles: 1.8,
    street_view_url: null,
    ai_description:
      "Monolithic concrete grain silos looming over the East River — brutal minimalist architecture with jaw-dropping Manhattan skyline framing.",
    rooms: [
      { label: "Silo Interior", url: "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=1600&q=85" },
      { label: "Dock Level", url: "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=1600&q=85" },
      { label: "Rooftop with View", url: "https://images.unsplash.com/photo-1566438480900-0609be27a4be?w=1600&q=85" },
    ],
  },
];

const CATEGORY_FILTER_MAP: Record<string, string[]> = {
  industrial: ["industrial"],
  outdoor: ["outdoor"],
  interior: ["interior", "historic"],
  urban: ["urban"],
  historic: ["historic", "interior"],
  all: [],
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(request: NextRequest) {
  const { prompt, radius, locationType, sizeCategory } = await request.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  await sleep(900);

  let filtered = [...MOCK_LOCATIONS];

  // Filter by radius
  if (radius && radius < 50) {
    filtered = filtered.filter((l) => (l.distance_miles ?? 99) <= radius);
  }

  // Filter by location type
  if (locationType && locationType !== "all") {
    const allowedCats = CATEGORY_FILTER_MAP[locationType] ?? [];
    if (allowedCats.length > 0) {
      filtered = filtered.filter((l) => allowedCats.includes(l.location_category ?? ""));
    }
  }

  // Filter by size
  if (sizeCategory && sizeCategory !== "all") {
    filtered = filtered.filter((l) => l.size_category === sizeCategory);
  }

  // Shuffle deterministically based on prompt seed
  const seed = prompt.length % Math.max(filtered.length, 1);
  const results = [...filtered.slice(seed), ...filtered.slice(0, seed)];

  return NextResponse.json({ results });
}
