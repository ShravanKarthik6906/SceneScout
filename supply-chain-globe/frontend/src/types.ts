export type NodeType = 'factory' | 'port' | 'warehouse' | 'distribution_center';

export interface SupplyNode {
  id: string;
  name: string;
  type: NodeType;
  country: string;
  lat: number;
  lng: number;
}

export type RouteMode = 'sea' | 'rail' | 'land' | 'air';

export interface SupplyRoute {
  id: string;
  source: string;
  target: string;
  mode: RouteMode;
  lead_time_days: number;
  volume_teu: number;
}

export interface Network {
  nodes: SupplyNode[];
  routes: SupplyRoute[];
}

export interface NodeDependencies {
  node: SupplyNode;
  upstream: SupplyRoute[];
  downstream: SupplyRoute[];
}
