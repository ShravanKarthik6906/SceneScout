"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import LocationCard from "@/components/LocationCard";
import { useScoutStore, LocationResult } from "@/store/scoutStore";
import nextDynamic from "next/dynamic";
import ZillowPanel from "@/components/ZillowPanel";
import Link from "next/link";

const EarthViewer = nextDynamic(() => import("@/components/EarthViewer"), { ssr: false });

interface Board {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  share_slug: string;
}

interface BoardLocation {
  id: string;
  place_id: string;
  place_name: string;
  place_address: string;
  place_photo_url: string;
  lat: number;
  lng: number;
  notes: string | null;
}

function boardLocationToResult(bl: BoardLocation): LocationResult {
  return {
    place_id: bl.place_id,
    name: bl.place_name,
    address: bl.place_address,
    lat: bl.lat,
    lng: bl.lng,
    photo_url: bl.place_photo_url,
    types: [],
    ai_description: bl.notes ?? "",
  };
}

export default function BoardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [locations, setLocations] = useState<BoardLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const { selectedLocation, isEarthOpen, setIsEarthOpen, isZillowOpen, setIsZillowOpen } =
    useScoutStore();

  useEffect(() => {
    fetch(`/api/boards/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setBoard(d.board);
        setLocations(d.board?.board_locations ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function togglePublic() {
    if (!board) return;
    const res = await fetch(`/api/boards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_public: !board.is_public }),
    });
    const { board: updated } = await res.json();
    setBoard(updated);
  }

  function copyShareLink() {
    if (!board) return;
    navigator.clipboard.writeText(`${window.location.origin}/share/${board.share_slug}`);
  }

  async function deleteBoard() {
    if (!confirm("Delete this board?")) return;
    await fetch(`/api/boards/${id}`, { method: "DELETE" });
    router.push("/dashboard/boards");
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="h-8 bg-gray-100 rounded w-48 mb-4 animate-pulse" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl h-64 animate-pulse border border-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400">
        <p className="text-xl">Board not found</p>
        <Link href="/dashboard/boards" className="text-indigo-600 hover:underline text-sm mt-2 block">
          ← Back to boards
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/dashboard/boards" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Boards
        </Link>
      </div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{board.name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {locations.length} saved location{locations.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={togglePublic}
            className={`text-xs font-medium px-4 py-2 rounded-xl border transition-colors ${
              board.is_public
                ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                : "bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {board.is_public ? "🔓 Public" : "🔒 Private"}
          </button>
          {board.is_public && (
            <button
              onClick={copyShareLink}
              className="text-xs font-medium px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              🔗 Copy Link
            </button>
          )}
          <button
            onClick={deleteBoard}
            className="text-xs font-medium px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {locations.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <div className="text-5xl mb-4">📍</div>
          <p>No locations saved yet.</p>
          <Link href="/search" className="text-indigo-600 hover:underline text-sm mt-2 block">
            Find locations →
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {locations.map((loc) => (
            <LocationCard key={loc.id} location={boardLocationToResult(loc)} />
          ))}
        </div>
      )}

      {isEarthOpen && selectedLocation && (
        <EarthViewer location={selectedLocation} onClose={() => setIsEarthOpen(false)} />
      )}
      {isZillowOpen && selectedLocation && (
        <ZillowPanel location={selectedLocation} onClose={() => setIsZillowOpen(false)} />
      )}
    </div>
  );
}
