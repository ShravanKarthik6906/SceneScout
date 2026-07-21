# SceneScout

AI-powered location scouting for photography and film. Describe the space you
need in plain language, discover matches anywhere in the US on a 2D map or a
tilted 3D globe, read an AI suitability score and production-intelligence
report, then step inside a walkable 3D digital twin and check the street
outside — Zillow + Airbnb search + Google Earth + Matterport + IMDb Pro in one
page.

## Run it

Any static server works (ES modules can't load from `file://`):

```sh
cd location-scout
python3 -m http.server 8674
# open http://localhost:8674
```

Requires internet for CDN assets (Leaflet, Three.js, MapLibre) and for the
keyless live services (OpenStreetMap Nominatim geocoding, Open-Meteo weather,
OpenFreeMap 3D tiles). Everything degrades gracefully offline.

## What's in the box

| Piece | File | Notes |
|---|---|---|
| AI query parser | `js/nlp.js` | Turns "modern industrial warehouse with big windows near downtown Chicago under $500/day" into structured intent (type, style, light, size, budget, radius, location) and drives the filters. Offline rules/lexicon parser — the seam where an LLM call would slot in |
| Suitability scoring | `js/score.js` | Blends prompt + filters + attributes into an overall match % and an 8-factor breakdown (Visual, Lighting, Space, Parking, Accessibility, Noise, Privacy, Production, Permit), each with a note and confidence |
| Production intelligence | `js/intel.js` | **Genuinely computed** sunrise / golden hour / blue hour / sunset / sun position for any lat-lng/date (SunCalc port), shown in the location's local timezone; keyless geocoding (Nominatim) and live weather (Open-Meteo) |
| Nationwide catalog | `js/catalog.js` | 10 US metros + airports; 26 locations built from floor-plan templates; deterministic enrichment (parking, noise, privacy, permits, crew capacity, amenities) and synthesized review profiles |
| Base inventory | `js/data.js` | 12 hand-authored LA locations, each with real coordinates and a structured floor plan (meters) |
| Search + UI | `js/app.js` | AI search, radius search, filters, detail modal with all intelligence panels, 2D/3D toggle |
| 2D map | `js/map.js` | Leaflet + dark Carto tiles, radius circle, click-to-move center |
| 3D map | `js/map3d.js` | MapLibre GL + OpenFreeMap vector tiles: tilted Google-Earth-style view with extruded 3D buildings (lazy-loaded, keyless, graceful fallback) |
| Digital-twin engine | `js/tour.js` | Compiles floor plans into walkable 3D: walls with real door openings, per-room ceilings, windows/skylights, style-based furnishing, collision. Modes: **Walk** (crouch, sprint, measurement tool, minimap, lens zoom), **Cinematic Flythrough**, **Dollhouse** orbit, **Floor Plan** |
| Plan renderers | `js/thumbs.js` | Canvas top-down thumbnails + 2.5D isometric hero images |

## Street View / Google Earth

- No setup: each listing links out to Google Street View and Google Earth at
  its coordinates (new tab, keyless).
- Optional: paste a Google Maps API key (Maps Embed API enabled) in ⚙ Settings
  to embed live Street View inside the listing page.

## What's real vs. modeled

Real and computed live: the AI query parsing, nationwide geocoding, the solar
math (golden/blue hour), live weather, the 3D building map, and the entire
walkable twin/flythrough/measurement engine.

Modeled for the prototype (clearly labeled in the UI): the listing inventory,
the per-location production factors, and the review summaries. A production
version swaps these layers — the search, scoring, map, twin, and UI are all
data-source-agnostic and carry over unchanged:

1. **Inventory** — licensed feeds (Zillow partner/MLS APIs, Peerspace,
   Giggster). Scraping Zillow violates its ToS.
2. **Photorealistic interiors** — Matterport SDK where tours exist; otherwise
   photogrammetry over listing photos (COLMAP → NeRF / 3D Gaussian splatting)
   to produce walkable meshes or splats in place of the procedural geometry.
3. **Exterior / 3D** — Google Maps Platform: Street View, Photorealistic 3D
   Tiles, Aerial View API (drop-in for the OpenFreeMap source in `map3d.js`).
4. **Reviews** — Google Places / a licensed review provider, summarized by an
   LLM against the user's brief.