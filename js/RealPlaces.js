// Real-world business search via Foursquare's Places API, proxied through
// our own server (/api/places-search — see server.js). This replaced an
// earlier OpenStreetMap/Overpass-based approach for the same purpose:
// OSM's coverage depends entirely on volunteer mapping and its free query
// mirrors turned out unreliable (rate limits, regional gaps, timeouts).
// Foursquare is an actual maintained business directory with consistent
// nationwide coverage instead.

// typeKey: one of catalog.js's TYPES keys (e.g. 'studio') — must match
// exactly so the existing type filter/scoring treats these as first-class
// results, not a separate dynamic category needing its own code path.
// spec: { label, searchQuery } — searchQuery is the free-text term sent to
// Foursquare (e.g. "photography studio"), distinct from the catalog label
// since Foursquare's search works better with natural business-search terms.
export async function findRealPlaces(center, radiusMi, typeKey, spec) {
    if (!spec || !spec.searchQuery) return [];

    const params = new URLSearchParams({
        lat: center.lat, lng: center.lng, radiusMi: String(radiusMi), query: spec.searchQuery,
    });
    try {
        const res = await fetch(`/api/places-search?${params}`, {
            // The server's own Foursquare call is bounded to 10s; this is
            // defense in depth for a hung connection to our own server.
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            console.warn('[realPlaces] places-search proxy failed:', res.status);
            return [];
        }
        const places = await res.json();
        return places.map(p => toPlaceLocation(p, typeKey, spec));
    } catch (e) {
        console.warn('[realPlaces] Foursquare search failed:', e.message);
        return [];
    }
}

// Builds a pseudo-"location" object matching the shape the rest of the app
// expects (rate, sqft, intel, reviews, tags) so existing card/detail
// rendering works without modification — same convention
// NaturalFeatures.js's toFeatureLocation uses. Real businesses have none of
// the curated catalog's modeled attributes (sqft, rate, ceiling height
// aren't in Foursquare's data), so those are surfaced as honestly unknown
// rather than invented, with a note to contact the business directly.
function toPlaceLocation(p, typeKey, spec) {
    const id = `place-${typeKey}-${p.id}`;
    return {
        id, name: p.name,
        type: typeKey,
        lat: p.lat, lng: p.lng,
        address: p.address || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`,
        neighborhood: p.neighborhood || 'Unincorporated area',
        wikipedia: null,
        sqft: 0,
        ceilingFt: null,
        rate: 0,
        desc: `A real ${spec.label.toLowerCase()} business from Foursquare's places directory. ` +
            `Rates, size, and availability aren't in this data — contact directly to confirm.` +
            (p.phone ? ` Phone: ${p.phone}.` : '') + (p.website ? ` Website: ${p.website}.` : ''),
        tags: ['real business', spec.label.toLowerCase(), 'verify details directly'],
        intel: {
            crewCapacity: null,
            windows: [],
            factors: {
                parking: { score: 50, note: 'Unverified — no data source for this yet' },
                accessibility: { score: 50, note: 'Unverified — contact the business' },
                noise: { score: 50, note: 'Unverified' },
                privacy: { score: 50, note: 'Unverified — a working business, likely has staff/clients present' },
                power: { score: 60, note: 'Likely available — verify with the business' },
                permit: { score: 60, note: "Commercial space — permitting is typically the business's to arrange" },
            },
            productionFriendliness: 40,
            nearestAirport: { code: '—', mi: '—', name: 'Not calculated for real businesses yet' },
            amenities: { equipment: 'Unknown', hotels: 'Unknown', dining: 'Unknown' },
        },
        reviews: {
            rating: 0, count: 0,
            summary: 'No review data available for real businesses yet.',
            positives: [],
            considerations: ['Contact the business directly to confirm rates, size, and availability.'],
        },
    };
}
