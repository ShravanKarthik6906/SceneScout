"use client";

import { LocationResult } from "@/store/scoutStore";
import { useEffect, useRef, useState } from "react";

interface AerialViewerProps {
  location: LocationResult;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
    initAerialMap?: () => void;
  }
}

export default function AerialViewer({ location }: AerialViewerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [hasKey, setHasKey] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tilt, setTilt] = useState(45);
  const [heading, setHeading] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    setHasKey(!!apiKey && apiKey !== "your_google_maps_api_key");
  }, [apiKey]);

  useEffect(() => {
    if (!hasKey || !mapRef.current) return;

    function initMap() {
      if (!mapRef.current || !window.google?.maps) return;

      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: location.lat, lng: location.lng },
        zoom: 18,
        tilt: 45,
        heading: 0,
        mapTypeId: "satellite",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        rotateControl: false,
        zoomControl: true,
      });

      // Marker
      new window.google.maps.Marker({
        position: { lat: location.lat, lng: location.lng },
        map,
        title: location.name,
      });

      mapInstanceRef.current = map;
      setMapLoaded(true);
    }

    if (window.google?.maps) {
      initMap();
    } else {
      window.initAerialMap = initMap;
      const existing = document.getElementById("gmaps-aerial-script");
      if (!existing) {
        const script = document.createElement("script");
        script.id = "gmaps-aerial-script";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initAerialMap`;
        script.async = true;
        document.head.appendChild(script);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasKey, location.lat, location.lng]);

  // Apply tilt / heading changes to live map
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setTilt(tilt);
    mapInstanceRef.current.setHeading(heading);
  }, [tilt, heading]);

  if (!hasKey) {
    // Beautiful mock aerial view with satellite overlay
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-950 relative overflow-hidden">
        {/* Blurred satellite bg */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={location.photo_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-25 blur-sm scale-105"
        />

        <div className="relative z-10 bg-black/65 backdrop-blur-md rounded-2xl px-8 py-7 text-center max-w-md mx-4">
          <div className="text-5xl mb-3">🌍</div>
          <h3 className="text-xl font-semibold text-white mb-2">Photorealistic 3D Aerial</h3>
          <p className="text-white/60 text-sm mb-4">
            Add{" "}
            <span className="text-yellow-300 font-mono text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span>
            {" "}to <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs">.env.local</code> to enable
            live satellite + 45° tilt 3D viewing.
          </p>
          <div className="text-xs text-white/40 space-y-1">
            <p>Enable: Maps JavaScript API + Map Tiles API</p>
            <p className="font-mono text-white/30">
              {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </p>
          </div>
          <a
            href={`https://www.google.com/maps/@${location.lat},${location.lng},200m/data=!3m1!1e3`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-indigo-400 hover:text-indigo-300 text-sm underline-offset-2 underline"
          >
            Open in Google Maps ↗
          </a>
        </div>

        {/* Mock tilt/heading controls (decorative) */}
        <div className="absolute bottom-6 right-6 flex flex-col gap-2">
          <div className="bg-black/60 backdrop-blur-sm rounded-xl p-3 text-white/60 text-xs space-y-2 w-36">
            <p className="font-medium text-white/80 text-center">View Controls</p>
            <div>
              <label className="block text-white/50 mb-0.5">Tilt: {tilt}°</label>
              <input
                type="range" min={0} max={60} value={tilt}
                onChange={(e) => setTilt(+e.target.value)}
                className="w-full accent-indigo-500"
              />
            </div>
            <div>
              <label className="block text-white/50 mb-0.5">Heading: {heading}°</label>
              <input
                type="range" min={0} max={360} value={heading}
                onChange={(e) => setHeading(+e.target.value)}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
          <div className="text-white/60 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-sm">Loading satellite view…</p>
          </div>
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" />

      {/* Tilt / Heading controls */}
      <div className="absolute bottom-6 right-6 bg-black/60 backdrop-blur-sm rounded-xl p-3 text-white/80 text-xs space-y-2 w-40">
        <p className="font-semibold text-white/90 text-center">View Controls</p>
        <div>
          <label className="block text-white/50 mb-0.5">Tilt: {tilt}°</label>
          <input
            type="range" min={0} max={60} value={tilt}
            onChange={(e) => setTilt(+e.target.value)}
            className="w-full accent-indigo-400"
          />
        </div>
        <div>
          <label className="block text-white/50 mb-0.5">Heading: {heading}°</label>
          <input
            type="range" min={0} max={360} value={heading}
            onChange={(e) => setHeading(+e.target.value)}
            className="w-full accent-indigo-400"
          />
        </div>
      </div>
    </div>
  );
}
