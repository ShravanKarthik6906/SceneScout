import { useEffect, useState } from 'react';
import { SupplyChainGlobe } from './components/SupplyChainGlobe';
import { fetchNetwork, fetchDependencies } from './api';
import type { Network, NodeDependencies, SupplyNode } from './types';

const TYPE_LABEL: Record<SupplyNode['type'], string> = {
  factory: 'Factory',
  port: 'Port',
  warehouse: 'Warehouse',
  distribution_center: 'Distribution Center',
};

export default function App() {
  const [network, setNetwork] = useState<Network | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NodeDependencies | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  useEffect(() => {
    fetchNetwork()
      .then(setNetwork)
      .catch((e) => setLoadError(e.message || 'Failed to load network'));
  }, []);

  async function handleSelectNode(node: SupplyNode) {
    setSelectedLoading(true);
    try {
      const deps = await fetchDependencies(node.id);
      setSelected(deps);
    } catch (e) {
      console.warn('[app] fetchDependencies failed:', e);
    } finally {
      setSelectedLoading(false);
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070d]">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">Supply Chain Globe</h1>
          <p className="text-sm text-slate-400">Interactive network of facilities and shipping lanes</p>
        </div>
        <Legend />
      </header>

      {loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-lg border border-red-500/30 bg-red-950/60 px-5 py-4 text-sm text-red-200">
            Couldn't load the network: {loadError}. Is the backend running on :8000?
          </div>
        </div>
      )}

      {!network && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
            Loading network…
          </div>
        </div>
      )}

      {network && (
        <SupplyChainGlobe
          network={network}
          selectedNodeId={selected?.node.id ?? null}
          onSelectNode={handleSelectNode}
        />
      )}

      {selected && (
        <NodePanel
          deps={selected}
          loading={selectedLoading}
          nodesById={Object.fromEntries((network?.nodes ?? []).map(n => [n.id, n]))}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function Legend() {
  const items: Array<[string, string]> = [
    ['#f59e0b', 'Factory'],
    ['#38bdf8', 'Port'],
    ['#a78bfa', 'Warehouse'],
    ['#4ade80', 'Distribution Center'],
  ];
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-xs text-slate-300 backdrop-blur">
      {items.map(([color, label]) => (
        <div key={label} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {label}
        </div>
      ))}
    </div>
  );
}

function NodePanel({
  deps,
  loading,
  nodesById,
  onClose,
}: {
  deps: NodeDependencies;
  loading: boolean;
  nodesById: Record<string, SupplyNode>;
  onClose: () => void;
}) {
  const { node, upstream, downstream } = deps;
  return (
    <aside className="absolute right-0 top-0 z-10 h-full w-80 overflow-y-auto border-l border-white/10 bg-[#0b0d14]/90 p-5 text-slate-200 backdrop-blur">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 text-slate-500 hover:text-slate-200"
        aria-label="Close"
      >
        ✕
      </button>
      <div className="mb-1 text-xs uppercase tracking-wide text-slate-500">
        {TYPE_LABEL[node.type]}
      </div>
      <h2 className="mb-1 text-xl font-semibold text-white">{node.name}</h2>
      <p className="mb-6 text-sm text-slate-400">{node.country}</p>

      {loading ? (
        <p className="text-sm text-slate-500">Loading dependencies…</p>
      ) : (
        <>
          <RouteSection title="Upstream (inbound)" routes={upstream} nodesById={nodesById} direction="source" />
          <RouteSection title="Downstream (outbound)" routes={downstream} nodesById={nodesById} direction="target" />
          {!upstream.length && !downstream.length && (
            <p className="text-sm text-slate-500">No routes connect to this node in the demo dataset.</p>
          )}
        </>
      )}
    </aside>
  );
}

function RouteSection({
  title,
  routes,
  nodesById,
  direction,
}: {
  title: string;
  routes: NodeDependencies['upstream'];
  nodesById: Record<string, SupplyNode>;
  direction: 'source' | 'target';
}) {
  if (!routes.length) return null;
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="space-y-2">
        {routes.map((r) => {
          const other = nodesById[direction === 'source' ? r.source : r.target];
          return (
            <li key={r.id} className="rounded-md border border-white/10 bg-white/5 p-3 text-sm">
              <div className="font-medium text-slate-100">{other?.name ?? (direction === 'source' ? r.source : r.target)}</div>
              <div className="mt-1 text-xs text-slate-400">
                {r.mode} · {r.lead_time_days}d lead time · {r.volume_teu.toLocaleString()} TEU
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
