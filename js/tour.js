// Digital-twin engine. Compiles a listing's floor plan into a walkable 3D
// scene: walls with real door openings, per-room ceilings/floors, glowing
// windows and skylights, style-based furnishing, and three camera modes
// (first-person walk, orbit dollhouse, top-down plan).
//
// In production the geometry here would be replaced by reconstructed meshes
// (Matterport SDK / Gaussian splats from listing photos); the controls,
// collision, and UI layer would stay the same.

import * as THREE from 'three';
import { generateFloorplan, hashStr, mulberry32 } from './floorplanGen.js';
import { resolvePreset, colorTempToHex } from './stylePresets.js';
import { RoomEnvironment } from '/vendor/three/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from '/vendor/three/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from '/vendor/three/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/three/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/vendor/three/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '/vendor/three/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '/vendor/three/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from '/vendor/three/jsm/shaders/FXAAShader.js';
import { mergeGeometries } from '/vendor/three/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

// No real HDR file to load (this build has no outbound network access to
// fetch one) — RectAreaLightUniformsLib.init() and a procedural PMREM
// environment (RoomEnvironment: a small lit box, not a real photo) still
// give MeshStandardMaterial/RectAreaLight correct-looking reflections and
// falloff instead of the flat, reflectionless look plain materials have
// with no environment map at all.
RectAreaLightUniformsLib.init();

const WALL_T = 0.16;
const DOOR_H = 2.1;
const EYE = 1.6;
const CROUCH_EYE = 1.02;
const TOUR_EXPOSURE = 1.3;

let ctx = null; // active tour context

// Read-only introspection for the debug route and Part 3's FPS overlay —
// no behavior depends on this, safe to leave in.
if (typeof window !== 'undefined') {
  window.__tourDebug = { pos: () => ctx ? { x: ctx.x, z: ctx.z, mode: ctx.mode } : null };
}

// ---------------------------------------------------------------- utilities

// scripts/build-catalog.js bakes one of 8 fixed room templates into every
// Kaggle-derived listing (see catalog.js's header comment) regardless of
// its real sqft, which is exactly the "every warehouse looks the same"
// problem this app is trying to get away from. Those listings are tagged
// `_source` at build time — for them, generate a floorplan from the real
// sqft/ceiling data instead of trusting the baked template. Hand-authored
// data.js locations (no `_source`) keep their authored floorplan; a debug
// fixture can force a specific floorplan via `_forceFloorplan` to test an
// edge case the generator wouldn't naturally produce (e.g. zero windows).
function resolveFloorplan(listing) {
  if (listing._forceFloorplan) return listing._forceFloorplan;
  if (!listing._source && listing.floorplan?.rooms?.length) return listing.floorplan;
  const fp = generateFloorplan(listing);
  // Belt-and-braces: even a malformed/empty authored floorplan (or a future
  // generator bug) should never leave the scene with zero rooms.
  return fp.rooms.length ? fp : generateFloorplan({ ...listing, type: 'default' });
}

function planBounds(rooms) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.x); minZ = Math.min(minZ, r.z);
    maxX = Math.max(maxX, r.x + r.w); maxZ = Math.max(maxZ, r.z + r.d);
  }
  return { minX, minZ, maxX, maxZ, w: maxX - minX, d: maxZ - minZ,
           cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

// -------------------------------------------------------- wall segmentation

// Collect every room edge onto shared lines, then compute piecewise wall
// segments where the height at each span is the tallest adjacent room.
function computeWallSegments(rooms) {
  const lines = new Map(); // key "dir:coord" -> {dir, c, edges:[{a1,a2,h}]}
  const addEdge = (dir, c, a1, a2, h) => {
    const key = `${dir}:${c.toFixed(2)}`;
    if (!lines.has(key)) lines.set(key, { dir, c, edges: [] });
    lines.get(key).edges.push({ a1, a2, h });
  };
  for (const r of rooms) {
    addEdge('h', r.z, r.x, r.x + r.w, r.h);
    addEdge('h', r.z + r.d, r.x, r.x + r.w, r.h);
    addEdge('v', r.x, r.z, r.z + r.d, r.h);
    addEdge('v', r.x + r.w, r.z, r.z + r.d, r.h);
  }

  const segments = [];
  for (const { dir, c, edges } of lines.values()) {
    const pts = [...new Set(edges.flatMap(e => [e.a1, e.a2]))].sort((a, b) => a - b);
    let run = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const a1 = pts[i], a2 = pts[i + 1], mid = (a1 + a2) / 2;
      let h = 0;
      for (const e of edges) if (mid > e.a1 && mid < e.a2) h = Math.max(h, e.h);
      if (h === 0) { run = null; continue; }
      if (run && Math.abs(run.h - h) < 0.01 && Math.abs(run.a2 - a1) < 0.01) run.a2 = a2;
      else { run = { dir, c, a1, a2, h }; segments.push(run); }
    }
  }
  return segments;
}

// Subtract door openings; returns wall pieces plus lintels above doors.
function applyDoors(segments, doors) {
  const pieces = [];
  const lintels = [];
  for (const seg of segments) {
    let spans = [{ a1: seg.a1, a2: seg.a2 }];
    for (const door of doors) {
      const dc = seg.dir === 'v' ? door.x : door.z;
      if (door.dir !== seg.dir || Math.abs(dc - seg.c) > 0.02) continue;
      const da = (seg.dir === 'v' ? door.z : door.x);
      const d1 = da - door.width / 2, d2 = da + door.width / 2;
      const next = [];
      for (const sp of spans) {
        if (d2 <= sp.a1 + 0.01 || d1 >= sp.a2 - 0.01) { next.push(sp); continue; }
        const o1 = Math.max(sp.a1, d1), o2 = Math.min(sp.a2, d2);
        if (o1 - sp.a1 > 0.05) next.push({ a1: sp.a1, a2: o1 });
        if (sp.a2 - o2 > 0.05) next.push({ a1: o2, a2: sp.a2 });
        if (seg.h > DOOR_H + 0.1) {
          lintels.push({ dir: seg.dir, c: seg.c, a1: o1, a2: o2, y1: DOOR_H, y2: seg.h });
        }
      }
      spans = next;
    }
    for (const sp of spans) pieces.push({ ...seg, a1: sp.a1, a2: sp.a2 });
  }
  return { pieces, lintels };
}

// ------------------------------------------------------------ mesh helpers

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02, ...opts });
}

function addBox(group, w, h, d, material, x, y, z, rotY = 0, shadows = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  if (shadows) { m.castShadow = true; m.receiveShadow = true; }
  group.add(m);
  return m;
}

function addCyl(group, rt, rb, h, material, x, y, z, seg = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  group.add(m);
  return m;
}

// Mullion pattern is preset-driven (see stylePresets.js's windowMullion) —
// a steel-sash industrial window reads very differently from a minimal
// contemporary pane, purely from how the frame lines are drawn here.
const windowTextures = {};
function getWindowTexture(style = 'grid') {
  if (windowTextures[style]) return windowTextures[style];
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, '#dceeff');
  grad.addColorStop(0.7, '#aac9ef');
  grad.addColorStop(1, '#e8d9b8');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 160);
  g.fillStyle = 'rgba(30,34,44,0.9)';
  g.strokeStyle = 'rgba(30,34,44,0.9)';

  if (style === 'minimal') {
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 154);
  } else if (style === 'curtainWall') {
    g.lineWidth = 8;
    for (let x = 0; x <= 128; x += 32) { g.fillRect(x - 3, 0, 6, 160); }
    g.strokeRect(0, 0, 128, 160);
  } else if (style === 'steelSash') {
    g.lineWidth = 5;
    for (let y = 0; y < 4; y++) g.fillRect(0, y * 40 - 2, 128, 5);
    g.fillRect(60, 0, 6, 160);
    g.strokeStyle = 'rgba(20,22,28,0.95)'; g.lineWidth = 10;
    g.strokeRect(0, 0, 128, 160);
  } else { // 'grid' — original default
    g.fillRect(60, 0, 8, 160); g.fillRect(0, 76, 128, 8);
    g.lineWidth = 12;
    g.strokeRect(0, 0, 128, 160);
  }

  const tex = new THREE.CanvasTexture(c);
  windowTextures[style] = tex;
  return tex;
}

// Real 3D mullion bars in front of the glass pane, matching the same
// preset-driven pattern as the backdrop texture drawn above (kept in sync
// by hand since one is a canvas and the other is geometry, but both key
// off the same `style` string).
function addWindowMullions(group, w, h, style, trimMat) {
  const bar = (bw, bh, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.03), trimMat);
    m.position.set(x, y, 0.02);
    group.add(m);
  };
  if (style === 'minimal') {
    // frame only, no interior bars
  } else if (style === 'curtainWall') {
    for (let x = -w / 2 + w / 4; x < w / 2; x += w / 4) bar(0.04, h, x, 0);
  } else if (style === 'steelSash') {
    bar(0.035, h, 0, 0);
    for (let y = -h / 2 + h / 4; y < h / 2; y += h / 4) bar(w, 0.035, 0, y);
  } else { // 'grid'
    bar(0.045, h, 0, 0);
    bar(w, 0.045, 0, 0);
  }
}

function makeLabelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 52px system-ui, sans-serif';
  const tw = Math.min(480, g.measureText(text).width + 48);
  g.fillStyle = 'rgba(10, 12, 18, 0.62)';
  g.beginPath();
  g.roundRect((512 - tw) / 2, 24, tw, 80, 40);
  g.fill();
  g.fillStyle = '#f2ede2';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(3.4, 0.85, 1);
  return sprite;
}

// ------------------------------------------------------------- furnishings

function furnish(group, room, listing, rand, density = 1) {
  const p = listing.palette;
  const cx = room.x + room.w / 2, cz = room.z + room.d / 2;
  const wood = mat('#6b4f35'), dark = mat('#23262e'), lightGray = mat('#c9cdd4');
  const accent = mat(p.accent);
  const fabric = mat(shadeHex(p.accent, -40));

  const couch = (x, z, rot) => {
    const g2 = new THREE.Group();
    addBox(g2, 2.2, 0.42, 0.95, fabric, 0, 0.21, 0);
    addBox(g2, 2.2, 0.55, 0.22, fabric, 0, 0.62, -0.37);
    addBox(g2, 0.22, 0.3, 0.95, fabric, -1, 0.55, 0);
    addBox(g2, 0.22, 0.3, 0.95, fabric, 1, 0.55, 0);
    g2.position.set(x, 0, z); g2.rotation.y = rot; group.add(g2);
  };
  const table = (x, z, w = 1.3, d = 0.75, h = 0.42) => {
    addBox(group, w, 0.06, d, wood, x, h, z);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      addBox(group, 0.06, h, 0.06, dark, x + sx * (w / 2 - 0.08), h / 2, z + sz * (d / 2 - 0.08));
  };
  const rug = (x, z, w, d, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, { roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.012, z); m.receiveShadow = true;
    group.add(m);
  };
  const plant = (x, z) => {
    addCyl(group, 0.18, 0.14, 0.35, mat('#8a5a3b'), x, 0.175, z);
    const fol = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), mat('#3f6b3a', { roughness: 1 }));
    fol.position.set(x, 0.75, z); fol.castShadow = true; group.add(fol);
  };
  const floorLamp = (x, z) => {
    addCyl(group, 0.02, 0.16, 1.5, dark, x, 0.75, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#ffe0b0' }));
    bulb.position.set(x, 1.58, z); group.add(bulb);
    const pl = new THREE.PointLight('#ffd9a0', 9, 7, 2);
    pl.position.set(x, 1.6, z); group.add(pl);
  };
  const softbox = (x, z, rot) => {
    addCyl(group, 0.025, 0.025, 1.8, dark, x, 0.9, z);
    const head = new THREE.Group();
    addBox(head, 0.75, 0.55, 0.28, dark, 0, 0, 0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.48),
      new THREE.MeshBasicMaterial({ color: '#fff6e8' }));
    face.position.z = 0.15; head.add(face);
    head.position.set(x, 1.75, z); head.rotation.y = rot; head.rotation.x = -0.25;
    group.add(head);
    const sl = new THREE.PointLight('#fff2dd', 12, 9, 2);
    sl.position.set(x, 1.8, z); group.add(sl);
  };
  const stool = (x, z) => {
    addCyl(group, 0.19, 0.19, 0.06, wood, x, 0.62, z);
    addCyl(group, 0.03, 0.05, 0.6, dark, x, 0.31, z);
  };
  const shelfRack = (x, z, rot, len = 2.4) => {
    const g2 = new THREE.Group();
    for (let i = 0; i < 3; i++) addBox(g2, len, 0.05, 0.6, mat('#7d7f86'), 0, 0.5 + i * 0.65, 0);
    addBox(g2, 0.06, 2, 0.6, dark, -len / 2 + 0.05, 1, 0);
    addBox(g2, 0.06, 2, 0.6, dark, len / 2 - 0.05, 1, 0);
    for (let i = 0; i < 4; i++) {
      addBox(g2, 0.45, 0.4, 0.45, mat(['#a08458', '#8a8f98', '#6d7d8d', '#9c6b4f'][i]),
        -len / 2 + 0.5 + i * (len - 1) / 3, 0.75 + (i % 2) * 0.65, 0);
    }
    g2.position.set(x, 0, z); g2.rotation.y = rot; group.add(g2);
  };

  switch (room.style) {
    case 'loft':
    case 'living': {
      rug(cx, cz + 0.3, Math.min(4, room.w * 0.5), Math.min(3, room.d * 0.45), shadeHex(p.floor, -25));
      couch(cx, cz + room.d * 0.22, Math.PI);
      table(cx, cz - 0.4);
      plant(room.x + 0.7, room.z + 0.7);
      floorLamp(room.x + room.w - 0.7, cz + room.d * 0.25);
      if (room.style === 'loft') { softbox(room.x + room.w * 0.72, room.z + room.d * 0.3, 2.4); stool(cx - 2, cz - 1.6); }
      break;
    }
    case 'lounge': {
      rug(cx, cz, room.w * 0.5, room.d * 0.5, shadeHex(p.floor, -25));
      couch(cx, room.z + room.d - 0.75, Math.PI);
      table(cx, cz - 0.2, 0.9, 0.6);
      plant(room.x + room.w - 0.6, room.z + 0.6);
      break;
    }
    case 'kitchen': {
      addBox(group, room.w * 0.75, 0.92, 0.64, lightGray, cx, 0.46, room.z + 0.42);
      addBox(group, room.w * 0.75, 0.05, 0.7, mat('#4a4d55'), cx, 0.95, room.z + 0.45);
      if (room.w > 4.2) { addBox(group, 2, 0.92, 1, lightGray, cx, 0.46, cz + 0.4); stool(cx - 0.7, cz + 1.3); stool(cx + 0.7, cz + 1.3); }
      break;
    }
    case 'bed': {
      const bg = new THREE.Group();
      addBox(bg, 1.9, 0.45, 1.7, mat('#d8d2c4'), 0, 0.28, 0);
      addBox(bg, 0.35, 0.16, 0.6, mat('#efe9dc'), -0.6, 0.56, -0.4);
      addBox(bg, 0.35, 0.16, 0.6, mat('#efe9dc'), -0.6, 0.56, 0.4);
      addBox(bg, 0.12, 0.9, 1.8, wood, -1, 0.45, 0);
      bg.position.set(room.x + 1.15, 0, cz); group.add(bg);
      table(room.x + 0.5, cz + 1.35, 0.5, 0.4, 0.55);
      rug(cx + 0.6, cz, 1.8, 2.4, shadeHex(p.floor, -25));
      break;
    }
    case 'office':
    case 'control': {
      addBox(group, 1.7, 0.05, 0.8, wood, cx, 0.74, room.z + 0.75);
      addBox(group, 0.08, 0.74, 0.7, dark, cx - 0.75, 0.37, room.z + 0.75);
      addBox(group, 0.08, 0.74, 0.7, dark, cx + 0.75, 0.37, room.z + 0.75);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36),
        new THREE.MeshBasicMaterial({ color: room.style === 'control' ? '#68d8ff' : '#cfe4ff' }));
      screen.position.set(cx, 1.05, room.z + 0.6); group.add(screen);
      stool(cx, room.z + 1.4);
      if (room.style === 'control') addBox(group, 2.2, 0.5, 0.5, dark, cx, 0.25, room.z + room.d - 0.6);
      break;
    }
    case 'makeup': {
      addBox(group, room.w * 0.6, 0.85, 0.5, lightGray, cx, 0.42, room.z + 0.35);
      for (let i = -1; i <= 1; i++) {
        const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.8),
          new THREE.MeshBasicMaterial({ color: '#fff1dc' }));
        mirror.position.set(cx + i * 0.85, 1.55, room.z + 0.12); group.add(mirror);
      }
      stool(cx - 0.85, room.z + 1); stool(cx, room.z + 1); stool(cx + 0.85, room.z + 1);
      break;
    }
    case 'studio': {
      // white cyc against the north wall
      const cycW = Math.min(room.w * 0.6, 12);
      addBox(group, cycW, room.h * 0.62, 0.25, mat('#f4f4f2', { roughness: 0.6 }), cx, room.h * 0.31, room.z + 0.35);
      rug(cx, room.z + room.d * 0.28, cycW, room.d * 0.4, '#efefec');
      softbox(cx - cycW * 0.42, room.z + room.d * 0.42, 0.7);
      softbox(cx + cycW * 0.42, room.z + room.d * 0.42, -0.7);
      addBox(group, 0.5, 0.2, 0.3, wood, cx - 1, 0.1, room.z + room.d * 0.6);
      addBox(group, 0.5, 0.2, 0.3, wood, cx - 1, 0.3, room.z + room.d * 0.6);
      addCyl(group, 0.025, 0.025, 1.5, dark, cx + 1.4, 0.75, room.z + room.d * 0.62);
      stool(cx + 2.2, room.z + room.d * 0.7);
      break;
    }
    case 'warehouse':
    case 'shop': {
      shelfRack(room.x + 1.6, room.z + room.d / 2, Math.PI / 2);
      if (room.w > 10) {
        shelfRack(room.x + room.w - 1.6, room.z + room.d / 2, Math.PI / 2);
        for (let i = 0; i < 4; i++) {
          addBox(group, 1.1, 0.9, 1.1, mat('#8f7a5a'),
            cx - 2 + (i % 2) * 1.4, 0.45, cz + Math.floor(i / 2) * 1.4 - 0.7);
        }
        softbox(cx - 3, cz + 3, 0.6); softbox(cx + 3, cz + 3, -0.6);
      } else {
        addBox(group, 1.8, 0.85, 0.8, wood, cx, 0.42, cz);
      }
      break;
    }
    case 'gallery': {
      for (let i = 0; i < 2; i++) {
        const px = room.x + room.w * (0.35 + i * 0.3), pz = cz + (i ? 1 : -1);
        addBox(group, 0.45, 1.1, 0.45, mat('#fafafa'), px, 0.55, pz);
        const art = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22),
          mat([p.accent, '#5aa7e8'][i], { roughness: 0.35, metalness: 0.5 }));
        art.position.set(px, 1.35, pz); art.castShadow = true; group.add(art);
      }
      for (let i = 0; i < 3; i++) {
        const fx = room.x + room.w * (0.25 + i * 0.25);
        addBox(group, 1.1, 1.4, 0.06, dark, fx, 1.7, room.z + 0.1);
        const cv = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.25),
          mat(['#b8543d', '#3d6bb8', '#c9a13c'][i], { roughness: 0.7 }));
        cv.position.set(fx, 1.7, room.z + 0.14); group.add(cv);
      }
      break;
    }
    case 'bar': {
      addBox(group, room.w * 0.6, 1.05, 0.7, mat('#4a2e20'), cx, 0.52, room.z + room.d - 1);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(room.w * 0.6, 0.1),
        new THREE.MeshBasicMaterial({ color: p.accent }));
      glow.rotation.x = Math.PI / 2; glow.position.set(cx, 0.06, room.z + room.d - 1.4); group.add(glow);
      for (let i = 0; i < 4; i++) stool(cx - room.w * 0.22 + i * room.w * 0.15, room.z + room.d - 1.75);
      for (let i = 0; i < 6; i++) {
        addCyl(group, 0.045, 0.045, 0.3, mat(['#7fd4a8', '#d4a87f', '#a87fd4', '#d47f7f', '#7fa8d4', '#d4d47f'][i], { roughness: 0.2 }),
          cx - 1 + i * 0.4, 1.6, room.z + room.d - 0.4, 8);
      }
      addBox(group, room.w * 0.5, 0.08, 0.3, wood, cx, 1.42, room.z + room.d - 0.4);
      const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5),
        new THREE.MeshBasicMaterial({ color: p.accent, transparent: true, opacity: 0.95 }));
      neon.position.set(cx, 2.5, room.z + room.d - 0.2); neon.rotation.y = Math.PI; group.add(neon);
      const nl = new THREE.PointLight(p.accent, 10, 8, 2);
      nl.position.set(cx, 2.4, room.z + room.d - 0.8); group.add(nl);
      break;
    }
    case 'ballroom': {
      const ch = new THREE.Group();
      addCyl(ch, 0.015, 0.015, 1, dark, 0, -0.5, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6),
          new THREE.MeshBasicMaterial({ color: '#ffe9c0' }));
        bead.position.set(Math.cos(a) * 0.45, -1.05, Math.sin(a) * 0.45); ch.add(bead);
      }
      ch.position.set(cx, room.h, cz); group.add(ch);
      const cl = new THREE.PointLight('#ffe2b0', 26, 14, 2);
      cl.position.set(cx, room.h - 1.3, cz); group.add(cl);
      addBox(group, 1.6, 0.5, 2.4, mat('#141414', { roughness: 0.25 }), room.x + room.w * 0.75, 0.5, cz, 0.4);
      addBox(group, 0.9, 0.25, 0.35, dark, room.x + room.w * 0.75 - 1.2, 0.32, cz + 0.6, 0.4);
      break;
    }
    case 'foyer': {
      addCyl(group, 0.55, 0.5, 0.78, wood, cx, 0.39, cz, 20);
      plant(cx, cz);
      const circ = new THREE.Mesh(new THREE.CircleGeometry(1.6, 28), mat(shadeHex(p.floor, -30), { roughness: 1 }));
      circ.rotation.x = -Math.PI / 2; circ.position.set(cx, 0.012, cz); circ.receiveShadow = true; group.add(circ);
      break;
    }
    case 'library': {
      addBox(group, room.w * 0.7, 2.4, 0.35, mat('#4a382a'), cx, 1.2, room.z + 0.25);
      for (let i = 0; i < 3; i++) addBox(group, room.w * 0.66, 0.04, 0.3, wood, cx, 0.6 + i * 0.6, room.z + 0.27);
      couch(cx, cz + 1, Math.PI);
      floorLamp(room.x + 0.6, cz);
      break;
    }
    case 'dining': {
      table(cx, cz, Math.min(2.6, room.w * 0.45), 1.1, 0.75);
      for (let i = 0; i < 3; i++) {
        addBox(group, 0.42, 0.9, 0.42, wood, cx - 0.9 + i * 0.9, 0.45, cz - 0.95);
        addBox(group, 0.42, 0.9, 0.42, wood, cx - 0.9 + i * 0.9, 0.45, cz + 0.95);
      }
      const dl = new THREE.PointLight('#ffe0b8', 12, 8, 2);
      dl.position.set(cx, room.h - 0.7, cz); group.add(dl);
      break;
    }
    case 'conservatory': {
      plant(room.x + 0.7, room.z + room.d - 0.7);
      plant(room.x + room.w - 0.7, room.z + room.d - 0.7);
      plant(room.x + room.w - 0.7, room.z + 0.7);
      addBox(group, 1.6, 0.45, 0.5, wood, cx, 0.22, cz);
      break;
    }
    case 'deck': {
      for (let i = 0; i < 2; i++) {
        const lg = new THREE.Group();
        addBox(lg, 0.7, 0.25, 1.7, fabric, 0, 0.2, 0);
        addBox(lg, 0.7, 0.5, 0.3, fabric, 0, 0.35, -0.85);
        lg.position.set(room.x + room.w * 0.3 + i * 1.2, 0, room.z + room.d * 0.4);
        lg.rotation.y = -0.3; group.add(lg);
      }
      // fire pit
      addCyl(group, 0.55, 0.6, 0.35, mat('#5a5e66'), room.x + room.w * 0.68, 0.17, room.z + room.d * 0.6, 20);
      const fire = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6),
        new THREE.MeshBasicMaterial({ color: '#ff9d4d' }));
      fire.position.set(room.x + room.w * 0.68, 0.42, room.z + room.d * 0.6); group.add(fire);
      const fl = new THREE.PointLight('#ff9d4d', 10, 7, 2);
      fl.position.set(room.x + room.w * 0.68, 0.7, room.z + room.d * 0.6); group.add(fl);
      // planters + string lights
      addBox(group, 1.4, 0.5, 0.45, mat('#4c5158'), room.x + 1, 0.25, room.z + 0.45);
      plant(room.x + 1, room.z + 0.45);
      const poles = [[room.x + 0.5, room.z + 0.5], [room.x + room.w - 0.5, room.z + room.d - 0.5]];
      for (const [px, pz] of poles) addCyl(group, 0.03, 0.03, 2.6, dark, px, 1.3, pz);
      for (let i = 1; i < 9; i++) {
        const t = i / 9;
        const lx = poles[0][0] + (poles[1][0] - poles[0][0]) * t;
        const lz = poles[0][1] + (poles[1][1] - poles[0][1]) * t;
        const sag = Math.sin(t * Math.PI) * 0.5;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5),
          new THREE.MeshBasicMaterial({ color: '#ffd9a0' }));
        bulb.position.set(lx, 2.55 - sag, lz); group.add(bulb);
      }
      const sl2 = new THREE.PointLight('#ffd9a0', 8, 10, 2);
      sl2.position.set(cx, 2.2, cz); group.add(sl2);
      break;
    }
    case 'bath': {
      addBox(group, 0.6, 0.42, 0.42, lightGray, room.x + 0.4, 0.21, room.z + 0.35);
      addBox(group, 0.55, 0.75, 0.5, lightGray, room.x + room.w - 0.4, 0.38, room.z + 0.3);
      const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.65),
        new THREE.MeshBasicMaterial({ color: '#dfeaf5' }));
      mirror.position.set(room.x + room.w - 0.4, 1.4, room.z + 0.06); group.add(mirror);
      break;
    }
    case 'hall': {
      // Circulation only — deliberately minimal so it reads as a passage,
      // not a destination, but never bare/broken.
      rug(cx, cz, Math.min(room.w * 0.7, room.d - 0.4), Math.min(room.d * 0.8, room.w - 0.4), shadeHex(p.floor, -20));
      const sconce = new THREE.PointLight('#ffe6c2', 5, 4, 2);
      sconce.position.set(cx, room.h - 0.4, cz); group.add(sconce);
      break;
    }
    case 'storage': {
      shelfRack(cx, room.z + 0.5, 0, Math.min(room.w * 0.8, 3));
      break;
    }
    // Any room style the app doesn't have a specific archetype for yet
    // (a new StylePreset, a debug fixture, an unrecognized type) — render
    // something plausible rather than an empty box.
    default: {
      rug(cx, cz, Math.min(3, room.w * 0.6), Math.min(2.2, room.d * 0.6), shadeHex(p.floor, -20));
      table(cx, cz, Math.min(1.1, room.w * 0.3), Math.min(0.7, room.d * 0.3));
      break;
    }
  }
  // tiny deterministic scatter so rooms don't feel copy-pasted
  if (rand() > 1 - 0.5 * density && room.w > 4 && !['deck', 'studio', 'hall'].includes(room.style)) {
    plant(room.x + room.w - 0.55, room.z + room.d - 0.55);
  }
}

function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ------------------------------------------------------------ scene build

function buildScene(listing, fp) {
  const rooms = fp.rooms;
  const b = planBounds(rooms);
  const p = listing.palette;
  const outdoor = !!listing.outdoor;
  const preset = resolvePreset(listing);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(outdoor ? '#141b2a' : '#0b0d13');
  scene.fog = new THREE.Fog(scene.background, 40, 120);

  const wallMat = mat(p.wall, preset.wallFinish);
  const floorMats = {};
  const ceilings = new THREE.Group();

  // ground slab beneath everything
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(b.w + 40, b.d + 40),
    mat(outdoor ? '#10151f' : '#15181f', { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(b.cx, -0.03, b.cz);
  ground.receiveShadow = true;
  scene.add(ground);

  // walls — every solid piece also gets pushed into collisionGeos (already
  // in world space via .translate(), so a straight merge is enough) for
  // the BVH collider built below. Door openings are genuinely absent from
  // this geometry (applyDoors already cut them out), not flagged/ignored,
  // so collision against it is exact rather than approximated.
  const collisionGeos = [];
  const segments = computeWallSegments(rooms);
  const { pieces, lintels } = applyDoors(segments, fp.doors);
  for (const w of pieces) {
    const len = w.a2 - w.a1, mid = (w.a1 + w.a2) / 2;
    const geo = w.dir === 'h'
      ? new THREE.BoxGeometry(len, w.h, WALL_T)
      : new THREE.BoxGeometry(WALL_T, w.h, len);
    const m = new THREE.Mesh(geo, wallMat);
    m.position.set(w.dir === 'h' ? mid : w.c, w.h / 2, w.dir === 'h' ? w.c : mid);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    collisionGeos.push(geo.clone().translate(m.position.x, m.position.y, m.position.z));
  }
  for (const l of lintels) {
    const len = l.a2 - l.a1, mid = (l.a1 + l.a2) / 2, h = l.y2 - l.y1;
    const geo = l.dir === 'h'
      ? new THREE.BoxGeometry(len, h, WALL_T)
      : new THREE.BoxGeometry(WALL_T, h, len);
    const m = new THREE.Mesh(geo, wallMat);
    m.position.set(l.dir === 'h' ? mid : l.c, (l.y1 + l.y2) / 2, l.dir === 'h' ? l.c : mid);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    // lintels sit above DOOR_H — irrelevant to a ~1.7m-tall player capsule,
    // skipped from collision on purpose (not an oversight).
  }

  // baseboard + door-frame trim, derived from the same wall/door geometry
  // above rather than a per-listing constant — works for any wall run or
  // door count since it just rides along pieces/fp.doors.
  const trimMat = mat(shadeHex(p.wall, -38), { roughness: 0.55 });
  const BB_H = 0.11, BB_OUT = WALL_T / 2 + 0.015;
  for (const w of pieces) {
    const len = w.a2 - w.a1, mid = (w.a1 + w.a2) / 2;
    const geo = w.dir === 'h'
      ? new THREE.BoxGeometry(len, BB_H, WALL_T + BB_OUT)
      : new THREE.BoxGeometry(WALL_T + BB_OUT, BB_H, len);
    const bb = new THREE.Mesh(geo, trimMat);
    bb.position.set(w.dir === 'h' ? mid : w.c, BB_H / 2, w.dir === 'h' ? w.c : mid);
    bb.receiveShadow = true;
    scene.add(bb);
  }
  const FRAME_W = 0.08;
  for (const d of fp.doors) {
    const jambH = DOOR_H + FRAME_W * 0.5;
    if (d.dir === 'v') {
      for (const side of [-1, 1]) {
        const jambGeo = new THREE.BoxGeometry(FRAME_W, jambH, FRAME_W);
        const jamb = new THREE.Mesh(jambGeo, trimMat);
        jamb.position.set(d.x, jambH / 2, d.z + side * (d.width / 2));
        jamb.castShadow = true; scene.add(jamb);
        collisionGeos.push(jambGeo.clone().translate(jamb.position.x, jamb.position.y, jamb.position.z));
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(FRAME_W, FRAME_W, d.width + FRAME_W), trimMat);
      head.position.set(d.x, DOOR_H + FRAME_W / 2, d.z);
      scene.add(head);
    } else {
      for (const side of [-1, 1]) {
        const jambGeo = new THREE.BoxGeometry(FRAME_W, jambH, FRAME_W);
        const jamb = new THREE.Mesh(jambGeo, trimMat);
        jamb.position.set(d.x + side * (d.width / 2), jambH / 2, d.z);
        jamb.castShadow = true; scene.add(jamb);
        collisionGeos.push(jambGeo.clone().translate(jamb.position.x, jamb.position.y, jamb.position.z));
      }
      const head = new THREE.Mesh(new THREE.BoxGeometry(d.width + FRAME_W, FRAME_W, FRAME_W), trimMat);
      head.position.set(d.x, DOOR_H + FRAME_W / 2, d.z);
      scene.add(head);
    }
  }

  // Collision BVH — a real accelerated structure over the actual wall/jamb
  // solids (see the collisionGeos.push() calls above), not an approximation
  // of them. Works unchanged for non-rectangular aggregate footprints or
  // any future non-axis-aligned geometry, since it's built from the real
  // meshes rather than per-room bounding boxes.
  const collisionGeometry = mergeGeometries(collisionGeos, false);
  collisionGeometry.computeBoundsTree();
  const collisionBVH = new MeshBVH(collisionGeometry);

  // floors, ceilings, windows, skylights, furniture, labels, room lights
  const winTex = getWindowTexture(preset.windowMullion);
  // RectAreaLight uses an LTC shading model that's real-time-expensive per
  // light — a 13-room house can have 30+ window openings, and a light per
  // window would tank frame rate on exactly the large/generous layouts
  // Stage 0 now generates. Budget it: every window still gets its glass/
  // mullion geometry (so the room never looks unlit or broken), but only
  // the first WINDOW_LIGHT_BUDGET actually get a real light — the per-room
  // point light already covers general fill for the rest.
  const WINDOW_LIGHT_BUDGET = 24;
  let windowLightsUsed = 0;
  const rand = mulberry32(hashStr(listing.id));
  for (const r of rooms) {
    const fkey = r.style === 'studio' || r.style === 'gallery' ? '#e8e8e6' : p.floor;
    if (!floorMats[fkey]) floorMats[fkey] = mat(fkey, preset.floorFinish);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), floorMats[fkey]);
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(r.x + r.w / 2, 0, r.z + r.d / 2);
    fl.receiveShadow = true;
    scene.add(fl);

    if (!r.open) {
      const ce = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), mat(shadeHex(p.wall, 22)));
      ce.rotation.x = Math.PI / 2;
      ce.position.set(r.x + r.w / 2, r.h, r.z + r.d / 2);
      ceilings.add(ce);

      if (r.sky) {
        for (let i = 0; i < r.sky; i++) {
          const sx = r.x + (i + 1) * r.w / (r.sky + 1);
          const skm = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2),
            new THREE.MeshBasicMaterial({ color: '#dceeff' }));
          skm.rotation.x = Math.PI / 2;
          skm.position.set(sx, r.h - 0.02, r.z + r.d / 2);
          ceilings.add(skm);
        }
      }
    }

    // windows: a canvas-textured backdrop (the "sky" beyond the glass) plus
    // a transmissive glass pane and preset-driven mullion bars in front of
    // it, and a RectAreaLight sized to the opening so the window is an
    // actual light source into the room, not just a lit-looking texture.
    const win = r.win || {};
    const winPlane = (wall, i, count) => {
      const W = 1.5, H = 1.7;
      const off = WALL_T / 2 + 0.03;
      const y = Math.min(0.95 + 0.85, r.h - 0.5); // center of window
      let x, z, rotY;
      if (wall === 'n') { x = r.x + (i + 1) * r.w / (count + 1); z = r.z + off; rotY = 0; }
      else if (wall === 's') { x = r.x + (i + 1) * r.w / (count + 1); z = r.z + r.d - off; rotY = Math.PI; }
      else if (wall === 'w') { x = r.x + off; z = r.z + (i + 1) * r.d / (count + 1); rotY = Math.PI / 2; }
      else { x = r.x + r.w - off; z = r.z + (i + 1) * r.d / (count + 1); rotY = -Math.PI / 2; }

      const group = new THREE.Group();
      group.position.set(x, y, z);
      group.rotation.y = rotY;

      const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: winTex }));
      backdrop.position.z = -0.015;
      group.add(backdrop);

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, H * 0.92), new THREE.MeshPhysicalMaterial({
        color: '#dceeff', transmission: 0.9, roughness: 0.06, metalness: 0, thickness: 0.02,
        ior: 1.5, transparent: true, opacity: 0.35,
      }));
      group.add(glass);

      addWindowMullions(group, W, H, preset.windowMullion, trimMat);

      if (windowLightsUsed < WINDOW_LIGHT_BUDGET) {
        windowLightsUsed++;
        const rl = new THREE.RectAreaLight(colorTempToHex(6500), 3.2, W * 0.9, H * 0.9);
        rl.position.z = -0.05;
        rl.rotation.y = Math.PI; // RectAreaLight emits along -Z of its local frame
        group.add(rl);
      }

      scene.add(group);
    };
    for (const wall of ['n', 's', 'e', 'w']) {
      const count = win[wall] || 0;
      for (let i = 0; i < count; i++) winPlane(wall, i, count);
    }

    // per-room fill light
    if (!r.open) {
      const rl = new THREE.PointLight('#fff1e0', Math.min(60, 12 + r.w * r.d * 0.5), 0, 2);
      rl.position.set(r.x + r.w / 2, r.h - 0.4, r.z + r.d / 2);
      scene.add(rl);
    }

    furnish(scene, r, listing, rand, preset.furnitureDensity);

    const label = makeLabelSprite(r.name);
    label.position.set(r.x + r.w / 2, Math.min(r.h - 0.35, 2.45), r.z + r.d / 2);
    if (r.open) label.position.y = 2.2;
    scene.add(label);
  }
  scene.add(ceilings);

  // global lighting — color temperature and intensity come from the
  // resolved StylePreset rather than being fixed for every scene; the
  // outdoor multiplier on top preserves exteriors reading brighter than
  // interiors regardless of which preset a listing resolved to.
  const sunColor = colorTempToHex(preset.lightTempK);
  const hemi = new THREE.HemisphereLight('#bfd4ff', '#4a3f36', preset.hemiIntensity * (outdoor ? 1.45 : 1));
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(sunColor, preset.sunIntensity * (outdoor ? 1.25 : 1));
  sun.position.set(b.cx + b.w, Math.max(b.w, b.d) * 0.9, b.cz + b.d * 0.6);
  sun.target.position.set(b.cx, 0, b.cz);
  sun.castShadow = true;
  const ext = Math.max(b.w, b.d) * 0.75 + 4;
  sun.shadow.camera.left = -ext; sun.shadow.camera.right = ext;
  sun.shadow.camera.top = ext; sun.shadow.camera.bottom = -ext;
  sun.shadow.camera.far = 200;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  if (outdoor) {
    // distant "skyline" blocks for rooftop views
    const skyMat = new THREE.MeshBasicMaterial({ color: '#1d2636' });
    const litMat = new THREE.MeshBasicMaterial({ color: '#39465e' });
    const r2 = mulberry32(99);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const dist = 34 + r2() * 22;
      const bw = 4 + r2() * 7, bh = 6 + r2() * 22;
      const bx = b.cx + Math.cos(a) * dist, bz = b.cz + Math.sin(a) * dist;
      const bld = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw), r2() > 0.5 ? skyMat : litMat);
      bld.position.set(bx, bh / 2 - 6, bz);
      scene.add(bld);
    }
  }

  for (const g of collisionGeos) g.dispose();

  return { scene, ceilings, bounds: b, collisionBVH };
}

// ------------------------------------------------------------- collision

// Resolves horizontal movement against the wall/jamb BVH (see collisionBVH
// in buildScene) by sampling two heights — near-floor and near-torso — and
// pushing the player out of anything the sample sphere penetrates. This
// replaces the old per-room bounding-box canStand(): it queries the actual
// wall/jamb solids rather than assuming every room is a clean rectangle,
// so it stays correct if a future floorplan ever has non-axis-aligned or
// non-rectangular walls, not just the ones this generator currently makes.
const PLAYER_RADIUS = 0.3;
const _cpPoint = new THREE.Vector3();
const _cpTarget = {};
function resolveCollision(bvh, x, z, eyeHeight) {
  let px = x, pz = z;
  for (let iter = 0; iter < 3; iter++) {
    for (const y of [0.4, Math.min(eyeHeight, 1.5)]) {
      _cpPoint.set(px, y, pz);
      const hit = bvh.closestPointToPoint(_cpPoint, _cpTarget, 0, PLAYER_RADIUS);
      if (!hit) continue;
      const dx = px - hit.point.x, dz = pz - hit.point.z;
      const horizDist = Math.hypot(dx, dz);
      if (horizDist < PLAYER_RADIUS && horizDist > 1e-5) {
        const push = PLAYER_RADIUS - horizDist;
        px += (dx / horizDist) * push;
        pz += (dz / horizDist) * push;
      }
    }
  }
  return { x: px, z: pz };
}

// Independent reachability check — floods the room-adjacency graph implied
// by fp.doors (which room each door actually connects, sampled directly
// from room bounds either side of it) rather than trusting the generator's
// own construction guarantee. Never blocks opening the tour, just warns —
// a broken layout should still be explorable, not fail outright.
function validateReachability(fp) {
  const rooms = fp.rooms;
  if (!rooms.length) return;
  const roomAt = (x, z) => rooms.findIndex(r =>
    x > r.x - 0.05 && x < r.x + r.w + 0.05 && z > r.z - 0.05 && z < r.z + r.d + 0.05);
  const adj = rooms.map(() => new Set());
  for (const d of fp.doors) {
    const [n1, n2] = d.dir === 'v'
      ? [{ x: d.x - 0.3, z: d.z }, { x: d.x + 0.3, z: d.z }]
      : [{ x: d.x, z: d.z - 0.3 }, { x: d.x, z: d.z + 0.3 }];
    const a = roomAt(n1.x, n1.z), b = roomAt(n2.x, n2.z);
    if (a >= 0 && b >= 0 && a !== b) { adj[a].add(b); adj[b].add(a); }
  }
  const seen = new Set([0]), queue = [0];
  while (queue.length) {
    const cur = queue.pop();
    for (const next of adj[cur]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  const unreachable = rooms.filter((_, i) => !seen.has(i)).map(r => r.name);
  if (unreachable.length) console.warn('[tour] unreachable from spawn:', unreachable);
}

// --------------------------------------------------------------- controls

function setupControls(dom) {
  const st = {
    keys: new Set(),
    dragging: false, lastX: 0, lastY: 0,
    pinchDist: 0,
  };
  st.onKeyDown = (e) => {
    if (e.repeat) return;
    st.keys.add(e.code);
    if (e.code === 'Escape') { if (ctx && ctx.measure.on) toggleMeasure(); else closeTour(); return; }
    if (!ctx) return;
    if (ctx.mode === 'fly') { setMode('walk'); return; }
    if (e.code === 'KeyM' && ctx.mode === 'walk') toggleMeasure();
    if (e.code === 'KeyB') ctx.composer.bloomPass.enabled = !ctx.composer.bloomPass.enabled;
    if (e.code === 'KeyF') ctx.composer.fxaaPass.enabled = !ctx.composer.fxaaPass.enabled;
  };
  st.onKeyUp = (e) => st.keys.delete(e.code);
  st.onPointerDown = (e) => {
    if (ctx && ctx.mode === 'fly') { setMode('walk'); return; }
    st.dragging = true; st.lastX = st.downX = e.clientX; st.lastY = st.downY = e.clientY; st.moved = 0;
    try { dom.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
  };
  st.onPointerUp = (e) => {
    st.dragging = false;
    if (ctx && ctx.measure.on && ctx.mode === 'walk' && st.moved < 6) measureAt(e.clientX, e.clientY, dom);
  };
  st.onPointerMove = (e) => {
    if (!st.dragging || !ctx) return;
    const dx = e.clientX - st.lastX, dy = e.clientY - st.lastY;
    st.lastX = e.clientX; st.lastY = e.clientY;
    st.moved += Math.abs(dx) + Math.abs(dy);
    if (ctx.mode === 'walk') {
      ctx.yaw -= dx * 0.0032;
      ctx.pitch = Math.max(-1.35, Math.min(1.35, ctx.pitch - dy * 0.0032));
    } else {
      ctx.orbitTheta -= dx * 0.005;
      ctx.orbitPhi = Math.max(0.12, Math.min(1.45, ctx.orbitPhi - dy * 0.004));
    }
  };
  st.onWheel = (e) => {
    e.preventDefault();
    if (!ctx) return;
    if (ctx.mode === 'walk') {
      ctx.fov = Math.max(28, Math.min(95, ctx.fov + e.deltaY * 0.04));
    } else {
      ctx.orbitR = Math.max(4, Math.min(90, ctx.orbitR * (1 + e.deltaY * 0.0012)));
    }
  };
  window.addEventListener('keydown', st.onKeyDown);
  window.addEventListener('keyup', st.onKeyUp);
  dom.addEventListener('pointerdown', st.onPointerDown);
  dom.addEventListener('pointerup', st.onPointerUp);
  dom.addEventListener('pointermove', st.onPointerMove);
  dom.addEventListener('wheel', st.onWheel, { passive: false });
  return st;
}

function teardownControls(st, dom) {
  window.removeEventListener('keydown', st.onKeyDown);
  window.removeEventListener('keyup', st.onKeyUp);
  dom.removeEventListener('pointerdown', st.onPointerDown);
  dom.removeEventListener('pointerup', st.onPointerUp);
  dom.removeEventListener('pointermove', st.onPointerMove);
  dom.removeEventListener('wheel', st.onWheel);
}

// ---------------------------------------------------------------- minimap

function drawMinimap(canvas, fp, bounds, x, z, yaw) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(10,13,19,0.78)';
  g.beginPath(); g.roundRect(0, 0, W, H, 12); g.fill();

  const pad = 14;
  const s = Math.min((W - pad * 2) / bounds.w, (H - pad * 2) / bounds.d);
  const ox = (W - bounds.w * s) / 2 - bounds.minX * s;
  const oz = (H - bounds.d * s) / 2 - bounds.minZ * s;

  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1.4;
  for (const r of fp.rooms) {
    g.fillRect(ox + r.x * s, oz + r.z * s, r.w * s, r.d * s);
    g.strokeRect(ox + r.x * s, oz + r.z * s, r.w * s, r.d * s);
  }
  g.strokeStyle = '#e8b45a';
  g.lineWidth = 3;
  for (const d of fp.doors) {
    g.beginPath();
    if (d.dir === 'v') {
      g.moveTo(ox + d.x * s, oz + (d.z - d.width / 2) * s);
      g.lineTo(ox + d.x * s, oz + (d.z + d.width / 2) * s);
    } else {
      g.moveTo(ox + (d.x - d.width / 2) * s, oz + d.z * s);
      g.lineTo(ox + (d.x + d.width / 2) * s, oz + d.z * s);
    }
    g.stroke();
  }
  // player arrow — camera faces -Z at yaw 0, screen up is -z
  const px = ox + x * s, pz = oz + z * s;
  g.save();
  g.translate(px, pz);
  g.rotate(-yaw);
  g.fillStyle = '#7fb4ff';
  g.beginPath();
  g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6);
  g.closePath(); g.fill();
  g.restore();
}

// ------------------------------------------------------------ post-processing
// A light stack rather than the full SSAO/GTAO the spec describes — SSAO's
// jsm implementation pulls in a much larger shader/texture dependency
// chain, and this build can't fetch anything beyond what's vendored
// locally. Bloom (mild, so it reads as light bleeding off windows/fixtures,
// not a glow filter) + FXAA + a correct tone-mapped output pass covers most
// of the visible gap. Each pass is independently toggleable via .enabled —
// press B / F in walk mode to see the difference.
function buildComposer(renderer, scene, camera, wrap) {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.55, 0.86);
  composer.addPass(bloom);

  const fxaa = new ShaderPass(FXAAShader);
  const pr = renderer.getPixelRatio();
  fxaa.material.uniforms['resolution'].value.set(1 / (w * pr), 1 / (h * pr));
  composer.addPass(fxaa);

  composer.addPass(new OutputPass());

  composer.bloomPass = bloom;
  composer.fxaaPass = fxaa;
  return composer;
}

// ------------------------------------------------------------ public API

export function openTour(listing, opts = {}) {
  closeTour();

  const overlay = document.getElementById('tour');
  overlay.classList.remove('hidden');
  document.getElementById('tour-title').innerHTML =
    `<strong>${listing.name}</strong><span>Digital twin · procedural reconstruction</span>`;

  const wrap = document.getElementById('tour-canvas-wrap');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TOUR_EXPOSURE;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  wrap.appendChild(renderer.domElement);

  const fp = resolveFloorplan(listing);
  validateReachability(fp);
  const { scene, ceilings, bounds, collisionBVH } = buildScene(listing, fp);

  // Procedural PMREM environment (see the RoomEnvironment import note
  // above) — gives every MeshStandardMaterial/RectAreaLight in the scene
  // plausible reflections instead of looking flat with no envMap at all.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(70, wrap.clientWidth / wrap.clientHeight, 0.05, 300);
  camera.rotation.order = 'YXZ';

  const composer = buildComposer(renderer, scene, camera, wrap);

  const spawnRoom = fp.rooms[0];
  const controls = setupControls(renderer.domElement);

  ctx = {
    listing, fp, renderer, scene, camera, ceilings, bounds, controls, pmrem, composer, collisionBVH,
    mode: 'walk',
    x: spawnRoom.x + spawnRoom.w / 2, z: spawnRoom.z + spawnRoom.d / 2,
    yaw: Math.PI * 0.75, pitch: 0, fov: 70,
    vel: { x: 0, z: 0 }, crouch: false,
    orbitTheta: -0.7, orbitPhi: 0.9, orbitR: Math.max(bounds.w, bounds.d) * 1.25,
    fly: null, flyPath: buildFlyPath(fp, bounds),
    measure: { on: false, pts: [], group: new THREE.Group(), ray: new THREE.Raycaster() },
    raf: 0, lastT: performance.now(),
  };
  scene.add(ctx.measure.group);

  // room jump chips
  const roomsBar = document.getElementById('tour-rooms');
  roomsBar.innerHTML = '';
  for (const r of fp.rooms) {
    const btn = document.createElement('button');
    btn.textContent = r.name;
    btn.onclick = () => {
      setMode('walk');
      ctx.x = r.x + r.w / 2; ctx.z = r.z + r.d / 2;
    };
    roomsBar.appendChild(btn);
  }

  document.querySelectorAll('#tour-modes button').forEach(b => {
    b.onclick = () => setMode(b.dataset.mode);
  });
  document.getElementById('tour-close').onclick = closeTour;

  ctx.onResize = () => {
    if (!ctx) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    composer.fxaaPass.material.uniforms['resolution'].value.set(1 / (w * pr), 1 / (h * pr));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', ctx.onResize);

  setMode(opts.mode === 'fly' ? 'fly' : 'walk');
  loop();
}

// ------------------------------------------------------- cinematic flythrough
// A keyframed camera path: a high exterior orbit that dives to the entrance,
// then glides through the room centers at eye level. Catmull-Rom smoothed.
function buildFlyPath(fp, b) {
  const rooms = fp.rooms;
  const pts = [], looks = [];
  const R = Math.max(b.w, b.d);
  // opening exterior sweep
  for (let i = 0; i < 4; i++) {
    const a = -0.6 + i * 0.5;
    pts.push(new THREE.Vector3(b.cx + Math.sin(a) * R * 1.1, R * 0.85 - i * R * 0.12, b.cz + Math.cos(a) * R * 1.1));
    looks.push(new THREE.Vector3(b.cx, R * 0.1, b.cz));
  }
  // descend toward the first room, then walk the rooms at eye height
  const ordered = [...rooms].sort((a, c) => (a.x + a.z) - (c.x + c.z));
  ordered.forEach((r, i) => {
    const cx = r.x + r.w / 2, cz = r.z + r.d / 2;
    const y = r.open ? 1.9 : Math.min(EYE + 0.15, r.h - 0.4);
    pts.push(new THREE.Vector3(cx, y, cz));
    const nxt = ordered[(i + 1) % ordered.length];
    looks.push(new THREE.Vector3(nxt.x + nxt.w / 2, y, nxt.z + nxt.d / 2));
  });
  return {
    pos: new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4),
    look: new THREE.CatmullRomCurve3(looks, false, 'catmullrom', 0.4),
    dur: 7.5 + ordered.length * 1.6,
  };
}

function updateFly(dt) {
  const f = ctx.fly;
  f.t += dt / ctx.flyPath.dur;
  if (f.t >= 1) { setMode('walk'); return; }
  const ease = f.t < 0.12 ? f.t / 0.12 : 1; // gentle start
  const p = ctx.flyPath.pos.getPoint(f.t);
  const l = ctx.flyPath.look.getPoint(Math.min(1, f.t + 0.02));
  ctx.camera.position.copy(p);
  ctx.camera.lookAt(l);
  const targetFov = 58 - 6 * Math.sin(f.t * Math.PI);
  ctx.camera.fov += (targetFov - ctx.camera.fov) * 0.1 * ease;
  ctx.camera.updateProjectionMatrix();
}

// ---------------------------------------------------------- measurement tool
function toggleMeasure() {
  const m = ctx.measure;
  m.on = !m.on;
  if (!m.on) clearMeasure();
  document.getElementById('tour-help').textContent = m.on
    ? 'Measure: click two points on the floor · press M again to exit'
    : walkHelp();
}
function clearMeasure() {
  ctx.measure.group.clear();
  ctx.measure.pts = [];
}
function addMeasurePoint(worldPt) {
  const m = ctx.measure;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#e8b45a' }));
  dot.position.copy(worldPt); m.group.add(dot);
  m.pts.push(worldPt.clone());
  if (m.pts.length === 2) {
    const [a, bb] = m.pts;
    const geo = new THREE.BufferGeometry().setFromPoints([a, bb]);
    m.group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#e8b45a' })));
    const dist = a.distanceTo(bb);
    const mid = a.clone().add(bb).multiplyScalar(0.5); mid.y += 0.25;
    const label = makeLabelSprite(`${dist.toFixed(2)} m · ${(dist * 3.281).toFixed(1)} ft`);
    label.position.copy(mid); label.scale.set(2.6, 0.65, 1);
    m.group.add(label);
    m.pts = []; // next click starts a fresh measurement pair
  }
}
function walkHelp() {
  return 'Drag to look · WASD to move · Shift run · C crouch · M measure · B bloom · F antialiasing · Esc exit';
}

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function measureAt(clientX, clientY, dom) {
  const rect = dom.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1);
  ctx.measure.ray.setFromCamera(ndc, ctx.camera);
  const hit = new THREE.Vector3();
  if (ctx.measure.ray.ray.intersectPlane(GROUND_PLANE, hit)) addMeasurePoint(hit);
}

function setMode(mode) {
  if (!ctx) return;
  ctx.mode = mode;
  ctx.ceilings.visible = (mode === 'walk' || mode === 'fly');
  if (mode !== 'walk' && ctx.measure.on) toggleMeasure();
  document.querySelectorAll('#tour-modes button').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('tour-minimap').style.display = mode === 'walk' ? 'block' : 'none';
  document.getElementById('tour-help').textContent =
    mode === 'walk' ? walkHelp()
    : mode === 'fly' ? '🎬 Cinematic flythrough · press any key or click to take control'
    : mode === 'orbit' ? 'Drag to orbit the dollhouse · Scroll to zoom'
    : 'Drag to rotate the plan · Scroll to zoom';
  if (mode === 'plan') { ctx.orbitPhi = 0.14; ctx.orbitR = Math.max(ctx.bounds.w, ctx.bounds.d) * 1.35; }
  if (mode === 'orbit' && ctx.orbitPhi < 0.4) ctx.orbitPhi = 0.9;
  if (mode === 'fly') {
    ctx.fly = { t: 0 };
    const start = ctx.flyPath.pos.getPoint(0);
    ctx.camera.position.copy(start);
  } else {
    ctx.fly = null;
  }
}

function loop() {
  if (!ctx) return;
  ctx.raf = requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - ctx.lastT) / 1000);
  ctx.lastT = now;

  const { camera, controls } = ctx;

  if (ctx.mode === 'fly') {
    updateFly(dt);
    ctx.composer.render();
    return;
  }

  if (ctx.mode === 'walk') {
    const k = controls.keys;
    ctx.crouch = k.has('KeyC') || k.has('ControlLeft');
    const run = (k.has('ShiftLeft') || k.has('ShiftRight')) && !ctx.crouch ? 2 : ctx.crouch ? 0.55 : 1;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyQ')) ctx.yaw += 1.8 * dt;
    if (k.has('KeyE')) ctx.yaw -= 1.8 * dt;
    // desired velocity in world space, smoothed for gentle accel/decel
    let tvx = 0, tvz = 0;
    if (mx || mz) {
      const len = Math.hypot(mx, mz); mx /= len; mz /= len;
      const sin = Math.sin(ctx.yaw), cos = Math.cos(ctx.yaw);
      const sp = 3.2 * run;
      tvx = (mx * cos - mz * sin) * sp;
      tvz = (mx * sin + mz * cos) * sp;
    }
    const smooth = 1 - Math.pow(0.0025, dt); // frame-rate independent lerp
    ctx.vel.x += (tvx - ctx.vel.x) * smooth;
    ctx.vel.z += (tvz - ctx.vel.z) * smooth;
    const wx = ctx.vel.x * dt, wz = ctx.vel.z * dt;
    const wantX = ctx.x + wx, wantZ = ctx.z + wz;
    const resolved = resolveCollision(ctx.collisionBVH, wantX, wantZ, ctx.eye ?? EYE);
    // Bleed velocity on the axis a wall actually blocked, rather than
    // zeroing both — keeps sliding along a wall you're moving into at an
    // angle instead of stopping dead.
    if (Math.abs(resolved.x - wantX) > 1e-4) ctx.vel.x *= 0.15;
    if (Math.abs(resolved.z - wantZ) > 1e-4) ctx.vel.z *= 0.15;
    ctx.x = resolved.x; ctx.z = resolved.z;

    const eye = ctx.crouch ? CROUCH_EYE : EYE;
    ctx.eye = (ctx.eye ?? EYE) + (eye - (ctx.eye ?? EYE)) * Math.min(1, dt * 10);
    camera.position.set(ctx.x, ctx.eye, ctx.z);
    camera.rotation.set(ctx.pitch, ctx.yaw, 0);
    if (Math.abs(camera.fov - ctx.fov) > 0.1) {
      camera.fov += (ctx.fov - camera.fov) * 0.25;
      camera.updateProjectionMatrix();
      const mm = Math.round(12 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      document.getElementById('tour-lens').textContent = `~${mm}mm · FOV ${Math.round(camera.fov)}°`;
    }
    drawMinimap(document.getElementById('tour-minimap'),
      ctx.fp, ctx.bounds, ctx.x, ctx.z, ctx.yaw);
  } else {
    const { bounds } = ctx;
    const phi = ctx.mode === 'plan' ? 0.14 : ctx.orbitPhi;
    const cy = Math.cos(phi) * ctx.orbitR;
    const rxz = Math.sin(phi) * ctx.orbitR;
    camera.position.set(
      bounds.cx + Math.sin(ctx.orbitTheta) * rxz,
      cy,
      bounds.cz + Math.cos(ctx.orbitTheta) * rxz);
    camera.lookAt(bounds.cx, 0, bounds.cz);
    if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
  }

  ctx.composer.render();
}

export function closeTour() {
  if (!ctx) return;
  cancelAnimationFrame(ctx.raf);
  teardownControls(ctx.controls, ctx.renderer.domElement);
  window.removeEventListener('resize', ctx.onResize);
  ctx.scene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
      if (m.map) m.map.dispose();
      m.dispose();
    });
  });
  ctx.pmrem.dispose();
  ctx.collisionBVH.geometry.disposeBoundsTree();
  ctx.collisionBVH.geometry.dispose();
  ctx.composer.dispose();
  ctx.renderer.dispose();
  ctx.renderer.domElement.remove();
  ctx = null;
  document.getElementById('tour').classList.add('hidden');
}
