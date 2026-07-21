"use client";

import { LocationResult } from "@/store/scoutStore";
import { useEffect, useRef, useState } from "react";

interface StreetViewViewerProps {
  location: LocationResult;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
    initStreetView?: () => void;
  }
}

export default function StreetViewViewer({ location }: StreetViewViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "unavailable">("loading");
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey || apiKey === "your_google_maps_api_key") {
      setStatus("unavailable");
      return;
    }

    function initPanorama() {
      if (!containerRef.current || !window.google?.maps) return;

      const sv = new window.google.maps.StreetViewService();
      const latLng = new window.google.maps.LatLng(location.lat, location.lng);

      sv.getPanorama({ location: latLng, radius: 200 }, (data: unknown, streetViewStatus: string) => {
        if (streetViewStatus === "OK") {
          new window.google.maps.StreetViewPanorama(containerRef.current!, {
            position: latLng,
            pov: { heading: 0, pitch: 0 },
            zoom: 1,
            addressControl: false,
            fullscreenControl: false,
            motionTracking: false,
          });
          setStatus("ok");
        } else {
          setStatus("unavailable");
        }
      });
    }

    if (window.google?.maps) {
      initPanorama();
    } else {
      window.initStreetView = initPanorama;
      const existing = document.getElementById("gmaps-street-script");
      if (!existing) {
        const script = document.createElement("script");
        script.id = "gmaps-street-script";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initStreetView`;
        script.async = true;
        document.head.appendChild(script);
      }
    }
  }, [location.lat, location.lng, apiKey]);

  if (!apiKey || apiKey === "your_google_maps_api_key") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-950 text-white gap-4">
        <div className="bg-black/60 backdrop-blur-md rounded-2xl px-8 py-7 text-center max-w-md">
          <div className="text-5xl mb-3">📍</div>
          <h3 className="text-xl font-semibold mb-2">Street View</h3>
          <p className="text-white/60 text-sm mb-4">
            Add{" "}
            <span className="text-yellow-300 font-mono text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> to{" "}
            <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs">.env.local</code> to enable
            interactive Street View.
          </p>
          <p className="text-white/40 text-xs">
            Enable: Maps JavaScript API + Street View Static API
          </p>
          <div className="mt-5 rounded-xl overflow-hidden border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${location.lat},${location.lng}&key=DEMO_KEY&return_error_code=false`}
              alt="Street View preview"
              className="w-full opacity-40"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          </div>
          <p className="text-white/30 text-xs mt-3">
            📍 {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-gray-950">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-white/60 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-sm">Loading Street View…</p>
          </div>
        </div>
      )}
      {status === "unavailable" && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="bg-black/70 rounded-2xl px-8 py-6 text-center text-white">
            <div className="text-4xl mb-2">🚧</div>
            <p className="font-medium">Street View not available here</p>
            <p className="text-white/50 text-sm mt-1">No Street View coverage at this location.</p>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
