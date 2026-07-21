"use client";

import { LocationResult, useScoutStore } from "@/store/scoutStore";
import { useState } from "react";
import SaveToBoard from "./SaveToBoard";
import { useUser } from "@/hooks/useUser";

interface LocationCardProps {
  location: LocationResult;
}

const CAT_COLORS: Record<string, string> = {
  industrial: "bg-orange-50 text-orange-700 border-orange-100",
  outdoor: "bg-green-50 text-green-700 border-green-100",
  interior: "bg-blue-50 text-blue-700 border-blue-100",
  urban: "bg-purple-50 text-purple-700 border-purple-100",
  historic: "bg-amber-50 text-amber-700 border-amber-100",
};

const CAT_LABELS: Record<string, string> = {
  industrial: "Industrial",
  outdoor: "Outdoor",
  interior: "Interior",
  urban: "Urban",
  historic: "Historic",
};

const SIZE_ICONS: Record<string, string> = {
  small: "▪",
  medium: "◆",
  large: "■",
};

export default function LocationCard({ location }: LocationCardProps) {
  const { setSelectedLocation, setIsDetailOpen, setActiveViewMode } = useScoutStore();
  const { user } = useUser();
  const [saveOpen, setSaveOpen] = useState(false);

  function openDetail(mode: "aerial" | "street" | "indoor" = "aerial") {
    setSelectedLocation(location);
    setActiveViewMode(mode);
    setIsDetailOpen(true);
  }

  const catColor = location.location_category
    ? CAT_COLORS[location.location_category] ?? "bg-gray-100 text-gray-600 border-gray-200"
    : "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <>
      <div className="bg-white rounded-2xl overflow-hidden border border-gray-200 hover:shadow-xl hover:-translate-y-0.5 transition-all flex flex-col">
        {/* Photo */}
        <div className="relative h-48 bg-gray-100 cursor-pointer" onClick={() => openDetail("aerial")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={location.photo_url}
            alt={location.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/placeholder-location.jpg";
            }}
          />

          {/* Category pill */}
          {location.location_category && (
            <span className={`absolute top-2 left-2 text-xs font-semibold px-2.5 py-1 rounded-full border ${catColor}`}>
              {CAT_LABELS[location.location_category] ?? location.location_category}
            </span>
          )}

          {/* Rating */}
          {location.rating && (
            <span className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm text-gray-700 text-xs font-medium px-2.5 py-1 rounded-full">
              ★ {location.rating.toFixed(1)}
            </span>
          )}

          {/* View count badge (rooms) */}
          {location.rooms && location.rooms.length > 0 && (
            <span className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full">
              🏛 {location.rooms.length} spaces
            </span>
          )}
        </div>

        {/* Info */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-semibold text-gray-900 text-base leading-tight">{location.name}</h3>
          <p className="text-gray-400 text-xs mt-0.5 truncate">{location.address}</p>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {location.sqft && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                {location.sqft.toLocaleString()} sqft
              </span>
            )}
            {location.size_category && (
              <span className="flex items-center gap-0.5">
                <span>{SIZE_ICONS[location.size_category]}</span>
                {location.size_category.charAt(0).toUpperCase() + location.size_category.slice(1)}
              </span>
            )}
            {location.distance_miles != null && (
              <span>{location.distance_miles} mi</span>
            )}
          </div>

          {/* AI description */}
          {location.ai_description && (
            <p className="text-gray-500 text-xs mt-2 leading-relaxed flex-1 italic line-clamp-2">
              &ldquo;{location.ai_description}&rdquo;
            </p>
          )}

          {/* ── Action buttons ── */}
          <div className="mt-4 space-y-2">
            {/* Primary CTA */}
            <button
              onClick={() => openDetail("aerial")}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <span>Explore This Space</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>

            {/* Secondary row */}
            <div className="flex gap-2">
              <button
                onClick={() => openDetail("street")}
                className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium py-2 rounded-xl transition-colors border border-gray-200"
                title="Street View"
              >
                📍 Street
              </button>
              <button
                onClick={() => openDetail("indoor")}
                disabled={!location.rooms || location.rooms.length === 0}
                className="flex-1 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 text-xs font-medium py-2 rounded-xl transition-colors border border-gray-200"
                title="Indoor Tour"
              >
                🏛 Indoor
              </button>
              {user && (
                <button
                  onClick={() => setSaveOpen(true)}
                  className="bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium py-2 px-3 rounded-xl transition-colors border border-gray-200"
                  title="Save to board"
                >
                  ＋
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {saveOpen && (
        <SaveToBoard location={location} onClose={() => setSaveOpen(false)} />
      )}
    </>
  );
}
