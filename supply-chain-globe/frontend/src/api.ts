import type { Network, NodeDependencies } from './types';

// Relative paths — Vite's dev proxy (see vite.config.ts) forwards /api/* to
// the FastAPI backend on :8000, and in production these would be served
// from the same origin as the backend.
export async function fetchNetwork(): Promise<Network> {
  const res = await fetch('/api/network', { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`GET /api/network failed: ${res.status}`);
  return res.json();
}

export async function fetchDependencies(nodeId: string): Promise<NodeDependencies> {
  const res = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/dependencies`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`GET /api/nodes/${nodeId}/dependencies failed: ${res.status}`);
  return res.json();
}
