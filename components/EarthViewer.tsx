"use client";

import { LocationResult } from "@/store/scoutStore";
import dynamic from "next/dynamic";

interface EarthViewerProps {
  location: LocationResult;
  onClose: () => void;
}

// Mock Google Earth viewer — shows a static satellite map tile and location info.
// Replace with the real Map3DElement implementation once a Google Maps API key is set.
function EarthViewerInner({ location, onClose }: EarthViewerProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 border-b border-white/10">
        <div>
          <h2 className="text-white font-semibold text-lg">{location.name}</h2>
          <p className="text-white/60 text-sm">{location.address}</p>
        </div>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm transition-colors"
        >
          ✕ Close
        </button>
      </div>

      {/* Map area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Satellite tile background (mock — blurred overlay when no API key) */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${location.photo_url})`,
            filter: "brightness(0.5) saturate(1.2)",
          }}
        />

        {/* 3D viewer placeholder overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4">
          <div className="bg-black/60 backdrop-blur-md rounded-2xl px-8 py-6 text-center max-w-md mx-4">
            <div className="text-5xl mb-3">🌍</div>
            <h3 className="text-xl font-semibold mb-1">Google Earth 3D</h3>
            <p className="text-white/60 text-sm mb-4">
              Add your <span className="text-indigo-300 font-medium">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> to
              {" "}<code className="bg-white/10 px-1.5 py-0.5 rounded text-xs">.env.local</code> to enable
              photorealistic 3D navigation.
            </p>
            <div className="text-xs text-white/40 space-y-1">
              <p>📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</p>
              <p>Drag · Rotate · Zoom · Tilt</p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-white/30 text-xs py-2 pb-3">
        Google Earth 3D · Photorealistic 3D Tiles
      </p>
    </div>
  );
}

export default dynamic(() => Promise.resolve(EarthViewerInner), { ssr: false });
