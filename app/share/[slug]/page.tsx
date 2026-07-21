export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import LocationCard from "@/components/LocationCard";
import { LocationResult } from "@/store/scoutStore";

// Mock shared board for demo — in production this fetches from Supabase by share_slug
const MOCK_SHARED_BOARD = {
  name: "Pacific Coast Road Trip",
  description: "Stunning coastal locations for our upcoming short film.",
  locations: [
    {
      id: "sl1",
      place_id: "mock_s01",
      place_name: "Big Sur Coastline",
      place_address: "Big Sur, CA 93920, USA",
      place_photo_url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80",
      lat: 36.2704,
      lng: -121.8081,
      notes: "Dramatic cliffs meeting turquoise water — golden hour here is unmatched.",
    },
    {
      id: "sl2",
      place_id: "mock_s02",
      place_name: "Point Reyes National Seashore",
      place_address: "Point Reyes Station, CA 94956, USA",
      place_photo_url: "https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?w=800&q=80",
      lat: 38.0416,
      lng: -122.9938,
      notes: "Sweeping fog-covered headlands and a historic lighthouse — ethereal and timeless.",
    },
    {
      id: "sl3",
      place_id: "mock_s03",
      place_name: "Pfeiffer Beach",
      place_address: "Pfeiffer Beach, Big Sur, CA, USA",
      place_photo_url: "https://images.unsplash.com/photo-1439066290691-ddef17d67d19?w=800&q=80",
      lat: 36.2399,
      lng: -121.8173,
      notes: "Purple sand, sea arches, crashing waves — a location scout's dream.",
    },
  ],
};

function toResult(loc: typeof MOCK_SHARED_BOARD.locations[0]): LocationResult {
  return {
    place_id: loc.place_id,
    name: loc.place_name,
    address: loc.place_address,
    lat: loc.lat,
    lng: loc.lng,
    photo_url: loc.place_photo_url,
    types: [],
    ai_description: loc.notes ?? "",
  };
}

export default function SharePage({ params }: { params: { slug: string } }) {
  // In mock mode, any slug renders the demo board
  if (!params.slug) notFound();

  const board = MOCK_SHARED_BOARD;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <div className="inline-block bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full mb-3">
          📋 Shared Shoot Board
        </div>
        <h1 className="text-3xl font-bold text-gray-900">{board.name}</h1>
        <p className="text-gray-500 mt-2">{board.description}</p>
        <p className="text-gray-400 text-sm mt-1">
          {board.locations.length} locations
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {board.locations.map((loc) => (
          <LocationCard key={loc.id} location={toResult(loc)} />
        ))}
      </div>
    </div>
  );
}
