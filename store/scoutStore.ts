import { create } from "zustand";

export interface RoomImage {
  label: string;       // "Living Room", "Kitchen", etc.
  url: string;
  hotspots?: { top: number; left: number; label: string }[];
}

export interface LocationResult {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  photo_url: string;
  types: string[];
  rating?: number;
  ai_description: string;
  // Enhanced fields
  sqft?: number;
  size_category?: "small" | "medium" | "large";
  location_category?: string;
  distance_miles?: number;
  rooms?: RoomImage[];
  street_view_url?: string;
}

export type ViewMode = "aerial" | "street" | "indoor";

interface ScoutStore {
  // Search filters
  radius: number;
  setRadius: (v: number) => void;
  locationType: string;
  setLocationType: (v: string) => void;
  sizeCategory: string;
  setSizeCategory: (v: string) => void;

  // Results
  results: LocationResult[];
  setResults: (r: LocationResult[]) => void;

  // Viewer state
  selectedLocation: LocationResult | null;
  setSelectedLocation: (l: LocationResult | null) => void;

  isDetailOpen: boolean;
  setIsDetailOpen: (v: boolean) => void;
  activeViewMode: ViewMode;
  setActiveViewMode: (v: ViewMode) => void;

  // Legacy (kept for ZillowPanel backward compat)
  isEarthOpen: boolean;
  setIsEarthOpen: (v: boolean) => void;
  isZillowOpen: boolean;
  setIsZillowOpen: (v: boolean) => void;
}

export const useScoutStore = create<ScoutStore>((set) => ({
  radius: 25,
  setRadius: (radius) => set({ radius }),
  locationType: "all",
  setLocationType: (locationType) => set({ locationType }),
  sizeCategory: "all",
  setSizeCategory: (sizeCategory) => set({ sizeCategory }),

  results: [],
  setResults: (results) => set({ results }),

  selectedLocation: null,
  setSelectedLocation: (selectedLocation) => set({ selectedLocation }),

  isDetailOpen: false,
  setIsDetailOpen: (isDetailOpen) => set({ isDetailOpen }),
  activeViewMode: "aerial",
  setActiveViewMode: (activeViewMode) => set({ activeViewMode }),

  isEarthOpen: false,
  setIsEarthOpen: (isEarthOpen) => set({ isEarthOpen }),
  isZillowOpen: false,
  setIsZillowOpen: (isZillowOpen) => set({ isZillowOpen }),
}));
