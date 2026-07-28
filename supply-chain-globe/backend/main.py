"""FastAPI backend: serves the supply-chain network (nodes + routes) to the
React/three.js globe frontend, and hosts the dependency-graph logic that
sits between the raw data and the frontend/LLM agent.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data import NODES, ROUTES

app = FastAPI(title="Supply Chain Globe API")

# Vite's dev server runs on 5173 by default; loosened to any localhost port
# during development since the frontend's port can shift if 5173 is busy.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

NODES_BY_ID = {n["id"]: n for n in NODES}


class Node(BaseModel):
    id: str
    name: str
    type: str
    country: str
    lat: float
    lng: float


class Route(BaseModel):
    id: str
    source: str
    target: str
    mode: str
    lead_time_days: int
    volume_teu: int


class Network(BaseModel):
    nodes: list[Node]
    routes: list[Route]


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/network", response_model=Network)
def get_network():
    return {"nodes": NODES, "routes": ROUTES}


@app.get("/api/nodes/{node_id}/dependencies")
def get_dependencies(node_id: str):
    """Every route touching a node, in either direction — the seed of the
    "dependency graph logic" the frontend/LLM agent will build on. A more
    complete implementation would walk this transitively (upstream sources
    of a node's sources, and so on); this returns direct edges only.
    """
    if node_id not in NODES_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown node: {node_id}")

    upstream = [r for r in ROUTES if r["target"] == node_id]
    downstream = [r for r in ROUTES if r["source"] == node_id]
    return {
        "node": NODES_BY_ID[node_id],
        "upstream": upstream,
        "downstream": downstream,
    }
