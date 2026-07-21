export const dynamic = "force-dynamic";

import Link from "next/link";

const EXAMPLES = [
  "Foggy industrial warehouse with broken windows",
  "Sunlit Mediterranean coastal town at golden hour",
  "Dense NYC rooftop with skyline views at dusk",
  "Ornate Art Deco theater with velvet seats",
  "Brutalist concrete river channel, LA",
];

const FEATURES = [
  {
    icon: "🌍",
    title: "Aerial 3D View",
    desc: "Photorealistic satellite + 45° tilt with heading control. Fly around any location from above and understand the full spatial context before you ever visit.",
  },
  {
    icon: "📍",
    title: "Street View Walk",
    desc: "Drop into the street and walk the block in every direction. See sight lines, traffic, neighboring facades, and the exact light angles for your scene.",
  },
  {
    icon: "🏛",
    title: "Indoor 360° Tour",
    desc: "Walk through the space room by room. Navigate with hotspot arrows — see every angle, every corner, and every architectural detail of the interior.",
  },
  {
    icon: "🔍",
    title: "Smart Filters",
    desc: "Filter by radius, location type (industrial, outdoor, interior, urban, historic), and space size. Get a precise shortlist tailored to your production.",
  },
  {
    icon: "🤖",
    title: "AI Scout Notes",
    desc: "GPT-4 reads your creative brief and writes a cinematic description of each location — the mood, the texture, the story the space tells.",
  },
  {
    icon: "📋",
    title: "Shoot Boards",
    desc: "Save locations to shareable boards. Collaborate with your team, share a link with your director or DP, and keep all your scouts in one place.",
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col items-center">
      {/* ── Hero ── */}
      <section className="w-full flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4 py-20 text-center bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-3xl mx-auto">
          <div className="inline-block bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full mb-6 tracking-wide uppercase border border-indigo-100">
            AI-Powered Location Scouting
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-tight tracking-tight">
            Find your perfect
            <br />
            <span className="text-indigo-600">filming location</span>
          </h1>

          <p className="mt-6 text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
            Describe your scene. ScoutAI finds real locations — then lets you explore them from every
            angle: aerial 3D, street-level walk, and a fully walkable indoor tour.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <Link
              href="/search"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-4 rounded-2xl text-lg transition-colors shadow-lg shadow-indigo-100"
            >
              Start Scouting →
            </Link>
            <Link
              href="/search?q=abandoned+industrial+warehouse+with+skylights"
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-8 py-4 rounded-2xl text-lg transition-colors border border-gray-200 shadow-sm"
            >
              See an example
            </Link>
          </div>

          {/* Example chips */}
          <div className="mt-10">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-4">
              Try these
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {EXAMPLES.map((ex) => (
                <Link
                  key={ex}
                  href={`/search?q=${encodeURIComponent(ex)}`}
                  className="bg-white border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 text-gray-600 text-sm px-4 py-2 rounded-full transition-colors shadow-sm"
                >
                  {ex}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Viewer showcase strip ── */}
      <section className="w-full bg-gray-950 py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs text-white/40 uppercase tracking-widest font-semibold mb-3">
            Three ways to explore every location
          </p>
          <h2 className="text-center text-3xl sm:text-4xl font-bold text-white mb-12">
            See it from every angle
          </h2>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: "🌍",
                title: "Aerial 3D",
                desc: "Satellite view with tilt & heading controls. Understand scale, surroundings, and approach routes.",
                color: "indigo",
              },
              {
                icon: "📍",
                title: "Street View",
                desc: "Walk the block in 360°. See the facade, the street, the light — exactly what your camera sees.",
                color: "emerald",
              },
              {
                icon: "🏛",
                title: "Indoor 360°",
                desc: "Navigate room by room with hotspot arrows. The full Zillow-style walkthrough, built for filmmakers.",
                color: "violet",
              },
            ].map((v) => (
              <div
                key={v.title}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition-colors"
              >
                <div className="text-4xl mb-4">{v.icon}</div>
                <h3 className="text-white font-semibold text-lg mb-2">{v.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section className="w-full py-20 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs text-gray-400 uppercase tracking-widest font-semibold mb-3">
            Everything you need
          </p>
          <h2 className="text-center text-3xl sm:text-4xl font-bold text-gray-900 mb-14">
            Built for film &amp; photography professionals
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold text-gray-900 text-base mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="w-full py-20 px-4 bg-indigo-600 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to find your next location?</h2>
          <p className="text-indigo-200 mb-8">
            Describe your scene in plain language. ScoutAI does the rest.
          </p>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 bg-white hover:bg-indigo-50 text-indigo-700 font-bold px-8 py-4 rounded-2xl text-lg transition-colors shadow-lg"
          >
            Start Scouting →
          </Link>
        </div>
      </section>
    </div>
  );
}
