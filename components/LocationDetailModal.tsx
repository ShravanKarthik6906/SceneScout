"use client";

import { LocationResult, ViewMode, useScoutStore } from "@/store/scoutStore";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useUser } from "@/hooks/useUser";
import SaveToBoard from "./SaveToBoard";

const AerialViewer = dynamic(() => import("./AerialViewer"), { ssr: false });
const StreetViewViewer = dynamic(() => import("./StreetViewViewer"), { ssr: false });
const IndoorTourViewer = dynamic(() => import("./IndoorTourViewer"), { ssr: false });

interface LocationDetailModalProps {
  location: LocationResult;
  onClose: () => void;
}

const TABS: { id: ViewMode; label: string; icon: string; desc: string }[] = [
  { id: "aerial", label: "Aerial 3D", icon: "🌍", desc: "Satellite + tilt" },
  { id: "street", label: "Street View", icon: "📍", desc: "Walk the block" },
  { id: "indoor", label: "Indoor Tour", icon: "🏛", desc: "360° walkthrough" },
];

const CAT_LABELS: Record<string, string> = {
  industrial: "Industrial",
  outdoor: "Outdoor",
  interior: "Interior Space",
  urban: "Urban",
  historic: "Historic",
};

const SIZE_LABELS: Record<string, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

export default function LocationDetailModal({ location, onClose }: LocationDetailModalProps) {
  const { activeViewMode, setActiveViewMode } = useScoutStore();
  const { user } = useUser();
  const [saveOpen, setSaveOpen] = useState(false);

  const rooms = location.rooms ?? [];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-gray-950 border-b border-white/10 shrink-0">
          <div className="flex flex-col min-w-0">
            <h2 className="text-white font-semibold text-base sm:text-lg truncate leading-tight">
              {location.name}
            </h2>
            <p className="text-white/50 text-xs sm:text-sm truncate mt-0.5">{location.address}</p>
          </div>

          <div className="flex items-center gap-2 ml-3 shrink-0">
            {user && (
              <button
                onClick={() => setSaveOpen(true)}
                className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-colors"
              >
                + Save
              </button>
            )}
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-colors"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* ── Tab switcher ── */}
        <div className="flex gap-1 px-4 py-2 bg-gray-950 border-b border-white/10 shrink-0 overflow-x-auto">
          {TABS.map((tab) => {
            const isIndoor = tab.id === "indoor";
            const disabled = isIndoor && rooms.length === 0;
            return (
              <button
                key={tab.id}
                disabled={disabled}
                onClick={() => setActiveViewMode(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                  activeViewMode === tab.id
                    ? "bg-indigo-600 text-white"
                    : disabled
                    ? "text-white/20 cursor-not-allowed"
                    : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span className={`text-xs ${activeViewMode === tab.id ? "text-indigo-200" : "text-white/30"}`}>
                  {tab.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Main viewer ── */}
        <div className="flex-1 min-h-0 flex">
          {/* Viewer panel */}
          <div className="flex-1 min-w-0 relative">
            {activeViewMode === "aerial" && <AerialViewer location={location} />}
            {activeViewMode === "street" && <StreetViewViewer location={location} />}
            {activeViewMode === "indoor" && rooms.length > 0 && (
              <IndoorTourViewer rooms={rooms} />
            )}
          </div>

          {/* ── Info sidebar (desktop) ── */}
          <aside className="hidden lg:flex w-72 shrink-0 bg-gray-950 border-l border-white/10 flex-col overflow-y-auto">
            {/* Photo */}
            <div className="h-44 overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={location.photo_url}
                alt={location.name}
                className="w-full h-full object-cover opacity-80"
              />
            </div>

            <div className="p-5 space-y-4">
              {/* Meta badges */}
              <div className="flex flex-wrap gap-2">
                {location.location_category && (
                  <span className="bg-indigo-900/60 text-indigo-300 text-xs px-2.5 py-1 rounded-full font-medium">
                    {CAT_LABELS[location.location_category] ?? location.location_category}
                  </span>
                )}
                {location.size_category && (
                  <span className="bg-white/10 text-white/60 text-xs px-2.5 py-1 rounded-full font-medium">
                    {SIZE_LABELS[location.size_category]} space
                  </span>
                )}
                {location.rating && (
                  <span className="bg-yellow-900/40 text-yellow-400 text-xs px-2.5 py-1 rounded-full font-medium">
                    ★ {location.rating.toFixed(1)}
                  </span>
                )}
              </div>

              {/* Area */}
              {location.sqft && (
                <div className="bg-white/5 rounded-xl px-4 py-3">
                  <p className="text-white/40 text-xs uppercase tracking-wide font-medium">Interior Area</p>
                  <p className="text-white text-lg font-semibold mt-0.5">
                    {location.sqft.toLocaleString()} sqft
                  </p>
                </div>
              )}

              {/* Distance */}
              {location.distance_miles != null && (
                <div className="bg-white/5 rounded-xl px-4 py-3">
                  <p className="text-white/40 text-xs uppercase tracking-wide font-medium">Distance</p>
                  <p className="text-white text-lg font-semibold mt-0.5">
                    {location.distance_miles} mi away
                  </p>
                </div>
              )}

              {/* AI Description */}
              {location.ai_description && (
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wide font-medium mb-2">Scout Notes</p>
                  <p className="text-white/70 text-sm leading-relaxed italic">
                    &ldquo;{location.ai_description}&rdquo;
                  </p>
                </div>
              )}

              {/* GPS */}
              <div className="bg-white/5 rounded-xl px-4 py-3">
                <p className="text-white/40 text-xs uppercase tracking-wide font-medium mb-1.5">Coordinates</p>
                <p className="text-white/60 font-mono text-xs leading-relaxed">
                  {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-indigo-400 hover:text-indigo-300 text-xs underline-offset-2 underline"
                >
                  Open in Google Maps ↗
                </a>
              </div>

              {/* Room list */}
              {rooms.length > 0 && (
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-wide font-medium mb-2">
                    Spaces ({rooms.length})
                  </p>
                  <ul className="space-y-1">
                    {rooms.map((r, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm text-white/60 bg-white/5 rounded-lg px-3 py-1.5"
                      >
                        <span className="w-5 h-5 bg-indigo-700/50 rounded text-indigo-300 text-xs flex items-center justify-center font-bold shrink-0">
                          {i + 1}
                        </span>
                        {r.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* ── Bottom info bar (mobile) ── */}
        <div className="lg:hidden bg-gray-950 border-t border-white/10 px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            {location.location_category && (
              <span className="text-indigo-300 text-xs font-medium mr-2">
                {CAT_LABELS[location.location_category] ?? location.location_category}
              </span>
            )}
            {location.sqft && (
              <span className="text-white/50 text-xs">{location.sqft.toLocaleString()} sqft</span>
            )}
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 text-xs underline"
          >
            Maps ↗
          </a>
        </div>
      </div>

      {saveOpen && <SaveToBoard location={location} onClose={() => setSaveOpen(false)} />}
    </>
  );
}
