"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useScoutStore } from "@/store/scoutStore";
import LocationCard from "@/components/LocationCard";
import nextDynamic from "next/dynamic";

const LocationDetailModal = nextDynamic(() => import("@/components/LocationDetailModal"), { ssr: false });

const LOCATION_TYPES = [
  { value: "all", label: "All Types" },
  { value: "industrial", label: "Industrial" },
  { value: "outdoor", label: "Outdoor" },
  { value: "interior", label: "Interior" },
  { value: "urban", label: "Urban" },
  { value: "historic", label: "Historic" },
];

const SIZE_OPTIONS = [
  { value: "all", label: "Any Size" },
  { value: "small", label: "Small (<5k sqft)" },
  { value: "medium", label: "Medium (5k–20k sqft)" },
  { value: "large", label: "Large (20k+ sqft)" },
];

function SearchPageInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [prompt, setPrompt] = useState(initialQ);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const {
    results, setResults,
    selectedLocation, isDetailOpen, setIsDetailOpen,
    radius, setRadius,
    locationType, setLocationType,
    sizeCategory, setSizeCategory,
  } = useScoutStore();

  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch(q = prompt) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q, radius, locationType, sizeCategory }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results ?? []);
    } catch (err) {
      setError((err as Error).message ?? "Search failed");
    } finally {
      setLoading(false);
    }
  }

  // Auto-search if URL query param provided
  useEffect(() => {
    if (initialQ) handleSearch(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilterCount = [
    radius !== 25 ? 1 : 0,
    locationType !== "all" ? 1 : 0,
    sizeCategory !== "all" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* ── Search bar ── */}
      <div className="max-w-3xl mx-auto mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4 text-center">Scout a Location</h1>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Describe the space you need — type, mood, features…"
            className="flex-1 border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 rounded-2xl px-5 py-3.5 text-sm outline-none transition-all bg-white"
          />
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`relative px-4 py-3.5 rounded-2xl border font-medium text-sm transition-colors ${
              filtersOpen || activeFilterCount > 0
                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
            title="Filters"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-indigo-600 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => handleSearch()}
            disabled={loading || !prompt.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3.5 rounded-2xl font-medium text-sm transition-colors min-w-[90px]"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              "Search"
            )}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}

        {/* ── Filters panel ── */}
        {filtersOpen && (
          <div className="mt-3 bg-white border border-gray-200 rounded-2xl p-5 shadow-md space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Radius */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Radius: <span className="text-indigo-600 font-bold">{radius} mi</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={radius}
                  onChange={(e) => setRadius(+e.target.value)}
                  className="w-full accent-indigo-600 h-1.5 rounded-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1 mi</span>
                  <span>50 mi</span>
                </div>
              </div>

              {/* Location Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Location Type
                </label>
                <select
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                >
                  {LOCATION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Size */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Space Size
                </label>
                <select
                  value={sizeCategory}
                  onChange={(e) => setSizeCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                >
                  {SIZE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-gray-100">
              <button
                onClick={() => {
                  setRadius(25);
                  setLocationType("all");
                  setSizeCategory("all");
                }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Reset filters
              </button>
              <button
                onClick={() => { setFiltersOpen(false); if (prompt.trim()) handleSearch(); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors"
              >
                Apply &amp; Search
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Loading skeletons ── */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-200">
              <div className="h-48 bg-gray-100 animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
                <div className="h-12 bg-gray-50 rounded animate-pulse mt-3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Results ── */}
      {!loading && results.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-400">
              {results.length} location{results.length !== 1 ? "s" : ""} found
              {radius < 50 && ` within ${radius} mi`}
              {locationType !== "all" && ` · ${locationType}`}
              {sizeCategory !== "all" && ` · ${sizeCategory} spaces`}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {results.map((loc) => (
              <LocationCard key={loc.place_id} location={loc} />
            ))}
          </div>
        </>
      )}

      {/* ── Empty state ── */}
      {!loading && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <span className="text-5xl mb-4">🎬</span>
          <p className="text-base font-medium">Describe a location to get started</p>
          <p className="text-sm mt-1 text-gray-300">
            Try &ldquo;gritty industrial warehouse&rdquo; or &ldquo;ornate Art Deco theater interior&rdquo;
          </p>
        </div>
      )}

      {/* ── No results after filter ── */}
      {!loading && results.length === 0 && !error && activeFilterCount > 0 && prompt.trim() && (
        <div className="mt-4 text-center text-sm text-gray-400">
          Try relaxing your filters — widen the radius or change the type.
        </div>
      )}

      {/* ── Location Detail Modal ── */}
      {isDetailOpen && selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => setIsDetailOpen(false)}
        />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}
