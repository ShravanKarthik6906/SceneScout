"use client";

import { RoomImage } from "@/store/scoutStore";
import { useState, useCallback } from "react";

interface IndoorTourViewerProps {
  rooms: RoomImage[];
}

// Simulated hotspot positions for each room transition
const HOTSPOT_POSITIONS = [
  { top: 58, left: 62, label: "Move forward" },
  { top: 55, left: 38, label: "Turn left" },
  { top: 58, left: 72, label: "Move right" },
];

export default function IndoorTourViewer({ rooms }: IndoorTourViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [fovX, setFovX] = useState(0); // simulated panning offset %
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(0);

  const current = rooms[currentIndex];

  function goToRoom(idx: number) {
    if (idx < 0 || idx >= rooms.length || transitioning) return;
    setTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(idx);
      setFovX(0);
      setTransitioning(false);
    }, 350);
  }

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsPanning(true);
      setPanStart(e.clientX);
    },
    []
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const delta = ((e.clientX - panStart) / window.innerWidth) * 40;
      setFovX(Math.max(-30, Math.min(30, delta)));
    },
    [isPanning, panStart]
  );

  const onMouseUp = useCallback(() => {
    setIsPanning(false);
    setPanStart(0);
  }, []);

  // Touch support
  const onTouchStart = (e: React.TouchEvent) => {
    setIsPanning(true);
    setPanStart(e.touches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isPanning) return;
    const delta = ((e.touches[0].clientX - panStart) / window.innerWidth) * 40;
    setFovX(Math.max(-30, Math.min(30, delta)));
  };
  const onTouchEnd = () => setIsPanning(false);

  return (
    <div className="w-full h-full flex flex-col bg-black select-none">
      {/* 360 panorama area */}
      <div
        className="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Background image — pans with fovX */}
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: transitioning ? 0 : 1,
            transform: `translateX(${fovX}px) scale(1.08)`,
            backgroundImage: `url(${current.url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            transition: transitioning ? "opacity 0.35s" : "transform 0.05s linear",
            willChange: "transform",
          }}
        />

        {/* Dark vignette edges */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
          }}
        />

        {/* Navigation hotspots */}
        {!transitioning &&
          HOTSPOT_POSITIONS.slice(0, Math.min(rooms.length - 1, 3)).map((hp, i) => {
            const targetIdx = (currentIndex + i + 1) % rooms.length;
            return (
              <button
                key={i}
                onClick={() => goToRoom(targetIdx)}
                className="absolute group"
                style={{ top: `${hp.top}%`, left: `${hp.left}%`, transform: "translate(-50%,-50%)" }}
                title={`Go to: ${rooms[targetIdx]?.label}`}
              >
                {/* Animated ring */}
                <span className="block w-10 h-10 rounded-full border-2 border-white/70 bg-black/30 backdrop-blur-sm flex items-center justify-center group-hover:bg-indigo-600/70 group-hover:border-indigo-400 transition-all">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
                    <path d="M8 2l6 6-6 6M2 8h12" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                  </svg>
                </span>
                {/* Tooltip */}
                <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {rooms[targetIdx]?.label}
                </span>
              </button>
            );
          })}

        {/* Compass HUD */}
        <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 text-white/70 text-xs flex items-center gap-1.5 pointer-events-none">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="5" stroke="white" strokeOpacity="0.3" strokeWidth="1" fill="none" />
            <path d="M6 1L7.5 5.5H4.5Z" fill="white" />
            <path d="M6 11L4.5 6.5H7.5Z" fill="white" opacity="0.4" />
          </svg>
          Drag to pan · Click arrow to move
        </div>

        {/* Room label */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm font-medium pointer-events-none">
          {current.label}
        </div>
      </div>

      {/* Room strip — bottom nav */}
      <div className="bg-gray-950 border-t border-white/10 px-3 py-2.5 flex gap-2 overflow-x-auto">
        {rooms.map((room, i) => (
          <button
            key={i}
            onClick={() => goToRoom(i)}
            className={`flex-shrink-0 flex flex-col items-center gap-1.5 rounded-xl overflow-hidden border transition-all ${
              i === currentIndex
                ? "border-indigo-500 ring-1 ring-indigo-500"
                : "border-white/10 hover:border-white/30"
            }`}
            style={{ width: 90 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={room.url}
              alt={room.label}
              className="w-full h-14 object-cover"
            />
            <span className="text-white/70 text-xs pb-1.5 px-1 text-center leading-tight line-clamp-1">
              {room.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
