# Supply Chain Globe

Interactive 3D globe visualizing supply-chain facilities (factories, ports,
warehouses, distribution centers) and the shipping lanes connecting them.

This is a separate app from GeoPhoto/SceneScout at the repo root — it just
lives in this subfolder. Different stack entirely: React/TypeScript +
Vite + Tailwind + react-globe.gl (three.js) on the frontend, FastAPI
(Python) on the backend.

**Current scope (MVP)**: the backend serves a static, hardcoded demo
dataset (`backend/data.py`) — ten real-world facility locations and ten
routes between them. There's no live data source or LLM agent wired up
yet; those are the natural next steps once this proves the stack end to
end.

## Running it

You need two terminals — the backend and frontend run as separate
processes.

### Backend (FastAPI)

```bash
cd supply-chain-globe/backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Confirm it's up: `curl http://localhost:8000/api/health` should return
`{"status":"ok"}`.

### Frontend (Vite + React)

In a second terminal:

```bash
cd supply-chain-globe/frontend
npm install
npm run dev
```

Open the URL it prints (typically `http://localhost:5173`). The dev
server proxies `/api/*` requests to the backend on `:8000` (see
`vite.config.ts`), so both need to be running.

## What you should see

A dark 3D globe, slowly auto-rotating until you drag it, with:
- Colored points for each facility (factory/port/warehouse/distribution
  center — see the legend, top right)
- Animated dashed arcs for each shipping route, colored by transport mode
  and thickness scaled to shipment volume
- Clicking a point opens a side panel showing that facility's upstream
  and downstream routes (via `/api/nodes/{id}/dependencies`)

The globe texture loads from a CDN (unpkg) — if you're on a restricted
network, that image may fail to load and the globe will render blank.

## API

- `GET /api/network` — all nodes + routes
- `GET /api/nodes/{id}/dependencies` — a single node with its direct
  upstream/downstream routes (the seed of "dependency graph logic" —
  currently direct edges only, not a transitive walk)
- `GET /api/health` — health check

## Next steps (not built yet)

- Replace `backend/data.py`'s static dataset with a real data source
- Wire up the LLM agent mentioned in the original spec (what should it
  do — answer questions about the network? Flag risk? Something else?)
- Transitive dependency walks (a node's sources' sources, and so on) —
  `get_dependencies` only returns direct edges right now
