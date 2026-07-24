// Canvas renderers that draw each listing's floor plan — a top-down plan for
// result cards and a 2.5D isometric "dollhouse" for the detail view hero.

import { TYPES } from './data.js';

function planBounds(fp) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const r of fp.rooms) {
    minX = Math.min(minX, r.x); minZ = Math.min(minZ, r.z);
    maxX = Math.max(maxX, r.x + r.w); maxZ = Math.max(maxZ, r.z + r.d);
  }
  return { minX, minZ, maxX, maxZ, w: maxX - minX, d: maxZ - minZ };
}

function bgGradient(ctx, w, h, accent) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#151923');
  g.addColorStop(1, '#0d1017');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.8, h * 0.15, 10, w * 0.8, h * 0.15, w * 0.7);
  glow.addColorStop(0, accent + '2e');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

// Dynamic (non-curated) locations — natural features from NaturalFeatures.js
// — have no floorplan/palette, only _icon/_color/_label. Draw a plain icon
// card for those instead of attempting a floor plan that doesn't exist.
function drawIconThumb(listing, ctx, W, H) {
  const accent = listing._color || '#7a8a99';
  bgGradient(ctx, W, H, accent);
  ctx.font = `${Math.round(Math.min(W, H) * 0.32)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(listing._icon || '📍', W / 2, H / 2 - 6);
  if (listing._label) {
    ctx.font = '600 12px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(listing._label, W / 2, H - 14);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function drawPlanThumb(listing, canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  if (!listing.floorplan) return drawIconThumb(listing, ctx, W, H);
  const fp = listing.floorplan;
  const b = planBounds(fp);
  const accent = listing.palette.accent;

  bgGradient(ctx, W, H, accent);

  const pad = 26;
  const s = Math.min((W - pad * 2) / b.w, (H - pad * 2) / b.d);
  const ox = (W - b.w * s) / 2 - b.minX * s;
  const oz = (H - b.d * s) / 2 - b.minZ * s;

  for (const r of fp.rooms) {
    const x = ox + r.x * s, y = oz + r.z * s, w = r.w * s, h = r.d * s;
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x, y, w, h);
  }
  // door gaps drawn in accent
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  for (const door of fp.doors) {
    ctx.beginPath();
    if (door.dir === 'v') {
      ctx.moveTo(ox + door.x * s, oz + (door.z - door.width / 2) * s);
      ctx.lineTo(ox + door.x * s, oz + (door.z + door.width / 2) * s);
    } else {
      ctx.moveTo(ox + (door.x - door.width / 2) * s, oz + door.z * s);
      ctx.lineTo(ox + (door.x + door.width / 2) * s, oz + door.z * s);
    }
    ctx.stroke();
  }

  const t = TYPES[listing.type];
  ctx.font = '15px system-ui';
  ctx.textBaseline = 'top';
  ctx.fillText(t.icon, 10, 8);
}

// simple isometric projection
function iso(x, z, y, s, ox, oy) {
  return [ox + (x - z) * s * 0.866, oy + (x + z) * s * 0.5 - y];
}

export function drawIsoHero(listing, canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  if (!listing.floorplan) return drawIconThumb(listing, ctx, W, H);
  const fp = listing.floorplan;
  const b = planBounds(fp);
  const accent = listing.palette.accent;

  bgGradient(ctx, W, H, accent);

  const s = Math.min(W / ((b.w + b.d) * 0.866 * 1.25), H / ((b.w + b.d) * 0.5 * 1.7));
  const wallPx = Math.min(30, s * 2.2);
  // center the projected bbox
  const corners = [
    iso(b.minX, b.minZ, 0, s, 0, 0), iso(b.maxX, b.minZ, 0, s, 0, 0),
    iso(b.minX, b.maxZ, 0, s, 0, 0), iso(b.maxX, b.maxZ, 0, s, 0, 0),
  ];
  const cminx = Math.min(...corners.map(c => c[0])), cmaxx = Math.max(...corners.map(c => c[0]));
  const cminy = Math.min(...corners.map(c => c[1])), cmaxy = Math.max(...corners.map(c => c[1]));
  const ox = (W - (cmaxx - cminx)) / 2 - cminx;
  const oy = (H - (cmaxy - cminy) - wallPx) / 2 - cminy + wallPx;

  const rooms = [...fp.rooms].sort((a, b2) => (a.x + a.z) - (b2.x + b2.z));
  for (const r of rooms) {
    const hp = r.open ? wallPx * 0.35 : wallPx;
    const p00 = iso(r.x, r.z, 0, s, ox, oy);
    const p10 = iso(r.x + r.w, r.z, 0, s, ox, oy);
    const p01 = iso(r.x, r.z + r.d, 0, s, ox, oy);
    const p11 = iso(r.x + r.w, r.z + r.d, 0, s, ox, oy);

    // floor
    ctx.beginPath();
    ctx.moveTo(...p00); ctx.lineTo(...p10); ctx.lineTo(...p11); ctx.lineTo(...p01);
    ctx.closePath();
    ctx.fillStyle = listing.palette.floor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // back walls (north edge and west edge stand up)
    ctx.fillStyle = listing.palette.wall + 'e6';
    ctx.beginPath();
    ctx.moveTo(...p00); ctx.lineTo(...p10);
    ctx.lineTo(p10[0], p10[1] - hp); ctx.lineTo(p00[0], p00[1] - hp);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = shade(listing.palette.wall, -18) + 'e6';
    ctx.beginPath();
    ctx.moveTo(...p00); ctx.lineTo(...p01);
    ctx.lineTo(p01[0], p01[1] - hp); ctx.lineTo(p00[0], p00[1] - hp);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // room label
    const c = iso(r.x + r.w / 2, r.z + r.d / 2, -4, s, ox, oy);
    ctx.font = `600 ${Math.max(11, s * 0.9)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(r.name, c[0], c[1]);
    ctx.shadowBlur = 0;
  }
  ctx.textAlign = 'left';
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
