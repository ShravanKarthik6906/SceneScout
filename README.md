# SceneScout

Location scouting for film, photo, and video shoots — describe what you need in plain English, and find it on a map, walk through a 3D twin of it, and check the street outside, without leaving your desk.

## Problem statement

Finding a shoot location is still mostly a manual, word-of-mouth process. A scout or indie director either drives around neighborhoods hoping to spot something, cold-calls property owners, or scrolls through generic listing sites that have no idea what "abundant natural light," "400A power," or "blackout capable" even mean. There's no single place to search for a location the way you'd actually describe it to a person, no quick way to judge whether a space will actually work for a shoot before visiting it in person, and no way to get a feel for walking through the space itself until you're standing in it — which, for a small crew on a tight budget, can mean wasted trips, missed light, and locations that looked fine in three photos and turned out to be unusable in reality.

## Solution description

SceneScout lets you type a brief the way you'd say it out loud — "modern industrial warehouse with big windows near downtown Chicago, under $500 a day" — and turns that into an actual search: building type, style, light, size, budget, and radius, run against a database of 899 real US properties plus live natural-feature and business search for anything the curated catalog doesn't cover (lakes, parks, real photography studios, and so on).

Every result comes with an AI-generated suitability score against your specific brief, not just a generic listing page — visual match, space and scale, accessibility, lighting, parking, noise, and production-friendliness, each with a plain-language reason attached. You get real sunrise/golden-hour timing and weather for the location's actual coordinates, the nearest airport, and links straight out to Google Street View, Google Earth, and directions.

Then, instead of stopping at photos, you can click "Enter 3D Digital Twin" and actually walk through a procedurally generated 3D reconstruction of the property's floor plan — first-person, real collision against the walls and furniture, a cinematic flythrough option, and a dollhouse/floor-plan view — to get a real feel for the space before ever scheduling a visit. There's also a whole-Earth "Explore Globe" mode for scouting anywhere on the map with no search radius at all, and a screenplay-upload feature that reads a PDF script and pulls out the locations, scene headings, and budget language it mentions, so you can go from a script straight to a location search.

The whole thing is also built to keep working with zero configuration — every external API it calls (AI query parsing, geocoding, natural-feature search) has a offline fallback that kicks in automatically if a key isn't set or a service is unreachable, so the core experience — the catalog, the map, the filters, the 3D tours — never actually breaks.

## AI approach and architecture

- **Natural-language query parsing.** A user's free-text brief is sent to an LLM (via Groq) with a strict JSON schema — building type, style keywords, light level, min square footage, max daily rate, radius, a target location, and (separately) whether the brief is actually describing a natural feature rather than a building, in which case it also has to guess a real OpenStreetMap tag for it. That structured output drives every filter in the UI directly.
- **Suitability scoring.** Each candidate location is scored against the parsed brief across weighted factors (visual match, space/scale, accessibility, lighting, parking, noise, privacy, production-friendliness), producing both an overall percentage and a per-factor breakdown with a written reason, not just a number.
- **Procedural 3D reconstruction.** Rather than 8 fixed building templates, floor plans are generated procedurally per property and rendered with a style-preset system that matches materials and lighting mood to the property's actual type, real BVH mesh collision (not a rough bounding box) for walking through the space, PBR materials, and post-processing.
- **Resilience layer.** Every AI/external-data call — Groq parsing, LocationIQ geocoding (forward and reverse), Overpass/GeoNames natural-feature search, Foursquare business search — has a matching offline fallback module that activates automatically on a missing key or a failed call: a lightweight keyword parser, a bundled list of major US cities, a curated list of well-known natural landmarks, and a graceful empty result, respectively. The app degrades in place instead of breaking.
- **Server**: a small Express backend (`server.js`) proxies and caches all of the above, keeping every API key server-side.
- **Frontend**: vanilla JS ES modules, no bundler — Leaflet for the 2D map, MapLibre GL for the 3D/globe view, Three.js (with three-mesh-bvh for collision) for the walkable digital twin.

## Selected challenge theme

**July Challenge — Reimagine Creative Industries with AI.**

Location scouting is a real, unglamorous bottleneck in film and photo production — the industry this challenge is asking us to reimagine. SceneScout puts AI directly into a working creative team's workflow: turning a plain-language creative brief into a structured search, scoring how well a real space actually fits the shot a director has in mind, and reconstructing that space in 3D so a crew can walk through it and judge the light, the layout, and the feel before ever booking a flight or a rental van. It's not a general-purpose AI demo bolted onto a map — every AI-driven piece (the query parser, the suitability scoring, the screenplay breakdown) exists specifically to help someone making something get from an idea to a real place faster.

## How IBM Bob was used

_TODO — describe your team's actual Bob workflow here (which parts of the app Bob built or scaffolded, how you iterated with it, what you'd point a judge at first). I don't have direct visibility into your Bob sessions outside this conversation, so I've left this for you to fill in accurately rather than guess._

## Running it

```bash
git clone -b Locations https://github.com/U-daya/GeoPhoto.git
cd GeoPhoto
npm install
npm run dev
```

Then open **http://localhost:3001**.

Works out of the box with zero configuration. For live AI search and geocoding, create a `.env` file in the project root:

```
GROQ_API_KEY=your_groq_key        # console.groq.com/keys — free tier
LOCATIONIQ_KEY=your_locationiq_key  # locationiq.com/register — free tier
GEONAMES_USERNAME=your_username     # geonames.org/login — free, enable "web services" in account settings
```

Without any of these, the app runs fully functional on its offline fallbacks — the 899-location catalog, map, filters, and 3D tours all work regardless; only live AI parsing and exact geocoding lose precision.

## What's real vs. what's simulated

Real: the 899 property listings (Zillow US House Listings 2023 dataset), the AI query parsing, the suitability scoring, real sunrise/golden-hour/weather data for each location's actual coordinates, live natural-feature and business search, and the entire walkable 3D digital-twin engine.

Simulated, and labeled as such in the app: the per-location production-intelligence factors (parking, noise, permit difficulty) and review summaries, since this is a prototype without access to licensed production-scouting data. A production version would swap these for licensed feeds (MLS/Zillow partner APIs, Peerspace, Giggster) and photogrammetry-based interior capture (Matterport, or COLMAP → NeRF/Gaussian splatting) in place of the procedural 3D reconstruction — the search, scoring, map, and UI layers are all data-source-agnostic and wouldn't need to change.
