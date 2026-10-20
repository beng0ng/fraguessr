// Ingredient vignettes: one small canvas animation per ingredient.
// Each ingredient picks a renderer (`fx`), its own palette (`c`) and a seed derived
// from its id, and several renderers also switch shape by id, so no two look alike.

const TAU = Math.PI * 2;

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// cheap smooth 1D noise
function noise(x, s = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const r = (n) => { const v = Math.sin((n + s * 57.1) * 127.1) * 43758.5453; return v - Math.floor(v); };
  return r(i) * (1 - u) + r(i + 1) * u;
}

// ── shapes ────────────────────────────────────────────────
function petal(ctx, len, wid) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(wid, -len * 0.3, wid * 0.8, -len * 0.9, 0, -len);
  ctx.bezierCurveTo(-wid * 0.8, -len * 0.9, -wid, -len * 0.3, 0, 0);
}
function flower(ctx, n, r, fill, center, open = 1, pw = 0.55) {
  ctx.fillStyle = fill;
  for (let i = 0; i < n; i++) {
    ctx.save(); ctx.rotate((i / n) * TAU); petal(ctx, r * open, r * pw * open); ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = center; ctx.beginPath(); ctx.arc(0, 0, r * 0.18, 0, TAU); ctx.fill();
}
function leafShape(ctx, kind, s) {
  ctx.beginPath();
  if (kind === 'lobed') { // fig / geranium
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.55;
      const r = s * (i % 2 ? 0.75 : 1);
      ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r);
    }
    ctx.lineTo(0, s * 0.25);
  } else if (kind === 'serrated') { // patchouli / sage
    const n = 8;
    ctx.moveTo(0, 0);
    for (let i = 1; i <= n; i++) { const y = -s * i / n, w = Math.sin(Math.PI * i / n) * s * 0.42; ctx.lineTo(w + (i % 2) * s * 0.06, y); }
    for (let i = n; i >= 0; i--) { const y = -s * i / n, w = Math.sin(Math.PI * i / n) * s * 0.42; ctx.lineTo(-w - (i % 2) * s * 0.06, y); }
  } else if (kind === 'cupped') { // basil
    ctx.moveTo(0, 0); ctx.bezierCurveTo(s * 0.6, -s * 0.1, s * 0.5, -s * 0.9, 0, -s); ctx.bezierCurveTo(-s * 0.5, -s * 0.9, -s * 0.6, -s * 0.1, 0, 0);
  } else { // ovate
    petal(ctx, s, s * 0.4);
  }
  ctx.closePath();
}

// ── renderers ────────────────────────────────────────────
// Each: init(state) once, frame(state, t, dt) every frame. state: {ctx,w,h,r,c,id,p}
const R = {};

R.zest = {
  init(S) { S.p = []; S.next = 0; },
  frame(S, t, dt) {
    const { ctx, w, h, c, r } = S, cx = w / 2, cy = h * 0.55;
    // half fruit
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 0.5) * 0.08);
    const R0 = Math.min(w, h) * 0.2;
    ctx.fillStyle = c[0]; ctx.beginPath(); ctx.arc(0, 0, R0, 0, TAU); ctx.fill();
    ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(0, 0, R0 * 0.86, 0, TAU); ctx.fill();
    ctx.strokeStyle = c[0]; ctx.lineWidth = 1.5;
    const segs = 8 + Math.floor(r() * 0) + (S.id.length % 4);
    for (let i = 0; i < segs; i++) { const a = (i / segs) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R0 * 0.86, Math.sin(a) * R0 * 0.86); ctx.stroke(); }
    ctx.restore();
    // spray
    S.next -= dt;
    if (S.next <= 0) { S.next = 0.9 + Math.random() * 0.6; for (let i = 0; i < 26; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 80 + Math.random() * 160; S.p.push({ x: cx, y: cy - R0 * 0.3, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, s: 1.5 + Math.random() * 3, col: c[Math.random() < 0.5 ? 0 : 2] }); } }
    for (const p of S.p) { p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.9; ctx.fillStyle = hexA(p.col, Math.max(0, p.life)); ctx.beginPath(); ctx.ellipse(p.x, p.y, p.s, p.s * 1.4, Math.atan2(p.vy, p.vx), 0, TAU); ctx.fill(); }
    S.p = S.p.filter((p) => p.life > 0);
  },
};

R.segments = {
  init(S) {
    const n = S.id === 'grapefruit' ? 3 : S.id === 'yuzu' ? 4 : 6;
    S.p = Array.from({ length: n }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: (S.id === 'grapefruit' ? 46 : S.id === 'yuzu' ? 30 : 22) * (0.7 + S.r() * 0.6), a: S.r() * TAU, va: (S.r() - 0.5) * 0.8, vx: (S.r() - 0.5) * 14, vy: (S.r() - 0.5) * 14 }));
    S.segs = S.id === 'mandarin' ? 10 : S.id === 'yuzu' ? 9 : 12;
  },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S;
    for (const p of S.p) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
      if (p.x < -p.s) p.x = w + p.s; if (p.x > w + p.s) p.x = -p.s; if (p.y < -p.s) p.y = h + p.s; if (p.y > h + p.s) p.y = -p.s;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = c[2]; ctx.beginPath();
      if (S.id === 'yuzu') { for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU, rr = p.s * (1 + 0.05 * Math.sin(a * 11)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } }
      else ctx.arc(0, 0, p.s, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fffdf5'; ctx.beginPath(); ctx.arc(0, 0, p.s * 0.88, 0, TAU); ctx.fill();
      for (let i = 0; i < S.segs; i++) {
        const a0 = (i / S.segs) * TAU + 0.04, a1 = ((i + 1) / S.segs) * TAU - 0.04;
        ctx.fillStyle = i % 2 ? c[0] : c[1];
        ctx.beginPath(); ctx.moveTo(Math.cos((a0 + a1) / 2) * p.s * 0.08, Math.sin((a0 + a1) / 2) * p.s * 0.08); ctx.arc(0, 0, p.s * 0.8, a0, a1); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  },
};

R.fizz = {
  init(S) { S.p = Array.from({ length: 60 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: 1 + S.r() * 5, v: 20 + S.r() * 60, ph: S.r() * TAU })); },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S;
    // lime slice
    ctx.save(); ctx.translate(w * 0.5, h * 0.55); ctx.rotate(t * 0.15);
    const R0 = Math.min(w, h) * 0.26;
    ctx.fillStyle = c[2]; ctx.beginPath(); ctx.arc(0, 0, R0, 0, TAU); ctx.fill();
    ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(0, 0, R0 * 0.9, 0, TAU); ctx.fill();
    for (let i = 0; i < 10; i++) { const a0 = (i / 10) * TAU + 0.05, a1 = ((i + 1) / 10) * TAU - 0.05; ctx.fillStyle = hexA(c[0], 0.8); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R0 * 0.82, a0, a1); ctx.fill(); }
    ctx.restore();
    for (const p of S.p) {
      p.y -= p.v * dt; p.x += Math.sin(t * 3 + p.ph) * 0.4;
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      ctx.strokeStyle = hexA('#ffffff', 0.85); ctx.lineWidth = 1; ctx.fillStyle = hexA(c[1], 0.25);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); ctx.stroke();
    }
  },
};

R.blossom = {
  init(S) { S.n = S.id === 'tuberose' ? 6 : 5; S.p = Array.from({ length: 10 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: 12 + S.r() * 16, a: S.r() * TAU, va: S.r() - 0.5, v: 18 + S.r() * 24, age: 0.5 + S.r() * 2 })); },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S;
    if (S.p.length < 14 && Math.random() < dt * 4) S.p.push({ x: Math.random() * w, y: h + 20, s: 12 + Math.random() * 16, a: Math.random() * TAU, va: (Math.random() - 0.5), v: 18 + Math.random() * 24, age: 0 });
    for (const p of S.p) {
      p.age += dt; p.y -= p.v * dt; p.a += p.va * dt; p.x += Math.sin(p.age * 1.3) * 0.3;
      const open = Math.min(1, p.age / 1.6);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.shadowColor = hexA(c[2], 0.35); ctx.shadowBlur = 8;
      flower(ctx, S.n, p.s, c[0], c[2], 0.3 + 0.7 * open, S.n === 6 ? 0.42 : 0.6);
      ctx.restore();
    }
    S.p = S.p.filter((p) => p.y > -40);
  },
};

R.petals = {
  init(S) { S.p = Array.from({ length: 36 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: 8 + S.r() * 12, a: S.r() * TAU, ph: S.r() * TAU, v: 20 + S.r() * 30, col: S.c[Math.floor(S.r() * 3)] })); },
  frame(S, t, dt) {
    const { ctx, w, h } = S;
    for (const p of S.p) {
      p.y += p.v * dt; p.x += Math.sin(t * 1.2 + p.ph) * 0.8 + (S.id === 'rose_turkey' ? 0.5 : -0.2); p.a += dt * 0.8;
      if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; } if (p.x > w + 20) p.x = -20; if (p.x < -20) p.x = w + 20;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(Math.cos(t * 2 + p.ph), 1);
      ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, p.s * 0.75, p.s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = hexA('#ffffff', 0.18); ctx.beginPath(); ctx.ellipse(-p.s * 0.2, -p.s * 0.2, p.s * 0.3, p.s * 0.5, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  },
};

R.bloom = {
  init() {},
  frame(S, t) {
    const { ctx, w, h, c } = S, cx = w / 2, cy = h / 2, R0 = Math.min(w, h) * 0.38;
    const layers = S.id === 'peony' ? 7 : 6, breathe = 0.85 + 0.15 * Math.sin(t * 0.8);
    for (let L = 0; L < layers; L++) {
      const k = 1 - L / layers, n = 5 + L, rad = R0 * k * breathe;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(L * 0.6 + t * 0.05 * (L % 2 ? 1 : -1));
      for (let i = 0; i < n; i++) {
        ctx.save(); ctx.rotate((i / n) * TAU);
        ctx.fillStyle = L % 2 ? c[0] : c[1]; ctx.strokeStyle = hexA(c[2], 0.35); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 0);
        const ruff = S.id === 'peony' ? 0.12 : 0.03;
        for (let j = 0; j <= 16; j++) { const a = -0.55 + (j / 16) * 1.1; const rr = rad * (1 + ruff * Math.sin(j * 2.3 + L)); ctx.lineTo(Math.sin(a) * rr * 0.75, -Math.cos(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
  },
};

R.stars = {
  init(S) { S.p = Array.from({ length: S.id === 'osmanthus' ? 70 : 40 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: (S.id === 'osmanthus' ? 4 : 9) + S.r() * 6, ph: S.r() * TAU, a: S.r() * TAU })); },
  frame(S, t) {
    const { ctx, c } = S, n = S.id === 'osmanthus' ? 4 : S.id === 'sambac' ? 8 : 5;
    for (const p of S.p) {
      const k = 0.5 + 0.5 * Math.sin(t * 1.5 + p.ph);
      ctx.save(); ctx.translate(p.x, p.y - k * 4); ctx.rotate(p.a + t * 0.1);
      ctx.globalAlpha = 0.35 + 0.65 * k;
      ctx.shadowColor = c[1]; ctx.shadowBlur = 12 * k;
      flower(ctx, n, p.s * (0.7 + 0.3 * k), c[0], c[2], 1, S.id === 'sambac' ? 0.5 : 0.38);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};

R.spiral = {
  init() {},
  frame(S, t) {
    const { ctx, w, h, c } = S, cx = w / 2, cy = h / 2;
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((i / 6) * TAU + t * 0.25);
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let s = 0; s <= 30; s++) { const k = s / 30, rr = k * Math.min(w, h) * 0.45; const tw = Math.sin(k * 6 - t * 2) * 10 * k; ctx.lineTo(rr, tw + k * k * 30); }
      for (let s = 30; s >= 0; s--) { const k = s / 30, rr = k * Math.min(w, h) * 0.45; const tw = Math.sin(k * 6 - t * 2) * 10 * k; ctx.lineTo(rr, tw + k * k * 30 + 9 * Math.sin(Math.PI * k)); }
      ctx.fillStyle = i % 2 ? c[0] : c[1]; ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = c[2]; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill();
  },
};

R.bells = {
  init() {},
  frame(S, t) {
    const { ctx, w, h, c } = S;
    const stems = S.id === 'lotv' ? 3 : 2;
    for (let k = 0; k < stems; k++) {
      const x0 = w * (0.25 + k * (0.5 / Math.max(1, stems - 1))), sway = Math.sin(t * 0.9 + k) * 12;
      ctx.strokeStyle = c[2]; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x0, h); ctx.quadraticCurveTo(x0 + sway, h * 0.35, x0 + 50 + sway, h * 0.2); ctx.stroke();
      const n = S.id === 'lotv' ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const u = 0.35 + (i / n) * 0.6, bx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * (x0 + sway) + u * u * (x0 + 50 + sway), by = (1 - u) * (1 - u) * h + 2 * (1 - u) * u * h * 0.35 + u * u * h * 0.2;
        const swing = Math.sin(t * 2 + i + k) * 0.25;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(swing);
        ctx.strokeStyle = c[2]; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 10); ctx.stroke();
        ctx.fillStyle = S.id === 'freesia' ? (i % 2 ? c[0] : c[2]) : c[0];
        ctx.beginPath(); const s = 8 - i * 0.6;
        if (S.id === 'freesia') { ctx.ellipse(0, 10 + s, s * 0.8, s * 1.3, 0, 0, TAU); }
        else { ctx.moveTo(-s, 10 + s * 1.4); ctx.quadraticCurveTo(-s, 10, 0, 10); ctx.quadraticCurveTo(s, 10, s, 10 + s * 1.4); for (let j = 0; j <= 4; j++) ctx.lineTo(s - (j / 4) * 2 * s, 10 + s * 1.4 + (j % 2 ? -2 : 1)); }
        ctx.fill(); ctx.restore();
      }
    }
  },
};

R.powder = {
  init(S) { S.p = Array.from({ length: 140 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: 0.6 + S.r() * 2.6, vx: 0, vy: 0, col: S.c[Math.floor(S.r() * 3)] })); },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S, cx = w / 2, cy = h / 2;
    if (S.id === 'violet') { // heart-shaped petals
      for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(cx, cy); ctx.rotate((i / 5) * TAU + Math.sin(t * 0.4) * 0.1); ctx.fillStyle = hexA(c[i < 2 ? 2 : 0], 0.9); petal(ctx, 48, 30); ctx.fill(); ctx.restore(); }
      ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, TAU); ctx.fill();
    }
    if (S.id === 'iris') { // rhizome lines
      ctx.strokeStyle = hexA(c[2], 0.35); ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w * 0.15, h * 0.82); ctx.bezierCurveTo(w * 0.35, h * 0.72, w * 0.6, h * 0.92, w * 0.85, h * 0.8); ctx.stroke();
    }
    for (const p of S.p) {
      if (S.id === 'heliotrope') { const a = Math.atan2(p.y - cy, p.x - cx); p.vx += -Math.sin(a) * 6 * dt; p.vy += Math.cos(a) * 6 * dt; }
      p.vx += (Math.random() - 0.5) * 12 * dt; p.vy += ((Math.random() - 0.5) * 12 - (S.id === 'iris' ? 2 : 0)) * dt;
      p.vx *= 0.99; p.vy *= 0.99; p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x += w; if (p.x > w) p.x -= w; if (p.y < 0) p.y += h; if (p.y > h) p.y -= h;
      ctx.fillStyle = hexA(p.col, 0.55); ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill();
    }
  },
};

R.spikes = {
  init(S) { S.p = Array.from({ length: 11 }, (_, i) => ({ x: (i + 0.5) / 11 * S.w + (S.r() - 0.5) * 20, hgt: 0.55 + S.r() * 0.3, ph: S.r() * TAU })); },
  frame(S, t) {
    const { ctx, w, h, c } = S;
    for (const p of S.p) {
      const sway = Math.sin(t * 1.1 + p.ph) * 14 + Math.sin(t * 0.3) * 8, topY = h * (1 - p.hgt);
      ctx.strokeStyle = c[2]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, h); ctx.quadraticCurveTo(p.x, (h + topY) / 2, p.x + sway, topY); ctx.stroke();
      for (let j = 0; j < 9; j++) {
        const u = 1 - j * 0.045, bx = p.x + sway * (u * u), by = topY + j * 7;
        ctx.fillStyle = j % 2 ? c[0] : c[1];
        ctx.beginPath(); ctx.ellipse(bx - 3, by, 3, 4.5, -0.4, 0, TAU); ctx.ellipse(bx + 3, by, 3, 4.5, 0.4, 0, TAU); ctx.fill();
      }
    }
  },
};

R.pompoms = {
  init(S) { S.p = Array.from({ length: 22 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: 7 + S.r() * 9, ph: S.r() * TAU })); },
  frame(S, t) {
    const { ctx, c, w, h } = S;
    ctx.strokeStyle = hexA('#7a8b62', 0.6); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, h * 0.7); ctx.bezierCurveTo(w * 0.3, h * 0.4, w * 0.6, h * 0.7, w, h * 0.35); ctx.stroke();
    for (const p of S.p) {
      const b = Math.sin(t * 1.4 + p.ph) * 3;
      for (let i = 0; i < 26; i++) {
        const a = i * 2.39996, rr = Math.sqrt(i / 26) * p.s;
        ctx.fillStyle = i % 3 ? c[0] : c[1];
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * rr, p.y + b + Math.sin(a) * rr, 1.6, 0, TAU); ctx.fill();
      }
    }
  },
};

R.tears = {
  init(S) { S.p = Array.from({ length: 7 }, (_, i) => ({ x: (i + 0.5) / 7 * S.w, grow: S.r(), y: 0, falling: false, v: 0 })); },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S;
    // bark
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.14); g.addColorStop(0, hexA(c[2], 0.85)); g.addColorStop(1, hexA(c[2], 0.0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.14);
    for (const p of S.p) {
      if (!p.falling) { p.grow += dt * 0.25; if (p.grow > 1) { p.falling = true; p.y = 14 + 22; p.v = 0; } }
      else { p.v += 300 * dt; p.y += p.v * dt; if (p.y > h + 20) { p.falling = false; p.grow = 0; } }
      const s = p.falling ? 10 : 4 + p.grow * 8, y = p.falling ? p.y : 12 + p.grow * 24;
      const rg = ctx.createRadialGradient(p.x - s * 0.3, y - s * 0.3, 1, p.x, y, s * 1.4);
      rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.3, c[1]); rg.addColorStop(1, c[0]);
      ctx.fillStyle = rg; ctx.shadowColor = c[0]; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(p.x, y - s * 1.8); ctx.bezierCurveTo(p.x + s, y - s * 0.4, p.x + s, y + s, p.x, y + s); ctx.bezierCurveTo(p.x - s, y + s, p.x - s, y - s * 0.4, p.x, y - s * 1.8); ctx.fill();
      ctx.shadowBlur = 0;
    }
  },
};

R.frost = {
  init(S) { S.p = Array.from({ length: 14 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: 8 + S.r() * 22, a: S.r() * TAU, ph: S.r() * 6 })); },
  frame(S, t) {
    const { ctx, c } = S;
    for (const p of S.p) {
      const k = ((t * 0.25 + p.ph) % 2) / 2, grow = Math.sin(k * Math.PI);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a + t * 0.1);
      ctx.strokeStyle = hexA(c[0], 0.3 + 0.7 * grow); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.rotate((i / 6) * TAU); const L = p.s * grow;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L);
        for (const f of [0.45, 0.7]) { ctx.moveTo(0, -L * f); ctx.lineTo(L * 0.25, -L * f - L * 0.2); ctx.moveTo(0, -L * f); ctx.lineTo(-L * 0.25, -L * f - L * 0.2); }
        ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
  },
};

R.needles = {
  init(S) { S.p = Array.from({ length: 6 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: 40 + S.r() * 40, a: S.r() * TAU, va: (S.r() - 0.5) * 0.5, vy: 8 + S.r() * 12 })); },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S;
    for (const p of S.p) {
      p.a += p.va * dt; p.y += p.vy * dt; if (p.y > h + p.s) { p.y = -p.s; p.x = Math.random() * w; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.strokeStyle = c[2]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, p.s / 2); ctx.lineTo(0, -p.s / 2); ctx.stroke();
      const n = S.id === 'cypress' ? 9 : 12;
      for (let i = 0; i < n; i++) {
        const y = p.s / 2 - (i / n) * p.s;
        ctx.fillStyle = i % 2 ? c[0] : c[1];
        if (S.id === 'cypress') { ctx.beginPath(); ctx.ellipse(0, y, 7 - i * 0.4, 4, 0, 0, TAU); ctx.fill(); }
        else for (const sgn of [-1, 1]) { ctx.save(); ctx.translate(0, y); ctx.rotate(sgn * 1.0); ctx.beginPath(); ctx.ellipse(0, -8, 1.6, 8, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      }
      ctx.restore();
    }
  },
};

R.steam = {
  init(S) { S.p = Array.from({ length: 8 }, () => ({ x: S.r() * S.w, y: S.h * (0.5 + S.r() * 0.5), a: S.r() * TAU, s: 8 + S.r() * 8, unf: S.r() })); },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S;
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = hexA(c[1], 0.5); ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let y = h; y > 0; y -= 6) { const x = w * (0.3 + k * 0.14) + Math.sin(y * 0.03 + t * 1.5 + k) * 14 * (1 - y / h); y === h ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    for (const p of S.p) {
      p.unf = Math.min(1, p.unf + dt * 0.1); p.a += dt * 0.3; p.y -= dt * 6; if (p.y < -20) { p.y = h + 20; p.unf = 0; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(0.4 + 0.6 * p.unf, 1);
      ctx.fillStyle = c[2]; petal(ctx, p.s * 2, p.s * 0.6); ctx.fill(); ctx.restore();
    }
  },
};

R.berries = {
  init(S) { S.p = Array.from({ length: S.id === 'blackcurrant' || S.id === 'juniper' ? 28 : 12 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, vx: (S.r() - 0.5) * 40, vy: 0, s: S.id === 'blackcurrant' || S.id === 'juniper' ? 6 + S.r() * 4 : 13 + S.r() * 8, a: S.r() * TAU })); },
  frame(S, t, dt) {
    const { ctx, w, h, c, id } = S;
    for (const p of S.p) {
      p.vy += 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.vx * dt * 0.02;
      if (p.y > h - p.s) { p.y = h - p.s; p.vy = -Math.abs(p.vy) * 0.82 - 40 - Math.random() * 120; }
      if (p.x < p.s || p.x > w - p.s) p.vx *= -1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); const s = p.s;
      if (id === 'pear') { ctx.fillStyle = c[0]; ctx.beginPath(); ctx.arc(0, s * 0.3, s * 0.8, 0, TAU); ctx.arc(0, -s * 0.5, s * 0.5, 0, TAU); ctx.fill(); ctx.strokeStyle = c[2]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(2, -s * 1.4); ctx.stroke(); }
      else if (id === 'apple') { ctx.fillStyle = c[0]; ctx.beginPath(); ctx.arc(-s * 0.35, 0, s * 0.75, 0, TAU); ctx.arc(s * 0.35, 0, s * 0.75, 0, TAU); ctx.fill(); ctx.fillStyle = c[2]; ctx.beginPath(); ctx.ellipse(s * 0.3, -s * 0.9, s * 0.4, s * 0.18, -0.5, 0, TAU); ctx.fill(); }
      else if (id === 'strawberry') { ctx.fillStyle = c[0]; ctx.beginPath(); ctx.moveTo(-s, -s * 0.5); ctx.quadraticCurveTo(0, -s * 0.9, s, -s * 0.5); ctx.quadraticCurveTo(s * 0.6, s, 0, s * 1.1); ctx.quadraticCurveTo(-s * 0.6, s, -s, -s * 0.5); ctx.fill(); ctx.fillStyle = '#ffee58'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(Math.sin(i * 2.1) * s * 0.5, (i / 8) * s * 0.9 - s * 0.2, 1, 0, TAU); ctx.fill(); } ctx.fillStyle = c[2]; flower(ctx, 5, s * 0.5, c[2], c[2], 1, 0.5); }
      else if (id === 'pineapple') { ctx.fillStyle = c[0]; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = hexA('#8d6e00', 0.6); ctx.lineWidth = 1; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.3 - s, -s); ctx.lineTo(i * s * 0.3 + s, s); ctx.moveTo(i * s * 0.3 + s, -s); ctx.lineTo(i * s * 0.3 - s, s); ctx.stroke(); } ctx.fillStyle = c[2]; for (let i = -2; i <= 2; i++) { ctx.save(); ctx.translate(0, -s); ctx.rotate(i * 0.35); ctx.beginPath(); ctx.ellipse(0, -s * 0.4, 2.5, s * 0.45, 0, 0, TAU); ctx.fill(); ctx.restore(); } }
      else if (id === 'raspberry') { for (let i = 0; i < 12; i++) { const a = i * 2.39996, rr = Math.sqrt(i / 12) * s * 0.75; ctx.fillStyle = i % 2 ? c[0] : c[2]; ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, s * 0.32, 0, TAU); ctx.fill(); } }
      else if (id === 'coconut') { ctx.fillStyle = c[2]; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); ctx.fillStyle = c[0]; ctx.beginPath(); ctx.arc(0, 0, s * 0.8, 0, Math.PI); ctx.fill(); }
      else if (id === 'peach') { const g = ctx.createRadialGradient(-s * 0.3, -s * 0.3, 1, 0, 0, s); g.addColorStop(0, c[1]); g.addColorStop(1, c[2]); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); ctx.strokeStyle = hexA(c[2], 0.6); ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.3, 0, 0, s); ctx.stroke(); }
      else { const g = ctx.createRadialGradient(-s * 0.3, -s * 0.3, 1, 0, 0, s); g.addColorStop(0, c[1]); g.addColorStop(1, c[0]); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); ctx.fillStyle = hexA('#ffffff', 0.5); ctx.beginPath(); ctx.arc(-s * 0.35, -s * 0.35, s * 0.2, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  },
};

R.embers = {
  init(S) { S.p = Array.from({ length: 70 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, v: 15 + S.r() * 45, s: 2 + S.r() * 4, ph: S.r() * TAU, a: S.r() * TAU })); },
  frame(S, t, dt) {
    const { ctx, w, h, c, id } = S;
    const g = ctx.createLinearGradient(0, h, 0, h * 0.4); g.addColorStop(0, hexA(c[1], 0.35)); g.addColorStop(1, hexA(c[1], 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (const p of S.p) {
      p.y -= p.v * dt; p.x += Math.sin(t * 2 + p.ph) * 0.5; p.a += dt;
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      const fade = Math.min(1, p.y / h + 0.2);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.globalAlpha = fade;
      ctx.shadowColor = c[1]; ctx.shadowBlur = 8; ctx.fillStyle = c[p.s > 4 ? 0 : 1];
      const s = p.s;
      ctx.beginPath();
      if (id === 'clove') { ctx.rect(-s * 0.3, -s, s * 0.6, s * 2.4); ctx.moveTo(s, -s); ctx.arc(0, -s, s * 0.9, 0, TAU); }
      else if (id === 'cumin') ctx.ellipse(0, 0, s * 0.45, s * 1.6, 0, 0, TAU);
      else if (id === 'nutmeg') ctx.ellipse(0, 0, s * 1.2, s * 1.5, 0, 0, TAU);
      else if (id === 'ginger') { ctx.ellipse(0, 0, s * 1.6, s * 0.7, 0, 0, TAU); ctx.ellipse(s, -s * 0.6, s * 0.7, s * 0.5, 0.6, 0, TAU); }
      else if (id === 'coriander') { ctx.arc(0, 0, s * 1.1, 0, TAU); }
      else ctx.arc(0, 0, s, 0, TAU);
      ctx.fill();
      if (id === 'coriander' || id === 'nutmeg') { ctx.strokeStyle = hexA(c[2], 0.8); ctx.lineWidth = 0.7; ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(i * s * 0.45, -s); ctx.lineTo(i * s * 0.45, s); } ctx.stroke(); }
      if (id === 'pinkpepper') { ctx.strokeStyle = hexA('#ffffff', 0.6); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(0, 0, s * 1.3, 0, TAU * 0.7); ctx.stroke(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  },
};

R.pods = {
  init(S) { S.p = Array.from({ length: 10 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, a: S.r() * TAU, va: (S.r() - 0.5) * 2, v: 12 + S.r() * 20, split: 0, seeds: [] })); },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S;
    for (const p of S.p) {
      p.y += p.v * dt; p.a += p.va * dt; if (p.y > h + 30) { p.y = -30; p.x = Math.random() * w; p.split = 0; }
      if (p.y > h * 0.5 && p.split === 0) { p.split = 0.01; for (let i = 0; i < 6; i++) p.seeds.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 60, life: 1 }); }
      if (p.split) p.split = Math.min(1, p.split + dt);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      for (const sgn of [-1, 1]) { ctx.save(); ctx.rotate(sgn * p.split * 0.4); ctx.fillStyle = c[0]; ctx.beginPath(); ctx.ellipse(0, 0, 7, 16, 0, sgn < 0 ? Math.PI / 2 : -Math.PI / 2, sgn < 0 ? Math.PI * 1.5 : Math.PI / 2); ctx.fill(); ctx.strokeStyle = c[2]; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(sgn * 3.5, -12); ctx.lineTo(sgn * 3.5, 12); ctx.stroke(); ctx.restore(); }
      ctx.restore();
    }
    for (const s of S.p.flatMap((p) => p.seeds)) { s.vy += 120 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 0.6; ctx.fillStyle = hexA('#3e2723', Math.max(0, s.life)); ctx.beginPath(); ctx.arc(s.x, s.y, 2, 0, TAU); ctx.fill(); }
    for (const p of S.p) p.seeds = p.seeds.filter((s) => s.life > 0);
  },
};

R.curls = {
  init(S) { S.p = Array.from({ length: 7 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, a: S.r() * TAU, va: (S.r() - 0.5) * 0.8, len: 60 + S.r() * 60, vx: 10 + S.r() * 14 })); },
  frame(S, t, dt) {
    const { ctx, w, c } = S;
    for (const p of S.p) {
      p.x += p.vx * dt; p.a += p.va * dt; if (p.x > w + p.len) p.x = -p.len;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = c[0]; ctx.fillRect(-p.len / 2, -9, p.len, 18);
      ctx.fillStyle = c[1]; ctx.fillRect(-p.len / 2, -3, p.len, 3);
      ctx.strokeStyle = c[2]; ctx.lineWidth = 1.5;
      for (const e of [-1, 1]) { ctx.beginPath(); for (let k = 0; k < 40; k++) { const a = k * 0.35 + t * 2 * e, rr = 9 - k * 0.2; ctx.lineTo(e * p.len / 2 + Math.cos(a) * rr * 0.35, Math.sin(a) * rr); } ctx.stroke(); }
      ctx.restore();
    }
  },
};

R.threads = {
  init(S) { S.p = Array.from({ length: 26 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, v: 18 + S.r() * 30, a: S.r() * TAU, ph: S.r() * TAU })); },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S;
    // crocus petals at the base
    for (let i = 0; i < 6; i++) { ctx.save(); ctx.translate(w / 2, h + 10); ctx.rotate(-Math.PI / 2 + (i - 2.5) * 0.28 + Math.sin(t * 0.6) * 0.03); ctx.fillStyle = hexA(c[2], 0.55); petal(ctx, h * 0.45, 26); ctx.fill(); ctx.restore(); }
    for (const p of S.p) {
      p.y += p.v * dt; p.a += Math.sin(t + p.ph) * dt; if (p.y > h + 30) { p.y = -30; p.x = Math.random() * w; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.strokeStyle = c[0]; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.bezierCurveTo(6, -6, -6, 6, 0, 14); ctx.stroke();
      ctx.fillStyle = c[0]; ctx.beginPath(); ctx.moveTo(-4, 14); ctx.lineTo(4, 14); ctx.lineTo(0, 9); ctx.fill();
      ctx.restore();
    }
  },
};

R.starfruit = {
  init(S) { S.p = Array.from({ length: 6 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: 18 + S.r() * 16, a: S.r() * TAU, va: (S.r() - 0.5) * 0.6, ph: S.r() * TAU })); },
  frame(S, t, dt) {
    const { ctx, c } = S;
    for (const p of S.p) {
      p.a += p.va * dt;
      ctx.save(); ctx.translate(p.x, p.y + Math.sin(t + p.ph) * 4); ctx.rotate(p.a);
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate((i / 8) * TAU);
        ctx.fillStyle = c[0]; ctx.beginPath(); ctx.moveTo(-p.s * 0.16, 0); ctx.quadraticCurveTo(0, -p.s * 1.1, p.s * 0.16, 0); ctx.fill();
        ctx.fillStyle = c[1]; ctx.beginPath(); ctx.ellipse(0, -p.s * 0.45, 2.5, 4, 0, 0, TAU); ctx.fill();
        const glint = Math.max(0, Math.sin(t * 2 + i + p.ph)); ctx.fillStyle = hexA('#ffffff', glint * 0.7); ctx.beginPath(); ctx.arc(0, -p.s * 0.45, 1.2, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
  },
};

R.rings = {
  init() {},
  frame(S, t) {
    const { ctx, w, h, c } = S, cx = w / 2, cy = h / 2, maxR = Math.hypot(w, h) / 2;
    ctx.fillStyle = hexA(c[1], 0.6); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) {
      const rr = ((i * 14 + t * 10) % (maxR + 20));
      ctx.strokeStyle = hexA(i % 3 ? c[0] : c[2], 0.55 * (1 - rr / maxR)); ctx.lineWidth = i % 3 ? 2 : 4;
      ctx.beginPath();
      for (let k = 0; k <= 72; k++) { const a = (k / 72) * TAU, d = rr * (1 + 0.04 * noise(a * 3 + i, 1)); ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9); }
      ctx.stroke();
    }
  },
};

R.grain = {
  init() {},
  frame(S, t) {
    const { ctx, w, h, c, id } = S;
    ctx.fillStyle = hexA(c[1], 0.7); ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 22; i++) {
      const y0 = (i / 22) * h;
      ctx.strokeStyle = hexA(i % 4 ? c[0] : c[2], 0.6); ctx.lineWidth = i % 4 ? 1.2 : 2.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) { const y = y0 + (noise(x * 0.012 + t * 0.4, i) - 0.5) * 30 + Math.exp(-(((x - w * 0.6) / 60) ** 2)) * 18 * Math.sin(i * 0.7); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
    }
    if (id === 'guaiac') { ctx.strokeStyle = hexA('#9e9e9e', 0.35); ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); for (let y = h; y > 0; y -= 6) { const x = w * 0.75 + Math.sin(y * 0.04 - t * 2) * 16; y === h ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
  },
};

R.roots = {
  init(S) { S.roots = []; S.seed = 0; },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S, ground = h * 0.28;
    ctx.fillStyle = hexA(c[1], 0.45); ctx.fillRect(0, ground, w, h - ground);
    // grass
    for (let i = 0; i < 26; i++) { const x = (i / 26) * w + 6, sway = Math.sin(t * 1.3 + i) * 6; ctx.strokeStyle = c[0]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, ground); ctx.quadraticCurveTo(x, ground - 30, x + sway, ground - 50 - (i % 3) * 10); ctx.stroke(); }
    if (S.roots.length < 40 && Math.random() < dt * 8) S.roots.push({ x: Math.random() * w, y: ground, a: Math.PI / 2 + (Math.random() - 0.5) * 0.6, pts: [], life: 0 });
    ctx.strokeStyle = c[2]; ctx.lineCap = 'round';
    for (const r of S.roots) {
      if (r.y < h) { r.a += (Math.random() - 0.5) * 0.3; r.x += Math.cos(r.a) * 30 * dt; r.y += Math.sin(r.a) * 30 * dt; r.pts.push([r.x, r.y]); }
      else r.life += dt;
      ctx.globalAlpha = Math.max(0, 1 - r.life); ctx.lineWidth = 1.5; ctx.beginPath(); r.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    }
    ctx.globalAlpha = 1; S.roots = S.roots.filter((r) => r.life < 1);
  },
};

R.smoke = {
  init(S) { S.p = []; for (let i = 0; i < 160; i++) R.smoke.frame(S, i / 30, 1 / 30, true); },
  frame(S, t, dt, warm) {
    const { ctx, w, h, c, id } = S;
    if (warm) ctx.save(), ctx.globalAlpha = 0;
    if (id === 'frankincense') { for (let i = 0; i < 5; i++) { ctx.fillStyle = c[i % 2 ? 0 : 1]; ctx.beginPath(); ctx.ellipse(w / 2 - 30 + i * 15, h - 10, 8, 6, i, 0, TAU); ctx.fill(); } }
    else { ctx.fillStyle = c[0]; ctx.fillRect(w / 2 - 40, h - 16, 80, 16); ctx.fillStyle = c[2]; for (let i = 0; i < 6; i++) ctx.fillRect(w / 2 - 38 + i * 13, h - 14, 5, 12); }
    if (Math.random() < dt * 30) S.p.push({ x: w / 2 + (Math.random() - 0.5) * 30, y: h - 16, life: 1, s: 4, ph: Math.random() * 10 });
    for (const p of S.p) {
      p.y -= 40 * dt; p.x += (noise(p.y * 0.01 + t * 0.3, p.ph) - 0.5) * 3; p.s += dt * 14; p.life -= dt * 0.28;
      ctx.fillStyle = hexA(id === 'oud' ? c[1] : c[2], Math.max(0, p.life) * (id === 'oud' ? 0.22 : 0.16)); ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill();
    }
    S.p = S.p.filter((p) => p.life > 0);
    if (warm) ctx.restore();
  },
};

R.leather = {
  init(S) { S.cells = Array.from({ length: 30 }, () => [S.r() * S.w, S.r() * S.h]); },
  frame(S, t) {
    const { ctx, w, h, c } = S;
    ctx.fillStyle = c[0]; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hexA('#000000', 0.5); ctx.lineWidth = 1;
    for (let i = 0; i < S.cells.length; i++) for (let j = i + 1; j < S.cells.length; j++) { const [a, b] = [S.cells[i], S.cells[j]]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < 70) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo((a[0] + b[0]) / 2 + 4, (a[1] + b[1]) / 2 - 3); ctx.stroke(); } }
    const sx = ((t * 60) % (w + 300)) - 150;
    const g = ctx.createLinearGradient(sx - 80, 0, sx + 80, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, hexA(c[1], 0.35)); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hexA(c[1], 0.5); ctx.setLineDash([4, 5]); ctx.lineWidth = 1.5; ctx.strokeRect(14, 14, w - 28, h - 28); ctx.setLineDash([]);
  },
};

R.lichen = {
  init(S) { S.br = []; S.reset = 0; },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S;
    if (S.br.length === 0 || S.reset > 9) { S.reset = 0; S.br = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ x: k % 2 ? w : 0, y: h * (0.12 + (k >> 1) * 0.25), a: (k % 2 ? Math.PI : 0) + (Math.random() - 0.5) * 0.4, d: 0, segs: [] })); }
    S.reset += dt;
    const next = [];
    for (const b of S.br) {
      for (let step = 0; step < 3; step++) if (b.d < 7 && Math.random() < 0.6) {
        const nx = b.x + Math.cos(b.a) * 6, ny = b.y + Math.sin(b.a) * 6; b.segs.push([b.x, b.y, nx, ny, b.d]); b.x = nx; b.y = ny; b.a += (Math.random() - 0.5) * 0.5;
        if (Math.random() < 0.08) next.push({ x: b.x, y: b.y, a: b.a + (Math.random() < 0.5 ? -0.8 : 0.8), d: b.d + 1, segs: b.segs });
      }
    }
    S.br.push(...next.slice(0, 200 - S.br.length));
    ctx.lineCap = 'round';
    const drawn = new Set();
    for (const b of S.br) { if (drawn.has(b.segs)) continue; drawn.add(b.segs); for (const [x0, y0, x1, y1, d] of b.segs) { ctx.strokeStyle = d % 2 ? c[0] : c[2]; ctx.lineWidth = Math.max(1, 5 - d * 0.6); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); } }
  },
};

R.drip = {
  init(S) { S.p = Array.from({ length: 5 }, (_, i) => ({ x: (i + 0.5) / 5 * S.w + (S.r() - 0.5) * 30, len: S.r() * 30, v: 0, drop: null })); S.ripples = []; },
  frame(S, t, dt) {
    const { ctx, w, h, c, id } = S;
    ctx.fillStyle = c[0]; ctx.beginPath(); ctx.moveTo(0, 0); for (let x = 0; x <= w; x += 10) ctx.lineTo(x, 12 + Math.sin(x * 0.05 + t) * 3); ctx.lineTo(w, 0); ctx.fill();
    ctx.fillStyle = c[0]; ctx.fillRect(0, h - 18, w, 18);
    for (const p of S.p) {
      if (!p.drop) { p.len += dt * 18; if (p.len > 50) { p.drop = { y: 12 + p.len, v: 0 }; p.len = 0; } }
      else { p.drop.v += 400 * dt; p.drop.y += p.drop.v * dt; if (p.drop.y > h - 18) { S.ripples.push({ x: p.x, r: 2, life: 1 }); p.drop = null; } }
      ctx.fillStyle = c[0];
      ctx.beginPath(); ctx.moveTo(p.x - 7, 12); ctx.quadraticCurveTo(p.x - 3, 12 + p.len * 0.6, p.x, 12 + p.len + 6); ctx.quadraticCurveTo(p.x + 3, 12 + p.len * 0.6, p.x + 7, 12); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, 12 + p.len, 3 + p.len * 0.08, 0, TAU); ctx.fill();
      if (p.drop) { ctx.beginPath(); ctx.ellipse(p.x, p.drop.y, 5, 7, 0, 0, TAU); ctx.fill(); }
    }
    for (const r of S.ripples) { r.r += dt * 40; r.life -= dt; ctx.strokeStyle = hexA(c[1], Math.max(0, r.life)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(r.x, h - 18, r.r, r.r * 0.25, 0, 0, TAU); ctx.stroke(); }
    S.ripples = S.ripples.filter((r) => r.life > 0);
    if (id === 'vanilla') { for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(w * (0.25 + i * 0.25), h * 0.55 + Math.sin(t + i) * 10); ctx.rotate(Math.sin(t * 0.5 + i) * 0.4 + 0.3); ctx.strokeStyle = c[2]; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(0, 12, 40, -4); ctx.stroke(); ctx.restore(); } }
  },
};

R.waves = {
  init() {},
  frame(S, t) {
    const { ctx, w, h, c, id } = S;
    for (let L = 0; L < 5; L++) {
      const base = h * (0.35 + L * 0.13), amp = 8 + L * 2, k = 0.02 - L * 0.002, sp = 1 + L * 0.3;
      ctx.fillStyle = hexA(L % 2 ? c[0] : c[2], 0.25 + L * 0.12);
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) ctx.lineTo(x, base + Math.sin(x * k + t * sp + L) * amp);
      ctx.lineTo(w, h); ctx.fill();
      ctx.fillStyle = hexA('#ffffff', 0.7);
      for (let x = (t * 20 * sp) % 40; x <= w; x += 40) ctx.fillRect(x, base + Math.sin(x * k + t * sp + L) * amp - 2, 2, 2);
      if (id === 'ambergris' && L === 1) {
        const x = w / 2 + Math.sin(t * 0.3) * 40, y = base + Math.sin(x * k + t * sp + L) * amp - 10;
        ctx.fillStyle = c[1]; ctx.beginPath(); for (let a = 0; a <= 24; a++) { const ang = (a / 24) * TAU, rr = 22 * (1 + 0.18 * noise(a, 3)); ctx.lineTo(x + Math.cos(ang) * rr * 1.4, y + Math.sin(ang) * rr * 0.8); } ctx.fill();
      }
    }
  },
};

R.clouds = {
  init(S) { S.p = Array.from({ length: 7 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: 50 + S.r() * 60, ph: S.r() * TAU, vx: (S.r() - 0.5) * 10 })); },
  frame(S, t, dt) {
    const { ctx, w, c } = S;
    for (const p of S.p) {
      p.x += p.vx * dt; if (p.x < -p.s) p.x = w + p.s; if (p.x > w + p.s) p.x = -p.s;
      const s = p.s * (0.85 + 0.15 * Math.sin(t * 0.7 + p.ph));
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s); g.addColorStop(0, hexA(c[2], 0.35)); g.addColorStop(1, hexA(c[0], 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
    }
  },
};

R.beans = {
  init(S) { S.p = Array.from({ length: 16 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, a: S.r() * TAU, va: (S.r() - 0.5) * 3, v: 30 + S.r() * 40, s: S.id === 'cacao' ? 14 : 10 })); },
  frame(S, t, dt) {
    const { ctx, w, h, c, id } = S;
    for (const p of S.p) {
      p.y += p.v * dt; p.a += p.va * dt; if (p.y > h + 20) { p.y = -20; p.x = Math.random() * w; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); const s = p.s;
      ctx.scale(1, 0.6 + 0.4 * Math.abs(Math.cos(t + p.x)));
      ctx.fillStyle = c[0]; ctx.beginPath();
      if (id === 'almond') { ctx.moveTo(0, -s * 1.5); ctx.quadraticCurveTo(s, 0, 0, s * 1.2); ctx.quadraticCurveTo(-s, 0, 0, -s * 1.5); }
      else if (id === 'tonka') ctx.ellipse(0, 0, s * 0.5, s * 1.6, 0, 0, TAU);
      else ctx.ellipse(0, 0, s * 0.8, s * 1.1, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = c[id === 'coffee' ? 1 : 2]; ctx.lineWidth = id === 'tonka' ? 0.8 : 1.5; ctx.beginPath();
      if (id === 'coffee') { ctx.moveTo(0, -s); ctx.bezierCurveTo(4, -s * 0.3, -4, s * 0.3, 0, s); }
      else if (id === 'tonka') { for (let i = -3; i <= 3; i++) { ctx.moveTo(-s * 0.4, i * s * 0.4); ctx.quadraticCurveTo(0, i * s * 0.4 + 3, s * 0.4, i * s * 0.4); } }
      else if (id === 'cacao') { for (let i = -1; i <= 1; i++) { ctx.moveTo(i * s * 0.35, -s); ctx.lineTo(i * s * 0.35, s); } }
      else { ctx.moveTo(0, -s * 1.2); ctx.lineTo(0, s); }
      ctx.stroke(); ctx.restore();
    }
  },
};

R.hex = {
  init(S) { S.fill = {}; },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S, r = 18, dx = r * Math.sqrt(3);
    let k = 0;
    for (let row = -1; row * r * 1.5 < h + r; row++) for (let col = -1; col * dx < w + dx; col++, k++) {
      const x = col * dx + (row % 2 ? dx / 2 : 0), y = row * r * 1.5;
      S.fill[k] = Math.min(1, (S.fill[k] || 0) + dt * (0.05 + ((k * 37) % 11) / 100));
      if (S.fill[k] >= 1 && Math.random() < dt * 0.05) S.fill[k] = 0;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath();
      ctx.fillStyle = hexA(c[0], 0.15 + S.fill[k] * 0.75); ctx.fill(); ctx.strokeStyle = c[1]; ctx.lineWidth = 2; ctx.stroke();
    }
    const bx = w / 2 + Math.sin(t * 1.3) * w * 0.35, by = h / 2 + Math.sin(t * 2.1) * h * 0.3;
    ctx.fillStyle = '#212121'; ctx.beginPath(); ctx.ellipse(bx, by, 7, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = c[2]; ctx.fillRect(bx - 2, by - 5, 2, 10);
    ctx.fillStyle = hexA('#ffffff', 0.7); ctx.beginPath(); ctx.ellipse(bx - 2, by - 7, 5, 3 + Math.abs(Math.sin(t * 40)) * 2, -0.4, 0, TAU); ctx.fill();
  },
};

R.tobacco = {
  init(S) { S.p = Array.from({ length: 6 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, a: S.r() * TAU, age: S.r() })); S.smoke = []; },
  frame(S, t, dt) {
    const { ctx, w, h, c } = S;
    for (const p of S.p) {
      p.age = (p.age + dt * 0.08) % 1; p.a += dt * 0.2;
      const col = p.age < 0.5 ? '#7cb342' : c[0], curl = 1 - p.age * 0.6;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(curl, 1);
      ctx.fillStyle = col; ctx.globalAlpha = 0.9; petal(ctx, 60, 26); ctx.fill();
      ctx.strokeStyle = c[2]; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -60); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (Math.random() < dt * 20) S.smoke.push({ x: w * 0.8, y: h * 0.9, s: 3, life: 1 });
    ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(w * 0.8, h * 0.9, 4, 0, TAU); ctx.fill();
    for (const s of S.smoke) { s.y -= dt * 35; s.x += Math.sin(s.y * 0.05) * 0.6; s.s += dt * 10; s.life -= dt * 0.35; ctx.fillStyle = hexA('#9e9e9e', Math.max(0, s.life) * 0.15); ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, TAU); ctx.fill(); }
    S.smoke = S.smoke.filter((s) => s.life > 0);
  },
};

const LEAF_KIND = { geranium: 'lobed', fig: 'lobed', patchouli: 'serrated', sage: 'serrated', basil: 'cupped' };
R.leaves = {
  init(S) { S.p = Array.from({ length: 16 }, () => ({ x: S.r() * S.w, y: S.r() * S.h, s: 18 + S.r() * 20, a: S.r() * TAU, va: (S.r() - 0.5) * 2, vx: 30 + S.r() * 40, ph: S.r() * TAU, col: S.c[S.r() < 0.6 ? 0 : 2] })); },
  frame(S, t, dt) {
    const { ctx, w, h, id, c } = S, kind = LEAF_KIND[id] || 'ovate';
    if (id === 'geranium') { ctx.save(); ctx.translate(w * 0.5, h * 0.5); flower(ctx, 5, 26, c[0], '#ffffff', 1, 0.6); ctx.restore(); }
    for (const p of S.p) {
      p.x += p.vx * dt; p.y += Math.sin(t * 1.5 + p.ph) * 0.8; p.a += p.va * dt;
      if (p.x > w + 40) { p.x = -40; p.y = Math.random() * h; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(Math.cos(t * 1.7 + p.ph), 1);
      leafShape(ctx, kind, p.s); ctx.fillStyle = id === 'geranium' ? c[1] : p.col; ctx.fill();
      ctx.strokeStyle = hexA('#ffffff', 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -p.s * 0.9); ctx.stroke();
      ctx.restore();
    }
  },
};

export function createVignette(canvas, ing) {
  const ctx = canvas.getContext('2d');
  const renderer = R[ing.fx] || R.powder;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, last = performance.now(), t = 0, S = null;
  function setup() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), rect = canvas.getBoundingClientRect();
    const w = Math.max(10, rect.width), h = Math.max(10, rect.height);
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = { ctx, w, h, c: ing.c, id: ing.id, r: mulberry(hash(ing.id)) };
    renderer.init(S);
  }
  function draw(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    ctx.clearRect(0, 0, S.w, S.h);
    renderer.frame(S, t, dt);
    if (!reduce) raf = requestAnimationFrame(draw);
  }
  setup();
  if (reduce) { t = 2; for (let i = 0; i < 60; i++) { ctx.clearRect(0, 0, S.w, S.h); renderer.frame(S, t += 1 / 30, 1 / 30); } }
  else raf = requestAnimationFrame(draw);
  const ro = new ResizeObserver(() => setup());
  ro.observe(canvas);
  return { stop() { cancelAnimationFrame(raf); ro.disconnect(); } };
}
