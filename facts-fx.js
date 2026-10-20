// Fun-fact cards. Every fact names a motif (`fx`) that illustrates it, drawn here on a canvas in the
// ingredient's own colour and particle shape, and a rarity tier (how niche the fact is) that picks the
// card's entrance and aura: a plain slide-in for common facts up to a gold flip with light rays for
// legendary ones. Motifs are pure functions of time, so a card can start, loop or be frozen anywhere.

const TAU = Math.PI * 2;

import { RARITY, RARITIES } from './rarity.js';
export { RARITY, RARITIES };

// ── small helpers ───────────────────────────────────────
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => `rgba(${hexRgb(hex)},${a})`;
const mixc = (a, b, k) => { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
const fract = (x) => x - Math.floor(x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3;
const easeInOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
const easeBack = (x) => { x = clamp01(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const rnd = (seed) => (i, k = 0) => fract(Math.sin((seed % 9973) * 0.731 + i * 127.1 + k * 311.7) * 43758.5453);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function star4(c, x, y, r) { c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); }
function starN(c, x, y, R, r, n, rot = -Math.PI / 2) { for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, d = i % 2 ? r : R; i ? c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } c.closePath(); }
function heart(c, x, y, s) {
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.35, y + s * 0.05, x - s * 0.8, y - s * 1.05, x, y - s * 0.38);
  c.bezierCurveTo(x + s * 0.8, y - s * 1.05, x + s * 1.35, y + s * 0.05, x, y + s * 0.9);
}
function soft(c, x, y, r, col, a) {
  if (r <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
}
let skyOff = false; // a scene backdrop stands in for a motif's own sky
function sky(c, w, h, top, bottom) { if (skyOff) return; const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bottom); c.fillStyle = g; c.fillRect(0, 0, w, h); }
// the ingredient's own particle shape (matches the harvest burst on the globe)
function glyph(c, shape, s) {
  c.beginPath();
  if (shape === 'petal') c.ellipse(0, 0, 5 * s, 2.6 * s, 0, 0, TAU);
  else if (shape === 'leaf') { c.moveTo(-6 * s, 0); c.quadraticCurveTo(0, -4.2 * s, 6 * s, 0); c.quadraticCurveTo(0, 4.2 * s, -6 * s, 0); }
  else if (shape === 'grain') c.rect(-2.3 * s, -2.3 * s, 4.6 * s, 4.6 * s);
  else if (shape === 'chip') c.rect(-5 * s, -1.4 * s, 10 * s, 2.8 * s);
  else if (shape === 'spark') star4(c, 0, 0, 5.5 * s);
  else if (shape === 'tear') { c.moveTo(0, -4.8 * s); c.quadraticCurveTo(4.2 * s, 1 * s, 0, 4.2 * s); c.quadraticCurveTo(-4.2 * s, 1 * s, 0, -4.8 * s); }
  else { c.moveTo(0, -4.6 * s); c.bezierCurveTo(3.6 * s, -0.6 * s, 3.4 * s, 3.8 * s, 0, 3.8 * s); c.bezierCurveTo(-3.4 * s, 3.8 * s, -3.6 * s, -0.6 * s, 0, -4.6 * s); }
}
function flower(c, x, y, r, col, open = 1, rot = 0) {
  c.save(); c.translate(x, y); c.rotate(rot);
  for (let i = 0; i < 6; i++) { c.rotate(TAU / 6); c.fillStyle = mixc(col, '#ffffff', 0.12 * (i % 2)); c.beginPath(); c.ellipse(0, -r * 0.62 * open, r * 0.36, r * 0.62 * open + 0.01, 0, 0, TAU); c.fill(); }
  c.fillStyle = '#f6c544'; c.beginPath(); c.arc(0, 0, r * 0.3, 0, TAU); c.fill();
  c.restore();
}
function leafAt(c, x, y, s, a, col) { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; glyph(c, 'leaf', s); c.fill(); c.restore(); }

// ── motifs ──────────────────────────────────────────────
// (c, w, h, t, o): t is seconds since the card was revealed; o carries colour, seed, shape and argument.
const M = {};

M.petals = (c, w, h, t, o) => {
  for (let i = 0; i < 46; i++) {
    const R = (k) => o.R(i, k), s = (0.75 + R(5) * 0.75) * o.S;
    const y = fract(R(0) + t * (0.12 + R(1) * 0.12)) * (h + 30) - 15;
    const x = R(2) * w + Math.sin(t * (1 + R(3)) + R(4) * TAU) * 16;
    c.save(); c.translate(x, y); c.rotate(R(6) * TAU + t * (R(7) - 0.5) * 3);
    c.scale(1, 0.45 + 0.55 * Math.abs(Math.sin(t * 1.6 + R(8) * 6)));
    c.fillStyle = mixc(o.col, '#ffffff', R(9) * 0.55);
    c.beginPath(); c.moveTo(0, -7 * s); c.bezierCurveTo(6 * s, -5 * s, 5 * s, 5 * s, 0, 7 * s); c.bezierCurveTo(-5 * s, 5 * s, -6 * s, -5 * s, 0, -7 * s); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(-1.2 * s, -2 * s, 1.5 * s, 3.4 * s, 0.2, 0, TAU); c.fill();
    c.restore();
  }
};

function parseCount(arg) {
  const s = String(arg ?? '').trim(), toks = [...s.matchAll(/\d[\d,]*(?:\.\d+)?/g)];
  if (!toks.length) return null;
  const val = (m) => +m[0].replace(/,/g, '');
  let best = toks[0]; for (const m of toks) if (val(m) > val(best)) best = m;
  const raw = best[0], v = val(best), dec = (raw.split('.')[1] || '').length, commas = raw.includes(',');
  return { pre: s.slice(0, best.index), post: s.slice(best.index + raw.length), v, dec, commas, year: !commas && !dec && v >= 1000 && v <= 2100 && !/[a-z]/i.test(s.slice(best.index + raw.length, best.index + raw.length + 3).replace(/^\s/, '')) };
}
const fmtCount = (n, p) => p.commas ? n.toLocaleString('en-US', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }) : n.toFixed(p.dec);
M.counter = (c, w, h, t, o) => (o.hero ? METER[METER[o.meter] ? o.meter : autoMeter(o.arg)] : counterPlain)(c, w, h, t, o);
function counterPlain(c, w, h, t, o) {
  const p = o.count ||= parseCount(o.arg) || { pre: '', post: '', v: 100, dec: 0, commas: false };
  c.save(); c.translate(w / 2, h / 2); c.rotate(t * 0.22); c.fillStyle = rgba(o.col, 0.14);
  for (let i = 0; i < 14; i++) { c.rotate(TAU / 14); c.beginPath(); c.moveTo(0, 0); c.lineTo(w, -w * 0.1); c.lineTo(w, w * 0.1); c.fill(); }
  c.restore();
  for (let i = 0; i < 16; i++) {
    const a = fract(o.R(i) + t * 0.22);
    c.globalAlpha = Math.sin(a * Math.PI) * 0.7; c.fillStyle = mixc(o.col, '#ffffff', o.R(i, 3) * 0.4);
    c.save(); c.translate(o.R(i, 1) * w, h + 8 - a * (h + 16)); c.rotate(t * (o.R(i, 2) - 0.5) * 4 + i); glyph(c, o.shape, o.S * 1.15); c.fill(); c.restore();
  }
  c.globalAlpha = 1;
  const k = easeOut(t / 1.9), from = p.year ? p.v - 120 : 0, n = from + (p.v - from) * k;
  const str = p.pre + fmtCount(p.dec ? n : Math.round(n), p) + p.post, full = p.pre + fmtCount(p.v, p) + p.post;
  c.font = `800 100px ${o.font}`;
  const size = Math.min(100 * w * 0.82 / c.measureText(full).width, h * 0.46);
  const pop = t > 1.9 ? 1 + 0.12 * Math.sin(Math.min(1, (t - 1.9) / 0.4) * Math.PI) : 1;
  c.save(); c.translate(w / 2, h / 2 + size * 0.04); c.scale(pop, pop);
  c.font = `800 ${size}px ${o.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = rgba(o.col, 0.7); c.shadowBlur = 20 * o.S; c.fillStyle = o.ink; c.fillText(str, 0, 0);
  c.restore();
};

function bee(c, x, y, dir, s, t, i) {
  c.save(); c.translate(x, y); c.scale(dir * s, s);
  const f = 0.35 + 0.65 * Math.abs(Math.sin(t * 46 + i));
  c.fillStyle = 'rgba(232,244,255,.8)'; c.beginPath(); c.ellipse(-1, -6, 4, 6 * f, -0.5, 0, TAU); c.ellipse(2.5, -5.5, 3.5, 5 * f, 0.4, 0, TAU); c.fill();
  c.fillStyle = '#f2b81b'; c.beginPath(); c.ellipse(0, 0, 7, 4.6, 0, 0, TAU); c.fill();
  c.save(); c.clip(); c.fillStyle = '#2a2118'; c.fillRect(-3.8, -6, 2.2, 12); c.fillRect(0.4, -6, 2.2, 12); c.restore();
  c.fillStyle = '#2a2118'; c.beginPath(); c.arc(6.6, -0.6, 3, 0, TAU); c.moveTo(-7, 0); c.lineTo(-10, 0.6); c.lineTo(-7, 1.4); c.fill();
  c.restore();
}
M.bees = (c, w, h, t, o) => {
  const S = o.S, fx = w / 2, fy = h * 0.8;
  c.strokeStyle = mixc('#4f8a45', o.col, 0.2); c.lineWidth = 2.5 * S; c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo(fx - 6 * S, h * 0.95, fx - 2 * S, h + 4); c.stroke();
  leafAt(c, fx - 9 * S, fy + 14 * S, 1.6 * S, -0.5, mixc('#4f8a45', o.col, 0.2));
  flower(c, fx, fy, 22 * S, o.col, 1, t * 0.2);
  for (let i = 0; i < 5; i++) {
    const sp = 0.9 + 0.17 * i, u = t * sp + i * 1.27, pos = (uu) => [w / 2 + Math.sin(uu) * w * 0.36, h * 0.42 + Math.sin(2 * uu) * h * 0.2];
    for (let k = 1; k < 9; k++) { const [x, y] = pos(u - k * 0.07); c.fillStyle = rgba(o.ink, 0.28 * (1 - k / 9)); c.beginPath(); c.arc(x, y, 1.2 * S, 0, TAU); c.fill(); }
    const [x, y] = pos(u);
    bee(c, x, y + Math.sin(t * 9 + i) * 1.5, Math.cos(u) >= 0 ? 1 : -1, 1.25 * S, t, i);
  }
};

function butterfly(c, x, y, s, flap, col, col2, rot, ink) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
  for (const side of [-1, 1]) {
    c.save(); c.scale(side * (0.18 + 0.82 * flap), 1);
    c.fillStyle = col; c.beginPath(); c.ellipse(7, -5, 8, 6, -0.55, 0, TAU); c.fill();
    c.fillStyle = col2; c.beginPath(); c.ellipse(5, 4.5, 5.5, 4.5, 0.5, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(9, -6, 1.8, 0, TAU); c.fill();
    c.restore();
  }
  c.fillStyle = ink; c.beginPath(); c.ellipse(0, 0, 1.4, 7, 0, 0, TAU); c.fill();
  c.strokeStyle = ink; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, -6); c.quadraticCurveTo(-2, -11, -4, -12); c.moveTo(0, -6); c.quadraticCurveTo(2, -11, 4, -12); c.stroke();
  c.restore();
}
M.butterflies = (c, w, h, t, o) => {
  const S = o.S;
  for (let i = 0; i < 6; i++) flower(c, w * (0.08 + i * 0.17), h * 0.96 - (i % 2) * 6 * S, 9 * S, mixc(o.col, '#ffffff', 0.2 + (i % 3) * 0.15), 1, i);
  for (let i = 0; i < 5; i++) {
    const R = (k) => o.R(i, k);
    const x = fract(R(0) + t * 0.05 * (1 + R(1))) * (w + 70) - 35, y = h * (0.2 + 0.5 * R(2)) + Math.sin(t * 1.8 + i * 2) * 14 * S;
    butterfly(c, x, y, (1 + R(3) * 0.5) * S, Math.abs(Math.sin(t * (8 + R(4) * 4) + i)), i % 2 ? o.col : mixc(o.col, '#ffffff', 0.35), mixc(o.col, '#000000', 0.25), Math.sin(t * 1.8 + i * 2) * 0.25 + 0.15, o.dark ? '#f1ece2' : '#2a2420');
  }
};

M.moon = (c, w, h, t, o) => {
  const S = o.S;
  sky(c, w, h, '#0b1430', '#26305e');
  for (let i = 0; i < 46; i++) {
    const a = 0.25 + 0.75 * Math.abs(Math.sin(t * (0.8 + o.R(i) * 2) + o.R(i, 1) * 6));
    c.fillStyle = `rgba(255,255,240,${a})`; c.beginPath();
    o.R(i, 3) > 0.85 ? star4(c, o.R(i, 4) * w, o.R(i, 5) * h * 0.8, 3.2 * S * a) : c.arc(o.R(i, 4) * w, o.R(i, 5) * h * 0.8, (0.5 + o.R(i, 2)) * S, 0, TAU);
    c.fill();
  }
  const mk = easeOut(t / 2.6), mx = w * 0.74, my = h * 1.15 - mk * h * 0.82, mr = h * 0.16;
  soft(c, mx, my, mr * 3.2, '#fdf3c8', 0.32);
  c.save(); c.beginPath(); c.arc(mx, my, mr, 0, TAU); c.clip();
  c.fillStyle = '#fbf2cf'; c.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
  c.fillStyle = '#e8dcae'; for (const [dx, dy, r] of [[-0.3, -0.2, 0.22], [0.25, 0.3, 0.16], [0.1, -0.45, 0.1], [-0.35, 0.4, 0.12]]) { c.beginPath(); c.arc(mx + dx * mr, my + dy * mr, r * mr, 0, TAU); c.fill(); }
  c.fillStyle = 'rgba(14,22,52,.88)'; c.beginPath(); c.arc(mx + mr * 0.55, my - mr * 0.2, mr * 0.98, 0, TAU); c.fill();
  c.restore();
  const op = easeOut((t - 0.5) / 2.4), fx = w * 0.26, fy = h * 0.82;
  c.strokeStyle = '#2f4a3a'; c.lineWidth = 3 * S; c.beginPath(); c.moveTo(fx, fy); c.quadraticCurveTo(fx + 8 * S, h * 0.95, fx + 4 * S, h + 4); c.stroke();
  leafAt(c, fx + 14 * S, h * 0.93, 2 * S, -0.4, '#2f4a3a');
  c.globalCompositeOperation = 'lighter'; soft(c, fx, fy, 46 * S * op, o.col, 0.45); c.globalCompositeOperation = 'source-over';
  c.save(); c.translate(fx, fy);
  for (let i = 0; i < 8; i++) { c.save(); c.rotate(i * TAU / 8 + t * 0.15); c.rotate(0); c.fillStyle = mixc(o.col, '#ffffff', 0.35 + (i % 2) * 0.2); c.beginPath(); c.ellipse(0, -14 * S * op, 4.5 * S, 13 * S * op + 0.1, 0, 0, TAU); c.fill(); c.restore(); }
  c.fillStyle = '#fff4c2'; c.beginPath(); c.arc(0, 0, 4 * S, 0, TAU); c.fill(); c.restore();
};

M.sun = (c, w, h, t, o) => {
  const S = o.S, hz = h * 0.74, k = easeOut(t / 2.4), sx = w * 0.5, sy = h * 0.98 - k * h * 0.5, sr = h * 0.17;
  sky(c, w, h, o.dark ? '#3b2a4e' : '#ffd6a0', o.dark ? '#e0875a' : '#fff1d8');
  c.save(); c.translate(sx, sy); c.rotate(t * 0.18); c.fillStyle = 'rgba(255,236,170,.32)';
  for (let i = 0; i < 18; i++) { c.rotate(TAU / 18); c.beginPath(); c.moveTo(0, 0); c.lineTo(w, -sr * 0.5); c.lineTo(w, sr * 0.5); c.fill(); }
  c.restore();
  soft(c, sx, sy, sr * 2.6, '#fff1b8', 0.6);
  const g = c.createRadialGradient(sx, sy - sr * 0.3, 0, sx, sy, sr); g.addColorStop(0, '#fffbe6'); g.addColorStop(1, '#ffb347');
  c.fillStyle = g; c.beginPath(); c.arc(sx, sy, sr, 0, TAU); c.fill();
  const gg = c.createLinearGradient(0, hz, 0, h); gg.addColorStop(0, mixc(o.col, '#6b8f3c', 0.55)); gg.addColorStop(1, mixc(o.col, '#3e5a26', 0.6));
  c.fillStyle = gg; c.fillRect(0, hz, w, h - hz);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) {
    const y = hz + 6 * S + r * 13 * S, x = ((i + 0.5 * (r % 2)) / 11) * w, sc = (0.8 + r * 0.35) * S;
    c.save(); c.translate(x, y); c.rotate(Math.sin(t * 1.5 + i + r) * 0.2); c.fillStyle = mixc(o.col, '#ffffff', 0.15 * (2 - r)); glyph(c, o.shape, sc); c.fill(); c.restore();
  }
};

M.hands = (c, w, h, t, o) => {
  const S = o.S, n = 6, P = 1.5, cyc = t / P, k = Math.floor(cyc) % n, p = fract(cyc);
  const bx = w * 0.3, by = h * 0.8, green = mixc('#4f8a45', o.col, 0.15);
  c.fillStyle = mixc(green, '#000000', 0.15);
  for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(bx + (i - 3) * 16 * S, by + 4 * S - Math.sin(i * 1.3) * 6 * S, 18 * S, 0, TAU); c.fill(); }
  c.fillStyle = green; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(bx + (i - 2.5) * 17 * S, by - 4 * S + Math.cos(i * 1.7) * 5 * S, 14 * S, 0, TAU); c.fill(); }
  const item = (i) => [bx + (i - (n - 1) / 2) * 17 * S, by - 14 * S - (i % 2) * 10 * S];
  const bkx = w * 0.75, bky = h * 0.84, bw = 74 * S, bh = 32 * S;
  if (o.hero) o.anchor = [bkx, bky - bh * 0.5 - 16 * S, 0.62];
  const drawItem = (x, y, i, sc = 1.5) => { c.save(); c.translate(x, y); c.rotate(i * 1.7 + Math.sin(t * 2 + i) * 0.1); c.fillStyle = mixc(o.col, '#ffffff', (i % 3) * 0.12); glyph(c, o.shape, sc * S); c.fill(); c.restore(); };
  for (let i = 0; i < n; i++) if (i > k || (i === k && p < 0.45)) drawItem(...item(i), i);
  // basket and what's already in it
  const inB = k + (p > 0.9 ? 1 : 0);
  for (let i = 0; i < inB; i++) drawItem(bkx - bw * 0.32 + (i % 4) * bw * 0.21, bky - bh * 0.42 - Math.floor(i / 4) * 7 * S, i, 1.3);
  c.fillStyle = '#b07a3e'; c.beginPath(); c.moveTo(bkx - bw / 2, bky - bh / 2); c.lineTo(bkx + bw / 2, bky - bh / 2); c.lineTo(bkx + bw * 0.4, bky + bh / 2); c.lineTo(bkx - bw * 0.4, bky + bh / 2); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(80,44,14,.45)'; c.lineWidth = 1.2 * S; c.beginPath();
  for (let i = 1; i < 4; i++) { const y = bky - bh / 2 + i * bh / 4; c.moveTo(bkx - bw * (0.5 - i * 0.025), y); c.lineTo(bkx + bw * (0.5 - i * 0.025), y); }
  for (let i = 1; i < 8; i++) { const x = bkx - bw / 2 + i * bw / 8; c.moveTo(x, bky - bh / 2); c.lineTo(bkx + (x - bkx) * 0.8, bky + bh / 2); }
  c.stroke();
  // the hand
  const [ix, iy] = item(k), [qx, qy] = [bkx, bky - bh * 0.9];
  let hx, hy;
  if (p < 0.4) { const u = easeInOut(p / 0.4); hx = lerp(qx, ix, u); hy = lerp(qy, iy, u) - Math.sin(u * Math.PI) * 26 * S; }
  else if (p < 0.5) { hx = ix; hy = iy + Math.sin((p - 0.4) / 0.1 * Math.PI) * 4 * S; }
  else if (p < 0.9) { const u = easeInOut((p - 0.5) / 0.4); hx = lerp(ix, qx, u); hy = lerp(iy, qy, u) - Math.sin(u * Math.PI) * 30 * S; }
  else { hx = qx; hy = qy; }
  const holding = p > 0.45 && p < 0.92;
  if (holding) drawItem(hx, hy + 4 * S, k);
  const skin = '#d9a074', skinD = '#b97f55';
  c.strokeStyle = skin; c.lineCap = 'round'; c.lineWidth = 11 * S; c.beginPath(); c.moveTo(hx + 34 * S, -14); c.quadraticCurveTo(hx + 22 * S, hy - 30 * S, hx + 3 * S, hy - 13 * S); c.stroke();
  c.fillStyle = skin; c.beginPath(); c.ellipse(hx, hy - 8 * S, 9 * S, 8 * S, 0.3, 0, TAU); c.fill();
  c.strokeStyle = skinD; c.lineWidth = 3.4 * S;
  for (let f = 0; f < 4; f++) { const fx = hx - 6 * S + f * 4 * S, len = (holding ? 5 : 10) * S; c.beginPath(); c.moveTo(fx, hy - 4 * S); c.lineTo(fx + (holding ? 2 * S : 0), hy - 4 * S + len); c.stroke(); }
  c.beginPath(); c.moveTo(hx + 7 * S, hy - 7 * S); c.lineTo(hx + (holding ? 5 : 11) * S, hy + 1 * S); c.stroke();
  c.lineCap = 'butt';
};

function coin(c, x, y, r, spin, S) {
  c.save(); c.translate(x, y); c.scale(Math.max(0.1, Math.abs(spin)), 1);
  const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#fff2a8'); g.addColorStop(0.5, '#f2c230'); g.addColorStop(1, '#b8860b');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  c.strokeStyle = '#a57400'; c.lineWidth = 1.2 * S; c.stroke();
  c.beginPath(); c.arc(0, 0, r * 0.7, 0, TAU); c.strokeStyle = 'rgba(150,100,0,.5)'; c.stroke();
  if (Math.abs(spin) > 0.45) { c.fillStyle = 'rgba(160,110,0,.55)'; c.beginPath(); starN(c, 0, 0, r * 0.45, r * 0.2, 5); c.fill(); }
  c.restore();
}
M.coins = (c, w, h, t, o) => {
  const S = o.S, rx = 13 * S, ry = 4.4 * S;
  const stacks = [[w * 0.2, 5], [w * 0.38, 9], [w * 0.62, 7], [w * 0.8, 4]];
  stacks.forEach(([x, n], j) => {
    const m = Math.floor(easeOut((t - j * 0.15) / 2.6) * n);
    for (let i = 0; i < m; i++) {
      const y = h * 0.93 - i * 4 * S;
      c.fillStyle = '#b8860b'; c.beginPath(); c.ellipse(x, y + 2 * S, rx, ry, 0, 0, TAU); c.fill();
      c.fillRect(x - rx, y, rx * 2, 2 * S);
      const g = c.createLinearGradient(x - rx, 0, x + rx, 0); g.addColorStop(0, '#f6d35b'); g.addColorStop(0.5, '#fff0a0'); g.addColorStop(1, '#d9a520');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
    }
  });
  for (let i = 0; i < 20; i++) {
    const R = (k) => o.R(i, k), y = fract(R(0) + t * (0.3 + R(1) * 0.25)) * (h + 40) - 20;
    coin(c, R(2) * w, y, (7 + R(3) * 4) * S, Math.cos(t * (4 + R(4) * 3) + R(5) * 6), S);
  }
  for (let i = 0; i < 7; i++) { const a = Math.max(0, Math.sin(t * 2.2 + i * 1.9)); c.fillStyle = `rgba(255,250,210,${a})`; c.beginPath(); star4(c, o.R(i, 7) * w, h * 0.55 + o.R(i, 8) * h * 0.35, 6 * S * a); c.fill(); }
  if (o.hero) { soft(c, w / 2, h * 0.32, 44 * S, '#f2c230', 0.45); return; }
  c.save(); c.translate(w / 2, h * 0.28 + Math.sin(t * 2) * 4 * S); c.fillStyle = o.col; c.shadowColor = rgba('#f2c230', 0.9); c.shadowBlur = 14 * S; glyph(c, o.shape, 2.6 * S); c.fill(); c.restore();
};

function crownShape(c, W, H) {
  c.beginPath(); c.moveTo(-W / 2, 0); c.lineTo(-W / 2, -H * 0.78); c.lineTo(-W / 4, -H * 0.36); c.lineTo(0, -H); c.lineTo(W / 4, -H * 0.36); c.lineTo(W / 2, -H * 0.78); c.lineTo(W / 2, 0); c.closePath();
}
function crown(c, W, H, S, col) {
  const g = c.createLinearGradient(-W / 2, -H, W / 2, 0); g.addColorStop(0, '#fff3a6'); g.addColorStop(0.45, '#f4c432'); g.addColorStop(1, '#b4800c');
  c.fillStyle = g; crownShape(c, W, H); c.fill(); c.strokeStyle = '#9b6c05'; c.lineWidth = 1.4 * S; c.stroke();
  c.fillStyle = '#d6a21c'; c.fillRect(-W / 2, -13 * S, W, 13 * S);
  c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(-W / 2, -13 * S, W, 2.5 * S);
  for (const [x, cc] of [[-W * 0.3, '#e5484d'], [0, col], [W * 0.3, '#3b82f6']]) { c.fillStyle = cc; c.beginPath(); c.arc(x, -6.5 * S, 4.6 * S, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(x - 1.4 * S, -8 * S, 1.4 * S, 0, TAU); c.fill(); }
  c.fillStyle = '#fff1a0'; for (const [x, y] of [[-W / 2, -H * 0.78], [0, -H], [W / 2, -H * 0.78]]) { c.beginPath(); c.arc(x, y, 4 * S, 0, TAU); c.fill(); }
}
M.crown = (c, w, h, t, o) => {
  const S = o.S, land = easeBack(t / 1.0), cx = w / 2, cy = lerp(-30 * S, h * 0.66, land), W = 92 * S, H = 52 * S;
  if (t > 0.8) {
    const a = Math.min(1, (t - 0.8) * 2);
    c.save(); c.translate(cx, h * 0.5); c.rotate(t * 0.25); c.fillStyle = `rgba(255,214,90,${0.18 * a})`;
    for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(w, -w * 0.12); c.lineTo(w, w * 0.12); c.fill(); }
    c.restore();
  }
  c.fillStyle = o.col; c.beginPath(); c.ellipse(cx, h * 0.8, 70 * S, 16 * S, 0, 0, TAU); c.fill();
  c.fillStyle = mixc(o.col, '#ffffff', 0.3); c.beginPath(); c.ellipse(cx, h * 0.78, 60 * S, 11 * S, 0, 0, TAU); c.fill();
  if (o.hero) {
    o.post = (hp, size) => {
      if (!hp) return;
      const k = easeBack((t - 0.55) / 0.9), sc = size / (150 * S), top = hp.y - size * 0.3 * hp.s + 6 * S;
      c.save(); c.translate(hp.x, lerp(-40 * S, top, k)); c.rotate(hp.r * 0.6 + (1 - clamp01(k)) * 0.5); c.scale(sc, sc); crown(c, W, H, S, o.col); c.restore();
      if (t > 1.3) for (let i = 0; i < 7; i++) { const a = Math.max(0, Math.sin(t * 3 + i * 2.1)); c.fillStyle = `rgba(255,248,200,${a})`; c.beginPath(); star4(c, hp.x + (o.R(i) - 0.5) * size * 1.4, top - size * 0.2 + (o.R(i, 1) - 0.5) * size, 6 * S * a); c.fill(); }
    };
    return;
  }
  c.save(); c.translate(cx, cy); crown(c, W, H, S, o.col); c.restore();
  if (t > 0.9) for (let i = 0; i < 9; i++) { const a = Math.max(0, Math.sin(t * 3 + i * 2.1)); c.fillStyle = `rgba(255,248,200,${a})`; c.beginPath(); star4(c, cx + (o.R(i) - 0.5) * W * 1.8, cy - H * 0.5 + (o.R(i, 1) - 0.5) * H * 1.6, 7 * S * a); c.fill(); }
};

M.ship = (c, w, h, t, o) => {
  const S = o.S, hz = h * 0.64, sea = mixc('#2f6fa3', o.col, 0.18);
  for (let i = 0; i < 3; i++) { const x = fract(o.R(i) + t * 0.03) * (w + 40) - 20, y = h * (0.15 + i * 0.09), f = Math.sin(t * 6 + i) * 3 * S; c.strokeStyle = rgba(o.ink, 0.6); c.lineWidth = 1.4 * S; c.beginPath(); c.moveTo(x - 6 * S, y + f); c.quadraticCurveTo(x - 3 * S, y - 3 * S, x, y); c.quadraticCurveTo(x + 3 * S, y - 3 * S, x + 6 * S, y + f); c.stroke(); }
  c.fillStyle = mixc(sea, '#ffffff', 0.25); c.fillRect(0, hz, w, h - hz);
  const x = w * 0.5 + Math.sin(t * 0.35) * w * 0.16, y = hz + 6 * S + Math.sin(t * 1.6) * 3 * S, roll = Math.sin(t * 1.3) * 0.07;
  if (o.hero) o.anchor = [x + Math.cos(roll) * 30 * S + Math.sin(roll) * 16 * S, y - 16 * S + Math.sin(roll) * 30 * S, 0.5, 'ride'];
  c.save(); c.translate(x, y); c.rotate(roll); c.scale(S, S);
  c.strokeStyle = '#5a3a20'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-12, 0); c.lineTo(-12, -64); c.moveTo(16, 0); c.lineTo(16, -54); c.stroke();
  const bulge = 6 + Math.sin(t * 1.2) * 2;
  c.fillStyle = '#f7f1e3'; c.strokeStyle = 'rgba(120,90,50,.35)'; c.lineWidth = 1;
  for (const [m, y1, y2, wd] of [[-12, -60, -34, 17], [-12, -30, -6, 21], [16, -50, -28, 14], [16, -24, -6, 17]]) {
    c.beginPath(); c.moveTo(m - wd, y1); c.lineTo(m + wd, y1); c.quadraticCurveTo(m + wd + bulge, (y1 + y2) / 2, m + wd, y2); c.lineTo(m - wd, y2); c.quadraticCurveTo(m - wd + bulge, (y1 + y2) / 2, m - wd, y1); c.fill(); c.stroke();
  }
  c.fillStyle = o.col; c.beginPath(); c.moveTo(-12, -64); for (let i = 0; i <= 6; i++) c.lineTo(-12 + i * 3, -64 + Math.sin(t * 8 + i) * 1.5 + (i === 6 ? 4 : 0)); c.lineTo(-12, -58); c.fill();
  c.fillStyle = '#6b4226'; c.beginPath(); c.moveTo(-46, -4); c.lineTo(46, -4); c.quadraticCurveTo(40, 12, 28, 15); c.lineTo(-30, 15); c.quadraticCurveTo(-42, 11, -46, -4); c.fill();
  c.fillStyle = o.col; c.fillRect(-42, 1, 84, 3);
  c.fillStyle = '#f2d49b'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(-26 + i * 13, 8, 1.8, 0, TAU); c.fill(); }
  c.restore();
  for (let L = 0; L < 2; L++) {
    c.fillStyle = L ? sea : mixc(sea, '#ffffff', 0.12); c.beginPath(); c.moveTo(0, h);
    for (let X = 0; X <= w; X += 6) c.lineTo(X, hz + (10 + L * 12) * S + Math.sin(X * 0.035 + t * (1.6 + L * 0.5) + L) * 4 * S);
    c.lineTo(w, h); c.fill();
  }
  c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5 * S; c.beginPath(); for (let X = 0; X <= w; X += 6) { const Y = hz + 22 * S + Math.sin(X * 0.035 + t * 2.1 + 1) * 4 * S; X ? c.lineTo(X, Y) : c.moveTo(X, Y); } c.stroke();
};

M.treasure = (c, w, h, t, o) => {
  const S = o.S, cx = w / 2, W = 100 * S, BH = 40 * S, top = h * 0.95 - BH, op = easeBack((t - 0.25) / 0.7);
  if (t > 0.5) {
    const a = Math.min(1, (t - 0.5) * 2);
    c.save(); c.translate(cx, top); c.fillStyle = `rgba(255,220,110,${0.2 * a})`;
    for (let i = 0; i < 9; i++) { const ang = -Math.PI / 2 + (i - 4) * 0.3 + Math.sin(t + i) * 0.04; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(ang - 0.08) * h, Math.sin(ang - 0.08) * h); c.lineTo(Math.cos(ang + 0.08) * h, Math.sin(ang + 0.08) * h); c.fill(); }
    c.restore(); soft(c, cx, top, 70 * S * a, '#ffd76a', 0.7);
  }
  if (t > 0.7) for (let i = 0; i < 22; i++) {
    const R = (k) => o.R(i, k), a = fract((t - 0.7) / 1.9 + R(0));
    const vx = (R(1) - 0.5) * 150 * S, vy = (150 + R(2) * 70) * S, tt = a * 1.6;
    const x = cx + vx * tt, y = top - (vy * tt - 170 * S * tt * tt);
    if (y > top + 4) continue;
    c.globalAlpha = 1 - a * 0.5;
    if (i % 3 === 0) coin(c, x, y, 6.5 * S, Math.cos(t * 6 + i), S);
    else { c.save(); c.translate(x, y); c.rotate(t * 4 + i); c.fillStyle = mixc(o.col, '#ffffff', R(3) * 0.4); glyph(c, o.shape, 1.6 * S); c.fill(); c.restore(); }
    c.globalAlpha = 1;
  }
  if (o.hero) o.anchor = [cx, top - 24 * S, 0.8];
  c.fillStyle = '#2b1a0e'; c.beginPath(); c.ellipse(cx, top, W / 2 - 3 * S, 7 * S * clamp01(op), 0, 0, TAU); c.fill();
  // lid lifts and tips back
  c.save(); c.translate(cx, top - 26 * S * clamp01(op)); c.scale(1, 1 - 0.55 * clamp01(op));
  c.fillStyle = mixc('#8a5530', '#3a2412', 0.5 * clamp01(op)); c.beginPath(); c.moveTo(-W / 2, 0); c.bezierCurveTo(-W / 2, -30 * S, W / 2, -30 * S, W / 2, 0); c.closePath(); c.fill();
  c.fillStyle = '#e0b040'; c.fillRect(-W * 0.32 - 4 * S, -22 * S, 8 * S, 22 * S); c.fillRect(W * 0.32 - 4 * S, -22 * S, 8 * S, 22 * S);
  c.restore();
  c.fillStyle = '#7a4a26'; c.fillRect(cx - W / 2, top, W, BH);
  c.strokeStyle = 'rgba(40,20,5,.35)'; c.lineWidth = 1 * S; c.beginPath(); for (let i = 1; i < 3; i++) { c.moveTo(cx - W / 2, top + i * BH / 3); c.lineTo(cx + W / 2, top + i * BH / 3); } c.stroke();
  c.fillStyle = '#e0b040'; c.fillRect(cx - W * 0.32 - 4 * S, top, 8 * S, BH); c.fillRect(cx + W * 0.32 - 4 * S, top, 8 * S, BH); c.fillRect(cx - W / 2, top, W, 4 * S);
  c.fillStyle = '#f5d36a'; rr(c, cx - 7 * S, top + 4 * S, 14 * S, 15 * S, 3 * S); c.fill(); c.fillStyle = '#4a2a10'; c.beginPath(); c.arc(cx, top + 10 * S, 2.2 * S, 0, TAU); c.fill();
};

M.scroll = (c, w, h, t, o) => {
  const S = o.S, k = easeOut(t / 1.3), cx = w / 2, pw = w * 0.74 * k + 10 * S, px = cx - pw / 2, py = h * 0.14, ph = h * 0.72;
  const paper = o.dark ? '#e3cfa2' : '#f3e5c4';
  c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(px + 3 * S, py + 4 * S, pw, ph);
  c.fillStyle = paper; c.fillRect(px, py, pw, ph);
  const g = c.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(160,110,40,.18)'); g.addColorStop(0.15, 'rgba(160,110,40,0)'); g.addColorStop(0.85, 'rgba(160,110,40,0)'); g.addColorStop(1, 'rgba(160,110,40,.18)');
  c.fillStyle = g; c.fillRect(px, py, pw, ph);
  const lx = cx - w * 0.33, lw = w * 0.66, lines = 5;
  let quill = null;
  c.save(); c.beginPath(); c.rect(px, py, pw, ph); c.clip();
  c.fillStyle = o.col; rr(c, lx, py + 10 * S, 22 * S, 22 * S, 3 * S); c.fill();
  c.fillStyle = '#fff'; c.font = `700 ${15 * S}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('A', lx + 11 * S, py + 21.5 * S);
  c.strokeStyle = 'rgba(96,66,30,.75)'; c.lineWidth = 1.6 * S; c.lineCap = 'round';
  for (let j = 0; j < lines; j++) {
    const lr = clamp01((t - 1.1 - j * 0.6) / 0.6); if (!lr) continue;
    const y = py + 16 * S + j * ph * 0.17, x0 = j < 2 ? lx + 28 * S : lx, span = (j < 2 ? lw - 28 * S : lw) * (j === lines - 1 ? 0.6 : 1), end = x0 + span * lr;
    let x = x0, wi = 0;
    c.beginPath();
    while (x < end) { const wl = (10 + o.R(j * 20 + wi) * 26) * S, xe = Math.min(end, x + wl); c.moveTo(x, y); for (let q = x; q < xe; q += 3 * S) c.lineTo(q, y + Math.sin(q * 0.9 + j) * 1.3 * S); x = xe + 6 * S; wi++; }
    c.stroke();
    if (lr < 1) quill = [end, y];
  }
  c.restore(); c.lineCap = 'butt';
  if (quill) {
    const [qx, qy] = quill; c.save(); c.translate(qx, qy); c.rotate(-0.7 + Math.sin(t * 20) * 0.05);
    c.fillStyle = mixc(o.col, '#ffffff', 0.5); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(10 * S, -26 * S, 6 * S, -50 * S); c.quadraticCurveTo(-4 * S, -26 * S, 0, 0); c.fill();
    c.strokeStyle = '#5a4026'; c.lineWidth = 1 * S; c.beginPath(); c.moveTo(0, 0); c.lineTo(5 * S, -46 * S); c.stroke(); c.restore();
  }
  for (const x of [px, px + pw]) {
    const rg = c.createLinearGradient(x - 7 * S, 0, x + 7 * S, 0); rg.addColorStop(0, '#8a6436'); rg.addColorStop(0.5, '#d8b073'); rg.addColorStop(1, '#7a5428');
    c.fillStyle = rg; rr(c, x - 7 * S, py - 6 * S, 14 * S, ph + 12 * S, 6 * S); c.fill();
    c.fillStyle = '#5b3d1c'; c.beginPath(); c.arc(x, py - 8 * S, 4 * S, 0, TAU); c.arc(x, py + ph + 8 * S, 4 * S, 0, TAU); c.fill();
  }
};

M.pyramid = (c, w, h, t, o) => {
  const S = o.S, base = h * 0.8;
  sky(c, w, h, o.dark ? '#2e2347' : '#f6cf94', o.dark ? '#c97a4c' : '#fdebc9');
  const sx = w * 0.82, sy = h * 0.26; soft(c, sx, sy, 50 * S, '#fff2c0', 0.8); c.fillStyle = '#fff6da'; c.beginPath(); c.arc(sx, sy, 15 * S, 0, TAU); c.fill();
  c.save(); c.beginPath(); c.rect(0, 0, w, base); c.clip();
  [[w * 0.3, 74], [w * 0.56, 56], [w * 0.72, 38]].forEach(([x, s], i) => {
    const y = base + (1 - easeOut((t - i * 0.25) / 1.3)) * h * 0.7, H = s * S * 1.05;
    c.fillStyle = '#ecc884'; c.beginPath(); c.moveTo(x - s * S * 1.1, y); c.lineTo(x, y - H); c.lineTo(x + s * S * 0.25, y); c.fill();
    c.fillStyle = '#b98a48'; c.beginPath(); c.moveTo(x + s * S * 0.25, y); c.lineTo(x, y - H); c.lineTo(x + s * S * 1.1, y); c.fill();
    c.strokeStyle = 'rgba(120,80,30,.18)'; c.lineWidth = 1; c.beginPath(); for (let r = 1; r < 6; r++) { const yy = y - H * r / 6, f = 1 - r / 6; c.moveTo(x - s * S * 1.1 * f, yy); c.lineTo(x + s * S * 1.1 * f, yy); } c.stroke();
  });
  c.restore();
  c.fillStyle = '#e3b56b'; c.beginPath(); c.moveTo(0, h); c.lineTo(0, base); for (let x = 0; x <= w; x += 8) c.lineTo(x, base + Math.sin(x * 0.02) * 3 * S); c.lineTo(w, h); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1.5 * S;
  for (let i = 0; i < 5; i++) { const y = h * 0.4 + fract(i / 5 - t * 0.12) * h * 0.4; c.beginPath(); for (let x = 0; x <= w; x += 6) { const yy = y + Math.sin(x * 0.06 + t * 3 + i) * 2 * S; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } c.stroke(); }
  const gx = w * 0.3, gy = base - 74 * S * 1.05 - 18 * S + Math.sin(t * 1.8) * 4 * S;
  if (o.hero) { o.anchor = [w * 0.56, base - 56 * S * 1.05 - 14 * S, 0.55]; return; }
  if (t > 1) { c.globalAlpha = Math.min(1, t - 1); soft(c, gx, gy, 24 * S, o.col, 0.6); c.save(); c.translate(gx, gy); c.rotate(t * 0.8); c.fillStyle = o.col; glyph(c, o.shape, 2 * S); c.fill(); c.restore(); c.globalAlpha = 1; }
};

M.smoke = (c, w, h, t, o) => {
  const S = o.S, cx = w / 2, by = h * 0.86, sm = mixc(o.col, o.dark ? '#d8d8d8' : '#8a8a8a', 0.55);
  for (let p = 0; p < 3; p++) for (let i = 0; i < 22; i++) {
    const a = fract(t / 4 + i / 22 + p * 0.31), x = cx + (p - 1) * 10 * S + Math.sin(a * 6 + t * 0.7 + p * 2) * (5 + a * 34) * S, y = by - 12 * S - a * h * 0.95;
    const g = c.createRadialGradient(x, y, 0, x, y, (5 + a * 24) * S); g.addColorStop(0, rgba(sm, 0.32 * (1 - a) * Math.min(1, a * 6))); g.addColorStop(1, rgba(sm, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, (5 + a * 24) * S, 0, TAU); c.fill();
  }
  soft(c, cx, by - 10 * S, 22 * S, '#ff9a3c', 0.5 + Math.sin(t * 5) * 0.15);
  c.fillStyle = '#ffb347'; c.beginPath(); c.ellipse(cx, by - 9 * S, 14 * S, 3 * S, 0, 0, TAU); c.fill();
  const g = c.createLinearGradient(cx - 28 * S, 0, cx + 28 * S, 0); g.addColorStop(0, '#6b5134'); g.addColorStop(0.5, '#b58d55'); g.addColorStop(1, '#5c4329');
  c.fillStyle = g; c.beginPath(); c.moveTo(cx - 28 * S, by - 9 * S); c.quadraticCurveTo(cx, by + 22 * S, cx + 28 * S, by - 9 * S); c.closePath(); c.fill();
  c.fillRect(cx - 4 * S, by + 4 * S, 8 * S, 8 * S); c.fillRect(cx - 16 * S, by + 11 * S, 32 * S, 3 * S);
  for (let i = 0; i < 4; i++) { c.fillStyle = mixc(o.col, '#7a5a3a', 0.4); c.beginPath(); c.arc(cx - 9 * S + i * 6 * S, by - 9 * S, 2.6 * S, 0, TAU); c.fill(); }
};

M.fire = (c, w, h, t, o) => {
  const S = o.S, cx = w / 2, by = h * 0.86;
  soft(c, cx, by - 20 * S, 90 * S, '#ff8a2a', 0.35 + Math.sin(t * 7) * 0.05);
  c.fillStyle = '#5b3a22'; for (const a of [-0.25, 0.25]) { c.save(); c.translate(cx, by + 4 * S); c.rotate(a); rr(c, -42 * S, -5 * S, 84 * S, 10 * S, 5 * S); c.fill(); c.fillStyle = '#c99a63'; c.beginPath(); c.ellipse(42 * S, 0, 3 * S, 5 * S, 0, 0, TAU); c.fill(); c.fillStyle = '#5b3a22'; c.restore(); }
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 80; i++) {
    const R = (k) => o.R(i, k), a = fract(t / (0.9 + R(0) * 0.5) + R(1));
    const x = cx + (R(2) - 0.5) * 56 * S * (1 - a * 0.8) + Math.sin(t * 9 + i) * 3 * S, y = by - 4 * S - a * h * (0.45 + R(3) * 0.35), r = ((1 - a) * 13 + 2) * S;
    const col = a < 0.25 ? '#fff1a8' : a < 0.55 ? '#ffb02e' : '#ff5a1c';
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, 0.55 * (1 - a))); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  for (let i = 0; i < 18; i++) { const a = fract(t * 0.35 + o.R(i, 5)); c.fillStyle = rgba(mixc(o.col, '#ffb02e', 0.4), 1 - a); c.beginPath(); c.arc(cx + (o.R(i, 6) - 0.5) * 80 * S + Math.sin(t * 3 + i) * 8 * S, by - 20 * S - a * h * 0.8, 1.6 * S, 0, TAU); c.fill(); }
  c.globalCompositeOperation = 'source-over';
};

M.tears = (c, w, h, t, o) => {
  const S = o.S, tx = w * 0.5, tw = 96 * S;
  const g = c.createLinearGradient(tx - tw / 2, 0, tx + tw / 2, 0); g.addColorStop(0, '#5d4330'); g.addColorStop(0.45, '#8a6a4c'); g.addColorStop(1, '#4c3626');
  c.fillStyle = g; c.fillRect(tx - tw / 2, 0, tw, h);
  c.strokeStyle = 'rgba(30,18,10,.35)'; c.lineWidth = 1.6 * S;
  for (let i = 0; i < 7; i++) { const x0 = tx - tw / 2 + (i + 0.5) * tw / 7; c.beginPath(); for (let y = 0; y <= h; y += 6) { const x = x0 + Math.sin(y * 0.05 + i * 2) * 3 * S; y ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  for (let j = 0; j < 4; j++) { c.fillStyle = rgba(o.col, 0.85); c.beginPath(); c.ellipse(tx + (j - 1.5) * 26 * S, h * 0.94 - (j % 2) * 3 * S, 7 * S, 4.5 * S, 0, 0, TAU); c.fill(); }
  const cuts = [[tx - 26 * S, h * 0.2], [tx + 20 * S, h * 0.32], [tx - 6 * S, h * 0.5]];
  cuts.forEach(([x, y], i) => {
    c.strokeStyle = '#2a1a10'; c.lineWidth = 2.4 * S; c.beginPath(); c.moveTo(x - 9 * S, y - 3 * S); c.lineTo(x + 9 * S, y + 3 * S); c.stroke();
    const p = fract(t / 2.4 + i * 0.33), grow = clamp01(p / 0.35), slide = clamp01((p - 0.35) / 0.65) ** 1.6;
    const dy = slide * (h * 0.92 - y), r = (3 + grow * 5.5) * S;
    c.strokeStyle = rgba(o.col, 0.55); c.lineWidth = 3 * S; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y + 2 * S); c.lineTo(x + Math.sin(dy * 0.05) * 2 * S, y + dy); c.stroke(); c.lineCap = 'butt';
    c.save(); c.translate(x + Math.sin(dy * 0.05) * 2 * S, y + 2 * S + dy); c.scale(1, 1 + slide * 0.5);
    const dg = c.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r * 1.4); dg.addColorStop(0, mixc(o.col, '#ffffff', 0.6)); dg.addColorStop(0.5, o.col); dg.addColorStop(1, mixc(o.col, '#000000', 0.3));
    c.fillStyle = dg; c.beginPath(); c.moveTo(0, -r * 1.5); c.quadraticCurveTo(r * 1.1, 0, 0, r); c.quadraticCurveTo(-r * 1.1, 0, 0, -r * 1.5); c.fill();
    c.restore();
  });
};

M.tree = (c, w, h, t, o) => {
  const S = o.S, g = easeOut(t / 2.2), gx = w * 0.34, gy = h * 0.9;
  c.fillStyle = mixc('#6a8f3e', o.col, 0.2); c.fillRect(0, gy, w, h - gy);
  const th = h * 0.5 * g, green = mixc('#3f8f4f', o.col, 0.25);
  c.fillStyle = '#6b4a2e'; c.beginPath(); c.moveTo(gx - 7 * S, gy); c.lineTo(gx - 4 * S, gy - th); c.lineTo(gx + 4 * S, gy - th); c.lineTo(gx + 7 * S, gy); c.fill();
  const blobs = [[0, -1, 1], [-0.7, -0.7, 0.75], [0.7, -0.7, 0.8], [-0.35, -1.35, 0.7], [0.4, -1.3, 0.72], [0, -0.55, 0.7]];
  blobs.forEach(([dx, dy, r], i) => {
    const k = easeBack((t - 0.5 - i * 0.12) / 0.8) * Math.min(1, g * 1.4), R = 26 * S * r * k; if (R <= 0) return;
    c.fillStyle = mixc(green, '#ffffff', i % 2 ? 0.12 : 0); c.beginPath(); c.arc(gx + dx * 30 * S, gy - th + dy * 24 * S + 22 * S, R, 0, TAU); c.fill();
  });
  // a cross-section counting its rings
  const rx = w * 0.76, ry = h * 0.5, rR = h * 0.34, n = Math.min(14, Math.floor(t * 5));
  c.fillStyle = '#7a5434'; c.beginPath(); c.arc(rx, ry, rR + 3 * S, 0, TAU); c.fill();
  c.fillStyle = mixc(o.col, '#e7c79a', 0.6); c.beginPath(); c.arc(rx, ry, rR, 0, TAU); c.fill();
  c.strokeStyle = mixc(o.col, '#8a5a30', 0.6); c.lineWidth = 1.2 * S;
  for (let i = 1; i <= n; i++) { const r = rR * i / 15; c.beginPath(); for (let a = 0; a <= TAU + 0.01; a += 0.2) { const rr2 = r + Math.sin(a * 3 + i) * S; const x = rx + Math.cos(a) * rr2, y = ry + Math.sin(a) * rr2; a ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  c.fillStyle = mixc(o.col, '#8a5a30', 0.5); c.beginPath(); c.arc(rx, ry, 2 * S, 0, TAU); c.fill();
};

M.roots = (c, w, h, t, o) => {
  const S = o.S, gy = h * 0.3, cx = w / 2;
  const sg = c.createLinearGradient(0, gy, 0, h); sg.addColorStop(0, '#8a6440'); sg.addColorStop(1, '#4e3522');
  c.fillStyle = sg; c.fillRect(0, gy, w, h - gy);
  c.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 30; i++) { c.beginPath(); c.arc(o.R(i, 9) * w, gy + o.R(i, 8) * (h - gy), (1 + o.R(i, 7) * 2) * S, 0, TAU); c.fill(); }
  const grow = t * 0.9, segs = [];
  const branch = (x, y, a, len, d, t0, id) => {
    if (d > 5 || len < 4 * S) return;
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len; segs.push([x, y, ex, ey, d, t0]);
    const t1 = t0 + 0.32;
    branch(ex, ey, a + (o.R(id, 1) - 0.5) * 0.5, len * 0.86, d + 0.4, t1, id * 2 + 1);
    if (o.R(id, 2) > 0.35) branch(ex, ey, a + (o.R(id, 3) > 0.5 ? 0.7 : -0.7), len * 0.62, d + 1, t1 + 0.1, id * 2 + 2);
  };
  for (let k = 0; k < 4; k++) branch(cx, gy, Math.PI / 2 + (k - 1.5) * 0.45, 18 * S, 0, 0, k + 3);
  c.lineCap = 'round';
  for (const [x, y, ex, ey, d, t0] of segs) {
    const k = clamp01((grow - t0) / 0.32); if (!k) continue;
    c.strokeStyle = mixc(o.col, '#f2e2c0', 0.35 + d * 0.06); c.lineWidth = Math.max(1, (5 - d) * 1.1 * S);
    c.beginPath(); c.moveTo(x, y); c.lineTo(lerp(x, ex, k), lerp(y, ey, k)); c.stroke();
  }
  c.lineCap = 'butt';
  const sp = easeOut(t / 1.2);
  c.strokeStyle = '#4f8a45'; c.lineWidth = 2.5 * S; c.beginPath(); c.moveTo(cx, gy); c.lineTo(cx, gy - 34 * S * sp); c.stroke();
  for (let i = 0; i < 4; i++) leafAt(c, cx + (i % 2 ? 1 : -1) * 8 * S * sp, gy - (10 + i * 7) * S * sp, 1.9 * S * sp, (i % 2 ? -0.4 : Math.PI + 0.4) + Math.sin(t * 2 + i) * 0.1, mixc('#4f8a45', o.col, 0.15 * i));
};

M.clock = (c, w, h, t, o) => {
  const S = o.S, cx = w * 0.38, cy = h / 2, R = h * 0.38;
  const bx = w * 0.76, by = h * 0.58;
  c.fillStyle = o.dark ? '#ecebe6' : '#ffffff'; rr(c, bx - 30 * S, by - 30 * S, 60 * S, 56 * S, 6 * S); c.fill();
  c.fillStyle = o.col; rr(c, bx - 30 * S, by - 30 * S, 60 * S, 15 * S, 6 * S); c.fill(); c.fillRect(bx - 30 * S, by - 21 * S, 60 * S, 6 * S);
  const yr = Math.floor(t * 1.4);
  c.fillStyle = '#2a2622'; c.font = `700 ${20 * S}px ${o.font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(yr + 1), bx, by + 6 * S);
  for (let i = 0; i < 3; i++) {
    const a = fract(t * 1.4) + i; if (a > 2.6) continue; const k = a / 2.6;
    c.save(); c.translate(bx + k * w * 0.25, by - 4 * S + k * k * h * 0.9 - Math.sin(k * Math.PI) * 30 * S); c.rotate(k * 3); c.globalAlpha = 1 - k;
    c.fillStyle = o.dark ? '#ecebe6' : '#ffffff'; c.fillRect(-26 * S, -20 * S, 52 * S, 40 * S); c.fillStyle = o.col; c.fillRect(-26 * S, -20 * S, 52 * S, 9 * S);
    c.restore();
  }
  c.globalAlpha = 1;
  c.fillStyle = o.col; c.beginPath(); c.arc(cx, cy, R + 5 * S, 0, TAU); c.fill();
  c.fillStyle = o.dark ? '#f1ede4' : '#fffdf8'; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  c.strokeStyle = '#3a342d'; for (let i = 0; i < 12; i++) { const a = i * TAU / 12, l = i % 3 ? 5 : 9; c.lineWidth = (i % 3 ? 1.2 : 2.4) * S; c.beginPath(); c.moveTo(cx + Math.cos(a) * (R - 3 * S), cy + Math.sin(a) * (R - 3 * S)); c.lineTo(cx + Math.cos(a) * (R - l * S), cy + Math.sin(a) * (R - l * S)); c.stroke(); }
  const am = t * TAU * 1.4 - Math.PI / 2, ah = am / 12 - 1;
  c.strokeStyle = rgba(o.col, 0.35); c.lineWidth = R * 0.5; c.beginPath(); c.arc(cx, cy, R * 0.45, am - 0.8, am); c.stroke();
  c.lineCap = 'round'; c.strokeStyle = '#2a2622';
  c.lineWidth = 3.4 * S; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ah) * R * 0.5, cy + Math.sin(ah) * R * 0.5); c.stroke();
  c.lineWidth = 2.2 * S; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(am) * R * 0.78, cy + Math.sin(am) * R * 0.78); c.stroke();
  c.lineCap = 'butt'; c.fillStyle = o.col; c.beginPath(); c.arc(cx, cy, 3.4 * S, 0, TAU); c.fill();
};

M.waves = (c, w, h, t, o) => {
  const S = o.S, base = mixc('#1f6aa5', o.col, 0.2);
  soft(c, w * 0.7, h * 0.22, 46 * S, '#fff6d5', 0.7);
  for (let L = 0; L < 4; L++) {
    const y0 = h * (0.42 + L * 0.15), A = (4 + L * 2.5) * S, kx = 0.03 - L * 0.004, sp = 1 + L * 0.5;
    c.fillStyle = mixc(base, '#ffffff', 0.45 - L * 0.13); c.beginPath(); c.moveTo(0, h);
    const Y = (x) => y0 + A * Math.sin(x * kx + t * sp + L * 1.7) + A * 0.45 * Math.sin(x * kx * 2.3 - t * sp * 1.3 + L);
    for (let x = 0; x <= w; x += 5) c.lineTo(x, Y(x)); c.lineTo(w, h); c.fill();
    c.fillStyle = 'rgba(255,255,255,.75)';
    for (let x = 0; x <= w; x += 9) { const d = Y(x) - Y(x + 5); if (d > A * 0.12) { c.beginPath(); c.arc(x, Y(x) + 1, (0.8 + d / A) * S, 0, TAU); c.fill(); } }
  }
  for (let i = 0; i < 2; i++) { const x = fract(o.R(i) + t * 0.04) * (w + 40) - 20, y = h * (0.16 + i * 0.1), f = Math.sin(t * 6 + i) * 3 * S; c.strokeStyle = rgba(o.ink, 0.6); c.lineWidth = 1.4 * S; c.beginPath(); c.moveTo(x - 7 * S, y + f); c.quadraticCurveTo(x - 3 * S, y - 3 * S, x, y); c.quadraticCurveTo(x + 3 * S, y - 3 * S, x + 7 * S, y + f); c.stroke(); }
};

function whaleShape(c) {
  c.beginPath(); c.moveTo(42, 0); c.bezierCurveTo(42, -15, 12, -19, -18, -10); c.lineTo(-36, -3);
  c.lineTo(-48, -14); c.quadraticCurveTo(-44, -2, -52, 9); c.lineTo(-36, 3); c.lineTo(-18, 10); c.bezierCurveTo(12, 19, 42, 15, 42, 0); c.closePath();
}
M.whale = (c, w, h, t, o) => {
  const S = o.S, y0 = h * 0.62, sea = mixc('#215f8f', o.col, 0.15);
  const P = 3.6, p = fract(t / P), u = clamp01((p - 0.08) / 0.62);
  const pos = (uu) => [w * 0.22 + uu * w * 0.56, y0 + 34 * S - Math.sin(uu * Math.PI) * h * 0.6];
  const [x, y] = pos(u), [x2, y2] = pos(Math.min(1, u + 0.01)), [x1, y1] = pos(Math.max(0, u - 0.01));
  c.save(); c.translate(x, y); c.rotate(Math.atan2(y2 - y1, x2 - x1)); c.scale(S * 1.15, S * 1.15);
  c.fillStyle = mixc('#3d5a78', o.col, 0.2); whaleShape(c); c.fill();
  c.save(); whaleShape(c); c.clip(); c.fillStyle = '#d9e3ea'; c.beginPath(); c.ellipse(12, 12, 32, 8, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(80,100,120,.45)'; c.lineWidth = 0.8; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-6, 6 + i * 2); c.lineTo(36, 4 + i * 2); c.stroke(); } c.restore();
  c.fillStyle = '#1d2c3b'; c.beginPath(); c.arc(26, -2, 1.8, 0, TAU); c.fill();
  c.fillStyle = mixc('#2d4660', o.col, 0.2); c.beginPath(); c.ellipse(8, 9, 12, 3.5, 0.6, 0, TAU); c.fill();
  c.restore();
  const wg = c.createLinearGradient(0, y0, 0, h); wg.addColorStop(0, rgba(sea, 0.9)); wg.addColorStop(1, rgba(mixc(sea, '#000000', 0.35), 0.98));
  c.fillStyle = wg; c.beginPath(); c.moveTo(0, h); for (let X = 0; X <= w; X += 5) c.lineTo(X, y0 + Math.sin(X * 0.04 + t * 1.8) * 2.5 * S); c.lineTo(w, h); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.4 * S; c.beginPath(); for (let X = 0; X <= w; X += 5) { const Y = y0 + Math.sin(X * 0.04 + t * 1.8) * 2.5 * S; X ? c.lineTo(X, Y) : c.moveTo(X, Y); } c.stroke();
  const splash = (sx, a) => {
    if (a < 0 || a > 1) return;
    for (let i = 0; i < 16; i++) { const vx = (o.R(i, 4) - 0.5) * 90 * S, vy = (60 + o.R(i, 5) * 70) * S, tt = a * 1.1, px = sx + vx * tt, py = y0 - (vy * tt - 120 * S * tt * tt); if (py > y0 + 2) continue; c.fillStyle = `rgba(255,255,255,${0.9 * (1 - a)})`; c.beginPath(); c.arc(px, py, (1.5 + o.R(i, 6) * 2) * S, 0, TAU); c.fill(); }
    c.strokeStyle = `rgba(255,255,255,${0.7 * (1 - a)})`; c.lineWidth = 1.5 * S; c.beginPath(); c.ellipse(sx, y0 + 2 * S, 10 * S + a * 40 * S, 3 * S + a * 6 * S, 0, 0, TAU); c.stroke();
  };
  splash(w * 0.22 + 0.12 * w * 0.56, (p - 0.1) / 0.35); splash(w * 0.22 + 0.9 * w * 0.56, (p - 0.66) / 0.35);
};

// simple animal silhouettes, facing right, standing on y = 0
const ANIMALS = {
  deer(c, sw) {
    c.beginPath(); c.ellipse(0, -34, 24, 11, 0, 0, TAU); c.fill();
    legs(c, [[-15, -28], [-10, -28], [12, -28], [16, -28]], 28, sw, 3.4);
    c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.moveTo(16, -38); c.lineTo(25, -58); c.stroke();
    c.beginPath(); c.ellipse(31, -60, 9, 5, 0.35, 0, TAU); c.fill(); c.beginPath(); c.ellipse(22, -66, 4, 2, -0.6, 0, TAU); c.fill();
    c.lineWidth = 2; c.beginPath(); c.moveTo(25, -64); c.lineTo(21, -84); c.moveTo(22, -74); c.lineTo(14, -80); c.moveTo(21.5, -80); c.lineTo(27, -88); c.moveTo(28, -64); c.lineTo(31, -82); c.moveTo(30, -74); c.lineTo(37, -79); c.stroke();
    c.beginPath(); c.ellipse(-25, -38, 4, 3, 0.4, 0, TAU); c.fill();
  },
  beaver(c, sw) {
    c.save(); c.translate(-38, -7); c.rotate(-0.15 + Math.sin(sw * 4) * 0.08); rr(c, -16, -5, 30, 10, 5); c.fill(); c.restore();
    c.beginPath(); c.ellipse(0, -16, 24, 15, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(22, -20, 11, 9, 0.2, 0, TAU); c.fill();
    c.beginPath(); c.arc(17, -28, 3, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(8 + sw * 6, -2, 6, 3, 0, 0, TAU); c.ellipse(-10 - sw * 6, -2, 6, 3, 0, 0, TAU); c.fill();
    c.fillStyle = '#ffffff'; c.fillRect(30, -15, 3, 4);
  },
  cat(c, sw) {
    c.beginPath(); c.ellipse(0, -22, 22, 10, 0, 0, TAU); c.fill();
    legs(c, [[-14, -16], [-9, -16], [11, -16], [16, -16]], 16, sw, 3.6);
    c.beginPath(); c.arc(24, -34, 9, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(18, -40); c.lineTo(20, -51); c.lineTo(25, -42); c.moveTo(25, -42); c.lineTo(31, -50); c.lineTo(32, -38); c.fill();
    c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-20, -26); c.quadraticCurveTo(-34, -30, -32 + Math.sin(sw * 3) * 4, -48); c.stroke();
  },
  goat(c, sw) {
    c.beginPath(); c.ellipse(0, -32, 24, 12, 0, 0, TAU); c.fill();
    legs(c, [[-15, -24], [-10, -24], [12, -24], [17, -24]], 24, sw, 4);
    c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.moveTo(16, -36); c.lineTo(24, -50); c.stroke();
    c.beginPath(); c.ellipse(30, -50, 9, 6, 0.5, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(31, -44); c.lineTo(33, -34); c.lineTo(28, -42); c.fill();
    c.lineWidth = 3; c.beginPath(); c.moveTo(24, -56); c.quadraticCurveTo(18, -72, 8, -64); c.stroke();
    c.beginPath(); c.moveTo(-23, -38); c.lineTo(-27, -46); c.stroke();
  },
  snail(c, sw, col2) {
    c.beginPath(); c.moveTo(-26, 0); c.quadraticCurveTo(-24, -7, 0, -6); c.lineTo(22, -8); c.quadraticCurveTo(30, -10, 30, -3); c.lineTo(30, 0); c.closePath(); c.fill();
    c.lineWidth = 1.6; c.beginPath(); c.moveTo(24, -9); c.lineTo(27, -22 - sw * 2); c.moveTo(27, -9); c.lineTo(32, -20 + sw * 2); c.stroke();
    c.beginPath(); c.arc(27, -22 - sw * 2, 2, 0, TAU); c.arc(32, -20 + sw * 2, 2, 0, TAU); c.fill();
    c.fillStyle = col2; c.beginPath(); c.arc(-4, -18, 15, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 2; c.beginPath(); for (let a = 0; a < TAU * 2.2; a += 0.2) { const r = 13 - a * 0.9; const x = -4 + Math.cos(a) * r, y = -18 + Math.sin(a) * r; a ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  },
  bird(c, sw) {
    c.save(); c.translate(0, -40);
    c.beginPath(); c.ellipse(0, 0, 15, 8, -0.1, 0, TAU); c.fill(); c.beginPath(); c.arc(13, -4, 6.5, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(18, -6); c.lineTo(27, -3); c.lineTo(18, -1); c.fill();
    c.beginPath(); c.moveTo(-13, -2); c.lineTo(-27, -8); c.lineTo(-25, 4); c.fill();
    const f = Math.sin(sw * 5); c.beginPath(); c.moveTo(-6, -3); c.quadraticCurveTo(0, -3 - 26 * f, 8, -3 - 22 * f); c.lineTo(6, -2); c.fill();
    c.restore();
  },
  monkey(c, sw) {
    c.save(); c.translate(0, -64); c.rotate(Math.sin(sw * 2) * 0.35);
    c.lineWidth = 4.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(2, 22); c.stroke();
    c.beginPath(); c.arc(4, 30, 10, 0, TAU); c.fill(); c.beginPath(); c.arc(-4, 26, 4, 0, TAU); c.arc(12, 26, 4, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(4, 52, 11, 14, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(-2, 62); c.lineTo(-6, 76); c.moveTo(10, 62); c.lineTo(14, 76); c.moveTo(13, 46); c.lineTo(22, 58); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.moveTo(-5, 58); c.quadraticCurveTo(-26, 66, -22, 46); c.quadraticCurveTo(-18, 38, -12, 44); c.stroke();
    c.fillStyle = 'rgba(255,230,200,.55)'; c.beginPath(); c.ellipse(5, 32, 6, 5, 0, 0, TAU); c.fill();
    c.restore();
  },
  elephant(c, sw) {
    c.beginPath(); c.ellipse(-2, -36, 30, 19, 0, 0, TAU); c.fill();
    legs(c, [[-20, -24], [-12, -24], [10, -24], [18, -24]], 24, sw * 0.5, 9);
    c.beginPath(); c.arc(30, -42, 13, 0, TAU); c.fill();
    c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(40, -38); c.quadraticCurveTo(48 + Math.sin(sw * 3) * 3, -22, 44 + Math.sin(sw * 3) * 4, -10); c.stroke();
    c.save(); c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(24, -40, 8, 12, 0.1, 0, TAU); c.fill(); c.restore();
    c.lineWidth = 1.5; c.beginPath(); c.moveTo(-31, -38); c.lineTo(-36, -26); c.stroke();
  },
  camel(c, sw) {
    c.beginPath(); c.ellipse(0, -42, 24, 10, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(-2, -51, 13, 11, 0, Math.PI, TAU); c.fill();
    legs(c, [[-15, -36], [-10, -36], [12, -36], [16, -36]], 36, sw, 3.4);
    c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(18, -44); c.quadraticCurveTo(30, -40, 32, -58); c.stroke();
    c.beginPath(); c.ellipse(37, -60, 8, 4, 0.1, 0, TAU); c.fill();
    c.lineWidth = 1.5; c.beginPath(); c.moveTo(-23, -44); c.lineTo(-26, -34); c.stroke();
  },
};
function legs(c, pts, len, sw, lw) {
  c.lineWidth = lw; c.lineCap = 'round'; c.beginPath();
  pts.forEach(([x, y], i) => { const a = (i % 2 ? 1 : -1) * Math.sin(sw * 6) * 0.35; c.moveTo(x, y); c.lineTo(x + Math.sin(a) * len, y + Math.cos(a) * len); });
  c.stroke();
}
M.animal = (c, w, h, t, o) => {
  const S = o.S, kind = ANIMALS[o.arg] ? o.arg : 'deer', gy = h * 0.88, body = o.dark ? mixc(o.col, '#efe9df', 0.55) : mixc(o.col, '#3a332c', 0.6);
  const fly = kind === 'bird', slow = kind === 'snail' ? 0.25 : 1;
  c.fillStyle = rgba(o.ink, 0.12); c.fillRect(0, gy, w, 2 * S);
  if (kind === 'monkey') { c.strokeStyle = '#6b4a2e'; c.lineWidth = 6 * S; c.beginPath(); c.moveTo(0, h * 0.12); c.quadraticCurveTo(w / 2, h * 0.2, w, h * 0.1); c.stroke(); for (let i = 0; i < 5; i++) leafAt(c, w * (0.1 + i * 0.2), h * 0.15, 2 * S, 1 + i, mixc('#4f8a45', o.col, 0.2)); }
  for (let i = 0; i < 9; i++) {
    const x = fract(o.R(i) - t * (fly ? 0.12 : 0.07) * slow) * (w + 40) - 20;
    if (fly) { c.fillStyle = rgba('#ffffff', o.dark ? 0.12 : 0.6); c.beginPath(); c.ellipse(x, h * (0.15 + o.R(i, 1) * 0.5), 18 * S, 6 * S, 0, 0, TAU); c.fill(); }
    else { c.strokeStyle = mixc('#4f8a45', o.col, 0.25); c.lineWidth = 1.6 * S; c.beginPath(); for (let k = -1; k <= 1; k++) { c.moveTo(x, gy); c.quadraticCurveTo(x + k * 3 * S, gy - 6 * S, x + k * 6 * S, gy - 9 * S); } c.stroke(); }
  }
  if (kind === 'snail') { c.strokeStyle = rgba(o.col, 0.45); c.lineWidth = 3 * S; c.beginPath(); c.moveTo(0, gy - 1); c.lineTo(w / 2 - 24 * S, gy - 1); c.stroke(); }
  const sw = t * slow * (kind === 'elephant' ? 0.7 : 1), bob = fly ? Math.sin(t * 2) * 8 * S : -Math.abs(Math.sin(sw * 6)) * 1.5 * S;
  c.save(); c.translate(w / 2 - (kind === 'monkey' ? 0 : 4 * S), (kind === 'monkey' ? h * 0.15 + 64 * S * 1.1 : gy) + bob); c.scale(S * 1.1, S * 1.1);
  c.fillStyle = body; c.strokeStyle = body;
  ANIMALS[kind](c, sw, mixc(o.col, '#8a5a30', 0.3));
  c.restore(); c.lineCap = 'butt';
};

M.molecule = (c, w, h, t, o) => {
  const S = o.S, atoms = o.mol ||= (() => {
    const a = [];
    for (let i = 0; i < 6; i++) a.push({ p: [Math.cos(i * TAU / 6), Math.sin(i * TAU / 6), 0], e: 'C', b: [(i + 1) % 6] });
    const subs = [0, 2, 4].filter((i, k) => k === 0 || o.R(i, 3) > 0.25);
    subs.forEach((i, k) => {
      const d = [Math.cos(i * TAU / 6), Math.sin(i * TAU / 6)], j = a.length;
      a.push({ p: [d[0] * 1.95, d[1] * 1.95, (o.R(i, 4) - 0.5) * 0.8], e: k === 1 ? 'O' : 'C', b: [i] });
      if (k === 0) a.push({ p: [d[0] * 2.8, d[1] * 2.8 + 0.5, 0.3], e: 'O', b: [j], dbl: true });
    });
    for (let i = 0; i < 6; i++) if (!subs.includes(i)) a.push({ p: [Math.cos(i * TAU / 6) * 1.75, Math.sin(i * TAU / 6) * 1.75, 0], e: 'H', b: [i] });
    return a;
  })();
  const rz = t * 0.6, ry = Math.sin(t * 0.7) * 0.6, rx = 0.55 + Math.sin(t * 0.5) * 0.3, sc = h * 0.15, cx = w / 2, cy = h / 2;
  const P = atoms.map(({ p: [x0, y0, z] }) => {
    const x = x0 * Math.cos(rz) - y0 * Math.sin(rz), y = x0 * Math.sin(rz) + y0 * Math.cos(rz);
    let X = x * Math.cos(ry) + z * Math.sin(ry), Z = -x * Math.sin(ry) + z * Math.cos(ry), Y = y * Math.cos(rx) - Z * Math.sin(rx); Z = y * Math.sin(rx) + Z * Math.cos(rx);
    const f = 5 / (5 + Z); return [cx + X * sc * f, cy + Y * sc * f, Z, f];
  });
  c.strokeStyle = rgba(o.ink, 0.5); c.lineCap = 'round';
  atoms.forEach((a, i) => a.b.forEach((j) => { c.lineWidth = 3 * S; c.beginPath(); c.moveTo(P[i][0], P[i][1]); c.lineTo(P[j][0], P[j][1]); c.stroke(); if (a.dbl) { c.lineWidth = 1.4 * S; c.beginPath(); c.moveTo(P[i][0] + 4 * S, P[i][1]); c.lineTo(P[j][0] + 4 * S, P[j][1]); c.stroke(); } }));
  c.lineCap = 'butt';
  const order = P.map((p, i) => i).sort((a, b) => P[b][2] - P[a][2]);
  for (const i of order) {
    const [x, y, , f] = P[i], e = atoms[i].e, col = e === 'C' ? o.col : e === 'O' ? '#e5484d' : '#f2f2f2', r = (e === 'H' ? 5 : 9) * S * f;
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, mixc(col, '#ffffff', 0.65)); g.addColorStop(0.6, col); g.addColorStop(1, mixc(col, '#000000', 0.35));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  for (let i = 0; i < 3; i++) { const a = t * (1.6 + i * 0.4) + i * 2; c.strokeStyle = rgba(o.col, 0.25); c.lineWidth = 1 * S; c.beginPath(); c.ellipse(cx, cy, w * 0.4, h * 0.12, i * 1.05, 0, TAU); c.stroke(); c.fillStyle = o.col; const ex = Math.cos(a) * w * 0.4, ey = Math.sin(a) * h * 0.12, ca = Math.cos(i * 1.05), sa = Math.sin(i * 1.05); c.beginPath(); c.arc(cx + ex * ca - ey * sa, cy + ex * sa + ey * ca, 2.4 * S, 0, TAU); c.fill(); }
};

M.potion = (c, w, h, t, o) => {
  const S = o.S, cx = w / 2, cy = h * 0.64, R = h * 0.26, nk = 9 * S;
  soft(c, cx, cy, R * 2.2, o.col, 0.35 + Math.sin(t * 3) * 0.08);
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
  const lv = cy - R * 0.2;
  const lg = c.createLinearGradient(0, lv, 0, cy + R); lg.addColorStop(0, mixc(o.col, '#ffffff', 0.25)); lg.addColorStop(1, mixc(o.col, '#000000', 0.25));
  c.fillStyle = lg; c.beginPath(); c.moveTo(cx - R, cy + R); for (let x = -R; x <= R; x += 4) c.lineTo(cx + x, lv + Math.sin(x * 0.12 + t * 4) * 2.5 * S); c.lineTo(cx + R, cy + R); c.fill();
  for (let i = 0; i < 14; i++) { const a = fract(t * 0.7 + o.R(i)), x = cx + (o.R(i, 1) - 0.5) * R * 1.4, y = cy + R - a * (cy + R - lv); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1 * S; c.beginPath(); c.arc(x + Math.sin(t * 4 + i) * 2 * S, y, (1 + o.R(i, 2) * 2.5) * S, 0, TAU); c.stroke(); }
  c.restore();
  c.strokeStyle = rgba(o.ink, 0.55); c.lineWidth = 2 * S; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2 + 0.22, -Math.PI / 2 - 0.22 + TAU); c.lineTo(cx - nk, h * 0.16); c.moveTo(cx + nk, h * 0.16); c.lineTo(cx + nk, cy - R + 1.5 * S); c.stroke();
  c.fillStyle = '#9a6b3e'; rr(c, cx - nk - 2 * S, h * 0.1, nk * 2 + 4 * S, 9 * S, 2 * S); c.fill();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(cx - R * 0.45, cy - R * 0.3, R * 0.14, R * 0.32, 0.5, 0, TAU); c.fill();
  for (let i = 0; i < 9; i++) {
    const a = fract(t * 0.45 + o.R(i, 3)), x = cx + Math.sin(a * 7 + i) * (6 + a * 26) * S + (o.R(i, 4) - 0.5) * 10 * S, y = h * 0.1 - a * h * 0.1 + (1 - a) * 0;
    c.globalAlpha = 1 - a; c.fillStyle = i % 2 ? o.col : '#ffffff'; c.beginPath();
    i % 3 === 0 ? star4(c, x, h * 0.08 - a * h * 0.12 + 10 * S, 4 * S) : c.arc(x, y + 6 * S, (2 + a * 3) * S, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
};

M.hearts = (c, w, h, t, o) => {
  const S = o.S, beat = 1 + 0.12 * Math.exp(-((t % 1.1) * 9)) + 0.07 * Math.exp(-(((t + 0.85) % 1.1) * 9));
  soft(c, w / 2, h / 2, 70 * S * beat, o.col, 0.35);
  for (let i = 0; i < 24; i++) {
    const R = (k) => o.R(i, k), a = fract(t * 0.2 * (0.8 + R(0) * 0.7) + R(1)), s = (5 + R(2) * 8) * S * (1 + 0.1 * Math.sin(t * 6 + i));
    const x = R(3) * w + Math.sin(t * 2 + i) * 10 * S, y = h + 14 * S - a * (h + 28 * S);
    c.globalAlpha = Math.sin(a * Math.PI) * 0.9; c.fillStyle = [o.col, mixc(o.col, '#ff4d6d', 0.5), '#ff7a95'][i % 3];
    c.beginPath(); heart(c, x, y, s); c.fill();
  }
  c.globalAlpha = 1;
  const g = c.createLinearGradient(w / 2 - 30 * S, h / 2 - 30 * S, w / 2 + 30 * S, h / 2 + 30 * S); g.addColorStop(0, mixc(o.col, '#ff6b8b', 0.35)); g.addColorStop(1, mixc(o.col, '#c81e4a', 0.5));
  c.fillStyle = g; c.beginPath(); heart(c, w / 2, h / 2 + 4 * S, 30 * S * beat); c.fill();
  c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.ellipse(w / 2 - 14 * S * beat, h / 2 - 12 * S * beat, 5 * S, 8 * S, 0.7, 0, TAU); c.fill();
};

M.music = (c, w, h, t, o) => {
  const S = o.S, top = h * 0.32, gap = 8 * S;
  const Y = (x, l) => top + l * gap + Math.sin(x * 0.02 + t * 1.4) * 8 * S;
  c.strokeStyle = rgba(o.ink, 0.35); c.lineWidth = 1 * S;
  for (let l = 0; l < 5; l++) { c.beginPath(); for (let x = 0; x <= w; x += 6) x ? c.lineTo(x, Y(x, l)) : c.moveTo(x, Y(x, l)); c.stroke(); }
  for (let i = 0; i < 8; i++) {
    const x = fract(o.R(i) - t * 0.09) * (w + 60) - 30, l = Math.floor(o.R(i, 1) * 5), y = Y(x, l) - gap * 0.5, beamed = o.R(i, 2) > 0.6;
    c.fillStyle = c.strokeStyle = i % 2 ? o.col : rgba(o.ink, 0.85); c.lineWidth = 1.6 * S;
    const head = (hx, hy) => { c.beginPath(); c.ellipse(hx, hy, 5 * S, 3.6 * S, -0.4, 0, TAU); c.fill(); c.beginPath(); c.moveTo(hx + 4.4 * S, hy); c.lineTo(hx + 4.4 * S, hy - 24 * S); c.stroke(); };
    head(x, y);
    if (beamed) { head(x + 14 * S, y - 4 * S); c.lineWidth = 4 * S; c.beginPath(); c.moveTo(x + 4.4 * S, y - 24 * S); c.lineTo(x + 18.4 * S, y - 28 * S); c.stroke(); }
    else { c.lineWidth = 2 * S; c.beginPath(); c.moveTo(x + 4.4 * S, y - 24 * S); c.quadraticCurveTo(x + 12 * S, y - 18 * S, x + 10 * S, y - 10 * S); c.stroke(); }
  }
  for (let i = 0; i < 6; i++) {
    const a = fract(t * 0.3 + o.R(i, 5)), x = o.R(i, 6) * w + Math.sin(t * 2 + i) * 8 * S, y = h * 0.95 - a * h * 0.8;
    c.globalAlpha = Math.sin(a * Math.PI) * 0.7; c.fillStyle = c.strokeStyle = mixc(o.col, '#ffffff', 0.3); c.lineWidth = 1.4 * S;
    c.beginPath(); c.ellipse(x, y, 3.6 * S, 2.6 * S, -0.4, 0, TAU); c.fill(); c.beginPath(); c.moveTo(x + 3.2 * S, y); c.lineTo(x + 3.2 * S, y - 14 * S); c.stroke();
  }
  c.globalAlpha = 1;
};

M.lightning = (c, w, h, t, o) => {
  const S = o.S, P = 1.3, cyc = Math.floor(t / P), p = fract(t / P);
  sky(c, w, h, '#151a2e', '#2c3454');
  const flash = p < 0.3 ? (1 - p / 0.3) : 0;
  c.fillStyle = `rgba(200,215,255,${0.1 * flash})`; c.fillRect(0, 0, w, h);
  c.fillStyle = '#2a3150'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(i * w / 8, 6 * S + Math.sin(i * 2.3) * 6 * S, 22 * S, 0, TAU); c.fill(); }
  if (flash) {
    const pts = [[w * (0.2 + o.R(cyc, 1) * 0.6), 10 * S]];
    for (let i = 1; i < 10; i++) pts.push([pts[i - 1][0] + (o.R(cyc, i + 2) - 0.5) * 34 * S, 10 * S + i * h * 0.085]);
    const bolt = (a, lw, col) => { c.strokeStyle = col; c.lineWidth = lw; c.globalAlpha = a; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); const b = pts[4]; c.moveTo(b[0], b[1]); c.lineTo(b[0] + 26 * S, b[1] + 22 * S); c.lineTo(b[0] + 22 * S, b[1] + 40 * S); c.stroke(); };
    bolt(flash * 0.35, 9 * S, mixc(o.col, '#bcd2ff', 0.6)); bolt(flash, 2.4 * S, '#ffffff'); c.globalAlpha = 1;
  }
  const gx = w / 2, gy = h * 0.82;
  soft(c, gx, gy, 30 * S, o.col, 0.5);
  if (o.hero) o.anchor = [gx, gy - 8 * S, 0.95];
  else { c.save(); c.translate(gx, gy); c.fillStyle = o.col; glyph(c, o.shape, 3 * S); c.fill(); c.restore(); }
  c.strokeStyle = '#d9e6ff'; c.lineWidth = 1.2 * S;
  for (let i = 0; i < 5; i++) {
    if (Math.sin(t * 13 + i * 2.7) < 0.3) continue;
    const a = i * TAU / 5 + t, r0 = 14 * S, r1 = 26 * S; c.beginPath(); c.moveTo(gx + Math.cos(a) * r0, gy + Math.sin(a) * r0);
    for (let k = 1; k <= 3; k++) { const r = r0 + (r1 - r0) * k / 3, j = (k % 2 ? 1 : -1) * 0.15; c.lineTo(gx + Math.cos(a + j) * r, gy + Math.sin(a + j) * r); } c.stroke();
  }
};

M.snow = (c, w, h, t, o) => {
  const S = o.S;
  c.fillStyle = o.dark ? 'rgba(170,200,255,.08)' : 'rgba(200,225,255,.35)'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(0, h);
  const lvl = h * 0.9 - easeOut(t / 4) * h * 0.06;
  for (let x = 0; x <= w; x += 8) c.lineTo(x, lvl + Math.sin(x * 0.04) * 3 * S); c.lineTo(w, h); c.fill();
  const gx = w / 2, gy = lvl - 2 * S;
  c.fillStyle = '#2f5d46'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(gx - (22 - i * 5) * S, gy - i * 14 * S); c.lineTo(gx, gy - (24 + i * 14) * S); c.lineTo(gx + (22 - i * 5) * S, gy - i * 14 * S); c.fill(); }
  c.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(gx - (12 - i * 3) * S, gy - (8 + i * 14) * S); c.lineTo(gx, gy - (24 + i * 14) * S); c.lineTo(gx + (12 - i * 3) * S, gy - (8 + i * 14) * S); c.quadraticCurveTo(gx, gy - (14 + i * 14) * S, gx - (12 - i * 3) * S, gy - (8 + i * 14) * S); c.fill(); }
  c.save(); c.translate(gx, gy - 58 * S); c.fillStyle = o.col; glyph(c, o.shape, 1.6 * S); c.fill(); c.restore();
  for (let i = 0; i < 46; i++) {
    const R = (k) => o.R(i, k), y = fract(R(0) + t * (0.08 + R(1) * 0.1)) * (h + 20) - 10, x = R(2) * w + Math.sin(t * (0.8 + R(3)) + i) * 12 * S, s = (1.5 + R(4) * 3.5) * S;
    c.strokeStyle = o.dark ? '#ffffff' : mixc(o.col, '#ffffff', 0.35); c.lineWidth = Math.max(0.8, s * 0.3);
    c.save(); c.translate(x, y); c.rotate(t * (R(5) - 0.5) * 2);
    c.beginPath(); for (let k = 0; k < 6; k++) { const a = k * TAU / 6, ca = Math.cos(a), sa = Math.sin(a); c.moveTo(0, 0); c.lineTo(ca * s, sa * s); if (s > 3 * S) { c.moveTo(ca * s * 0.6, sa * s * 0.6); c.lineTo(ca * s * 0.6 + Math.cos(a + 0.8) * s * 0.35, sa * s * 0.6 + Math.sin(a + 0.8) * s * 0.35); } } c.stroke();
    c.restore();
  }
};

M.mountain = (c, w, h, t, o) => {
  const S = o.S;
  const layers = [[mixc(o.col, '#b8c7d9', 0.7), 0.28, 5], [mixc(o.col, '#7f93ab', 0.6), 0.42, 4], [mixc(o.col, '#4a5d70', 0.55), 0.6, 6]];
  layers.forEach(([col, top, n], L) => {
    const off = (1 - easeOut((t - L * 0.25) / 1.3)) * h * 0.7;
    const pts = [[0, h]]; for (let i = 0; i <= n; i++) { const x = i * w / n; pts.push([x, h * top + (i % 2 ? h * 0.22 : o.R(i, L) * h * 0.08) + off]); } pts.push([w, h]);
    c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.fill();
    if (L < 2) { c.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i <= n; i += 2) { const [x, y] = pts[i + 1]; const [xl, yl] = pts[i] || pts[i + 1], [xr, yr] = pts[i + 2]; const k = 0.22; c.beginPath(); c.moveTo(x, y); c.lineTo(lerp(x, xr, k), lerp(y, yr, k)); c.lineTo(lerp(x, xr, k * 0.5), lerp(y, yr, k * 0.7) + 2 * S); c.lineTo(lerp(x, xl, k * 0.5), lerp(y, yl, k * 0.7) + 3 * S); c.lineTo(lerp(x, xl, k), lerp(y, yl, k)); c.fill(); } }
  });
  for (let i = 0; i < 3; i++) { const x = fract(o.R(i, 8) + t * 0.03) * (w + 120) - 60, y = h * (0.3 + i * 0.12); c.fillStyle = rgba('#ffffff', 0.55); c.beginPath(); c.ellipse(x, y, 34 * S, 7 * S, 0, 0, TAU); c.ellipse(x + 14 * S, y - 4 * S, 18 * S, 6 * S, 0, 0, TAU); c.fill(); }
  if (t > 1.6) {
    const px = w * 2 / 6, py = h * 0.28 + o.R(2, 0) * h * 0.08, k = easeBack((t - 1.6) / 0.6);
    c.strokeStyle = '#3a342d'; c.lineWidth = 1.6 * S; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 22 * S * k); c.stroke();
    c.fillStyle = o.col; c.beginPath(); c.moveTo(px, py - 22 * S * k); for (let i = 0; i <= 5; i++) c.lineTo(px + i * 3.4 * S * k, py - 22 * S * k + Math.sin(t * 7 + i) * 1.4 * S + (i === 5 ? 5 * S : 0)); c.lineTo(px, py - 12 * S * k); c.fill();
  }
};

M.desert = (c, w, h, t, o) => {
  const S = o.S;
  sky(c, w, h, o.dark ? '#3a2b45' : '#ffd99a', o.dark ? '#d08a52' : '#fff0d0');
  soft(c, w * 0.22, h * 0.24, 60 * S, '#fff6d0', 0.8); c.fillStyle = '#fffbe8'; c.beginPath(); c.arc(w * 0.22, h * 0.24, 16 * S, 0, TAU); c.fill();
  const dunes = [['#efc884', 0.55, 0.012], ['#e0ad62', 0.68, 0.018], ['#cc9448', 0.82, 0.024]];
  dunes.forEach(([col, y0, k], L) => {
    c.fillStyle = mixc(col, o.col, 0.1); c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) c.lineTo(x, h * y0 + Math.sin(x * k + L * 2 + t * 0.05) * 10 * S); c.lineTo(w, h); c.fill();
    c.strokeStyle = 'rgba(120,70,20,.15)'; c.lineWidth = 1 * S; for (let r = 1; r < 3; r++) { c.beginPath(); for (let x = 0; x <= w; x += 6) { const y = h * y0 + r * 7 * S + Math.sin(x * k + L * 2 + t * 0.05) * 10 * S + Math.sin(x * 0.2) * 1 * S; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  });
  c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 1.5 * S;
  for (let i = 0; i < 4; i++) { const y = h * 0.5 - fract(t * 0.2 + i / 4) * h * 0.4; c.beginPath(); for (let x = 0; x <= w; x += 6) { const yy = y + Math.sin(x * 0.08 + t * 4 + i) * 2 * S; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } c.stroke(); }
  const px = w * 0.72, py = h * 0.8 + Math.sin(px * 0.024 + 4 + t * 0.05) * 10 * S;
  c.strokeStyle = '#6a8f3e'; c.lineWidth = 2.4 * S; c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - 22 * S); c.stroke();
  if (o.hero) o.anchor = [px, py - 36 * S, 0.7];
  else { c.save(); c.translate(px, py - 26 * S); c.fillStyle = o.col; glyph(c, o.shape, 2 * S); c.fill(); c.restore(); }
  for (let i = 0; i < 24; i++) { const x = fract(o.R(i) + t * (0.25 + o.R(i, 1) * 0.2)) * w, y = h * (0.6 + o.R(i, 2) * 0.35) + Math.sin(t * 5 + i) * 2 * S; c.fillStyle = 'rgba(160,110,50,.5)'; c.fillRect(x, y, 1.5 * S, 1.5 * S); }
};

M.rain = (c, w, h, t, o) => {
  const S = o.S, gy = h * 0.9;
  c.fillStyle = o.dark ? 'rgba(120,140,170,.12)' : 'rgba(120,140,170,.15)'; c.fillRect(0, 0, w, h);
  c.fillStyle = rgba(mixc('#4b5e75', o.col, 0.25), 0.4); c.fillRect(0, gy, w, h - gy);
  const sp = easeOut(t / 3);
  for (let i = 0; i < 5; i++) { const x = w * (0.14 + i * 0.18); c.strokeStyle = '#4f8a45'; c.lineWidth = 2 * S; c.beginPath(); c.moveTo(x, gy); c.lineTo(x, gy - (10 + (i % 2) * 8) * S * sp); c.stroke(); leafAt(c, x + 4 * S, gy - (8 + (i % 2) * 8) * S * sp, 1.3 * S * sp, -0.5, '#5ea150'); }
  c.strokeStyle = rgba(o.dark ? '#cfe0ff' : '#5b7aa6', 0.65); c.lineWidth = 1.3 * S; c.beginPath();
  for (let i = 0; i < 70; i++) { const R = (k) => o.R(i, k), y = fract(R(0) + t * (0.9 + R(1) * 0.5)) * (gy + 20) - 20, x = R(2) * (w + 30) - y * 0.15; c.moveTo(x, y); c.lineTo(x - 2 * S, y + 9 * S); }
  c.stroke();
  for (let i = 0; i < 14; i++) { const a = fract(t * 1.2 + o.R(i, 7)), x = o.R(i, 8) * w; c.strokeStyle = rgba(o.dark ? '#cfe0ff' : '#5b7aa6', 0.6 * (1 - a)); c.lineWidth = 1 * S; c.beginPath(); c.ellipse(x, gy + 3 * S, 2 * S + a * 10 * S, 1 * S + a * 2.5 * S, 0, 0, TAU); c.stroke(); }
  for (let i = 0; i < 4; i++) { const a = fract(t * 0.25 + i / 4), x = w * (0.2 + i * 0.2); c.strokeStyle = rgba(o.col, 0.6 * Math.sin(a * Math.PI)); c.lineWidth = 2 * S; c.beginPath(); for (let k = 0; k <= 20; k++) { const y = gy - a * h * 0.5 - k * 2 * S, xx = x + Math.sin(k * 0.5 + t * 3) * 4 * S; k ? c.lineTo(xx, y) : c.moveTo(xx, y); } c.stroke(); }
  c.fillStyle = o.dark ? '#5a6478' : '#c3ccd8'; for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(i * w / 7, 2 * S + Math.sin(i * 1.7) * 5 * S, 20 * S, 0, TAU); c.fill(); }
};

M.volcano = (c, w, h, t, o) => {
  const S = o.S, cx = w * 0.5, top = h * 0.36, base = h * 0.95;
  sky(c, w, h, o.dark ? '#24161c' : '#f4c7a2', o.dark ? '#5a2a1e' : '#fbe3cf');
  for (let i = 0; i < 16; i++) { const a = fract(t * 0.2 + i / 16), x = cx + 10 * S + a * 80 * S + Math.sin(a * 5 + i) * 10 * S, y = top - a * h * 0.4, r = (8 + a * 22) * S; c.fillStyle = `rgba(90,80,80,${0.35 * (1 - a)})`; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  soft(c, cx, top, 50 * S, '#ff7a1a', 0.55 + Math.sin(t * 4) * 0.1);
  c.fillStyle = '#4a3530'; c.beginPath(); c.moveTo(cx - w * 0.45, base); c.lineTo(cx - 16 * S, top); c.lineTo(cx + 16 * S, top); c.lineTo(cx + w * 0.45, base); c.fill();
  c.strokeStyle = '#ff7a1a'; c.lineWidth = 3 * S; c.lineCap = 'round';
  for (const [dx, len] of [[-8, 0.7], [6, 0.5], [-2, 0.85]]) { const k = clamp01(t / 1.6) * len; c.beginPath(); c.moveTo(cx + dx * S, top + 2 * S); for (let i = 1; i <= 12; i++) { const u = i / 12 * k; c.lineTo(cx + dx * S + dx * u * 6 * S + Math.sin(u * 9) * 3 * S, top + u * (base - top)); } c.stroke(); }
  c.lineCap = 'butt';
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 30; i++) {
    const R = (k) => o.R(i, k), a = fract(t / 1.6 + R(0)), vx = (R(1) - 0.5) * 120 * S, vy = (110 + R(2) * 90) * S, tt = a * 1.4;
    const x = cx + vx * tt, y = top - (vy * tt - 150 * S * tt * tt); if (y > base) continue;
    c.fillStyle = a < 0.4 ? '#fff0a0' : a < 0.7 ? '#ffae2e' : '#ff5a1c'; c.globalAlpha = 1 - a * 0.6; c.beginPath(); c.arc(x, y, (2.6 - a * 1.4) * S, 0, TAU); c.fill();
  }
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  for (let i = 0; i < 6; i++) { const x = w * (0.06 + i * 0.18), y = base + 1; c.save(); c.translate(x, y - 6 * S); c.fillStyle = o.col; glyph(c, o.shape, 1.4 * S); c.fill(); c.restore(); c.strokeStyle = '#4f8a45'; c.lineWidth = 1.5 * S; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 3 * S); c.stroke(); }
};

M.wind = (c, w, h, t, o) => {
  const S = o.S;
  c.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const y0 = h * (0.15 + i * 0.12), curl = i % 3 === 1;
    c.strokeStyle = rgba(i % 2 ? o.col : o.ink, i % 2 ? 0.7 : 0.3); c.lineWidth = (1.5 + (i % 3)) * S;
    c.setLineDash([40 * S, 30 * S + i * 6 * S]); c.lineDashOffset = -t * (90 + i * 15) * S;
    c.beginPath();
    for (let k = 0; k <= 60; k++) { const u = k / 60; let x = -20 + u * (w + 40), y = y0 + Math.sin(u * 6 + i) * 8 * S; if (curl && u > 0.45 && u < 0.62) { const a = (u - 0.45) / 0.17 * TAU; x = -20 + 0.45 * (w + 40) + Math.sin(a) * 16 * S + (u - 0.45) * w * 0.4; y = y0 - 16 * S + Math.cos(a) * 16 * S; } k ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  }
  c.setLineDash([]); c.lineCap = 'butt';
  for (let i = 0; i < 12; i++) {
    const R = (k) => o.R(i, k), u = fract(R(0) + t * (0.12 + R(1) * 0.1)), x = -10 + u * (w + 20), y = h * (0.2 + R(2) * 0.6) + Math.sin(u * 8 + i) * 14 * S;
    c.save(); c.translate(x, y); c.rotate(t * (3 + R(3) * 4) + i); c.fillStyle = mixc(o.col, '#ffffff', R(4) * 0.35); glyph(c, o.shape, 1.6 * S); c.fill(); c.restore();
  }
};

M.compass = (c, w, h, t, o) => {
  const S = o.S, cx = w * 0.5, cy = h * 0.5, R = h * 0.38;
  c.strokeStyle = rgba(o.ink, 0.35); c.lineWidth = 1.6 * S; c.setLineDash([4 * S, 5 * S]);
  const k = clamp01(t / 2.5); c.beginPath(); for (let i = 0; i <= 40 * k; i++) { const u = i / 40, x = w * 0.06 + u * w * 0.88, y = h * 0.8 - Math.sin(u * Math.PI) * h * 0.25 + Math.sin(u * 12) * 6 * S; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); c.setLineDash([]);
  if (o.hero) { const u = Math.min(k, 0.84); o.anchor = [w * 0.06 + u * w * 0.88, h * 0.8 - Math.sin(u * Math.PI) * h * 0.25 + Math.sin(u * 12) * 6 * S - 18 * S, 0.55, 'ride']; }
  if (k >= 1) { c.strokeStyle = '#e5484d'; c.lineWidth = 3 * S; const x = w * 0.94, y = h * 0.8; c.beginPath(); c.moveTo(x - 5 * S, y - 5 * S); c.lineTo(x + 5 * S, y + 5 * S); c.moveTo(x + 5 * S, y - 5 * S); c.lineTo(x - 5 * S, y + 5 * S); c.stroke(); }
  c.fillStyle = 'rgba(0,0,0,.15)'; c.beginPath(); c.arc(cx + 2 * S, cy + 4 * S, R + 6 * S, 0, TAU); c.fill();
  const rim = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R); rim.addColorStop(0, '#f6dc8a'); rim.addColorStop(1, '#a87a1e');
  c.fillStyle = rim; c.beginPath(); c.arc(cx, cy, R + 6 * S, 0, TAU); c.fill();
  c.fillStyle = '#fbf6ea'; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  c.fillStyle = rgba(o.col, 0.28); c.beginPath(); starN(c, cx, cy, R * 0.85, R * 0.18, 4, -Math.PI / 2); c.fill();
  c.strokeStyle = '#5a4a36'; for (let i = 0; i < 32; i++) { const a = i * TAU / 32, l = i % 8 ? 3 : 7; c.lineWidth = (i % 8 ? 0.8 : 1.6) * S; c.beginPath(); c.moveTo(cx + Math.cos(a) * (R - 2 * S), cy + Math.sin(a) * (R - 2 * S)); c.lineTo(cx + Math.cos(a) * (R - l * S), cy + Math.sin(a) * (R - l * S)); c.stroke(); }
  c.fillStyle = '#3a2e22'; c.font = `700 ${9 * S}px ${o.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  [['N', 0], ['E', 1], ['S', 2], ['W', 3]].forEach(([l, i]) => { const a = -Math.PI / 2 + i * Math.PI / 2; c.fillText(l, cx + Math.cos(a) * (R - 14 * S), cy + Math.sin(a) * (R - 14 * S)); });
  const target = (o.R(1, 9) - 0.5) * 1.6, ang = target + 2.6 * Math.exp(-t * 1.1) * Math.cos(t * 7) + Math.sin(t * 1.3) * 0.03;
  c.save(); c.translate(cx, cy); c.rotate(ang);
  c.fillStyle = '#e5484d'; c.beginPath(); c.moveTo(0, -R * 0.78); c.lineTo(6 * S, 0); c.lineTo(-6 * S, 0); c.fill();
  c.fillStyle = '#3a3a3a'; c.beginPath(); c.moveTo(0, R * 0.78); c.lineTo(6 * S, 0); c.lineTo(-6 * S, 0); c.fill();
  c.restore(); c.fillStyle = o.col; c.beginPath(); c.arc(cx, cy, 4 * S, 0, TAU); c.fill();
};

M.rocket = (c, w, h, t, o) => {
  const S = o.S, k = easeOut(t / 2.4);
  sky(c, w, h, '#070b1e', '#1a2350');
  for (let i = 0; i < 40; i++) { const y = fract(o.R(i) + t * (0.15 + o.R(i, 1) * 0.3) * (0.3 + k)) * h, x = o.R(i, 2) * w; c.strokeStyle = `rgba(255,255,255,${0.3 + o.R(i, 3) * 0.6})`; c.lineWidth = 1 * S; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - (1 + k * 10 * o.R(i, 4)) * S); c.stroke(); }
  const ey = h * 0.95 + k * h * 0.6, er = w * 1.1;
  const eg = c.createRadialGradient(w / 2, ey + er, er * 0.9, w / 2, ey + er, er * 1.06); eg.addColorStop(0, '#2a6fb0'); eg.addColorStop(0.92, mixc('#6fb3ff', o.col, 0.4)); eg.addColorStop(1, 'rgba(111,179,255,0)');
  c.fillStyle = eg; c.beginPath(); c.arc(w / 2, ey + er, er * 1.06, 0, TAU); c.fill();
  const rx = w / 2 + Math.sin(t * 30) * 0.6 * S, ry = h * 0.62 - k * h * 0.14;
  for (let i = 0; i < 26; i++) { const a = fract(t * 1.6 + o.R(i, 5)), x = rx + (o.R(i, 6) - 0.5) * 16 * S * (1 + a * 2), y = ry + 26 * S + a * h * 0.5, r = (3 + a * 10) * S; c.fillStyle = `rgba(220,220,235,${0.35 * (1 - a)})`; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  c.globalCompositeOperation = 'lighter'; const fl = 1 + Math.sin(t * 40) * 0.15;
  const fg = c.createRadialGradient(rx, ry + 26 * S, 0, rx, ry + 30 * S, 22 * S * fl); fg.addColorStop(0, '#fff6c0'); fg.addColorStop(0.4, '#ffae2e'); fg.addColorStop(1, 'rgba(255,80,20,0)');
  c.fillStyle = fg; c.beginPath(); c.ellipse(rx, ry + 34 * S, 8 * S, 22 * S * fl, 0, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
  c.save(); c.translate(rx, ry); c.scale(S, S);
  c.fillStyle = o.col; c.beginPath(); c.moveTo(-10, 12); c.lineTo(-20, 28); c.lineTo(-10, 24); c.fill(); c.beginPath(); c.moveTo(10, 12); c.lineTo(20, 28); c.lineTo(10, 24); c.fill();
  const bg = c.createLinearGradient(-10, 0, 10, 0); bg.addColorStop(0, '#d8dde6'); bg.addColorStop(0.5, '#ffffff'); bg.addColorStop(1, '#aab2c0');
  c.fillStyle = bg; c.beginPath(); c.moveTo(0, -34); c.bezierCurveTo(14, -20, 11, 10, 9, 26); c.lineTo(-9, 26); c.bezierCurveTo(-11, 10, -14, -20, 0, -34); c.fill();
  c.fillStyle = o.col; c.beginPath(); c.moveTo(0, -34); c.bezierCurveTo(7, -27, 9, -22, 10, -18); c.lineTo(-10, -18); c.bezierCurveTo(-9, -22, -7, -27, 0, -34); c.fill();
  c.fillStyle = '#5ab0ff'; c.strokeStyle = '#7a8496'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, -6, 5, 0, TAU); c.fill(); c.stroke();
  c.restore();
};

M.sparkle = (c, w, h, t, o) => {
  const S = o.S;
  for (let i = 0; i < 44; i++) {
    const R = (k) => o.R(i, k), a = fract(R(0) + t * (0.25 + R(1) * 0.3)), x = R(2) * w + Math.sin(t * 3 + i) * 4 * S, y = h + 10 - a * (h + 20), r = (1.5 + R(3) * 4) * S;
    c.strokeStyle = rgba(o.dark ? (i % 3 ? mixc(o.col, '#ffffff', 0.3) : '#ffffff') : mixc(o.col, '#000000', i % 3 ? 0.2 : 0.4), 0.85 * (a < 0.9 ? 1 : (1 - a) * 10)); c.lineWidth = 1.3 * S;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, TAU); c.fill();
  }
  if (o.dark) c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) { const a = Math.max(0, Math.sin(t * (2 + o.R(i, 6) * 2) + i * 1.7)), x = o.R(i, 7) * w, y = o.R(i, 8) * h; soft(c, x, y, 12 * S * a, o.col, o.dark ? 0.6 : 0.45); c.fillStyle = o.dark ? `rgba(255,255,255,${a})` : rgba(mixc(o.col, '#000000', 0.25), a); c.beginPath(); star4(c, x, y, 9 * S * a); c.fill(); }
  c.globalCompositeOperation = 'source-over';
};

M.crystals = (c, w, h, t, o) => {
  const S = o.S, bx = w / 2, by = h * 0.92;
  c.fillStyle = rgba(o.ink, 0.12); c.beginPath(); c.ellipse(bx, by, 90 * S, 8 * S, 0, 0, TAU); c.fill();
  const cr = [[-0.55, 62, 16], [-0.25, 92, 20], [0.05, 112, 22], [0.32, 84, 18], [0.6, 58, 15], [-0.85, 40, 12], [0.88, 42, 12]];
  cr.forEach(([a, len, wd], i) => {
    const g = easeOut((t - i * 0.15) / 1.1) * len * S; if (g <= 0) return; const W = wd * S;
    c.save(); c.translate(bx + a * 52 * S, by); c.rotate(a * 0.7);
    const tip = Math.min(g, W * 1.2);
    const grd = c.createLinearGradient(-W, 0, W, 0); grd.addColorStop(0, mixc(o.col, '#ffffff', 0.55)); grd.addColorStop(0.5, mixc(o.col, '#ffffff', 0.2)); grd.addColorStop(1, mixc(o.col, '#000000', 0.15));
    c.fillStyle = grd; c.globalAlpha = 0.92; c.beginPath(); c.moveTo(-W / 2, 0); c.lineTo(-W / 2, -g + tip); c.lineTo(0, -g); c.lineTo(W / 2, -g + tip); c.lineTo(W / 2, 0); c.closePath(); c.fill(); c.globalAlpha = 1;
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1 * S; c.beginPath(); c.moveTo(-W * 0.1, 0); c.lineTo(-W * 0.1, -g + tip); c.lineTo(0, -g); c.stroke();
    const glint = Math.max(0, Math.sin(t * 2.4 - i * 1.3)) ** 4; if (glint > 0.05) { c.fillStyle = `rgba(255,255,255,${glint})`; c.beginPath(); star4(c, 0, -g, 9 * S * glint); c.fill(); }
    c.restore();
  });
};

M.fireflies = (c, w, h, t, o) => {
  const S = o.S;
  sky(c, w, h, '#0d1626', '#1c2b28');
  c.strokeStyle = '#0a120e'; c.lineWidth = 2 * S;
  for (let i = 0; i < 40; i++) { const x = i * w / 39, l = (14 + o.R(i, 9) * 18) * S; c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x + Math.sin(t + i) * 3 * S, h - l * 0.6, x + Math.sin(t * 1.2 + i) * 6 * S, h - l); c.stroke(); }
  const glow = mixc(o.col, '#d9ff6b', 0.5);
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const R = (k) => o.R(i, k), x = R(0) * w + Math.sin(t * (0.3 + R(1) * 0.4) + i) * 26 * S + Math.sin(t * 1.3 + i * 2) * 6 * S;
    const y = h * (0.2 + R(2) * 0.6) + Math.cos(t * (0.25 + R(3) * 0.3) + i) * 16 * S;
    const b = Math.max(0, Math.sin(t * (1 + R(4) * 1.5) + R(5) * 6)) ** 2;
    soft(c, x, y, (6 + 14 * b) * S, glow, 0.15 + 0.6 * b);
    c.fillStyle = `rgba(255,255,220,${0.3 + 0.7 * b})`; c.beginPath(); c.arc(x, y, 1.4 * S, 0, TAU); c.fill();
  }
  c.globalCompositeOperation = 'source-over';
};

M.leaves = (c, w, h, t, o) => {
  const S = o.S, cx = w / 2, cy = h / 2, greens = ['#4f8a45', '#7fb24a', '#2f6d3a'];
  for (let i = 0; i < 34; i++) {
    const R = (k) => o.R(i, k), rad = (0.15 + fract(R(0) + t * 0.06) * 0.85) * w * 0.48, ang = R(1) * TAU + t * (0.5 + (1 - rad / (w * 0.48)) * 1.2);
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad * 0.42 + (rad / w) * 20 * S, sc = (1.4 + R(2) * 1.4) * S;
    const col = i % 2 ? o.col : mixc(greens[i % 3], o.col, 0.25);
    c.save(); c.translate(x, y); c.rotate(ang + Math.PI / 2 + Math.sin(t * 3 + i) * 0.4); c.scale(1, 0.6 + 0.4 * Math.abs(Math.sin(t * 2 + i)));
    c.fillStyle = col; glyph(c, 'leaf', sc); c.fill(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 0.6 * S; c.beginPath(); c.moveTo(-5 * sc, 0); c.lineTo(5 * sc, 0); c.stroke();
    c.restore();
  }
};

M.medal = (c, w, h, t, o) => {
  const S = o.S, drop = easeBack(t / 0.9), swing = 0.45 * Math.exp(-t * 0.9) * Math.cos(t * 4), cx = w / 2, py = -10 * S, L = h * 0.5 * drop, R = h * 0.2;
  for (let i = 0; i < 10; i++) { const a = Math.max(0, Math.sin(t * 2.5 + i * 1.7)); c.fillStyle = `rgba(255,240,180,${a})`; c.beginPath(); star4(c, cx + (o.R(i) - 0.5) * w * 0.8, h * (0.2 + o.R(i, 1) * 0.7), 6 * S * a); c.fill(); }
  c.save(); c.translate(cx, py); c.rotate(swing);
  c.fillStyle = o.col; c.beginPath(); c.moveTo(-26 * S, 0); c.lineTo(-10 * S, 0); c.lineTo(6 * S, L); c.lineTo(-8 * S, L); c.fill();
  c.fillStyle = mixc(o.col, '#ffffff', 0.35); c.beginPath(); c.moveTo(26 * S, 0); c.lineTo(10 * S, 0); c.lineTo(-6 * S, L); c.lineTo(8 * S, L); c.fill();
  c.translate(0, L + R * 0.8);
  const g = c.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.6, '#f0b62a'); g.addColorStop(1, '#a8740c');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
  c.strokeStyle = '#a8740c'; c.lineWidth = 2 * S; c.beginPath(); c.arc(0, 0, R * 0.78, 0, TAU); c.stroke();
  c.fillStyle = '#c98f15'; c.beginPath(); starN(c, 0, 0, R * 0.5, R * 0.22, 5); c.fill();
  c.save(); c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip(); const sx = (fract(t / 2.4) * 3 - 1) * R * 1.6;
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.moveTo(sx - 8 * S, -R); c.lineTo(sx + 4 * S, -R); c.lineTo(sx - 12 * S, R); c.lineTo(sx - 24 * S, R); c.fill(); c.restore();
  c.restore();
};

M.skull = (c, w, h, t, o) => {
  const S = o.S, cx = w / 2, cy = h * 0.46 + Math.sin(t * 2) * 3 * S, tox = mixc('#7bd34f', o.col, 0.3);
  for (let i = 0; i < 18; i++) { const a = fract(t * 0.35 + o.R(i)), x = o.R(i, 1) * w + Math.sin(t * 2 + i) * 6 * S, y = h + 6 - a * (h + 12), r = (2 + o.R(i, 2) * 5) * S; c.strokeStyle = rgba(tox, 0.7 * Math.sin(a * Math.PI)); c.lineWidth = 1.4 * S; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  soft(c, cx, cy, 70 * S, tox, 0.25);
  const bone = '#f1ecdf', line = '#6d6252';
  c.save(); c.translate(cx, cy + 6 * S);
  for (const a of [0.7, -0.7]) { c.save(); c.rotate(a); c.fillStyle = bone; c.strokeStyle = line; c.lineWidth = 1.2 * S; rr(c, -44 * S, -4 * S, 88 * S, 8 * S, 4 * S); c.fill(); c.stroke(); for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 44 * S, -4 * S, 5 * S, 0, TAU); c.arc(s * 44 * S, 4 * S, 5 * S, 0, TAU); c.fill(); } c.restore(); }
  c.restore();
  c.fillStyle = bone; c.strokeStyle = line; c.lineWidth = 1.4 * S;
  c.beginPath(); c.arc(cx, cy - 6 * S, 28 * S, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(cx + 18 * S, cy + 22 * S); c.lineTo(cx - 18 * S, cy + 22 * S); c.closePath(); c.fill(); c.stroke();
  const eg = 0.5 + 0.5 * Math.sin(t * 3);
  for (const s of [-1, 1]) { c.fillStyle = '#2a2420'; c.beginPath(); c.ellipse(cx + s * 11 * S, cy, 8 * S, 9 * S, 0, 0, TAU); c.fill(); soft(c, cx + s * 11 * S, cy, 8 * S, o.col, 0.4 + eg * 0.5); }
  c.fillStyle = '#2a2420'; c.beginPath(); c.moveTo(cx, cy + 8 * S); c.lineTo(cx - 4 * S, cy + 14 * S); c.lineTo(cx + 4 * S, cy + 14 * S); c.fill();
  c.strokeStyle = line; c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(cx + i * 6 * S, cy + 17 * S); c.lineTo(cx + i * 6 * S, cy + 22 * S); } c.stroke();
};

M.swords = (c, w, h, t, o) => {
  const S = o.S, cx = w / 2, cy = h * 0.55, hit = easeBack(t / 0.6), bounce = t > 0.6 ? Math.sin((t - 0.6) * 2.6) * 0.04 * Math.exp(-(t % 2.2)) : 0;
  const sword = (side) => {
    c.save(); c.translate(cx + side * 46 * S, cy + 40 * S); c.rotate(-side * (lerp(1.6, 0.76, hit) + bounce));
    const bg = c.createLinearGradient(-4 * S, 0, 4 * S, 0); bg.addColorStop(0, '#9aa4b2'); bg.addColorStop(0.5, '#ffffff'); bg.addColorStop(1, '#7c8696');
    c.fillStyle = bg; c.beginPath(); c.moveTo(-4 * S, -8 * S); c.lineTo(-4 * S, -84 * S); c.lineTo(0, -94 * S); c.lineTo(4 * S, -84 * S); c.lineTo(4 * S, -8 * S); c.fill();
    c.fillStyle = '#d6a21c'; rr(c, -15 * S, -10 * S, 30 * S, 5 * S, 2.5 * S); c.fill();
    c.fillStyle = o.col; rr(c, -3 * S, -5 * S, 6 * S, 18 * S, 2 * S); c.fill();
    c.fillStyle = '#d6a21c'; c.beginPath(); c.arc(0, 15 * S, 4 * S, 0, TAU); c.fill();
    c.restore();
  };
  sword(-1); sword(1);
  const ct = t < 0.6 ? -1 : ((t - 0.6) % 2.2) / 0.7;
  if (ct >= 0 && ct <= 1) {
    const px = cx, py = cy - 8 * S;
    c.globalCompositeOperation = 'lighter'; soft(c, px, py, 40 * S * (1 - ct), '#ffe08a', 0.9);
    for (let i = 0; i < 18; i++) { const a = o.R(i) * TAU, d = (10 + o.R(i, 1) * 50) * S * easeOut(ct); c.strokeStyle = `rgba(255,${200 + o.R(i, 2) * 55 | 0},120,${1 - ct})`; c.lineWidth = 1.6 * S; c.beginPath(); c.moveTo(px + Math.cos(a) * d * 0.6, py + Math.sin(a) * d * 0.6); c.lineTo(px + Math.cos(a) * d, py + Math.sin(a) * d); c.stroke(); }
    c.globalCompositeOperation = 'source-over';
  }
};

M.spiral = (c, w, h, t, o) => {
  const S = o.S, cx = w / 2, cy = h / 2, R = Math.hypot(w, h) * 0.55;
  for (let i = 0; i < 4; i++) { const a = fract(t * 0.4 + i / 4); c.strokeStyle = rgba(o.col, 0.35 * (1 - a)); c.lineWidth = 2 * S; c.beginPath(); c.arc(cx, cy, a * R, 0, TAU); c.stroke(); }
  for (let arm = 0; arm < 6; arm++) {
    c.strokeStyle = arm % 2 ? rgba(o.col, 0.85) : rgba(o.dark ? '#ffffff' : mixc(o.col, '#ffffff', 0.6), 0.85);
    c.lineCap = 'round';
    for (let k = 0; k < 40; k++) {
      const r0 = k / 40 * R, r1 = (k + 1) / 40 * R, a0 = arm * TAU / 6 + r0 * 0.045 / S - t * 1.6, a1 = arm * TAU / 6 + r1 * 0.045 / S - t * 1.6;
      c.lineWidth = (1 + k * 0.35) * S; c.beginPath(); c.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0); c.lineTo(cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1); c.stroke();
    }
  }
  c.lineCap = 'butt';
  if (o.hero) return;
  const p = 1 + 0.15 * Math.sin(t * 4); c.save(); c.translate(cx, cy); c.scale(p, p); c.rotate(-t); c.fillStyle = o.dark ? '#ffffff' : o.col; glyph(c, o.shape, 2.4 * S); c.fill(); c.restore();
};

M.film = (c, w, h, t, o) => {
  const S = o.S, sh = h * 0.6, sy = (h - sh) / 2, fw = sh * 1.25, off = (t * 55 * S) % fw;
  c.fillStyle = 'rgba(255,248,220,.12)'; c.beginPath(); c.moveTo(w * 0.5, 0); c.lineTo(w * 0.1, h); c.lineTo(w * 0.9, h); c.fill();
  c.fillStyle = '#1c1c1e'; c.fillRect(0, sy, w, sh);
  c.fillStyle = '#e9e4d8'; const hw = 7 * S, hs = 13 * S, ho = (t * 55 * S) % hs;
  for (let x = -ho; x < w; x += hs) { rr(c, x, sy + 3 * S, hw, 5 * S, 1.5 * S); c.fill(); rr(c, x, sy + sh - 8 * S, hw, 5 * S, 1.5 * S); c.fill(); }
  for (let i = -1; i < w / fw + 1; i++) {
    const x = i * fw - off + 6 * S, y = sy + 12 * S, fh = sh - 24 * S, fwi = fw - 12 * S, idx = i + Math.floor(t * 55 * S / fw);
    const g = c.createLinearGradient(x, y, x, y + fh); g.addColorStop(0, mixc(o.col, '#ffffff', 0.5)); g.addColorStop(1, mixc(o.col, '#000000', 0.2));
    c.fillStyle = g; c.fillRect(x, y, fwi, fh);
    c.save(); c.translate(x + fwi / 2, y + fh / 2 + Math.sin(idx * 0.9) * fh * 0.15); c.rotate(idx * 0.7); c.fillStyle = 'rgba(255,255,255,.9)'; glyph(c, o.shape, 2.6 * S); c.fill(); c.restore();
  }
  c.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 30; i++) c.fillRect(o.R(i + Math.floor(t * 12) * 31) * w, o.R(i, Math.floor(t * 12)) * h, 1.5, 1.5);
};

M.book = (c, w, h, t, o) => {
  const S = o.S, cx = w / 2, by = h * 0.86, pw = 78 * S, ph = 64 * S, paper = o.dark ? '#ece4d2' : '#fbf6ea';
  if (o.hero) o.anchor = [cx, by - ph - 4 * S, 0.7];
  for (let i = 0; i < 12; i++) { const a = fract(t * 0.3 + o.R(i)), x = cx + (o.R(i, 1) - 0.5) * pw * 1.6 + Math.sin(t * 2 + i) * 8 * S, y = by - ph * 0.6 - a * h * 0.6; c.globalAlpha = Math.sin(a * Math.PI); c.fillStyle = i % 2 ? o.col : o.ink; c.font = `600 ${(9 + o.R(i, 2) * 6) * S}px Georgia, serif`; c.textAlign = 'center'; c.fillText('aeoAbz✦'[i % 7], x, y); }
  c.globalAlpha = 1;
  c.fillStyle = o.col; c.beginPath(); c.moveTo(cx - pw - 6 * S, by + 4 * S); c.lineTo(cx + pw + 6 * S, by + 4 * S); c.lineTo(cx + pw + 6 * S, by - ph + 2 * S); c.lineTo(cx - pw - 6 * S, by - ph + 2 * S); c.fill();
  const page = (x0, x1, lift, shade) => { c.fillStyle = shade ? mixc(paper, '#000000', shade) : paper; c.beginPath(); c.moveTo(cx, by); c.quadraticCurveTo((cx + x1) / 2, by - lift, x1, by - 4 * S); c.lineTo(x1, by - ph); c.quadraticCurveTo((cx + x1) / 2, by - ph - lift, cx, by - ph + 4 * S); c.closePath(); c.fill(); };
  page(cx, cx - pw, 8 * S); page(cx, cx + pw, 8 * S);
  c.strokeStyle = 'rgba(90,70,40,.3)'; c.lineWidth = 1 * S;
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) { const y = by - ph + 14 * S + i * 8 * S; c.beginPath(); c.moveTo(cx + s * 10 * S, y); c.lineTo(cx + s * (pw - 10 * S) * (i === 5 ? 0.6 : 1), y); c.stroke(); }
  const p = fract(t / 1.6), ang = easeInOut(p) * Math.PI, x1 = cx + Math.cos(ang) * pw;
  page(cx, x1, 8 * S + Math.sin(ang) * 26 * S, Math.sin(ang) * 0.12);
  c.strokeStyle = 'rgba(90,70,40,.35)'; c.beginPath(); c.moveTo(cx, by - ph + 4 * S); c.lineTo(cx, by); c.stroke();
};

M.lab = (c, w, h, t, o) => {
  const S = o.S, by = h * 0.86;
  c.fillStyle = rgba(o.ink, 0.15); c.fillRect(0, by, w, 3 * S);
  const vessel = (x, kind, col, i) => {
    c.save(); c.translate(x, by);
    const shape = () => { c.beginPath(); if (kind === 0) { c.moveTo(-6 * S, -60 * S); c.lineTo(-6 * S, -36 * S); c.lineTo(-24 * S, 0); c.lineTo(24 * S, 0); c.lineTo(6 * S, -36 * S); c.lineTo(6 * S, -60 * S); } else if (kind === 1) { c.moveTo(-5 * S, -64 * S); c.lineTo(-5 * S, -40 * S); c.arc(0, -22 * S, 20 * S, -Math.PI / 2 - 0.25, -Math.PI / 2 + 0.25 + TAU, false); c.lineTo(5 * S, -64 * S); } else { c.moveTo(-14 * S, -52 * S); c.lineTo(-14 * S, 0); c.lineTo(14 * S, 0); c.lineTo(14 * S, -52 * S); } };
    c.save(); shape(); c.clip();
    const lv = kind === 1 ? -26 * S : kind === 0 ? -22 * S : -30 * S;
    c.fillStyle = col; c.beginPath(); c.moveTo(-30 * S, 4 * S); for (let xx = -30; xx <= 30; xx += 3) c.lineTo(xx * S, lv + Math.sin(xx * 0.3 + t * 5 + i) * 1.5 * S); c.lineTo(30 * S, 4 * S); c.fill();
    for (let k = 0; k < 7; k++) { const a = fract(t * 0.9 + o.R(k, i)), yy = -a * (-lv), xx = (o.R(k, i + 3) - 0.5) * 18 * S; c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 0.9 * S; c.beginPath(); c.arc(xx, yy, (1 + o.R(k, i + 5) * 1.8) * S, 0, TAU); c.stroke(); }
    c.restore();
    c.strokeStyle = rgba(o.ink, 0.55); c.lineWidth = 1.6 * S; shape(); c.stroke();
    for (let k = 0; k < 3; k++) { const a = fract(t * 0.4 + k / 3 + i * 0.2), yy = -64 * S - a * 40 * S; c.fillStyle = rgba(mixc(col, '#ffffff', 0.5), 0.5 * (1 - a)); c.beginPath(); c.arc(Math.sin(a * 6 + i) * 6 * S, yy, (3 + a * 7) * S, 0, TAU); c.fill(); }
    c.restore();
  };
  vessel(w * 0.24, 0, o.col, 0); vessel(w * 0.5, 1, mixc(o.col, '#6cc4ff', 0.5), 1); vessel(w * 0.76, 2, mixc(o.col, '#ffd166', 0.5), 2);
  const fx = w * 0.5, fy = by;
  c.globalCompositeOperation = 'lighter'; for (let i = 0; i < 10; i++) { const a = fract(t * 2 + o.R(i, 9)); c.fillStyle = rgba(a < 0.5 ? '#6cb8ff' : '#ffae2e', 0.5 * (1 - a)); c.beginPath(); c.arc(fx + (o.R(i, 8) - 0.5) * 8 * S, fy + 8 * S - a * 10 * S, 3 * S * (1 - a), 0, TAU); c.fill(); } c.globalCompositeOperation = 'source-over';
};

export const MOTIFS = Object.keys(M);

// counting facts: the number counts up inside a gadget that suits its unit
function countUp(o, t, dur = 1.9) {
  const p = o.count ||= parseCount(o.arg) || { pre: '', post: '', v: 100, dec: 0, commas: false };
  const k = easeOut(t / dur), from = p.year ? p.v - 120 : 0, n = from + (p.v - from) * k;
  return { str: p.pre + fmtCount(p.dec ? n : Math.round(n), p) + p.post, full: p.pre + fmtCount(p.v, p) + p.post, p, k };
}
function bigNum(c, o, t, x, y, maxW, maxH, dur = 1.9) {
  const { str, full } = countUp(o, t, dur);
  c.font = `800 100px ${o.font}`; const size = Math.min(100 * maxW / c.measureText(full).width, maxH);
  const pop = t > dur ? 1 + 0.12 * Math.sin(Math.min(1, (t - dur) / 0.4) * Math.PI) : 1;
  c.save(); c.translate(x, y); c.scale(pop, pop); c.font = `800 ${size}px ${o.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = o.dark ? rgba(o.col, 0.75) : 'rgba(255,255,255,.95)'; c.shadowBlur = 14 * o.S; c.fillStyle = o.ink; c.fillText(str, 0, size * 0.04); c.fillText(str, 0, size * 0.04);
  c.restore();
}
function autoMeter(arg) {
  const s = String(arg || ''), p = parseCount(s);
  if (/1 in /i.test(s)) return 'grid';
  if (/[$€£¥]|price|worth/i.test(s)) return 'tag';
  if (/°|degrees/i.test(s)) return 'thermo';
  if (/%|hz|hertz|km\/h|mph/i.test(s)) return 'gauge';
  if (/year|century|centuries|\bbc\b|\bad\b|old/i.test(s) || p?.year) return 'calendar';
  if (/\b(kg|tonnes?|tons?|g|grams?|pounds?|lb)\b/i.test(s)) return 'scale';
  if (/\b(km|m|metres?|meters?|cm|mm|miles?|feet|ft)\b/i.test(s)) return 'ruler';
  if (p && p.v < 0.01) return 'tiny';
  if (/flowers|petals|blossoms|seeds|fruits|pods|beans|trees|plants/i.test(s)) return 'tally';
  return 'odometer';
}
const METER = {
  odometer(c, w, h, t, o) {
    const S = o.S, { full, p } = countUp(o, t), chars = [...full], mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    c.font = `800 100px ${mono}`; const cw0 = c.measureText('0').width / 100, fs = Math.min(0.62 * w / (chars.length * cw0 * 1.12), h * 0.4), cw = cw0 * fs * 1.12, bh = fs * 1.25;
    const x0 = w * 0.42 - chars.length * cw / 2, y = h * 0.5, digits = chars.filter((ch) => /\d/.test(ch)).length;
    c.font = `800 ${fs}px ${mono}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    let di = 0;
    chars.forEach((ch, i) => {
      const x = x0 + (i + 0.5) * cw;
      if (!/\d/.test(ch)) { c.fillStyle = o.ink; c.fillText(ch, x, y); return; }
      c.fillStyle = '#211e1a'; rr(c, x - cw * 0.46, y - bh / 2, cw * 0.92, bh, 4 * S); c.fill();
      const dur = 0.9 + di * (1.1 / Math.max(1, digits)), val = +ch + 10 * (2 + di) * (1 - easeOut(t / dur)), base = Math.floor(val), fr = val - base;
      c.save(); rr(c, x - cw * 0.46, y - bh / 2, cw * 0.92, bh, 4 * S); c.clip(); c.fillStyle = '#f8f2e4';
      c.fillText(String(base % 10), x, y + fr * bh); c.fillText(String((base + 1) % 10), x, y + fr * bh - bh);
      const g = c.createLinearGradient(0, y - bh / 2, 0, y + bh / 2); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); c.fillStyle = g; c.fillRect(x - cw, y - bh, cw * 2, bh * 2);
      c.restore(); di++;
    });
    if (t > 2) { const sx = x0 + fract((t - 2) / 2.2) * (chars.length * cw + 80 * S) - 40 * S; c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.moveTo(sx, y - bh); c.lineTo(sx + 14 * S, y - bh); c.lineTo(sx - 6 * S, y + bh); c.lineTo(sx - 20 * S, y + bh); c.fill(); c.restore(); }
    void p; o.anchor = [w * 0.86, h * 0.6, 0.8];
  },
  scale(c, w, h, t, o) {
    const S = o.S, px = w * 0.2, py = h * 0.28, B = Math.min(w * 0.14, 54 * S), land = 0.42;
    const ang = t < land ? 0.3 : 0.3 * Math.exp(-(t - land) * 1.5) * Math.cos((t - land) * 5);
    const wood = o.dark ? '#c9a46a' : '#8a6a3e', metal = o.dark ? '#d8c08a' : '#a8843e';
    c.fillStyle = wood; c.beginPath(); c.moveTo(px - 26 * S, h * 0.95); c.lineTo(px + 26 * S, h * 0.95); c.lineTo(px + 12 * S, h * 0.88); c.lineTo(px - 12 * S, h * 0.88); c.fill(); c.fillRect(px - 2.5 * S, py, 5 * S, h * 0.6);
    const ca = Math.cos(ang), sa = Math.sin(ang), Lx = px - B * ca, Ly = py - B * sa, Rx = px + B * ca, Ry = py + B * sa, drop = 30 * S;
    c.strokeStyle = metal; c.lineWidth = 3.5 * S; c.lineCap = 'round'; c.beginPath(); c.moveTo(Lx, Ly); c.lineTo(Rx, Ry); c.stroke(); c.lineCap = 'butt';
    c.fillStyle = metal; c.beginPath(); c.arc(px, py, 4.5 * S, 0, TAU); c.fill(); c.beginPath(); c.moveTo(px, py - 12 * S); c.lineTo(px + 3 * S, py - 4 * S); c.lineTo(px - 3 * S, py - 4 * S); c.fill();
    for (const [x, y] of [[Lx, Ly], [Rx, Ry]]) { c.strokeStyle = rgba(o.ink, 0.5); c.lineWidth = 1 * S; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 15 * S, y + drop); c.moveTo(x, y); c.lineTo(x + 15 * S, y + drop); c.stroke(); c.fillStyle = metal; c.beginPath(); c.ellipse(x, y + drop, 19 * S, 4.5 * S, 0, 0, Math.PI); c.fill(); c.fillRect(x - 19 * S, y + drop - 1 * S, 38 * S, 2 * S); }
    c.fillStyle = '#3a3632'; c.beginPath(); c.moveTo(Rx - 11 * S, Ry + drop - 1 * S); c.lineTo(Rx - 8 * S, Ry + drop - 19 * S); c.lineTo(Rx + 8 * S, Ry + drop - 19 * S); c.lineTo(Rx + 11 * S, Ry + drop - 1 * S); c.fill();
    c.strokeStyle = '#3a3632'; c.lineWidth = 2.4 * S; c.beginPath(); c.arc(Rx, Ry + drop - 21 * S, 4 * S, Math.PI, TAU); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(Rx - 6 * S, Ry + drop - 17 * S, 2 * S, 14 * S);
    bigNum(c, o, t, w * 0.7, h * 0.5, w * 0.44, h * 0.38);
    o.anchor = [Lx, Ly + drop - 17 * S, 0.55, 'drop'];
  },
  calendar(c, w, h, t, o) {
    const S = o.S, cx = w * 0.2, cy = h * 0.6, pw = 64 * S, ph = 56 * S, { str, k } = countUp(o, t);
    const paper = o.dark ? '#ece8df' : '#ffffff', head = o.col;
    for (let i = 3; i > 0; i--) { c.fillStyle = mixc(paper, '#000000', 0.06 * i); rr(c, cx - pw / 2 + i * 2 * S, cy - ph / 2 + i * 2 * S, pw, ph, 5 * S); c.fill(); }
    c.fillStyle = paper; rr(c, cx - pw / 2, cy - ph / 2, pw, ph, 5 * S); c.fill();
    c.fillStyle = head; rr(c, cx - pw / 2, cy - ph / 2, pw, 15 * S, 5 * S); c.fill(); c.fillRect(cx - pw / 2, cy - ph / 2 + 8 * S, pw, 7 * S);
    c.fillStyle = '#5a5248'; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * pw * 0.28, cy - ph / 2 + 2 * S, 2.5 * S, 0, TAU); c.fill(); }
    c.fillStyle = '#2a2622'; c.font = `800 100px ${o.font}`; const fs = Math.min(100 * pw * 0.84 / c.measureText(str).width, 24 * S); c.font = `800 ${fs}px ${o.font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(str, cx, cy + 7 * S);
    if (k < 0.995) for (let i = 0; i < 4; i++) { const a = fract(t * 6 + i / 4); c.save(); c.translate(cx + a * 40 * S, cy - a * 46 * S + a * a * 30 * S); c.rotate(a * 2.4); c.globalAlpha = (1 - a) * 0.9; c.fillStyle = paper; c.fillRect(-pw / 2, -ph / 2, pw, ph); c.fillStyle = head; c.fillRect(-pw / 2, -ph / 2, pw, 12 * S); c.restore(); }
    bigNum(c, o, t, w * 0.7, h * 0.5, w * 0.44, h * 0.38);
    o.anchor = [cx + pw * 0.5, cy - ph / 2 - 14 * S, 0.5];
  },
  ruler(c, w, h, t, o) {
    const S = o.S, y = h * 0.8, k = easeOut(t / 1.9), x0 = w * 0.06 + 30 * S, xe = lerp(x0, w * 0.92, k);
    c.fillStyle = '#f2c230'; c.fillRect(x0, y - 6 * S, xe - x0, 12 * S); c.strokeStyle = '#3a3020'; c.lineWidth = 1 * S;
    for (let x = x0, i = 0; x < xe; x += 5 * S, i++) { const l = i % 10 === 0 ? 8 : i % 5 === 0 ? 5.5 : 3; c.beginPath(); c.moveTo(x, y - 6 * S); c.lineTo(x, y - 6 * S + l * S); c.stroke(); }
    c.fillStyle = '#7a6a50'; c.fillRect(xe - 2 * S, y - 9 * S, 3 * S, 18 * S);
    c.fillStyle = o.col; rr(c, w * 0.06 - 4 * S, y - 16 * S, 36 * S, 30 * S, 8 * S); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(w * 0.06 + 14 * S, y - 1 * S, 9 * S, 0, TAU); c.fill(); c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(w * 0.06 + 14 * S, y - 1 * S, 3 * S, 0, TAU); c.fill();
    bigNum(c, o, t, w * 0.55, h * 0.47, w * 0.6, h * 0.34);
    o.anchor = [xe, y - 6 * S - 18 * S, 0.55, 'ride'];
  },
  thermo(c, w, h, t, o) {
    const S = o.S, x = w * 0.16, top = h * 0.1, bot = h * 0.72, by = h * 0.84, k = easeOut(t / 1.9), red = mixc('#e5484d', o.col, 0.2);
    if (t > 1.6) for (let i = 0; i < 3; i++) { const a = fract(t * 0.5 + i / 3); c.strokeStyle = rgba(red, 0.5 * (1 - a)); c.lineWidth = 1.6 * S; c.beginPath(); for (let j = 0; j <= 10; j++) { const yy = top - 2 * S - a * 24 * S - j * 2 * S + 20 * S; c.lineTo(x + (i - 1) * 8 * S + Math.sin(j + t * 6) * 2 * S, yy); } c.stroke(); }
    c.fillStyle = o.dark ? '#e8e4dc' : '#ffffff'; rr(c, x - 7 * S, top, 14 * S, bot - top + 10 * S, 7 * S); c.fill(); c.beginPath(); c.arc(x, by, 13 * S, 0, TAU); c.fill();
    c.strokeStyle = rgba('#2a2622', 0.5); c.lineWidth = 1.2 * S; rr(c, x - 7 * S, top, 14 * S, bot - top + 10 * S, 7 * S); c.stroke();
    const lv = lerp(bot, top + 8 * S, k * 0.95 + Math.sin(t * 9) * 0.004 * (1 - k));
    c.fillStyle = red; c.fillRect(x - 3.5 * S, lv, 7 * S, by - lv); c.beginPath(); c.arc(x, by, 9.5 * S, 0, TAU); c.fill();
    soft(c, x, by, 22 * S, red, 0.35 * k);
    c.strokeStyle = rgba('#2a2622', 0.55); for (let i = 0; i <= 8; i++) { const yy = lerp(bot, top + 8 * S, i / 8); c.beginPath(); c.moveTo(x + 8 * S, yy); c.lineTo(x + (i % 2 ? 12 : 15) * S, yy); c.stroke(); }
    bigNum(c, o, t, w * 0.7, h * 0.5, w * 0.44, h * 0.38);
    o.anchor = [w * 0.33, h * 0.7, 0.6];
  },
  tally(c, w, h, t, o) {
    const S = o.S, cx = w * 0.22, base = h * 0.93, sp = 11 * S, rows = 6, slots = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < rows - r; i++) slots.push([cx + (i - (rows - r - 1) / 2) * sp, base - 5 * S - r * sp * 0.82]);
    const n = slots.length, f = easeOut(t / 1.9) * n, shown = Math.floor(f);
    let topY = base;
    for (let i = 0; i < Math.min(n, shown + 1); i++) {
      const [x, y] = slots[i], u = i < shown ? 1 : f - shown, yy = lerp(-10 * S, y, easeOut(u)); if (u <= 0) continue;
      c.save(); c.translate(x, yy); c.rotate(i * 1.3); c.fillStyle = mixc(o.col, i % 2 ? '#ffffff' : '#000000', 0.12 + (i % 3) * 0.06); glyph(c, o.shape, 1.6 * S); c.fill(); c.restore();
      if (i < shown) topY = Math.min(topY, y);
    }
    bigNum(c, o, t, w * 0.7, h * 0.5, w * 0.44, h * 0.38);
    o.anchor = [cx, topY - 22 * S, 0.55];
  },
  tag(c, w, h, t, o) {
    const S = o.S, px = w * 0.38, py = 4 * S, ang = 0.45 * Math.exp(-t * 0.8) * Math.cos(t * 3) + Math.sin(t * 1.3) * 0.035, tw = Math.min(w * 0.52, 190 * S), th = h * 0.6, L = 16 * S;
    c.strokeStyle = rgba(o.ink, 0.6); c.lineWidth = 1.2 * S; c.beginPath(); c.moveTo(px, -4); c.lineTo(px + Math.sin(-ang) * L * 0.2, py + L); c.stroke();
    c.save(); c.translate(px, py + L); c.rotate(ang);
    c.fillStyle = 'rgba(0,0,0,.16)'; c.save(); c.translate(3 * S, 4 * S); c.beginPath(); c.moveTo(0, 0); c.lineTo(tw / 2, 12 * S); c.lineTo(tw / 2, th); c.lineTo(-tw / 2, th); c.lineTo(-tw / 2, 12 * S); c.closePath(); c.fill(); c.restore();
    c.fillStyle = o.dark ? '#f1e6cf' : '#fff8e6'; c.beginPath(); c.moveTo(0, 0); c.lineTo(tw / 2, 12 * S); c.lineTo(tw / 2, th); c.lineTo(-tw / 2, th); c.lineTo(-tw / 2, 12 * S); c.closePath(); c.fill();
    c.strokeStyle = o.col; c.lineWidth = 2 * S; c.stroke(); c.fillStyle = rgba('#000000', 0.25); c.beginPath(); c.arc(0, 9 * S, 3 * S, 0, TAU); c.fill();
    const save = o.ink; o.ink = '#2a2420'; const d = o.dark; o.dark = false; bigNum(c, o, t, 0, th * 0.6, tw * 0.84, th * 0.5); o.ink = save; o.dark = d;
    c.restore();
    for (let i = 0; i < 6; i++) { const a = Math.max(0, Math.sin(t * 2.4 + i * 1.9)); c.fillStyle = `rgba(255,214,90,${a})`; c.beginPath(); star4(c, px + (o.R(i, 77) - 0.5) * tw * 1.3, h * (0.2 + o.R(i, 78) * 0.7), 5 * S * a); c.fill(); }
    o.anchor = [w * 0.86, h * 0.62, 0.85];
  },
  gauge(c, w, h, t, o) {
    const S = o.S, cx = w * 0.25, cy = h * 0.86, R = Math.min(h * 0.6, w * 0.2), { p, k } = countUp(o, t);
    const frac = /%/.test(p.post) ? clamp01(p.v / 100) : 0.82;
    c.fillStyle = o.dark ? '#26231f' : '#ffffff'; c.beginPath(); c.arc(cx, cy, R + 6 * S, Math.PI, TAU); c.closePath(); c.fill(); c.strokeStyle = rgba(o.ink, 0.25); c.lineWidth = 1.2 * S; c.stroke();
    const cols = ['#3fb27f', '#9bc53d', '#f2c230', '#f08a3a', '#e5484d'];
    cols.forEach((col, i) => { c.strokeStyle = col; c.lineWidth = 7 * S; c.beginPath(); c.arc(cx, cy, R - 4 * S, Math.PI + i * Math.PI / 5 + 0.02, Math.PI + (i + 1) * Math.PI / 5 - 0.02); c.stroke(); });
    c.strokeStyle = rgba(o.ink, 0.55); for (let i = 0; i <= 20; i++) { const a = Math.PI + i * Math.PI / 20, l = i % 5 ? 4 : 8; c.lineWidth = (i % 5 ? 0.8 : 1.6) * S; c.beginPath(); c.moveTo(cx + Math.cos(a) * (R - 12 * S), cy + Math.sin(a) * (R - 12 * S)); c.lineTo(cx + Math.cos(a) * (R - (12 + l) * S), cy + Math.sin(a) * (R - (12 + l) * S)); c.stroke(); }
    const wob = t > 1.9 ? 0.06 * Math.exp(-(t - 1.9) * 4) * Math.sin((t - 1.9) * 22) : 0, na = Math.PI + Math.PI * frac * k + wob + Math.sin(t * 17) * 0.004;
    c.strokeStyle = '#e5484d'; c.lineWidth = 2.6 * S; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx - Math.cos(na) * 8 * S, cy - Math.sin(na) * 8 * S); c.lineTo(cx + Math.cos(na) * (R - 10 * S), cy + Math.sin(na) * (R - 10 * S)); c.stroke(); c.lineCap = 'butt';
    c.fillStyle = '#3a3632'; c.beginPath(); c.arc(cx, cy, 5 * S, 0, TAU); c.fill();
    bigNum(c, o, t, w * 0.7, h * 0.5, w * 0.44, h * 0.38);
    o.anchor = [cx, cy - R - 20 * S, 0.5];
  },
  grid(c, w, h, t, o) {
    const S = o.S, x0 = w * 0.05, x1 = w * 0.46, y0 = h * 0.12, y1 = h * 0.9, cols = 16, rows = 9, dx = (x1 - x0) / (cols - 1), dy = (y1 - y0) / (rows - 1), n = cols * rows;
    const sweep = easeOut(t / 1.3), special = Math.floor(n * 0.62 + o.R(7, 7) * n * 0.2), found = clamp01((t - 1.4) / 0.6);
    for (let i = 0; i < n; i++) { if (i / n > sweep || i === special) continue; c.fillStyle = rgba(o.ink, 0.32 - found * 0.12); c.beginPath(); c.arc(x0 + (i % cols) * dx, y0 + Math.floor(i / cols) * dy, 1.8 * S, 0, TAU); c.fill(); }
    const sx = x0 + (special % cols) * dx, sy = y0 + Math.floor(special / cols) * dy;
    if (special / n <= sweep) {
      for (let r = 0; r < 3; r++) { const a = fract(t * 0.7 + r / 3); if (found > 0) { c.strokeStyle = rgba(o.col, 0.6 * (1 - a) * found); c.lineWidth = 1.5 * S; c.beginPath(); c.arc(sx, sy, 6 * S + a * 22 * S, 0, TAU); c.stroke(); } }
      soft(c, sx, sy, 16 * S, o.col, 0.6); heroImg(c, o, sx, sy, lerp(6 * S, 34 * S, easeBack(found)), Math.sin(t * 2) * 0.1);
    }
    bigNum(c, o, t, w * 0.7, h * 0.5, w * 0.44, h * 0.38);
    o.heroOwn = true; o.anchor = [sx, sy, 0.5];
  },
  tiny(c, w, h, t, o) {
    const S = o.S, spx = w * 0.24, spy = h * 0.56, LR = h * 0.3, k = easeInOut(clamp01((t - 0.3) / 1.5));
    for (let i = 0; i < 24; i++) { c.fillStyle = rgba(o.ink, 0.18); c.beginPath(); c.arc(o.R(i, 91) * w * 0.48, o.R(i, 92) * h, 0.8 * S, 0, TAU); c.fill(); }
    c.fillStyle = o.col; c.beginPath(); c.arc(spx, spy, 1 * S, 0, TAU); c.fill();
    const lx = spx + Math.cos(t * 1.4) * 34 * S * (1 - k) + Math.sin(t * 1.1) * 1.5 * S * k, ly = spy + Math.sin(t * 2.1) * 18 * S * (1 - k) + Math.cos(t * 0.9) * 1.2 * S * k, mag = 6;
    c.save(); c.beginPath(); c.arc(lx, ly, LR, 0, TAU); c.clip();
    c.fillStyle = o.dark ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.55)'; c.fillRect(lx - LR, ly - LR, LR * 2, LR * 2);
    for (let i = 0; i < 24; i++) { const qx = lx + (o.R(i, 91) * w * 0.48 - lx) * mag, qy = ly + (o.R(i, 92) * h - ly) * mag; c.fillStyle = rgba(o.ink, 0.2); c.beginPath(); c.arc(qx, qy, 4 * S, 0, TAU); c.fill(); }
    const hx = lx + (spx - lx) * mag, hy = ly + (spy - ly) * mag; soft(c, hx, hy, LR, o.col, 0.35); heroImg(c, o, hx, hy, LR * 1.5, Math.sin(t * 1.5) * 0.1);
    c.restore();
    c.strokeStyle = '#5a4630'; c.lineWidth = 7 * S; c.lineCap = 'round'; c.beginPath(); c.moveTo(lx + LR * 0.74, ly + LR * 0.74); c.lineTo(lx + LR * 1.35, ly + LR * 1.35); c.stroke(); c.lineCap = 'butt';
    const rim = c.createLinearGradient(lx - LR, ly - LR, lx + LR, ly + LR); rim.addColorStop(0, '#e8d6a0'); rim.addColorStop(1, '#8a6a2a'); c.strokeStyle = rim; c.lineWidth = 4 * S; c.beginPath(); c.arc(lx, ly, LR, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(lx - LR * 0.4, ly - LR * 0.45, LR * 0.22, LR * 0.1, -0.7, 0, TAU); c.fill();
    bigNum(c, o, t, w * 0.7, h * 0.5, w * 0.44, h * 0.38);
    o.heroOwn = true; o.anchor = [hx, hy, 0.5];
  },
};

// ── scenes ──────────────────────────────────────────────
// Every fact gets its own little film: a setting behind the motif, the ingredient itself (its 3D thumbnail)
// acting in it, accent particles, a camera move, and a rubber-stamp caption that lands on the beat.
const bounce = (x) => { x = clamp01(x); const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
const SKIES = {
  day: [['#cde3f4', '#f6efe0'], ['#1b2839', '#2b3443']],
  dawn: [['#ffc8a2', '#fff0dc'], ['#35273e', '#694545']],
  dusk: [['#d29abf', '#ffcd9a'], ['#261b38', '#6b404e']],
  night: [['#121c3e', '#303a6a'], ['#0a1024', '#1e2547']],
  warm: [['#ffd69c', '#fff1d6'], ['#3a2b45', '#7a5040']],
  ember: [['#5a2420', '#b0502e'], ['#1f0f12', '#5a2418']],
  cave: [['#4a3a2e', '#2a2018'], ['#1d1712', '#2c231b']],
  lab: [['#d9efeb', '#f3f8f4'], ['#14262a', '#1f3236']],
  paper: [['#ecdcc0', '#f8f0de'], ['#2a2419', '#3a3122']],
  storm: [['#3e4a5e', '#6c7788'], ['#141a26', '#2a3242']],
  jungle: [['#cfe8c8', '#f1f6e4'], ['#13261c', '#22352a']],
};
const SETTING_SKY = { dawn: 'dawn', dusk: 'dusk', night: 'night', aurora: 'night', space: 'night', cave: 'cave', storm: 'storm', volcanic: 'ember', desert: 'warm', temple: 'warm', palace: 'dusk', bazaar: 'warm', lab: 'lab', library: 'paper', jungle: 'jungle', forest: 'jungle' };
const DARK_SKY = new Set(['night', 'cave', 'storm', 'ember']);
const NIGHT_FX = new Set(['moon', 'lightning', 'rocket', 'fireflies']);
function palette(setting, fx, themeDark, col, k = 0) {
  let key = SETTING_SKY[setting] || 'day', v = themeDark ? 1 : 0;
  if (NIGHT_FX.has(fx)) { if (!DARK_SKY.has(key)) key = 'night'; v = 1; }
  const [top, bot] = SKIES[key][v], dark = v === 1 || DARK_SKY.has(key);
  const kt = 0.04 + k * 0.16, kb = 0.05 + k * 0.18; // how strongly this card's sky leans toward the ingredient's colour
  return { key, dark, top: mixc(top, col, kt), bot: mixc(bot, col, kb), sh: (j, hue = '#34442f') => mixc(mixc(bot, col, kb), dark ? '#04060b' : hue, j) };
}
function backdrop(c, w, h, p) { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, p.top); g.addColorStop(1, p.bot); c.fillStyle = g; c.fillRect(-w, -h, w * 3, h * 3); }
function ridge(c, w, h, y, amp, f, ph, col) { c.fillStyle = col; c.beginPath(); c.moveTo(-w * 0.2, h * 1.4); for (let x = -w * 0.2; x <= w * 1.2; x += 6) c.lineTo(x, y + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph * 1.3) * amp * 0.35); c.lineTo(w * 1.2, h * 1.4); c.fill(); }
function twinkle(c, w, h, t, o, n, top = 0.75, a0 = 1) {
  for (let i = 0; i < n; i++) { const a = (0.25 + 0.75 * Math.abs(Math.sin(t * (0.7 + o.R(i, 41) * 2) + o.R(i, 42) * 6))) * a0, x = o.R(i, 43) * w, y = o.R(i, 44) * h * top; c.fillStyle = `rgba(255,252,235,${a})`; c.beginPath(); o.R(i, 45) > 0.88 ? star4(c, x, y, 3 * o.S * a) : c.arc(x, y, (0.4 + o.R(i, 46) * 0.9) * o.S, 0, TAU); c.fill(); }
}
function clouds(c, w, h, t, o, n, col, a, y0 = 0.12, y1 = 0.4) {
  c.fillStyle = rgba(col, a);
  for (let i = 0; i < n; i++) { const x = fract(o.R(i, 51) + t * 0.012 * (1 + o.R(i, 52))) * (w + 140 * o.S) - 70 * o.S, y = h * (y0 + o.R(i, 53) * (y1 - y0)), s = (0.7 + o.R(i, 54) * 0.6) * o.S; c.beginPath(); c.ellipse(x, y, 30 * s, 8 * s, 0, 0, TAU); c.ellipse(x + 12 * s, y - 5 * s, 16 * s, 8 * s, 0, 0, TAU); c.ellipse(x - 10 * s, y - 3 * s, 12 * s, 6 * s, 0, 0, TAU); c.fill(); }
}
function conifer(c, x, y, ht, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - ht); c.lineTo(x + ht * 0.32, y); c.lineTo(x - ht * 0.32, y); c.fill(); }
const SET = {
  dawn(c, w, h, t, o, p) {
    const S = o.S, sy = h * 0.8 - easeOut(t / 3) * h * 0.08;
    soft(c, w * 0.2, sy, h * 0.95, '#ffb06a', p.dark ? 0.3 : 0.5); c.fillStyle = p.dark ? '#ffcf8f' : '#ffe6b8'; c.beginPath(); c.arc(w * 0.2, sy, h * 0.12, 0, TAU); c.fill();
    ridge(c, w, h, h * 0.8, 6 * S, 0.02, 1, p.sh(0.22, '#8a6a7a')); ridge(c, w, h, h * 0.92, 5 * S, 0.03, 3, p.sh(0.4, '#5a4a5a'));
    c.strokeStyle = rgba(p.dark ? '#f0e4d4' : '#4a3a40', 0.5); c.lineWidth = 1.2 * S;
    for (let i = 0; i < 3; i++) { const x = fract(o.R(i, 61) + t * 0.035) * (w + 40) - 20, y = h * (0.22 + i * 0.07), f = Math.sin(t * 6 + i) * 2.5 * S; c.beginPath(); c.moveTo(x - 5 * S, y + f); c.quadraticCurveTo(x - 2 * S, y - 2 * S, x, y); c.quadraticCurveTo(x + 2 * S, y - 2 * S, x + 5 * S, y + f); c.stroke(); }
  },
  noon(c, w, h, t, o, p) {
    const S = o.S; soft(c, w * 0.88, h * 0.18, 50 * S, '#fff3c0', p.dark ? 0.25 : 0.8); c.fillStyle = p.dark ? '#e8dcb0' : '#fffbe6'; c.beginPath(); c.arc(w * 0.88, h * 0.18, 11 * S, 0, TAU); c.fill();
    clouds(c, w, h, t, o, 4, p.dark ? '#7a8496' : '#ffffff', p.dark ? 0.25 : 0.75);
    ridge(c, w, h, h * 0.9, 4 * S, 0.018, 2, p.sh(0.3, '#5f8a4a'));
  },
  dusk(c, w, h, t, o, p) {
    const S = o.S; soft(c, w * 0.5, h * 0.86, h * 1.1, '#ff8d5a', p.dark ? 0.35 : 0.55);
    c.fillStyle = p.dark ? '#ff9d6a' : '#ffb27a'; c.beginPath(); c.arc(w * 0.5, h * 0.86 + easeOut(t / 4) * 6 * S, h * 0.2, 0, TAU); c.fill();
    ridge(c, w, h, h * 0.8, 7 * S, 0.016, 0.5, p.sh(0.3, '#5a3a5a')); ridge(c, w, h, h * 0.92, 5 * S, 0.026, 2, p.sh(0.5, '#3a2a40'));
  },
  night(c, w, h, t, o, p) {
    const S = o.S; twinkle(c, w, h, t, o, 50);
    c.fillStyle = '#f6efcf'; c.beginPath(); c.arc(w * 0.1, h * 0.22, 9 * S, 0, TAU); c.fill(); c.fillStyle = p.top; c.beginPath(); c.arc(w * 0.1 + 4 * S, h * 0.22 - 2 * S, 8 * S, 0, TAU); c.fill();
    ridge(c, w, h, h * 0.9, 5 * S, 0.02, 1, p.sh(0.35));
  },
  aurora(c, w, h, t, o, p) {
    const S = o.S; twinkle(c, w, h, t, o, 40);
    c.globalCompositeOperation = 'lighter';
    [['#4cf0a0', 0.22, 0], ['#8a6bff', 0.16, 2], ['#3fd6d0', 0.14, 4]].forEach(([col, a, ph]) => {
      for (let x = -10; x <= w + 10; x += 4 * S) { const y = h * 0.28 + Math.sin(x * 0.012 + t * 0.6 + ph) * 16 * S + Math.sin(x * 0.03 - t * 0.9) * 5 * S, L = (36 + Math.sin(x * 0.02 + t + ph) * 14) * S; const g = c.createLinearGradient(0, y - L, 0, y + 6 * S); g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.8, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(x, y - L, 4.5 * S, L + 6 * S); }
    });
    c.globalCompositeOperation = 'source-over';
    ridge(c, w, h, h * 0.86, 7 * S, 0.018, 2, mixc(p.bot, '#dfe8f2', 0.35)); ridge(c, w, h, h * 0.95, 3 * S, 0.03, 1, mixc(p.bot, '#eef3f8', 0.5));
  },
  sea(c, w, h, t, o, p) {
    const S = o.S, hz = h * 0.58, sea = mixc(p.dark ? '#1d3f5e' : '#5d9cc9', p.bot, 0.25);
    clouds(c, w, h, t, o, 3, p.dark ? '#5a6478' : '#ffffff', p.dark ? 0.2 : 0.65, 0.08, 0.3);
    const g = c.createLinearGradient(0, hz, 0, h); g.addColorStop(0, sea); g.addColorStop(1, mixc(sea, '#0b2a44', 0.35)); c.fillStyle = g; c.fillRect(-w, hz, w * 3, h * 2);
    c.strokeStyle = rgba('#ffffff', p.dark ? 0.18 : 0.45); c.lineWidth = 1.2 * S;
    for (let i = 0; i < 16; i++) { const y = hz + 4 * S + o.R(i, 71) * (h - hz), x = fract(o.R(i, 72) + t * 0.02 * (1 + o.R(i, 73))) * w, l = (4 + (y - hz) * 0.12) * S; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y); c.stroke(); }
    const sx = fract(0.7 + t * 0.01) * (w + 40) - 20; c.fillStyle = rgba(p.dark ? '#c8d0dc' : '#ffffff', 0.8); c.beginPath(); c.moveTo(sx, hz - 1); c.lineTo(sx, hz - 12 * S); c.lineTo(sx + 7 * S, hz - 1); c.fill();
  },
  beach(c, w, h, t, o, p) {
    const S = o.S, hz = h * 0.52;
    const sea = mixc(p.dark ? '#1d4a5e' : '#6ec3d4', p.bot, 0.2); c.fillStyle = sea; c.fillRect(-w, hz, w * 3, h);
    c.fillStyle = mixc(p.dark ? '#5a5040' : '#f0dcae', p.bot, 0.15); c.beginPath(); c.moveTo(-w * 0.2, h * 1.4);
    for (let x = -w * 0.2; x <= w * 1.2; x += 6) c.lineTo(x, h * 0.74 + Math.sin(x * 0.015 + 1) * 5 * S + Math.sin(t * 1.4 + x * 0.04) * 1.2 * S); c.lineTo(w * 1.2, h * 1.4); c.fill();
    c.strokeStyle = rgba('#ffffff', p.dark ? 0.25 : 0.7); c.lineWidth = 1.4 * S; c.beginPath(); for (let x = 0; x <= w; x += 6) { const y = h * 0.735 + Math.sin(x * 0.015 + 1) * 5 * S - Math.abs(Math.sin(t * 0.9)) * 3 * S; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    const px = w * 0.05, trunk = p.sh(0.55, '#4a3a28'); c.strokeStyle = trunk; c.lineWidth = 4 * S; c.beginPath(); c.moveTo(px, h); c.quadraticCurveTo(px + 10 * S, h * 0.5, px + 22 * S, h * 0.16); c.stroke();
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.55 + Math.sin(t * 1.3 + i) * 0.06; c.save(); c.translate(px + 22 * S, h * 0.16); c.rotate(a); c.fillStyle = p.sh(0.5, '#2f5a2a'); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(18 * S, -6 * S, 34 * S, 6 * S); c.quadraticCurveTo(18 * S, 2 * S, 0, 0); c.fill(); c.restore(); }
  },
  desert(c, w, h, t, o, p) {
    const S = o.S; soft(c, w * 0.8, h * 0.24, 46 * S, '#fff2c4', p.dark ? 0.3 : 0.8);
    ridge(c, w, h, h * 0.66, 9 * S, 0.012, 1, mixc(p.bot, p.dark ? '#6a4a30' : '#ecc584', 0.6)); ridge(c, w, h, h * 0.84, 8 * S, 0.02, 3, mixc(p.bot, p.dark ? '#5a3c24' : '#dba560', 0.7));
    c.strokeStyle = rgba('#ffffff', 0.18); c.lineWidth = 1.2 * S; for (let i = 0; i < 3; i++) { const y = h * 0.6 - fract(t * 0.2 + i / 3) * h * 0.3; c.beginPath(); for (let x = 0; x <= w; x += 6) { const yy = y + Math.sin(x * 0.08 + t * 4 + i) * 1.6 * S; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } c.stroke(); }
  },
  forest(c, w, h, t, o, p) {
    const S = o.S;
    for (let i = 0; i < 26; i++) conifer(c, (i / 25) * (w + 20) - 10, h * 0.84 + (i % 2) * 3 * S, (26 + o.R(i, 81) * 14) * S, p.sh(0.22, '#4f7a5a'));
    c.globalCompositeOperation = p.dark ? 'lighter' : 'source-over';
    for (let i = 0; i < 3; i++) { const x = w * (0.25 + i * 0.28) + Math.sin(t * 0.4 + i) * 10 * S; c.fillStyle = rgba('#fff6d0', p.dark ? 0.05 : 0.22); c.beginPath(); c.moveTo(x, -10); c.lineTo(x + 26 * S, -10); c.lineTo(x - 10 * S, h); c.lineTo(x - 40 * S, h); c.fill(); }
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 11; i++) conifer(c, (i / 10) * (w + 40) - 20, h * 1.02, (40 + o.R(i, 82) * 22) * S, p.sh(0.45, '#2f4f38'));
  },
  jungle(c, w, h, t, o, p) {
    const S = o.S, g1 = p.sh(0.35, '#2f6a35'), g2 = p.sh(0.5, '#1f4a28');
    c.strokeStyle = g1; c.lineWidth = 1.6 * S; for (let i = 0; i < 5; i++) { const x = w * (0.12 + i * 0.19), L = h * (0.25 + o.R(i, 91) * 0.25), sw = Math.sin(t * 0.9 + i) * 4 * S; c.beginPath(); c.moveTo(x, -4); c.quadraticCurveTo(x + sw, L * 0.5, x + sw * 1.4, L); c.stroke(); leafAt(c, x + sw * 1.4, L, 1.3 * S, 1.2 + i, g1); }
    const big = (x, y, a, s, col) => { c.save(); c.translate(x, y); c.rotate(a + Math.sin(t * 0.8 + x) * 0.04); c.fillStyle = col; c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(20 * s, -26 * s, 60 * s, -18 * s, 70 * s, 6 * s); c.bezierCurveTo(50 * s, 22 * s, 18 * s, 18 * s, 0, 0); c.fill(); c.strokeStyle = rgba('#ffffff', 0.12); c.lineWidth = 1 * S; c.beginPath(); c.moveTo(4 * s, 1 * s); c.lineTo(62 * s, 5 * s); c.stroke(); c.restore(); };
    big(-6 * S, h * 0.08, 0.35, S, g2); big(w + 6 * S, h * 0.02, Math.PI - 0.5, S * 0.9, g2); big(-10 * S, h * 1.02, -0.5, S * 0.8, g1); big(w + 10 * S, h * 0.98, Math.PI + 0.55, S * 0.85, g1);
  },
  alpine(c, w, h, t, o, p) {
    const S = o.S, rock = p.sh(0.25, '#6f7f92'), pk = [[0, 0.62], [0.16, 0.3], [0.34, 0.56], [0.52, 0.24], [0.7, 0.5], [0.86, 0.32], [1, 0.58]];
    c.fillStyle = rock; c.beginPath(); c.moveTo(-10, h * 1.4); pk.forEach(([x, y]) => c.lineTo(x * w, y * h)); c.lineTo(w + 10, h * 1.4); c.fill();
    c.fillStyle = rgba('#ffffff', p.dark ? 0.55 : 0.92); for (const i of [1, 3, 5]) { const [x, y] = pk[i], [xl, yl] = pk[i - 1], [xr, yr] = pk[i + 1]; c.beginPath(); c.moveTo(x * w, y * h); c.lineTo(lerp(x, xr, 0.28) * w, lerp(y, yr, 0.28) * h); c.lineTo(lerp(x, xr, 0.12) * w, lerp(y, yr, 0.16) * h + 3 * S); c.lineTo(lerp(x, xl, 0.14) * w, lerp(y, yl, 0.2) * h + 2 * S); c.lineTo(lerp(x, xl, 0.28) * w, lerp(y, yl, 0.28) * h); c.fill(); }
    for (let i = 0; i < 14; i++) conifer(c, (i / 13) * (w + 30) - 15, h * 1.01, (24 + o.R(i, 101) * 14) * S, p.sh(0.5, '#2f4a3a'));
  },
  meadow(c, w, h, t, o, p) {
    const S = o.S; clouds(c, w, h, t, o, 3, p.dark ? '#6a7488' : '#ffffff', p.dark ? 0.2 : 0.7);
    ridge(c, w, h, h * 0.76, 7 * S, 0.012, 2, p.sh(0.2, '#7aa65a')); ridge(c, w, h, h * 0.88, 6 * S, 0.02, 0, p.sh(0.32, '#5a8f45'));
    for (let i = 0; i < 26; i++) { const x = o.R(i, 111) * w, y = h * (0.9 + o.R(i, 112) * 0.1) + Math.sin(x * 0.02) * 6 * S, sw = Math.sin(t * 2 + i) * 1.5 * S; c.fillStyle = [o.col, '#ffffff', '#ffd54a', '#e86a9a'][i % 4]; c.globalAlpha = p.dark ? 0.55 : 0.9; c.beginPath(); c.arc(x + sw, y, 1.8 * S, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  },
  terraces(c, w, h, t, o, p) {
    const S = o.S, g = p.sh(0.22, '#6a9a4a');
    ridge(c, w, h, h * 0.45, 14 * S, 0.01, 1, g);
    c.strokeStyle = p.sh(0.38, '#4a7a35'); c.lineWidth = 1.4 * S;
    for (let r = 0; r < 9; r++) { c.beginPath(); for (let x = -10; x <= w + 10; x += 6) { const y = h * (0.5 + r * 0.06) + Math.sin(x * 0.01 + 1) * 14 * S * (1 - r * 0.07) + Math.sin(x * 0.03 + r) * 2 * S; x > -10 ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
    c.fillStyle = rgba('#ffffff', p.dark ? 0.06 : 0.3); for (let i = 0; i < 3; i++) { const x = fract(i / 3 + t * 0.02) * (w + 200 * S) - 100 * S; c.beginPath(); c.ellipse(x, h * (0.5 + i * 0.12), 90 * S, 8 * S, 0, 0, TAU); c.fill(); }
  },
  orchard(c, w, h, t, o, p) {
    const S = o.S; ridge(c, w, h, h * 0.7, 2 * S, 0.01, 0, p.sh(0.2, '#8aaa5a'));
    for (let r = 0; r < 3; r++) { const y = h * (0.72 + r * 0.12), sc = (0.6 + r * 0.35) * S, n = 9 - r * 2; for (let i = 0; i < n; i++) { const x = ((i + 0.5 * (r % 2)) / (n - 1)) * w; c.fillStyle = p.sh(0.4 + r * 0.05, '#5a3a20'); c.fillRect(x - 1.5 * sc, y - 12 * sc, 3 * sc, 12 * sc); c.fillStyle = p.sh(0.3 + r * 0.08, '#3f7a3a'); c.beginPath(); c.arc(x, y - 18 * sc, 10 * sc, 0, TAU); c.fill(); c.fillStyle = rgba(o.col, p.dark ? 0.5 : 0.85); for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + (o.R(i + r * 9, k) - 0.5) * 12 * sc, y - 18 * sc + (o.R(i + r * 9, k + 3) - 0.5) * 10 * sc, 1.6 * sc, 0, TAU); c.fill(); } } }
  },
  garden(c, w, h, t, o, p) {
    const S = o.S, hedge = p.sh(0.35, '#3f6e3a');
    c.strokeStyle = p.sh(0.3, '#7a6a5a'); c.lineWidth = 2.5 * S; c.beginPath(); c.moveTo(w * 0.14, h * 0.86); c.lineTo(w * 0.14, h * 0.42); c.arc(w * 0.24, h * 0.42, w * 0.1, Math.PI, 0); c.lineTo(w * 0.34, h * 0.86); c.stroke();
    for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; leafAt(c, w * 0.24 + Math.cos(a) * w * 0.1, h * 0.42 + Math.sin(a) * w * 0.1, 1.2 * S, a + Math.sin(t + i) * 0.1, hedge); }
    c.fillStyle = hedge; c.beginPath(); c.moveTo(-10, h * 1.4); for (let x = -10; x <= w + 10; x += 8 * S) c.lineTo(x, h * 0.84 - Math.abs(Math.sin(x * 0.09)) * 6 * S); c.lineTo(w + 10, h * 1.4); c.fill();
    for (let i = 0; i < 18; i++) { c.fillStyle = [o.col, '#ffffff', '#f2a0c0'][i % 3]; c.globalAlpha = p.dark ? 0.5 : 0.85; c.beginPath(); c.arc(o.R(i, 121) * w, h * (0.82 + o.R(i, 122) * 0.06) + Math.sin(t * 1.5 + i) * S, 2 * S, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  },
  river(c, w, h, t, o, p) {
    const S = o.S; ridge(c, w, h, h * 0.55, 8 * S, 0.014, 1, p.sh(0.2, '#6a9a5a'));
    const water = mixc(p.dark ? '#2a4a6a' : '#7ab8dc', p.bot, 0.2);
    c.fillStyle = water; c.beginPath(); const L = (y) => w * 0.55 + Math.sin(y * 0.05) * 30 * S, half = (y) => 2 * S + (y - h * 0.55) * 0.55;
    for (let y = h * 0.55; y <= h * 1.05; y += 4) c.lineTo(L(y) - half(y), y); for (let y = h * 1.05; y >= h * 0.55; y -= 4) c.lineTo(L(y) + half(y), y); c.fill();
    c.strokeStyle = rgba('#ffffff', p.dark ? 0.2 : 0.55); c.lineWidth = 1.2 * S; for (let i = 0; i < 10; i++) { const y = h * 0.6 + fract(o.R(i, 131) + t * 0.15) * h * 0.4, x = L(y) + (o.R(i, 132) - 0.5) * half(y); c.beginPath(); c.moveTo(x - 3 * S, y); c.lineTo(x + 3 * S, y); c.stroke(); }
  },
  temple(c, w, h, t, o, p) {
    const S = o.S, stone = p.sh(0.25, '#9a7a5a');
    for (const x of [0.05, 0.15, 0.85, 0.95]) { c.fillStyle = stone; c.fillRect(x * w - 7 * S, h * 0.12, 14 * S, h); c.fillStyle = rgba('#000000', 0.08); for (let k = -1; k <= 1; k++) c.fillRect(x * w + k * 4 * S - 0.5 * S, h * 0.14, 1 * S, h); c.fillStyle = stone; c.fillRect(x * w - 10 * S, h * 0.1, 20 * S, 5 * S); }
    c.fillStyle = stone; c.fillRect(-10, h * 0.02, w * 0.22, 8 * S); c.fillRect(w * 0.79, h * 0.02, w * 0.25, 8 * S);
    c.fillStyle = p.sh(0.32, '#8a6a4a'); for (let i = 0; i < 3; i++) c.fillRect(-10, h * (0.9 + i * 0.04), w + 20, h * 0.04);
    for (let i = 0; i < 8; i++) { const a = fract(t * 0.08 + i / 8), x = w * 0.5 + Math.sin(a * 5 + i) * w * 0.3; c.fillStyle = rgba(p.dark ? '#c8b8a0' : '#ffffff', 0.12 * Math.sin(a * Math.PI)); c.beginPath(); c.arc(x, h * (1 - a), (20 + a * 30) * S, 0, TAU); c.fill(); }
  },
  palace(c, w, h, t, o, p) {
    const S = o.S, sil = p.sh(0.38, '#5a3a4a'), base = h * 0.9;
    c.fillStyle = sil; c.fillRect(-10, base, w + 20, h);
    const dome = (x, r, ht) => { c.fillRect(x - r, base - ht, r * 2, ht); c.beginPath(); c.moveTo(x - r * 1.05, base - ht); c.bezierCurveTo(x - r * 1.2, base - ht - r * 1.2, x - r * 0.2, base - ht - r * 1.3, x, base - ht - r * 1.9); c.bezierCurveTo(x + r * 0.2, base - ht - r * 1.3, x + r * 1.2, base - ht - r * 1.2, x + r * 1.05, base - ht); c.fill(); };
    const tower = (x, ht) => { c.fillRect(x - 3 * S, base - ht, 6 * S, ht); c.beginPath(); c.moveTo(x - 4 * S, base - ht); c.lineTo(x, base - ht - 10 * S); c.lineTo(x + 4 * S, base - ht); c.fill(); };
    tower(w * 0.06, 60 * S); dome(w * 0.16, 12 * S, 20 * S); tower(w * 0.26, 46 * S); dome(w * 0.78, 16 * S, 24 * S); tower(w * 0.9, 64 * S); dome(w * 0.97, 9 * S, 14 * S);
    for (let i = 0; i < 8; i++) { const a = Math.max(0, Math.sin(t * 2.2 + i * 1.9)); c.fillStyle = `rgba(255,220,120,${a * 0.9})`; c.beginPath(); star4(c, [0.06, 0.16, 0.26, 0.78, 0.9, 0.97, 0.12, 0.84][i] * w, base - [74, 44, 58, 56, 76, 30, 20, 30][i] * S, 4 * S * a); c.fill(); }
  },
  bazaar(c, w, h, t, o, p) {
    const S = o.S, cols = ['#e5484d', '#f2b632', '#2f9e8f', '#7a4ec9', '#f07c3a'];
    for (let i = 0; i < 12; i++) { c.fillStyle = mixc(cols[i % 5], p.bot, p.dark ? 0.55 : 0.25); c.beginPath(); c.moveTo(i * w / 11 - w / 22, -2); c.lineTo(i * w / 11 + w / 22, -2); c.lineTo(i * w / 11 + w / 22, 10 * S); c.quadraticCurveTo(i * w / 11, 16 * S, i * w / 11 - w / 22, 10 * S); c.fill(); }
    c.strokeStyle = p.sh(0.4, '#5a4a3a'); c.lineWidth = 1 * S; const sag = (x) => h * 0.2 + Math.sin(x / w * Math.PI) * 12 * S;
    c.beginPath(); for (let x = 0; x <= w; x += 6) x ? c.lineTo(x, sag(x)) : c.moveTo(x, sag(x)); c.stroke();
    for (let i = 0; i < 14; i++) { const x = (i + 0.5) * w / 14, y = sag(x), sw = Math.sin(t * 2.2 + i) * 0.2; c.save(); c.translate(x, y); c.rotate(sw); c.fillStyle = mixc(cols[i % 5], p.bot, p.dark ? 0.4 : 0.1); c.beginPath(); c.moveTo(-5 * S, 0); c.lineTo(5 * S, 0); c.lineTo(0, 11 * S); c.fill(); c.restore(); }
    for (const x of [0.08, 0.92]) { const sw = Math.sin(t * 1.6 + x * 9) * 0.12, lx = x * w, ly = h * 0.42; c.save(); c.translate(lx, h * 0.24); c.rotate(sw); c.strokeStyle = p.sh(0.4); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, ly - h * 0.24); c.stroke(); soft(c, 0, ly - h * 0.24 + 8 * S, 22 * S, '#ffb347', p.dark ? 0.5 : 0.35); c.fillStyle = '#e8862a'; rr(c, -6 * S, ly - h * 0.24, 12 * S, 16 * S, 5 * S); c.fill(); c.restore(); }
  },
  lab(c, w, h, t, o, p) {
    const S = o.S; c.strokeStyle = rgba(p.dark ? '#7fd6c8' : '#2a7a70', 0.08); c.lineWidth = 1;
    for (let x = 0; x <= w; x += 16 * S) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y <= h; y += 16 * S) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = p.sh(0.3, '#5a6a6a'); c.fillRect(-10, h * 0.3, w + 20, 3 * S);
    for (let i = 0; i < 12; i++) { const x = w * (0.04 + i * 0.085), ht = (8 + o.R(i, 141) * 12) * S; c.fillStyle = mixc(['#6cc4b8', '#e8a84a', '#9a7ad6', '#e57a7a'][i % 4], p.bot, p.dark ? 0.6 : 0.45); rr(c, x - 4 * S, h * 0.3 - ht, 8 * S, ht, 2 * S); c.fill(); }
  },
  library(c, w, h, t, o, p) {
    const S = o.S, wood = p.sh(0.4, '#6a4a2e');
    for (const y of [0.34, 0.68, 1.02]) {
      c.fillStyle = wood; c.fillRect(-10, h * y, w + 20, 4 * S);
      let x = -4; let i = Math.round(y * 50); while (x < w) { const bw = (5 + o.R(i, 151) * 7) * S, bh = (18 + o.R(i, 152) * 16) * S; c.fillStyle = mixc(['#8a3a2e', '#2e5a6a', '#6a5a2a', '#3e3a6a', '#2e6a3e'][i % 5], p.bot, p.dark ? 0.55 : 0.5); c.fillRect(x, h * y - bh, bw, bh); x += bw + 1 * S; i++; }
    }
    for (let i = 0; i < 10; i++) { const a = fract(t * 0.05 + o.R(i, 153)); c.fillStyle = rgba(p.dark ? '#ffe8b0' : '#ffffff', 0.4 * Math.sin(a * Math.PI)); c.beginPath(); c.arc(o.R(i, 154) * w + Math.sin(t + i) * 8 * S, h * (1 - a), 1.3 * S, 0, TAU); c.fill(); }
  },
  space(c, w, h, t, o, p) {
    const S = o.S; c.globalCompositeOperation = 'lighter';
    soft(c, w * 0.3, h * 0.4, 80 * S, '#7a4ad8', 0.18); soft(c, w * 0.62, h * 0.6, 70 * S, '#2a8ad8', 0.15); soft(c, w * 0.48, h * 0.3, 40 * S, '#e84a9a', 0.1);
    c.globalCompositeOperation = 'source-over'; twinkle(c, w, h, t, o, 70, 1);
    const px = w * 0.9, py = h * 0.2, pr = 16 * S; c.fillStyle = '#c98a5a'; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill(); c.strokeStyle = rgba('#f0d0a0', 0.8); c.lineWidth = 2 * S; c.beginPath(); c.ellipse(px, py, pr * 1.8, pr * 0.45, -0.3, 0, TAU); c.stroke();
  },
  cave(c, w, h, t, o, p) {
    const S = o.S; soft(c, w * 0.5, h * 0.62, w * 0.5, '#ffb060', 0.18 + Math.sin(t * 3) * 0.03);
    const rock = p.sh(0.4, '#2a1e16'); c.fillStyle = rock;
    c.beginPath(); c.moveTo(-10, -10); for (let i = 0; i <= 16; i++) { const x = i * w / 16; c.lineTo(x - w / 32, 4 * S); c.lineTo(x, (10 + o.R(i, 161) * 26) * S); } c.lineTo(w + 10, -10); c.fill();
    c.beginPath(); c.moveTo(-10, h + 10); for (let i = 0; i <= 10; i++) { const x = i * w / 10; c.lineTo(x - w / 20, h - 3 * S); c.lineTo(x, h - (6 + o.R(i, 162) * 16) * S); } c.lineTo(w + 10, h + 10); c.fill();
    for (let i = 0; i < 4; i++) { const x = w * (0.15 + o.R(i, 163) * 0.7), a = fract(t * 0.6 + o.R(i, 164)); c.fillStyle = rgba('#cfe4ff', 0.7 * (1 - a)); c.beginPath(); c.arc(x, (14 + a * h * 0.8) * 1, 1.4 * S, 0, TAU); c.fill(); }
    const vg = c.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); c.fillStyle = vg; c.fillRect(-w, -h, w * 3, h * 3);
  },
  storm(c, w, h, t, o, p) {
    const S = o.S, fl = Math.max(0, 1 - fract(t / 2.6 + 0.3) * 12);
    c.fillStyle = `rgba(220,230,255,${0.25 * fl})`; c.fillRect(-w, -h, w * 3, h * 3);
    c.strokeStyle = rgba('#c8d4e8', 0.22); c.lineWidth = 1 * S; c.beginPath();
    for (let i = 0; i < 40; i++) { const y = fract(o.R(i, 171) + t * (1 + o.R(i, 172) * 0.4)) * (h + 20) - 10, x = o.R(i, 173) * (w + 30) - y * 0.2; c.moveTo(x, y); c.lineTo(x - 2 * S, y + 10 * S); } c.stroke();
    c.fillStyle = mixc(p.top, '#0a0e16', 0.25); for (let i = 0; i < 10; i++) { const x = fract(i / 10 + t * 0.015) * (w + 60 * S) - 30 * S; c.beginPath(); c.arc(x, (4 + Math.sin(i * 2.1) * 6) * S, (22 + (i % 3) * 6) * S, 0, TAU); c.fill(); }
    ridge(c, w, h, h * 0.92, 4 * S, 0.02, 1, p.sh(0.4));
  },
  volcanic(c, w, h, t, o, p) {
    const S = o.S, vx = w * 0.82, top = h * 0.42;
    soft(c, vx, top, 50 * S, '#ff6a1a', 0.45 + Math.sin(t * 3) * 0.08);
    c.fillStyle = p.sh(0.45, '#2a1410'); c.beginPath(); c.moveTo(vx - w * 0.3, h * 1.2); c.lineTo(vx - 10 * S, top); c.lineTo(vx + 10 * S, top); c.lineTo(vx + w * 0.3, h * 1.2); c.fill();
    for (let i = 0; i < 26; i++) { const y = fract(o.R(i, 181) + t * 0.08) * h, x = o.R(i, 182) * w + Math.sin(t + i) * 6 * S; c.fillStyle = rgba('#d8c8c0', 0.35); c.fillRect(x, y, 1.4 * S, 1.4 * S); }
    ridge(c, w, h, h * 0.94, 3 * S, 0.03, 2, p.sh(0.55, '#1a0c08'));
  },
};

// where the ingredient stands in each motif [x, y, size] and the corner the stamp lands in
const LAY = {
  petals: [0.5, 0.55, 1.25, 'tl'], counter: [0.86, 0.62, 0.85, 'tl'], bees: [0.84, 0.66, 1, 'tl'], butterflies: [0.5, 0.56, 1.1, 'tl'],
  moon: [0.5, 0.66, 0.95, 'tl'], sun: [0.18, 0.62, 0.95, 'tr'], hands: [0.75, 0.6, 0.62, 'tl'], coins: [0.5, 0.32, 0.95, 'bl'],
  crown: [0.5, 0.6, 1.05, 'tl'], ship: [0.5, 0.5, 0.6, 'tl'], treasure: [0.5, 0.5, 0.85, 'tl'], scroll: [0.86, 0.72, 0.8, 'br'],
  pyramid: [0.3, 0.28, 0.75, 'br'], smoke: [0.22, 0.62, 1, 'tr'], fire: [0.82, 0.64, 0.9, 'tl'], tears: [0.84, 0.64, 0.95, 'tl'],
  tree: [0.58, 0.72, 0.8, 'tl'], roots: [0.82, 0.18, 0.7, 'bl'], clock: [0.9, 0.24, 0.7, 'bl'], waves: [0.5, 0.42, 0.95, 'tl'],
  whale: [0.88, 0.32, 0.8, 'tl'], animal: [0.82, 0.68, 0.85, 'tl'], molecule: [0.86, 0.62, 0.85, 'tl'], potion: [0.82, 0.64, 0.9, 'tl'],
  hearts: [0.8, 0.6, 0.9, 'tl'], music: [0.5, 0.74, 0.9, 'tl'], lightning: [0.5, 0.76, 0.95, 'tl'], snow: [0.8, 0.68, 0.9, 'tl'],
  mountain: [0.8, 0.72, 0.9, 'tl'], desert: [0.72, 0.6, 0.75, 'tl'], rain: [0.5, 0.76, 0.95, 'bl'], volcano: [0.86, 0.74, 0.8, 'tl'],
  wind: [0.5, 0.5, 1, 'bl'], compass: [0.5, 0.6, 0.62, 'tr'], rocket: [0.68, 0.5, 0.7, 'tl'], sparkle: [0.5, 0.55, 1.2, 'tl'],
  crystals: [0.86, 0.62, 0.85, 'tl'], fireflies: [0.5, 0.6, 1, 'tl'], leaves: [0.5, 0.52, 1.05, 'tl'], medal: [0.8, 0.64, 0.9, 'tl'],
  skull: [0.84, 0.66, 0.85, 'tl'], swords: [0.14, 0.66, 0.85, 'tr'], spiral: [0.5, 0.5, 0.95, 'tl'], film: [0.86, 0.5, 0.85, 'tl'],
  book: [0.5, 0.3, 0.75, 'tl'], lab: [0.88, 0.3, 0.75, 'bl'],
};
const HERO = 88;
function heroImg(c, o, x, y, size, rot = 0, sx = 1, sy = 1, a = 1) {
  if (a <= 0 || size <= 0) return;
  c.save(); c.globalAlpha *= a; c.translate(x, y); c.rotate(rot); c.scale(sx, sy);
  const img = o.img;
  if (img && img.complete && img.naturalWidth) c.drawImage(img, -size / 2, -size / 2, size, size);
  else { soft(c, 0, 0, size * 0.45, o.col, 0.45); c.fillStyle = o.col; glyph(c, o.shape, size / 18); c.fill(); }
  c.restore();
}
// how the ingredient moves: returns position, rotation, squash and opacity around its anchor
function heroPose(act, t, ax, ay, w, h, S, size) {
  let x = ax, y = ay, r = 0, sx = 1, sy = 1, a = 1, s = 1, k;
  switch (act) {
    case 'drop': { const u = t / 1.15; y = lerp(-size, ay, bounce(u)); const imp = Math.max(0, 1 - Math.abs(u - 0.364) * 12) + 0.5 * Math.max(0, 1 - Math.abs(u - 0.727) * 14); sx = 1 + 0.22 * imp; sy = 1 - 0.2 * imp; y += size * 0.1 * imp; break; }
    case 'rise': k = easeOut(t / 1.2); y = lerp(h + size, ay, k) + (t > 1.2 ? Math.sin((t - 1.2) * 2) * 2.5 * S : 0); a = clamp01(t * 3); break;
    case 'float': k = easeOut(t / 0.9); a = k; y = ay + Math.sin(t * 1.8) * 5 * S + (1 - k) * 12 * S; r = Math.sin(t * 1.2) * 0.09; s = lerp(0.8, 1, k); break;
    case 'sail': k = easeOut(t / 2); x = lerp(-size, ax, k); y = ay + Math.sin(t * 2.4) * 5 * S; r = Math.cos(t * 2.4) * 0.15; break;
    case 'spin': { k = easeOut(t / 1.7); sx = Math.cos((1 - k) * TAU * 4); s = easeBack(t / 0.45); a = clamp01(t * 4); y = ay - (1 - k) * 12 * S; break; }
    case 'orbit': { const ang = t * 1.3 - 1.2; x = w / 2 + Math.cos(ang) * w * 0.36; y = h * 0.52 + Math.sin(ang) * h * 0.28; s = 0.78 + 0.16 * Math.sin(ang); a = clamp01(t * 2); r = Math.cos(ang) * 0.15; break; }
    case 'grow': k = Math.max(0, easeBack((t - 0.15) / 0.9)); s = k; y = ay + size * (1 - k) * 0.42; r = Math.sin(t * 1.4) * 0.05 * k; break;
    case 'swing': { const L = Math.max(10 * S, ay + 6 * S) * easeOut(t / 0.7), ang = 0.85 * Math.exp(-t * 0.5) * Math.cos(t * 2.6) + Math.sin(t * 1.2) * 0.05; x = ax + Math.sin(ang) * L; y = -6 * S + Math.cos(ang) * L; r = -ang * 0.9; break; }
    case 'pulse': s = easeBack(t / 0.5) * (1 + 0.13 * Math.exp(-((t % 1.05) * 9)) + 0.07 * Math.exp(-(((t + 0.8) % 1.05) * 9))); break;
    case 'shake': { s = easeBack(t / 0.4); const j = t * 37; x = ax + (Math.sin(j * 1.7) + Math.sin(j * 2.9)) * 1.6 * S; y = ay + Math.cos(j * 2.3) * 1.4 * S; r = Math.sin(j * 3.1) * 0.06; break; }
    case 'peek': { const ex = w + size * 0.32; k = t < 0.9 ? easeOut(t / 0.5) * 0.42 : t < 1.4 ? lerp(0.42, 0.18, easeInOut((t - 0.9) / 0.3)) : lerp(0.18, 1, easeBack((t - 1.4) / 0.6)); x = lerp(ex, ax, k); r = (1 - clamp01(k)) * -0.4; y = ay + Math.sin(t * 2) * 2 * S; break; }
    case 'tumble': k = easeOut(t / 1.5); x = lerp(-size, ax, k); r = (x - ax) / (size * 0.45); y = ay - Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * 16 * S; break;
    case 'zoom': k = easeOut(t / 0.75); x = lerp(w / 2, ax, k); y = lerp(h * 0.45, ay, k); s = Math.max(0.05, easeBack(t / 0.75)); r = (1 - k) * 0.6; break;
    case 'glide': { const u = clamp01(t / 1.8); k = easeInOut(u); x = lerp(-size, ax, k); y = lerp(h * 0.2, ay, k) - Math.sin(u * Math.PI) * h * 0.18 + Math.sin(t * 3) * 3 * S; r = (1 - u) * 0.25 * Math.sin(t * 5); break; }
    default: a = clamp01(t * 3);
  }
  return { x, y, r, sx, sy, a, s };
}
// accent particles laid over the scene, tinted with the fact's colour
function accent(c, kind, w, h, t, o, tint) {
  const S = o.S, R = (i, k) => o.R(i, 200 + k);
  const ink = o.dark ? mixc(tint, '#ffffff', 0.35) : tint;
  if (kind === 'none' || !kind) return;
  for (let i = 0, N = o.v?.n || 16; i < N; i++) {
    const fall = fract(R(i, 0) + t * (0.12 + R(i, 1) * 0.12)), rise = 1 - fall, x0 = R(i, 2) * w, sw = Math.sin(t * (1 + R(i, 3)) + i * 2) * 10 * S, a = Math.sin(fall * Math.PI);
    c.save(); c.globalAlpha = a;
    switch (kind) {
      case 'sparkles': { const b = Math.max(0, Math.sin(t * (2 + R(i, 4) * 2) + i * 1.7)); c.globalAlpha = b; c.fillStyle = i % 3 ? ink : '#ffffff'; c.beginPath(); star4(c, R(i, 5) * w, R(i, 6) * h, 6 * S * b); c.fill(); break; }
      case 'hearts': c.fillStyle = mixc(ink, '#ff5d7d', 0.4); c.beginPath(); heart(c, x0 + sw, rise * (h + 20) - 10, (3 + R(i, 4) * 3) * S); c.fill(); break;
      case 'notes': { const y = rise * (h + 20) - 10; c.fillStyle = c.strokeStyle = ink; c.lineWidth = 1.2 * S; c.beginPath(); c.ellipse(x0 + sw, y, 3.2 * S, 2.3 * S, -0.4, 0, TAU); c.fill(); c.beginPath(); c.moveTo(x0 + sw + 3 * S, y); c.lineTo(x0 + sw + 3 * S, y - 11 * S); c.lineTo(x0 + sw + 7 * S, y - 8 * S); c.stroke(); break; }
      case 'snow': c.fillStyle = o.dark ? '#ffffff' : mixc(ink, '#ffffff', 0.5); c.beginPath(); c.arc(x0 + sw, fall * (h + 10) - 5, (1 + R(i, 4) * 1.8) * S, 0, TAU); c.fill(); break;
      case 'embers': c.globalCompositeOperation = o.dark ? 'lighter' : 'source-over'; c.fillStyle = ['#ffb02e', '#ff6a1c', mixc(ink, '#ffb02e', 0.5)][i % 3]; c.beginPath(); c.arc(x0 + sw * 0.6, rise * (h + 10), (1 + R(i, 4) * 1.6) * S, 0, TAU); c.fill(); break;
      case 'bubbles': c.strokeStyle = o.dark ? 'rgba(255,255,255,.7)' : ink; c.lineWidth = 1 * S; c.beginPath(); c.arc(x0 + sw * 0.5, rise * (h + 16) - 8, (2 + R(i, 4) * 4) * S, 0, TAU); c.stroke(); break;
      case 'petals': c.translate(x0 + sw, fall * (h + 20) - 10); c.rotate(t * (R(i, 4) - 0.5) * 4 + i); c.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i))); c.fillStyle = mixc(ink, '#ffffff', 0.3 + R(i, 5) * 0.3); c.beginPath(); c.ellipse(0, 0, 4 * S, 2.4 * S, 0, 0, TAU); c.fill(); break;
      case 'leaves': c.translate(x0 + sw * 1.5, fall * (h + 20) - 10); c.rotate(t * (R(i, 4) - 0.5) * 3 + i); c.fillStyle = mixc(['#5a9a45', '#c9a23a', '#b8642e'][i % 3], ink, 0.3); glyph(c, 'leaf', 1.1 * S); c.fill(); break;
      case 'dust': c.globalAlpha = 0.5 * a; c.fillStyle = o.dark ? '#f0e4c8' : mixc(ink, '#6a5a40', 0.4); c.beginPath(); c.arc(fract(R(i, 4) + t * 0.05 * (1 + R(i, 5))) * w, R(i, 6) * h + Math.sin(t + i) * 6 * S, (0.8 + R(i, 7)) * S, 0, TAU); c.fill(); break;
      case 'stars': { const b = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + R(i, 4)) + i)); c.globalAlpha = b; c.fillStyle = i % 2 ? ink : '#ffe9a0'; c.beginPath(); starN(c, R(i, 5) * w, R(i, 6) * h, 4 * S, 1.8 * S, 5, t * 0.5 + i); c.fill(); break; }
      case 'drops': { const y = fract(R(i, 0) + t * (0.5 + R(i, 1) * 0.3)) * (h + 20) - 10; c.globalAlpha = 0.8; c.fillStyle = o.dark ? mixc(ink, '#ffffff', 0.4) : ink; c.save(); c.translate(x0, y); glyph(c, 'tear', 0.7 * S); c.fill(); c.restore(); break; }
      case 'confetti': c.translate(x0 + sw, fall * (h + 20) - 10); c.rotate(t * 5 * (R(i, 4) - 0.5) + i); c.scale(1, Math.abs(Math.cos(t * 7 + i))); c.fillStyle = [ink, '#ffd560', '#4cc9f0', '#f72585'][i % 4]; c.fillRect(-3 * S, -1.8 * S, 6 * S, 3.6 * S); break;
      case 'motes': { c.globalAlpha = 1; const x = R(i, 4) * w + Math.sin(t * (0.4 + R(i, 5) * 0.5) + i) * 18 * S, y = R(i, 6) * h + Math.cos(t * (0.3 + R(i, 7) * 0.4) + i) * 10 * S, b = 0.3 + 0.7 * Math.abs(Math.sin(t * (0.8 + R(i, 8)) + i)); c.globalCompositeOperation = o.dark ? 'lighter' : 'source-over'; soft(c, x, y, 7 * S, ink, 0.5 * b); c.fillStyle = o.dark ? `rgba(255,255,230,${b})` : rgba(ink, b); c.beginPath(); c.arc(x, y, 1.3 * S, 0, TAU); c.fill(); break; }
      case 'feathers': c.translate(x0 + sw * 2, fall * (h + 24) - 12); c.rotate(Math.sin(t * 1.6 + i) * 0.8); c.fillStyle = o.dark ? '#f2ede4' : mixc(ink, '#ffffff', 0.45); c.beginPath(); c.ellipse(0, 0, 2.4 * S, 8 * S, 0, 0, TAU); c.fill(); c.strokeStyle = rgba(o.ink, 0.35); c.lineWidth = 0.6 * S; c.beginPath(); c.moveTo(0, -8 * S); c.lineTo(0, 9 * S); c.stroke(); break;
      case 'zap': { if (Math.sin(t * 11 + i * 2.3) < 0.55) break; c.globalAlpha = 1; const x = R(i, 4) * w, y = R(i, 5) * h; c.strokeStyle = i % 2 ? '#ffffff' : mixc(ink, '#fff27a', 0.4); c.lineWidth = 1.4 * S; c.beginPath(); c.moveTo(x, y); for (let k = 1; k < 4; k++) c.lineTo(x + (k % 2 ? 4 : -3) * S, y + k * 5 * S); c.stroke(); break; }
    }
    c.restore();
  }
}
function camera(c, w, h, t, kind, shake, S) {
  let s = 1, dx = 0, dy = 0, r = 0; const k = easeInOut(clamp01(t / 5));
  switch (kind) {
    case 'push': s = 1 + 0.09 * k; break;
    case 'pull': s = 1.12 - 0.09 * k; break;
    case 'panL': s = 1.09; dx = lerp(14, -14, k) * S; break;
    case 'panR': s = 1.09; dx = lerp(-14, 14, k) * S; break;
    case 'tilt': s = 1.09; dy = lerp(-9, 7, k) * S; break;
    case 'drift': s = 1.07; dx = Math.sin(t * 0.6) * 7 * S; dy = Math.cos(t * 0.45) * 3.5 * S; break;
    case 'dutch': s = 1.13; r = -0.055 + Math.sin(t * 0.5) * 0.012; break;
    case 'sway': s = 1.09; r = Math.sin(t * 1.1) * 0.03; dy = Math.sin(t * 1.1 + 1) * 2 * S; break;
  }
  dx += Math.sin(t * 93) * shake; dy += Math.cos(t * 71) * shake;
  c.translate(w / 2 + dx, h / 2 + dy); c.rotate(r); c.scale(s, s); c.translate(-w / 2, -h / 2);
}
// the rubber-stamp caption that slams down on the beat
function stampDraw(c, w, h, t, o, sc, rarity) {
  const u = (t - sc.tc) / 0.2; if (u < 0 || !sc.stamp) return;
  const S = o.S, legend = rarity === 'legendary', fs = Math.max(10, 13 * S);
  c.save(); c.font = `900 ${fs}px ${o.font}`; if ('letterSpacing' in c) c.letterSpacing = `${1.6 * S}px`;
  const tw = c.measureText(sc.stamp).width, bw = tw + 18 * S, bh = fs * 1.9, m = 9 * S;
  const cx = sc.corner[1] === 'l' ? m + bw / 2 : w - m - bw / 2, cy = sc.corner[0] === 't' ? m + bh / 2 + 2 * S : h - m - bh / 2 - 2 * S;
  const sl = u < 1 ? lerp(2.5, 1, u * u) : 1 + 0.07 * Math.exp(-(u - 1) * 3) * Math.sin((u - 1) * 9);
  if (u > 1 && u < 4) {
    const k = (u - 1) / 3;
    for (let i = 0; i < 14; i++) { const a = o.R(i, 300) * TAU, d = (bw * 0.4 + k * 30 * S), px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.45; c.fillStyle = rgba(o.dark ? '#ffffff' : '#7a6a50', 0.45 * (1 - k)); c.beginPath(); c.arc(px, py, (1 + o.R(i, 301) * 2) * S * (1 - k * 0.5), 0, TAU); c.fill(); }
  }
  c.translate(cx, cy); c.rotate(sc.rot); c.scale(sl, sl); c.globalAlpha = clamp01(u * 2.5);
  const tint = legend ? '#c98a0c' : sc.tint, ink = o.dark ? mixc(tint, '#ffffff', 0.4) : mixc(tint, '#000000', 0.12);
  c.fillStyle = o.dark ? 'rgba(22,20,17,.82)' : 'rgba(255,252,244,.88)'; rr(c, -bw / 2, -bh / 2, bw, bh, 5 * S); c.fill();
  if (legend || rarity === 'epic') { c.shadowColor = legend ? '#ffcf40' : '#c084fc'; c.shadowBlur = 12 * S; }
  let fill = ink;
  if (legend) { const g = c.createLinearGradient(-bw / 2, 0, bw / 2, 0); g.addColorStop(0, '#b8780a'); g.addColorStop(0.5, o.dark ? '#ffe9a0' : '#e8a91c'); g.addColorStop(1, '#b8780a'); fill = g; }
  c.strokeStyle = fill; c.lineWidth = 2 * S; rr(c, -bw / 2, -bh / 2, bw, bh, 5 * S); c.stroke(); c.shadowBlur = 0;
  if (RIDX[rarity] >= 1) { c.lineWidth = 0.8 * S; rr(c, -bw / 2 + 3 * S, -bh / 2 + 3 * S, bw - 6 * S, bh - 6 * S, 3 * S); c.stroke(); }
  c.fillStyle = fill; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(sc.stamp, 0, fs * 0.04);
  if (RIDX[rarity] >= 2) { c.fillStyle = fill; for (const s of [-1, 1]) { c.beginPath(); legend ? starN(c, s * (bw / 2 - 1 * S), 0, 4 * S, 1.7 * S, 5) : c.arc(s * (bw / 2), 0, 1.8 * S, 0, TAU); c.fill(); } }
  c.fillStyle = o.dark ? 'rgba(22,20,17,.55)' : 'rgba(255,252,244,.6)';
  for (let i = 0; i < 30; i++) { c.beginPath(); c.arc((o.R(i, 310) - 0.5) * bw, (o.R(i, 311) - 0.5) * bh, (0.4 + o.R(i, 312) * 0.9) * S, 0, TAU); c.fill(); }
  c.restore();
}
const RIDX = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
export const SETTINGS = Object.keys(SET);
// every card also gets small variations of its own, seeded by the fact, so no two play quite alike: mirrored or not
// (never for motifs that write numbers or words), a touch faster or slower, its own sky tint, the ingredient a little
// larger or smaller and off its usual spot, and a sparser or busier fall of accent particles
const TEXTY = new Set(['counter', 'clock', 'compass', 'book', 'scroll', 'lab']);
function variant(R, fx) {
  return { flip: !TEXTY.has(fx) && R(1, 901) < 0.5, speed: 0.86 + R(2, 901) * 0.28, hue: R(3, 901), size: 0.88 + R(4, 901) * 0.24, dx: (R(5, 901) - 0.5) * 0.08, dy: (R(6, 901) - 0.5) * 0.06, n: 9 + Math.floor(R(7, 901) * 14) };
}
// draws one frame of a whole scene: backdrop, motif, hero, accents under the camera, then the beat and the stamp
function drawScene(c, w, h, t, m, f, sc, rarity, themeDark) {
  const v = m.v || { speed: 1, hue: 0.4, size: 1, dx: 0, dy: 0 };
  t *= v.speed;
  const S = m.S, ri = RIDX[rarity] || 0, beat = t - sc.tc - 0.2;
  const p = palette(sc.setting, f.fx, themeDark, m.col, v.hue);
  m.dark = p.dark; m.ink = p.dark ? '#f4f1ea' : '#24211d'; m.hero = true; m.anchor = null; m.heroOwn = false; m.post = null; m.meter = sc.meter;
  const shake = beat > 0 && beat < 0.4 ? (1.2 + ri * 0.9) * S * (1 - beat / 0.4) : 0;
  c.save(); camera(c, w, h, t, sc.camera, shake, S);
  if (v.flip) { c.translate(w, 0); c.scale(-1, 1); }
  backdrop(c, w, h, p); (SET[sc.setting] || SET.noon)(c, w, h, t, m, p);
  skyOff = true; try { (M[f.fx] || M.sparkle)(c, w, h, t, m); } finally { skyOff = false; }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.shadowBlur = 0; c.lineCap = 'butt'; c.setLineDash([]);
  const L = LAY[f.fx] || [0.82, 0.62, 0.9, 'tl'], size = HERO * S * (m.anchor?.[2] ?? L[2]) * (m.anchor ? 1 : v.size);
  const ax = m.anchor ? m.anchor[0] : (L[0] + v.dx) * w, ay = m.anchor ? m.anchor[1] : (L[1] + v.dy) * h;
  let hp = null;
  if (!m.heroOwn) {
    hp = heroPose(m.anchor?.[3] || sc.hero, t, ax, ay, w, h, S, size);
    if (beat > 0 && beat < 0.5) { const u = Math.sin(beat / 0.5 * Math.PI); hp.y -= u * 9 * S; hp.sx *= 1 + 0.08 * u; hp.sy *= 1 - 0.06 * u; }
    if (sc.hero === 'swing' && !m.anchor?.[3]) { c.strokeStyle = rgba(m.ink, 0.55); c.lineWidth = 1.2 * S; c.beginPath(); c.moveTo(ax, -6 * S); c.lineTo(hp.x, hp.y - size * 0.3 * hp.s); c.stroke(); }
    if (sc.hero === 'zoom' && t < 0.75) for (let g = 3; g > 0; g--) { const q = heroPose('zoom', t - g * 0.05, ax, ay, w, h, S, size); heroImg(c, m, q.x, q.y, size * q.s, q.r, q.sx, q.sy, 0.18 * q.a); }
    if (['drop', 'grow', 'tumble', 'rise'].includes(sc.hero) && !m.anchor) { const gy = ay + size * 0.36, near = clamp01(1 - Math.abs(hp.y - ay) / (h * 0.6)); c.fillStyle = `rgba(0,0,0,${0.16 * near})`; c.beginPath(); c.ellipse(hp.x, gy, size * 0.3 * hp.s * (0.6 + 0.4 * near), size * 0.06, 0, 0, TAU); c.fill(); }
    if (ri >= 2 && t > 0.6) { c.globalCompositeOperation = p.dark ? 'lighter' : 'source-over'; soft(c, hp.x, hp.y, size * 0.7 * hp.s, ri === 4 ? '#ffd560' : RARITY[rarity].col, (p.dark ? 0.25 : 0.18) * clamp01((t - 0.6) * 2)); c.globalCompositeOperation = 'source-over'; }
    heroImg(c, m, hp.x, hp.y, size * hp.s, hp.r, hp.sx, hp.sy, hp.a);
    if (sc.hero === 'shake' || sc.accent === 'zap') { c.strokeStyle = mixc(sc.tint, '#ffffff', 0.5); c.lineWidth = 1.2 * S; for (let i = 0; i < 4; i++) { if (Math.sin(t * 13 + i * 2.7) < 0.35) continue; const a = i * TAU / 4 + t * 2, r0 = size * 0.42; c.beginPath(); c.moveTo(hp.x + Math.cos(a) * r0, hp.y + Math.sin(a) * r0); for (let k = 1; k <= 3; k++) { const rr2 = r0 + k * 4 * S, j = (k % 2 ? 1 : -1) * 0.18; c.lineTo(hp.x + Math.cos(a + j) * rr2, hp.y + Math.sin(a + j) * rr2); } c.stroke(); } }
  }
  if (m.post) m.post(hp, size);
  accent(c, sc.accent, w, h, t, m, sc.tint);
  if (beat > 0 && beat < 0.9 && hp) { const k = easeOut(beat / 0.9); c.strokeStyle = rgba(ri === 4 ? '#ffd560' : sc.tint, 0.8 * (1 - k)); c.lineWidth = (2 + ri) * S * (1 - k); c.beginPath(); c.arc(hp.x, hp.y, size * 0.4 + k * (50 + ri * 14) * S, 0, TAU); c.stroke(); }
  c.restore();
  if (beat > 0 && beat < 0.3) { c.fillStyle = `rgba(255,255,255,${(0.1 + ri * 0.05) * (1 - beat / 0.3)})`; c.fillRect(0, 0, w, h); }
  stampDraw(c, w, h, t, m, sc, rarity);
}

// ── rarity auras (drawn around the card) ───────────────
function perim(b, u) {
  const P = 2 * (b.w + b.h); let d = fract(u) * P;
  if (d < b.w) return [b.x + d, b.y]; d -= b.w;
  if (d < b.h) return [b.x + b.w, b.y + d]; d -= b.h;
  if (d < b.w) return [b.x + b.w - d, b.y + b.h]; d -= b.w;
  return [b.x, b.y + b.h - d];
}
function aura(c, rarity, W, H, t, b, R) {
  const col = RARITY[rarity].col, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if (rarity === 'uncommon') {
    if (t < 1) { const k = easeOut(t); c.strokeStyle = rgba(col, 0.6 * (1 - k)); c.lineWidth = 3; rr(c, b.x - k * 26, b.y - k * 26, b.w + k * 52, b.h + k * 52, 16 + k * 20); c.stroke(); }
    for (let i = 0; i < 14; i++) { const a = Math.max(0, Math.sin(t * 2.2 + i * 1.9)), [x, y] = perim(b, R(i)); const ox = (R(i, 1) - 0.5) * 22, oy = (R(i, 2) - 0.5) * 22; c.fillStyle = rgba(mixc(col, '#ffffff', 0.4), a); c.beginPath(); star4(c, x + ox, y + oy, 6 * a); c.fill(); }
  } else if (rarity === 'rare') {
    c.save(); c.shadowColor = col; c.shadowBlur = 22 + Math.sin(t * 2.5) * 6; c.strokeStyle = rgba(col, 0.5); c.lineWidth = 2; rr(c, b.x, b.y, b.w, b.h, 16); c.stroke(); c.restore();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) for (let k = 0; k < 7; k++) { const [x, y] = perim(b, i / 8 + t * 0.07 - k * 0.004); const s = (7 - k) / 7; soft(c, x, y, 9 * s, mixc(col, '#ffffff', 0.25), 0.55 * s); }
    c.globalCompositeOperation = 'source-over';
  } else if (rarity === 'epic') {
    if (t < 1.2) {
      const k = easeOut(t / 1.2);
      c.save(); c.translate(cx, cy); c.strokeStyle = rgba(col, 0.7 * (1 - k)); c.lineWidth = 3;
      for (let i = 0; i < 28; i++) { const a = i * TAU / 28 + R(i) * 0.1, r0 = 40 + k * Math.max(b.w, b.h) * 0.45, r1 = r0 + 30 + R(i, 1) * 60 * (1 - k); c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.7); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.7); c.stroke(); }
      c.restore();
      for (let i = 0; i < 30; i++) { const a = R(i, 3) * TAU, sp = 140 + R(i, 4) * 180, tt = t, x = cx + Math.cos(a) * sp * tt, y = cy + Math.sin(a) * sp * tt * 0.7 + 160 * tt * tt; c.fillStyle = rgba(i % 2 ? col : '#f0abfc', 1 - k); c.beginPath(); c.arc(x, y, 2.5, 0, TAU); c.fill(); }
    }
    c.save(); c.shadowColor = col; c.shadowBlur = 26 + Math.sin(t * 3) * 10; c.strokeStyle = rgba(col, 0.55); c.lineWidth = 2; rr(c, b.x, b.y, b.w, b.h, 16); c.stroke(); c.restore();
    for (let i = 0; i < 10; i++) { const a = fract(t * 0.35 + R(i, 6)), [x] = perim(b, R(i, 7) * 0.25), y = b.y + b.h - a * (b.h + 40); c.fillStyle = rgba(mixc(col, '#ffffff', 0.3), Math.sin(a * Math.PI) * 0.8); c.beginPath(); star4(c, b.x - 10 + R(i, 8) * (b.w + 20), y, 4); c.fill(); void x; }
  } else if (rarity === 'legendary') {
    const on = clamp01((t - 0.75) / 0.5);
    if (on > 0) {
      c.save(); c.translate(cx, cy); c.rotate(t * 0.18); c.globalCompositeOperation = 'lighter';
      const L = Math.hypot(W, H);
      for (let i = 0; i < 16; i++) { c.rotate(TAU / 16); const g = c.createLinearGradient(0, 0, L * 0.5, 0); g.addColorStop(0, rgba('#ffd560', 0.32 * on)); g.addColorStop(1, rgba('#ffd560', 0)); c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(L * 0.5, -L * 0.04); c.lineTo(L * 0.5, L * 0.04); c.fill(); }
      c.restore(); c.globalCompositeOperation = 'source-over';
      c.save(); c.shadowColor = '#ffcf40'; c.shadowBlur = 30 + Math.sin(t * 3) * 10; c.strokeStyle = rgba('#ffcf40', 0.7 * on); c.lineWidth = 2; rr(c, b.x, b.y, b.w, b.h, 16); c.stroke(); c.restore();
    }
    if (t > 0.75 && t < 4) {
      const k = t - 0.75;
      for (let i = 0; i < 60; i++) {
        const a = -Math.PI / 2 + (R(i) - 0.5) * 2.4, sp = 260 + R(i, 1) * 260, x = cx + Math.cos(a) * sp * k * 0.6 + Math.sin(k * 6 + i) * 8, y = cy + Math.sin(a) * sp * k * 0.6 + 230 * k * k;
        if (y > H + 10) continue;
        c.save(); c.translate(x, y); c.rotate(k * 8 * (R(i, 2) - 0.5) + i); c.scale(1, Math.abs(Math.cos(k * 9 + i)));
        c.fillStyle = ['#ffd560', '#fff3c4', '#f0a81c', '#ffffff'][i % 4]; c.globalAlpha = clamp01(3.2 - k); c.fillRect(-4, -2.5, 8, 5); c.restore();
      }
      c.globalAlpha = 1;
    }
    for (let i = 0; i < 12; i++) { const a = Math.max(0, Math.sin(t * 2.6 + i * 1.7)) * on, [x, y] = perim(b, R(i, 9)); c.fillStyle = `rgba(255,236,160,${a})`; c.beginPath(); star4(c, x + (R(i, 5) - 0.5) * 30, y + (R(i, 6) - 0.5) * 30, 9 * a); c.fill(); }
  }
}

// ── the card ────────────────────────────────────────────
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const REVEAL = { common: 0, uncommon: 0, rare: 0.1, epic: 0.25, legendary: 0.85 };

// f: {title, fact, rarity, fx, arg, src}; o: {id, name, place, col, shape, isDark(), isNew, index, total, compact, still, scene}
export function factCard(f, o) {
  const rarity = RARITY[f.rarity] ? f.rarity : 'common', r = RARITY[rarity], legendary = rarity === 'legendary';
  const el = document.createElement('div');
  el.className = `fc fc-${rarity}${o.compact ? ' fc-compact' : ''}`;
  el.style.setProperty('--c', o.col); el.style.setProperty('--r', r.col);
  el.innerHTML = `${o.compact ? '' : '<canvas class="fc-aura" aria-hidden="true"></canvas>'}
    <div class="fc-flip"><div class="fc-card">
      <div class="fc-art"><canvas class="fc-cv" aria-hidden="true"></canvas>${o.compact || o.scene ? '' : '<span class="fc-thumb"></span>'}${o.compact && o.scene && !o.still ? '<button class="fc-replay" type="button" aria-label="Replay the animation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Replay</button>' : ''}</div>
      <div class="fc-body">
        <div class="fc-meta"><span class="fc-rar"><span class="fc-pips">${'<i></i>'.repeat(r.pips)}</span>${r.label} fact</span>${o.isNew ? '<span class="fc-new">New</span>' : ''}${o.total ? `<span class="fc-n mono">${o.index}/${o.total}</span>` : ''}</div>
        ${o.compact ? '' : `<span class="fc-ing">${esc(o.name)}${o.place ? ` · ${esc(o.place)}` : ''}</span>`}
        <b class="fc-title">${esc(f.title)}</b>
        <p class="fc-text">${esc(f.fact)}</p>
        ${f.src ? `<a class="fc-src mono" href="${esc(f.src)}" target="_blank" rel="noopener">Source: ${esc(hostOf(f.src))}</a>` : ''}
      </div>
      ${o.compact ? '' : '<div class="fc-timer"><i></i></div>'}
    </div>${legendary ? '<div class="fc-back"><span>★</span></div>' : ''}</div>
    ${legendary ? '<div class="fc-banner">Legendary</div>' : ''}`;
  const cv = el.querySelector('.fc-cv'), ctx = cv.getContext('2d'), av = el.querySelector('.fc-aura'), actx = av?.getContext('2d');
  // motifs ease in and out past their ends, where a radius can dip just below zero; clamp it rather than throw
  for (const c of [ctx, actx]) if (c) { const arc = c.arc, ell = c.ellipse; c.arc = (x, y, r, ...a) => arc.call(c, x, y, Math.max(0, r), ...a); c.ellipse = (x, y, rx, ry, ...a) => ell.call(c, x, y, Math.max(0, rx), Math.max(0, ry), ...a); }
  const R = rnd(hash(o.id || f.title)), font = getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'system-ui, sans-serif';
  const m = { col: o.col, arg: f.arg, shape: o.shape || 'drop', R, font, S: 1, v: variant(R, f.fx) };
  const draw = M[f.fx] || M.sparkle, delay = o.compact ? 0 : REVEAL[rarity];
  let sc = null;
  if (o.scene) {
    sc = { setting: 'noon', hero: 'float', accent: 'sparkles', camera: 'push', tint: o.col, ...o.scene };
    sc.tc = 1.25 + RIDX[rarity] * 0.2; sc.rot = (R(5, 333) - 0.5) * 0.22;
    const L = LAY[f.fx]; let cn = f.fx === 'counter' ? ({ odometer: 'tl', ruler: 'tl' }[sc.meter] || 'tr') : (L?.[3] || 'tl');
    if (L && f.fx !== 'counter' && cn === (L[1] < 0.5 ? 't' : 'b') + (L[0] < 0.5 ? 'l' : 'r')) cn = cn[0] + (cn[1] === 'l' ? 'r' : 'l');
    if (m.v.flip) cn = cn[0] + (cn[1] === 'l' ? 'r' : 'l'); // the scene is mirrored, so the stamp moves with the free side
    sc.corner = cn;
  }
  let raf = 0, t0 = 0, frozen = null;
  function fit(canvas, c2) {
    const w = canvas.clientWidth, h = canvas.clientHeight, d = Math.min(devicePixelRatio || 1, 2);
    if (!w || !h) return null;
    if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) { canvas.width = Math.round(w * d); canvas.height = Math.round(h * d); }
    c2.setTransform(d, 0, 0, d, 0, 0); c2.clearRect(0, 0, w, h); return [w, h];
  }
  function frame(now) {
    if (!el.isConnected && t0 && now - t0 > 500) { raf = 0; return; }
    const t = frozen ?? (now - t0) / 1000;
    const dark = o.isDark?.() ?? false;
    m.dark = dark; m.ink = dark ? '#f4f1ea' : '#24211d';
    const sz = fit(cv, ctx);
    if (sz) {
      const [w, h] = sz; m.S = Math.min(w / 320, h / 150);
      ctx.save(); if (sc) drawScene(ctx, w, h, Math.max(0, t - delay), m, f, sc, rarity, dark); else draw(ctx, w, h, Math.max(0, t - delay), m); ctx.restore();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.shadowBlur = 0;
    }
    if (av) {
      const az = fit(av, actx);
      if (az) { const pad = parseFloat(getComputedStyle(av).getPropertyValue('--pad')) || 70, card = el.querySelector('.fc-flip'); actx.save(); aura(actx, rarity, az[0], az[1], t, { x: pad, y: pad, w: card.offsetWidth, h: card.offsetHeight }, R); actx.restore(); }
    }
    if (frozen == null) raf = requestAnimationFrame(frame);
  }
  const replay = el.querySelector('.fc-replay');
  if (replay) el.querySelector('.fc-art').addEventListener('click', () => { t0 = performance.now(); replay.classList.remove('show'); if (!raf) raf = requestAnimationFrame(frame); });
  if (replay) { const iv = setInterval(() => { if (!t0) return; if (!el.isConnected) { clearInterval(iv); return; } replay.classList.toggle('show', (performance.now() - t0) / 1000 > (sc?.tc ?? 2) + 1.2); }, 400); }
  return {
    el,
    duration: (REVEAL[rarity] + 2.6 + f.fact.length * 0.045) * 1000,
    start() { if (o.still) { frozen = 3.2; t0 = performance.now(); frame(t0); return; } t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); el.classList.add('in'); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    setThumb(url) {
      if (!url) return;
      const th = el.querySelector('.fc-thumb'); if (th) th.style.backgroundImage = `url(${url})`;
      const img = new Image(); img.onload = () => { m.img = img; if (frozen != null) frame(performance.now()); }; img.src = url;
    },
  };
}

// for the motif contact sheet in tests
export function drawMotif(ctx, fx, w, h, t, o) {
  const m = { col: o.col, arg: o.arg, shape: o.shape || 'drop', R: rnd(hash(o.id || fx)), font: 'system-ui, sans-serif', S: Math.min(w / 320, h / 150), dark: !!o.dark, ink: o.dark ? '#f4f1ea' : '#24211d', img: o.img };
  m.v = variant(m.R, fx);
  if (o.scene) {
    const rarity = o.rarity || 'common', sc = { setting: 'noon', hero: 'float', accent: 'sparkles', camera: 'push', tint: o.col, ...o.scene, tc: 1.25 + RIDX[rarity] * 0.2, rot: (m.R(5, 333) - 0.5) * 0.22 };
    const L = LAY[fx]; let cn = fx === 'counter' ? ({ odometer: 'tl', ruler: 'tl' }[sc.meter] || 'tr') : (L?.[3] || 'tl');
    if (L && fx !== 'counter' && cn === (L[1] < 0.5 ? 't' : 'b') + (L[0] < 0.5 ? 'l' : 'r')) cn = cn[0] + (cn[1] === 'l' ? 'r' : 'l');
    if (m.v.flip) cn = cn[0] + (cn[1] === 'l' ? 'r' : 'l');
    sc.corner = cn; ctx.save(); drawScene(ctx, w, h, t, m, { fx }, sc, rarity, !!o.dark); ctx.restore(); return;
  }
  ctx.save(); (M[fx] || M.sparkle)(ctx, w, h, t, m); ctx.restore();
}
