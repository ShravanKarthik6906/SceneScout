import { useEffect, useMemo, useRef, useState } from 'react';
import GlobeGL, { type GlobeMethods } from 'react-globe.gl';
import type { Network, SupplyNode, SupplyRoute } from '../types';

const NODE_COLOR: Record<SupplyNode['type'], string> = {
  factory: '#f59e0b',
  port: '#38bdf8',
  warehouse: '#a78bfa',
  distribution_center: '#4ade80',
};

const ROUTE_COLOR: Record<SupplyRoute['mode'], string> = {
  sea: '#38bdf8',
  rail: '#f59e0b',
  land: '#94a3b8',
  air: '#a78bfa',
};

interface ArcDatum {
  route: SupplyRoute;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

export function SupplyChainGlobe({
  network,
  selectedNodeId,
  onSelectNode,
}: {
  network: Network;
  selectedNodeId: string | null;
  onSelectNode: (node: SupplyNode) => void;
}) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Slow auto-rotate until the user takes control (drags/zooms) — a static
  // globe on load reads as frozen rather than interactive.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.controls().autoRotate = true;
    g.controls().autoRotateSpeed = 0.4;
    g.pointOfView({ lat: 20, lng: 40, altitude: 2.2 }, 0);
    const stop = () => { g.controls().autoRotate = false; };
    g.controls().addEventListener('start', stop);
    return () => g.controls().removeEventListener('start', stop);
  }, []);

  const nodesById = useMemo(
    () => new Map(network.nodes.map(n => [n.id, n])),
    [network.nodes],
  );

  const arcs: ArcDatum[] = useMemo(
    () => network.routes
      .map(route => {
        const source = nodesById.get(route.source);
        const target = nodesById.get(route.target);
        if (!source || !target) return null;
        return {
          route,
          startLat: source.lat, startLng: source.lng,
          endLat: target.lat, endLng: target.lng,
        };
      })
      .filter((a): a is ArcDatum => a !== null),
    [network.routes, nodesById],
  );

  return (
    <GlobeGL
      ref={globeRef}
      width={size.width}
      height={size.height}
      backgroundColor="#05070d"
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
      bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
      showAtmosphere
      atmosphereColor="#3b82f6"
      atmosphereAltitude={0.18}
      pointsData={network.nodes}
      pointLat="lat"
      pointLng="lng"
      pointColor={(d: object) => {
        const n = d as SupplyNode;
        return n.id === selectedNodeId ? '#f43f5e' : NODE_COLOR[n.type];
      }}
      pointRadius={(d: object) => ((d as SupplyNode).id === selectedNodeId ? 0.9 : 0.55)}
      pointAltitude={0.012}
      pointLabel={(d: object) => {
        const n = d as SupplyNode;
        return `<div style="font: 12px system-ui; background:#0b0d14cc; color:#e5e7eb; padding:4px 8px; border-radius:6px; border:1px solid #ffffff22">
          <b>${n.name}</b><br/>${n.type.replace('_', ' ')} · ${n.country}
        </div>`;
      }}
      onPointClick={(d: object) => onSelectNode(d as SupplyNode)}
      arcsData={arcs}
      arcStartLat="startLat"
      arcStartLng="startLng"
      arcEndLat="endLat"
      arcEndLng="endLng"
      arcColor={(d: object) => ROUTE_COLOR[(d as ArcDatum).route.mode]}
      arcStroke={(d: object) => Math.max(0.3, (d as ArcDatum).route.volume_teu / 12000)}
      arcDashLength={0.4}
      arcDashGap={0.6}
      arcDashAnimateTime={(d: object) => Math.max(1500, (d as ArcDatum).route.lead_time_days * 150)}
      arcAltitudeAutoScale={0.3}
      arcLabel={(d: object) => {
        const r = (d as ArcDatum).route;
        return `<div style="font: 12px system-ui; background:#0b0d14cc; color:#e5e7eb; padding:4px 8px; border-radius:6px; border:1px solid #ffffff22">
          ${r.mode} · ${r.lead_time_days}d lead time · ${r.volume_teu.toLocaleString()} TEU
        </div>`;
      }}
    />
  );
}
