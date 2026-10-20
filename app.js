// cobe draws its land dots with a fixed radius (and indexes at most 32,768 samples); when the source can be patched,
// the radius shrinks with zoom so dots stay small on screen
const COBE_URL = 'https://cdn.jsdelivr.net/npm/cobe@2.0.1/dist/index.esm.js';
let cobeReady = null; // one load of the (patched) library
async function loadCobe() {
  try {
    const src = await (await fetch(COBE_URL)).text();
    const patched = src.replace('smoothstep(8e-3,0.,g)', 'smoothstep(6e-3/max(x,1.),0.,g)'); // x is the zoom: constant on-screen dot size
    if (patched === src) throw new Error('cobe shader changed');
    const url = URL.createObjectURL(new Blob([patched], { type: 'text/javascript' }));
    const m = await import(url); URL.revokeObjectURL(url); fineDots = true; return m.default;
  } catch { return (await import('cobe')).default; }
}
let fineDots = false;
import { INGREDIENTS, FRAGRANCES, FAMILIES, HOUSES, noteId } from './data.js';
import { createVignette } from './fx.js';
import { createWorldLayer } from './world.js';
import { FACTS, LEGACY_TIER } from './facts.js';
import { RARITY, RARITIES } from './rarity.js';
import { letters, cascade, countUp, replay, burst } from './motion.js';

const $ = (s) => document.querySelector(s);
const ING = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
const FRAG = Object.fromEntries(FRAGRANCES.map((f) => [f.id, f]));
const DEG = Math.PI / 180;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// usage index: ingredient → [{fragrance, tier}]
const USES = Object.fromEntries(INGREDIENTS.map((i) => [i.id, []]));
for (const f of FRAGRANCES) for (const tier of ['top', 'heart', 'base']) {
  const seen = new Set();
  for (const n of f.tiers[tier]) { const id = noteId(n); if (id && !seen.has(id)) { seen.add(id); if (!USES[id].some((u) => u.f === f)) USES[id].push({ f, tier }); } }
}

const MOTION = { citrus: 'ripple', floral: 'bloom', green: 'wave', fruit: 'ripple', spice: 'flicker', wood: 'spin', resin: 'rise', gourmand: 'rise', animalic: 'wave', marine: 'wave' };
const famHex = (fam) => '#' + FAMILIES[fam].color.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
// each ingredient's own signature color: its most vivid palette swatch
const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (a) => '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
function vividness(h) { const [r, g, b] = hexRgb(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510; return (mx - mn) / 255 * (1 - Math.abs(l - 0.55)); }
const ING_COLOR = {};
for (const i of INGREDIENTS) ING_COLOR[i.id] = i.c.slice().sort((a, b) => vividness(b) - vividness(a))[0];
const ingHex = (ing) => ING_COLOR[ing.id];
const ingRgb = (ing) => hexRgb(ING_COLOR[ing.id]).map((v) => v / 255);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const listText = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

function haversine([la1, lo1], [la2, lo2]) {
  const a = Math.sin(((la2 - la1) * DEG) / 2) ** 2 + Math.cos(la1 * DEG) * Math.cos(la2 * DEG) * Math.sin(((lo2 - lo1) * DEG) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// ── theme ────────────────────────────────────────────────
const root = document.documentElement;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
// light, dark or follow the system; the choice is remembered in this browser
const themeSeg = $('#theme'), themePill = themeSeg.querySelector('.theme-pill');
function setTheme(v, save = true) {
  if (v === 'auto') delete root.dataset.theme; else root.dataset.theme = v;
  themeSeg.dataset.v = v;
  for (const b of themeSeg.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.themeV === v));
  placeThemePill();
  if (save) try { localStorage.setItem('noteguessr:theme', v); } catch {}
}
function placeThemePill() {
  const b = themeSeg.querySelector('[aria-checked="true"]'); if (!b) return;
  themePill.style.width = b.offsetWidth + 'px'; themePill.style.transform = `translateX(${b.offsetLeft - 3}px)`;
}
themeSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTheme(b.dataset.themeV); });
let savedTheme = 'auto'; try { savedTheme = localStorage.getItem('noteguessr:theme') || 'auto'; } catch {}
setTheme(['light', 'dark', 'auto'].includes(savedTheme) ? savedTheme : 'auto', false);
new ResizeObserver(placeThemePill).observe(themeSeg);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyGlobeTheme(); refreshThemed(); });
new MutationObserver(() => { applyGlobeTheme(); refreshThemed(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
// the 3D studio and bottle thumbnails are lit for the current theme
function refreshThemed() {
  if (tab === 'frag') { const y = listEl.scrollTop; renderList(); listEl.scrollTop = y; }
  const h = detailEl.querySelector('#hero');
  if (h && sel.ing) heroFor('ing', h, { vig: sel.ing, ing: sel.ing });
  else if (h && sel.frag) heroFor('frag', h, { f: sel.frag, liquid: liquidFor(sel.frag) });
}

// ── globe state ──────────────────────────────────────────
const stage = $('#stage'), wrap = $('#globe-wrap'), canvas = $('#globe'), labelsEl = $('#labels'), tip = $('#tooltip');
const view = { phi: 3 * Math.PI / 2 - 10 * DEG, theta: 0.3, scale: 1, tPhi: null, tTheta: null, tScale: 1, vPhi: 0.0022, vTheta: 0 };
let W = 0, H = 0, globe = null, markerKey = '', autoSpin = true, idleTimer = 0;
const hidden = new Set(); // hidden families
const sel = { ing: null, frag: null };
// game mode: game.js takes over the globe's markers, arcs, clicks and overlay while active
const play = { active: false, ver: 0, markers: () => [], arcs: () => [], onPick: null, draw: null, onKey: null };

let fit = 1; // shrink the globe on narrow stages so it fits the width
function size() {
  const r = stage.getBoundingClientRect();
  W = Math.round(r.width); H = Math.round(r.height); fit = Math.min(1, (W / H) * 0.98);
}
size();

function themeOpts() {
  return isDark()
    ? { dark: 1, diffuse: 1.3, mapBrightness: 3.2, mapBaseBrightness: 0, baseColor: [0.31, 0.28, 0.26], glowColor: [0.2, 0.16, 0.12], markerColor: [0.88, 0.63, 0.4], arcColor: [0.88, 0.63, 0.4] }
    : { dark: 0, diffuse: 1.25, mapBrightness: 1.45, mapBaseBrightness: 0, baseColor: [1, 0.985, 0.96], glowColor: [1, 0.97, 0.92], markerColor: [0.66, 0.36, 0.2], arcColor: [0.66, 0.36, 0.2] };
}

// explore-mode ingredient dots are drawn on their own canvas (drawDots) so they sit exactly
// on their coordinates instead of snapping to cobe's dot grid; cobe only draws game markers
function markerList() {
  return play.active ? play.markers() : [];
}
function arcList() {
  if (play.active) return play.arcs();
  if (!sel.frag) return [];
  const to = HOUSES[sel.frag.house];
  return sel.frag.ingredients.filter((id) => !hidden.has(ING[id].family)).map((id) => ({ from: ING[id].loc, to, color: ingRgb(ING[id]) }));
}
function refreshMarkers(force) {
  const key = `${play.active}|${play.ver}|${play.active ? view.scale.toFixed(2) : ''}|${sel.frag?.id}|${[...hidden]}|${isDark()}`;
  if (!force && key === markerKey) return null;
  markerKey = key;
  return { markers: markerList(), arcs: arcList() };
}

// adaptive quality: when the globe can't keep up (a slow GPU, a big high-DPI screen) its three canvases
// drop to fewer pixels, a step at a time, judged on the median frame so one-off stalls don't count
const QUALITY = [1, 0.75, 0.55];
let qLevel = 0, qTimes = [], qFrom = performance.now() + 5000, globeDpr = 1;
const renderDpr = () => Math.max(0.75, Math.min(devicePixelRatio || 1, 2) * QUALITY[qLevel]);
const globeSize = () => ({ width: W * renderDpr() / globeDpr, height: H * renderDpr() / globeDpr });
function watchFrames(now, ms) {
  if (now < qFrom || document.hidden || qLevel >= QUALITY.length - 1) return;
  qTimes.push(ms); if (qTimes.length < 90) return;
  const median = qTimes.sort((a, b) => a - b)[45]; qTimes = [];
  if (median > 26) { qLevel++; world.resize(); resizeDots(); globe?.update(globeSize()); qFrom = now + 2500; }
}
async function initGlobe() {
  const createGlobe = await (cobeReady ||= loadCobe());
  globeDpr = renderDpr();
  globe = createGlobe(canvas, {
    devicePixelRatio: globeDpr, width: W, height: H, phi: view.phi, theta: view.theta, scale: view.scale * fit,
    mapSamples: fineDots ? 32000 : 20000, ...themeOpts(), markers: markerList(), arcs: [], arcWidth: 0.6, arcHeight: 0.28, markerElevation: 0.01, opacity: 0.95,
  });
  requestAnimationFrame(() => canvas.classList.add('ready'));
  requestAnimationFrame(tick);
}
function applyGlobeTheme() {
  glow.cur = glow.base = null;
  if (sel.ing) setTint(ingHex(sel.ing), sel.ing.c); else if (sel.frag) setTint(fragHex(sel.frag));
  if (globe) globe.update({ ...themeOpts(), ...refreshMarkers(true) });
}

// project lat/lng to stage pixels, mirroring cobe's own projection
function U([lat, lng]) {
  const r = lat * DEG, a = lng * DEG - Math.PI, o = Math.cos(r);
  return [-o * Math.cos(a), Math.sin(r), o * Math.sin(a)];
}
function project(loc, elev = 0.01) {
  const p = U(loc).map((v) => v * (0.8 + elev));
  const cT = Math.cos(view.theta), cP = Math.cos(view.phi), sT = Math.sin(view.theta), sP = Math.sin(view.phi);
  const c = cP * p[0] + sP * p[2];
  const s = sP * sT * p[0] + cT * p[1] - cP * sT * p[2];
  const z = -sP * cT * p[0] + sT * p[1] + cP * cT * p[2];
  const S = view.scale * fit;
  return { x: (((c / (W / H)) * S + 1) / 2) * W, y: ((-s * S + 1) / 2) * H, front: z >= 0 || c * c + s * s >= 0.64, z };
}
// inverse: stage pixel → lat/lng on the front of the sphere, or null
function unproject(px, py) {
  const S = view.scale * fit, c = ((px / W) * 2 - 1) * (W / H) / S / 0.8, s = -((py / H) * 2 - 1) / S / 0.8;
  const d = c * c + s * s; if (d > 1) return null;
  const z = Math.sqrt(1 - d);
  const cT = Math.cos(view.theta), cP = Math.cos(view.phi), sT = Math.sin(view.theta), sP = Math.sin(view.phi);
  // invert rotation (orthonormal → transpose)
  const x = cP * c + sP * sT * s - sP * cT * z;
  const y = cT * s + sT * z;
  const zz = sP * c - cP * sT * s + cP * cT * z;
  const lat = Math.asin(Math.max(-1, Math.min(1, y))) / DEG;
  const a = Math.atan2(zz, -x); // a = lng - π
  let lng = (a + Math.PI) / DEG; if (lng > 180) lng -= 360;
  return [lat, lng];
}

function flyTo(loc, scale) {
  let target = 3 * Math.PI / 2 - loc[1] * DEG;
  const diff = Math.atan2(Math.sin(target - view.phi), Math.cos(target - view.phi));
  view.tPhi = view.phi + diff;
  view.tTheta = Math.max(-1.2, Math.min(1.2, loc[0] * DEG * 0.9));
  if (scale) view.tScale = scale;
  pauseSpin();
}
function pauseSpin(ms = 6000) { autoSpin = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!sel.ing && !sel.frag && !tour) autoSpin = true; }, ms); }

// ── per-frame ───────────────────────────────────────────
const labelEls = new Map();
let pinEl = null, pinFor = null, lastT = performance.now();
// on a phone the globe scrolls out of view under the list; while it is off screen it isn't redrawn
let stageSeen = true, lastInput = 0, frameNo = 0;
for (const ev of ['pointerdown', 'pointermove', 'wheel']) stage.addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true });
new IntersectionObserver(([e]) => { stageSeen = e.isIntersecting; }).observe(stage);
function tick(now) {
  if (!stageSeen) { lastT = now; requestAnimationFrame(tick); return; }
  watchFrames(now, now - lastT);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const k = 1 - Math.pow(0.0025, dt); // smoothing
  if (view.tPhi != null) { view.phi += (view.tPhi - view.phi) * k; view.theta += (view.tTheta - view.theta) * k; if (Math.abs(view.tPhi - view.phi) < 0.0005 && Math.abs(view.tTheta - view.theta) < 0.0005) view.tPhi = view.tTheta = null; }
  else if (!dragging) {
    view.phi += view.vPhi; view.theta += view.vTheta;
    view.vPhi *= 0.94; view.vTheta *= 0.9;
    if (autoSpin && !play.active && !reduceMotion) view.vPhi += (0.0016 - view.vPhi) * 0.02;
    view.theta = Math.max(-1.2, Math.min(1.2, view.theta));
  }
  view.scale += (view.tScale - view.scale) * k;
  // while the globe only drifts on its own (no hand on it, no flight or zoom under way) it is redrawn every other frame
  const idle = !dragging && view.tPhi == null && Math.abs(view.tScale - view.scale) < 0.002 && now - lastInput > 1500 && now - selAt > 1600 && !play.active;
  if (idle && (++frameNo & 1)) { requestAnimationFrame(tick); return; }
  const upd = { phi: view.phi, theta: view.theta, scale: view.scale * fit, mapSamples: fineDots ? 32000 : Math.round(Math.min(32000, 22000 * view.scale ** 1.2)) };
  const m = refreshMarkers(false); if (m) Object.assign(upd, m);
  // ease the globe's glow and base toward the selected ingredient's color
  const th = themeOpts();
  const tg = tintRgb ? (isDark() ? tintRgb.map((v) => v * 0.55) : tintRgb.map((v) => 0.55 + v * 0.45)) : th.glowColor;
  const tb = tintRgb ? th.baseColor.map((v, i) => v + (tintRgb[i] - v) * (isDark() ? 0.18 : 0.1)) : th.baseColor;
  glow.cur = glow.cur || th.glowColor.slice(); glow.base = glow.base || th.baseColor.slice();
  const kc = 1 - Math.pow(0.05, dt);
  for (let i = 0; i < 3; i++) { glow.cur[i] += (tg[i] - glow.cur[i]) * kc; glow.base[i] += (tb[i] - glow.base[i]) * kc; }
  upd.glowColor = glow.cur; upd.baseColor = glow.base;
  globe.update(upd);
  $('#zoom-meter').textContent = view.scale.toFixed(1) + '×';
  drawOverlay();
  world.draw(now, { shades: play.active ? null : shadeList() });
  drawDots(now);
  requestAnimationFrame(tick);
}

function wantLabel(ing) {
  if (hidden.has(ing.family)) return false;
  if (sel.frag) return sel.frag.ingredients.includes(ing.id);
  if (sel.ing === ing) return true;
  if (spot) return ing.family === spot && (performance.now() - spotAt) > (spotDelay[ing.id] || 0) + 200;
  return view.scale > 1.9 || (view.scale > 1.45 && USES[ing.id].length >= 20);
}
const BY_USE = INGREDIENTS.slice().sort((a, b) => USES[b.id].length - USES[a.id].length);
function drawOverlay() {
  if (play.active) {
    for (const el of labelEls.values()) el.classList.add('hidden');
    pinEl?.classList.add('hidden');
    play.draw?.(); return;
  }
  const placed = [];
  const order = sel.ing ? [sel.ing, ...BY_USE.filter((i) => i !== sel.ing)] : BY_USE;
  for (const ing of order) {
    const want = wantLabel(ing);
    let el = labelEls.get(ing.id);
    if (!want) { if (el) el.classList.add('hidden'); continue; }
    if (!el) {
      el = document.createElement('div'); el.className = 'label hidden'; el.innerHTML = `<span class="dot" style="display:inline-block;margin-right:5px;background:${ingHex(ing)}"></span>${esc(ing.name)}`; el.style.setProperty('--c', ingHex(ing));
      el.addEventListener('click', (e) => { e.stopPropagation(); selectIngredient(ing.id); });
      labelsEl.appendChild(el); labelEls.set(ing.id, el);
    }
    const p = project(ing.loc);
    el.style.transform = `translate(${p.x}px, ${p.y - 8}px) translate(-50%, -100%)`;
    // greedy collision culling: busier ingredients claim space first
    const bw = el._w || (el._w = el.offsetWidth || ing.name.length * 7 + 24), box = [p.x - bw / 2, p.y - 30, p.x + bw / 2, p.y - 6];
    const clash = placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
    const show = p.front && p.x > -50 && p.x < W + 50 && p.y > -20 && p.y < H + 40 && !clash;
    if (show) placed.push(box);
    el.classList.toggle('hidden', !show);
  }
  // house label
  let hEl = labelEls.get('__house');
  if (sel.frag) {
    if (!hEl) { hEl = document.createElement('div'); hEl.className = 'label house'; labelsEl.appendChild(hEl); labelEls.set('__house', hEl); }
    hEl.textContent = sel.frag.house;
    const p = project(HOUSES[sel.frag.house]);
    hEl.style.transform = `translate(${p.x}px, ${p.y + 10}px) translate(-50%, 0)`;
    hEl.classList.toggle('hidden', !p.front);
  } else if (hEl) hEl.classList.add('hidden');
  // animated pin for the selected ingredient
  if (sel.ing !== pinFor) {
    pinFor = sel.ing; pinEl?.remove(); pinEl = null;
    if (sel.ing) {
      pinEl = document.createElement('div'); pinEl.className = 'pin'; pinEl.dataset.motion = MOTION[sel.ing.family];
      pinEl.style.setProperty('--pin', ingHex(sel.ing));
      pinEl.innerHTML = '<i></i><i></i><i></i>'; labelsEl.appendChild(pinEl);
    }
  }
  if (pinEl) { const p = project(sel.ing.loc, 0); pinEl.style.transform = `translate(${p.x}px, ${p.y}px)`; pinEl.classList.toggle('hidden', !p.front); }
}

// ── ingredient dots: crisp cores with a soft coloured glow ─────────────
const dotsCv = $('#dots'), dctx = dotsCv.getContext('2d');
let dotsDpr = 1, hoverIng = null;
function resizeDots() { dotsDpr = renderDpr(); dotsCv.width = Math.round(W * dotsDpr); dotsCv.height = Math.round(H * dotsDpr); }
const glowSprites = new Map();
function glowSprite(hex, dark) {
  const key = hex + dark; let c = glowSprites.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const [r, gg, b] = hexRgb(hex), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (dark) {
    gr.addColorStop(0, `rgba(${r},${gg},${b},0.9)`); gr.addColorStop(0.18, `rgba(${r},${gg},${b},0.55)`);
    gr.addColorStop(0.45, `rgba(${r},${gg},${b},0.16)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  } else {
    gr.addColorStop(0, `rgba(${r},${gg},${b},0.8)`); gr.addColorStop(0.22, `rgba(${r},${gg},${b},0.46)`);
    gr.addColorStop(0.5, `rgba(${r},${gg},${b},0.15)`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  }
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); glowSprites.set(key, c); return c;
}
let shadowCv = null;
function shadowSprite() {
  if (shadowCv) return shadowCv;
  shadowCv = document.createElement('canvas'); shadowCv.width = shadowCv.height = 64; const g = shadowCv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(30,20,10,.85)'); gr.addColorStop(0.45, 'rgba(30,20,10,.35)'); gr.addColorStop(1, 'rgba(30,20,10,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return shadowCv;
}
const mixHex = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t))})`; };
// a glass bead per colour, drawn once and then stamped: bright cap, pure colour, deeper rim, crisp edge and glint
const BEAD_R = 32, BEAD_PAD = 1.125, beadSprites = new Map();
function beadSprite(hx, dark) {
  const key = hx + dark; let c = beadSprites.get(key); if (c) return c;
  const half = Math.ceil(BEAD_R * BEAD_PAD), r = BEAD_R;
  c = document.createElement('canvas'); c.width = c.height = half * 2; const g = c.getContext('2d'); g.translate(half, half);
  const cg = g.createRadialGradient(-r * 0.32, -r * 0.36, r * 0.04, 0, 0, r * 1.02);
  cg.addColorStop(0, mixHex(hx, '#ffffff', 0.8)); cg.addColorStop(0.36, mixHex(hx, '#ffffff', 0.22));
  cg.addColorStop(0.78, hx); cg.addColorStop(1, mixHex(hx, '#000000', 0.32));
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = cg; g.fill();
  g.lineWidth = r * 0.13; g.strokeStyle = dark ? 'rgba(255,255,255,.42)' : mixHex(hx, '#000000', 0.42); g.stroke();
  g.globalAlpha = 0.9; g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(-r * 0.34, -r * 0.38, r * 0.24, r * 0.15, -0.65, 0, Math.PI * 2); g.fill();
  beadSprites.set(key, c); return c;
}
let selAt = -1e9; // when the current pick was made, for the globe's shockwave
const PHASE = Object.fromEntries(INGREDIENTS.map((ing, i) => [ing.id, (i * 2.399) % (Math.PI * 2)]));
function dotRadius(ing) { return (1.5 + Math.sqrt(USES[ing.id].length) * 0.34) * Math.pow(view.scale, 0.38); }
// how much of a full bead each dot shows (1) versus a small speck (0), eased so dots never pop
const DOTK = Object.fromEntries(INGREDIENTS.map((i) => [i.id, 1]));
function drawDots(now) {
  dctx.setTransform(dotsDpr, 0, 0, dotsDpr, 0, 0); dctx.clearRect(0, 0, W, H);
  if (play.active) return;
  drawDotsInner(now);
  drawJourney(dctx, now);
}
function drawDotsInner(now) {
  const dark = isDark(), focus = sel.frag ? new Set(sel.frag.ingredients) : null, t = reduceMotion ? 0 : now;
  const fam = !focus && spot ? spot : null, famAge = reduceMotion ? 1e9 : now - spotAt;
  const list = [];
  for (const ing of INGREDIENTS) {
    if (hidden.has(ing.family)) continue;
    const p = project(ing.loc, 0); if (p.z < -0.02) continue;
    list.push({ ing, p });
  }
  list.sort((a, b) => a.p.z - b.p.z);
  // lit: the selection, its fragrance's notes or the spotlit family; dim: everything else while one of those is up
  const lit = (ing) => sel.ing === ing || hoverIng === ing || (focus ? focus.has(ing.id) : fam ? ing.family === fam : false);
  const dim = (ing) => (focus ? !focus.has(ing.id) : fam ? ing.family !== fam : false);
  // a spotlit family lights up in a wave spreading out from its centre
  const wave = (ing) => (fam && ing.family === fam ? Math.min(1, Math.max(0, (famAge - (spotDelay[ing.id] || 0)) / 420)) : 1);
  const quiet = sel.ing || focus || fam;
  // declutter: where beads would pile on top of each other (Europe at full view), the more used note keeps its bead
  // and the others shrink to small specks; zooming in gives them room and they grow back
  const kept = [];
  for (const it of list.slice().sort((a, b) => USES[b.ing.id].length - USES[a.ing.id].length)) {
    const r = dotRadius(it.ing), full = lit(it.ing) || !kept.some((o) => Math.abs(o.p.x - it.p.x) < r + o.r && Math.hypot(o.p.x - it.p.x, o.p.y - it.p.y) < (r + o.r) * 0.92);
    if (full) kept.push({ p: it.p, r });
    const k = DOTK[it.ing.id]; it.k = DOTK[it.ing.id] = reduceMotion ? +full : k + ((full ? 1 : 0) - k) * 0.12;
  }
  // pass 1: glows, screened in the dark so clusters bloom without burning out to white
  dctx.globalCompositeOperation = dark ? 'screen' : 'source-over';
  for (const { ing, p } of list) {
    if (dim(ing)) continue;
    const edge = Math.min(1, Math.max(0, p.z / 0.8) * 3.2), on = lit(ing), w = wave(ing);
    const r = dotRadius(ing) * (sel.ing === ing ? 1.7 : 1);
    const breathe = 0.84 + 0.16 * Math.sin(t / 1400 + PHASE[ing.id]);
    const flare = w < 1 ? 1 + (1 - w) * 1.4 : 1; // the wave front flares as it passes
    const gr = r * (on ? 6 : 3.1) * (on ? 0.92 + 0.08 * Math.sin(t / 520 + PHASE[ing.id]) : 1) * flare;
    dctx.globalAlpha = Math.min(1, edge * breathe * (on ? Math.min(1, w * 1.2) * 1.15 : (quiet ? 0.3 : dark ? 0.6 : 0.42) * DOTK[ing.id] ** 2));
    if (dctx.globalAlpha <= 0.01) continue;
    dctx.drawImage(glowSprite(ingHex(ing), dark), p.x - gr, p.y - gr, gr * 2, gr * 2);
  }
  // pass 2: a soft contact shadow under each dot, offset away from the light
  dctx.globalCompositeOperation = 'source-over';
  const sh = shadowSprite();
  for (const { ing, p } of list) {
    const edge = Math.min(1, Math.max(0, p.z / 0.8) * 3.2) * DOTK[ing.id]; if (edge <= 0.02 || dim(ing)) continue;
    const r = dotRadius(ing) * (sel.ing === ing ? 1.7 : 1) * 1.5;
    dctx.globalAlpha = edge * (dark ? 0.55 : 0.32);
    dctx.drawImage(sh, p.x - r + r * 0.18, p.y - r + r * 0.3, r * 2, r * 2);
  }
  // pass 3: cores, lit like small glass beads: a bright cap, the pure colour, a deeper rim, a crisp edge and a glint
  for (const { ing, p } of list) {
    const edge = Math.min(1, Math.max(0, p.z / 0.8) * 3.2); if (edge <= 0) continue;
    const off = dim(ing), isSel = sel.ing === ing, on = lit(ing), w = wave(ing);
    const k = 0.55 + 0.45 * Math.min(1, p.z / 0.8 * 1.6); // foreshorten toward the limb
    const pop = fam && on && !isSel ? 1.22 + (w < 1 ? Math.sin(w * Math.PI) * 0.5 : 0) : 1;
    const dk = isSel || hoverIng === ing || off ? 1 : DOTK[ing.id], speck = Math.max(1.1, dotRadius(ing) * 0.32);
    const r = dotRadius(ing) * (isSel ? 1.7 : hoverIng === ing ? 1.3 : pop) * (off ? 0.55 : 1) * dk + (off ? 0 : speck * (1 - dk));
    const ang = Math.atan2(p.y - H / 2, p.x - W / 2);
    // a speck: a plain dot of the note's colour, nothing more
    if (!off && dk < 0.35) { dctx.globalAlpha = edge * (0.75 + dk * 0.7); dctx.fillStyle = ingHex(ing); dctx.beginPath(); dctx.arc(p.x, p.y, r, 0, Math.PI * 2); dctx.fill(); continue; }
    dctx.save(); dctx.translate(p.x, p.y); dctx.rotate(ang); dctx.scale(k, 1);
    dctx.globalAlpha = edge * (off ? 0.45 : 1);
    dctx.beginPath(); dctx.arc(0, 0, r, 0, Math.PI * 2);
    if (off) { dctx.fillStyle = dark ? '#4a423c' : '#d3cabd'; dctx.fill(); dctx.restore(); continue; }
    const hx = ingHex(ing), bs = r * BEAD_PAD;
    dctx.drawImage(beadSprite(hx, dark), -bs, -bs, bs * 2, bs * 2);
    // a fine ring marks the selected dot and the spotlit family
    if (isSel || (fam && on)) {
      dctx.globalAlpha = edge * (isSel ? 1 : 0.75 * w); dctx.lineWidth = isSel ? 1.6 : 1;
      dctx.strokeStyle = isSel ? (dark ? '#f3eee7' : '#1f1a17') : hx;
      dctx.beginPath(); dctx.arc(0, 0, r + (isSel ? 3 : 2.2), 0, Math.PI * 2); dctx.stroke();
    }
    dctx.restore();
  }
  // sonar: rings keep spreading from the selected ingredient, or softly from each note of the selected fragrance,
  // with one bigger shockwave right after a pick
  if (!reduceMotion && (sel.ing || focus || fam)) {
    const src = sel.ing ? [sel.ing] : focus ? sel.frag.ingredients.map((i) => ING[i]).filter((i) => !hidden.has(i.family)) : INGREDIENTS.filter((i) => i.family === fam && !hidden.has(fam)), age = now - selAt;
    dctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (const ing of src) {
      const p = project(ing.loc, 0); if (p.z < 0.05) continue;
      const k = 0.55 + 0.45 * Math.min(1, p.z / 0.8 * 1.6), ang = Math.atan2(p.y - H / 2, p.x - W / 2), hx = ingHex(ing), fade = Math.min(1, p.z / 0.3);
      const base = dotRadius(ing) * (sel.ing ? 1.7 : 1), period = sel.ing ? 2600 : 3400, n = sel.ing ? 3 : 1;
      dctx.strokeStyle = hx;
      for (let j = 0; j < n; j++) {
        const ph = ((now + j * period / n + PHASE[ing.id] * 500) % period) / period, rr = base * (1.5 + ph * (sel.ing ? 9 : 5));
        dctx.globalAlpha = (1 - ph) * (1 - ph) * (sel.ing ? 0.8 : 0.5) * fade; dctx.lineWidth = sel.ing ? 1.6 : 1.1;
        dctx.beginPath(); dctx.ellipse(p.x, p.y, rr * k, rr, ang, 0, Math.PI * 2); dctx.stroke();
      }
      if (age >= 0 && age < 1500) {
        const e = age / 1500, rr = base * 2 + (1 - Math.pow(1 - e, 3)) * (sel.ing ? 110 : 50);
        dctx.globalAlpha = (1 - e) * 0.9 * fade; dctx.lineWidth = 3 * (1 - e) + 0.5;
        dctx.beginPath(); dctx.ellipse(p.x, p.y, rr * k, rr, ang, 0, Math.PI * 2); dctx.stroke();
      }
    }
    dctx.globalCompositeOperation = 'source-over';
  }
  // the fragrance's house: a small ink diamond with a halo
  if (sel.frag) {
    const p = project(HOUSES[sel.frag.house], 0);
    if (p.z > 0) {
      const ink = dark ? '#f3eee7' : '#1f1a17', r = 5.5 * Math.pow(view.scale, 0.3);
      dctx.globalAlpha = Math.min(1, p.z / 0.8 * 3.2);
      dctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      dctx.drawImage(glowSprite(dark ? '#ffffff' : '#1f1a17', dark), p.x - r * 4, p.y - r * 4, r * 8, r * 8);
      dctx.globalCompositeOperation = 'source-over';
      dctx.save(); dctx.translate(p.x, p.y); dctx.rotate(Math.PI / 4);
      dctx.fillStyle = ink; dctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      dctx.lineWidth = 1.5; dctx.strokeStyle = dark ? '#0f0d0c' : '#fffdfa'; dctx.strokeRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
      dctx.restore();
    }
  }
  dctx.globalAlpha = 1;
}

// ── pointer interactions ───────────────────────────────
// the how-to hint steps aside after the first touch or scroll, or on its own after a while
const hintEl = $('#hint'), hideHint = () => hintEl?.classList.add('gone');
stage.addEventListener('pointerdown', hideHint, { once: true }); stage.addEventListener('wheel', hideHint, { once: true, passive: true }); setTimeout(hideHint, 14000);
let dragging = false, moved = 0, last = null; const pointers = new Map(); let pinch0 = 0, pinchScale0 = 1;
wrap.addEventListener('pointerdown', (e) => {
  wrap.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); pinchScale0 = view.tScale; }
  dragging = true; moved = 0; last = [e.clientX, e.clientY]; view.tPhi = view.tTheta = null; wrap.classList.add('dragging'); pauseSpin(); hideTip();
});
wrap.addEventListener('pointermove', (e) => {
  if (!dragging) { hover(e); return; }
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); setZoom(pinchScale0 * d / pinch0, true); moved += 10; return; }
  const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy);
  const f = 0.005 / (view.scale * fit);
  view.phi += dx * f; view.theta = Math.max(-1.2, Math.min(1.2, view.theta + dy * f));
  view.vPhi = dx * f * 0.6; view.vTheta = dy * f * 0.6;
});
const endDrag = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size) return;
  dragging = false; wrap.classList.remove('dragging');
  if (moved < 5 && e.type === 'pointerup') click(e);
};
wrap.addEventListener('pointerup', endDrag); wrap.addEventListener('pointercancel', endDrag);
wrap.addEventListener('pointerleave', hideTip);
wrap.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(view.tScale * Math.exp(-e.deltaY * 0.0015)); pauseSpin(); }, { passive: false });
wrap.addEventListener('dblclick', (e) => {
  const r = stage.getBoundingClientRect(), ll = unproject(e.clientX - r.left, e.clientY - r.top);
  if (ll) flyTo(ll, Math.min(5, view.tScale * 1.8));
});
function setZoom(s) { view.tScale = Math.max(0.75, Math.min(5, s)); }
$('#zoom-in').addEventListener('click', () => { setZoom(view.tScale * 1.4); pauseSpin(); });
$('#zoom-out').addEventListener('click', () => { setZoom(view.tScale / 1.4); pauseSpin(); });
$('#reset').addEventListener('click', () => { stopTour(); clearSelection(); view.tScale = 1; view.tTheta = 0.3; view.tPhi = view.phi; autoSpin = true; });

function nearest(e, radius = 16) {
  const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = radius * radius;
  for (const ing of INGREDIENTS) {
    if (hidden.has(ing.family)) continue;
    const p = project(ing.loc, 0); if (p.z < 0.05) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = { ing, p }; }
  }
  return best;
}
function click(e) {
  if (play.active) { const r = stage.getBoundingClientRect(), ll = unproject(e.clientX - r.left, e.clientY - r.top); if (ll) play.onPick?.(ll); return; }
  const n = nearest(e, 20); if (n) selectIngredient(n.ing.id);
}
function hover(e) {
  if (play.active) { hideTip(); wrap.style.cursor = 'crosshair'; return; }
  const n = nearest(e);
  hoverIng = n?.ing || null;
  if (!n) { hideTip(); wrap.style.cursor = ''; return; }
  wrap.style.cursor = 'pointer';
  const ing = n.ing, uses = USES[ing.id].length;
  tip.style.setProperty('--c', ingHex(ing)); tip.innerHTML = `<b>${esc(ing.name)}</b><span class="mono muted">${esc(ing.place)}, ${esc(ing.country)}</span><div style="margin-top:6px;display:flex;gap:6px;align-items:center"><span class="dot" style="background:${ingHex(ing)}"></span><span style="font-size:12px">${FAMILIES[ing.family].label} · ${uses} fragrance${uses === 1 ? '' : 's'}</span></div>`;
  const tx = Math.min(W - 250, n.p.x + 14), ty = Math.max(8, n.p.y - 70);
  tip.style.transform = `translate(${tx}px, ${ty}px)`; tip.classList.add('show');
}
function hideTip() { tip.classList.remove('show'); hoverIng = null; }

// ── overlays: families & regions ────────────────────────
const famBox = $('#families');
// tapping a family lights up all of its dots (the rest dim) and opens a small card to isolate, hide or list them
let spot = null, spotAt = 0, spotDelay = {};
const spotEl = document.createElement('div'); spotEl.className = 'spot'; spotEl.hidden = true; famBox.after(spotEl);
// the card floats just above the chips, however many rows they wrap to
new ResizeObserver(() => { spotEl.style.bottom = `${famBox.offsetHeight + parseFloat(getComputedStyle(famBox).bottom) + 8}px`; }).observe(famBox);
const famChips = {};
for (const [key, f] of Object.entries(FAMILIES)) {
  const b = document.createElement('button'); b.className = 'chip'; b.setAttribute('aria-pressed', 'true'); b.dataset.fam = key;
  b.style.setProperty('--c', famHex(key));
  b.innerHTML = `<span class="dot" style="background:${famHex(key)}"></span>${f.label}`;
  b.addEventListener('click', () => setSpot(spot === key && !hidden.has(key) ? null : key));
  famBox.appendChild(b); famChips[key] = b;
}
const isolated = () => spot && Object.keys(FAMILIES).every((k) => (k === spot) !== hidden.has(k));
function setSpot(key) {
  if (key && hidden.has(key)) hidden.delete(key);
  spot = key; spotAt = performance.now();
  if (key) {
    const ings = INGREDIENTS.filter((i) => i.family === key), mid = U3mean(ings.map((i) => i.loc)), c = U(mid);
    // the wave reaches each dot by its distance from the family's centre
    spotDelay = Object.fromEntries(ings.map((i) => { const u = U(i.loc); return [i.id, Math.acos(Math.max(-1, Math.min(1, u[0] * c[0] + u[1] * c[1] + u[2] * c[2]))) / Math.PI * 1100]; }));
    if (sel.frag) clearSelection();
    flyTo(mid, Math.max(1, Math.min(view.tScale, 1.6))); pauseSpin(9000);
  }
  renderSpot(); renderList();
}
function renderSpot() {
  for (const [k, b] of Object.entries(famChips)) { b.setAttribute('aria-pressed', String(!hidden.has(k))); b.classList.toggle('on', spot === k); b.classList.toggle('dim', !!spot && spot !== k); }
  if (!spot) { spotEl.hidden = true; return; }
  const f = FAMILIES[spot], ings = INGREDIENTS.filter((i) => i.family === spot), uses = ings.reduce((n, i) => n + USES[i.id].length, 0);
  const top = ings.slice().sort((a, b) => USES[b.id].length - USES[a.id].length).slice(0, 3).map((i) => i.name);
  spotEl.style.setProperty('--c', famHex(spot));
  spotEl.innerHTML = `<span class="spot-dot"></span><div class="spot-t"><b>${f.label}</b><span class="mono">${ings.length} notes · in ${uses.toLocaleString('en-US')} blends · ${esc(top.join(', '))}</span></div>
    <div class="spot-acts"><button class="btn sm" data-sp="isolate">${isolated() ? 'Show all' : 'Isolate'}</button><button class="btn sm" data-sp="hide">Hide</button><button class="btn sm" data-sp="list">List</button><button class="btn icon ghost sm" data-sp="clear" aria-label="Clear the spotlight"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>`;
  if (spotEl.hidden) { spotEl.hidden = false; replay(spotEl, 'in'); }
}
spotEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-sp]'); if (!b) return;
  const act = b.dataset.sp, key = spot;
  if (act === 'isolate') { if (isolated()) hidden.clear(); else for (const k of Object.keys(FAMILIES)) k === key ? hidden.delete(k) : hidden.add(k); if (sel.ing && hidden.has(sel.ing.family)) clearSelection(); renderSpot(); renderList(); }
  else if (act === 'hide') { hidden.add(key); if (sel.ing?.family === key) clearSelection(); spot = null; renderSpot(); renderList(); }
  else if (act === 'list') { if (tab !== 'ing') setTab('ing'); showList(); requestAnimationFrame(() => listEl.querySelector(`[data-jump="${key}"]`)?.click()); }
  else if (act === 'clear') setSpot(null);
});
const REGIONS = [['Europe', [46, 10], 2.2], ['Middle East', [27, 48], 2.0], ['Africa', [2, 25], 1.5], ['South Asia', [18, 80], 2.2], ['East Asia', [28, 115], 1.9], ['Americas', [5, -80], 1.25], ['Oceania', [-25, 150], 1.4]];
const regBox = $('#regions');
for (const [name, loc, z] of REGIONS) {
  const b = document.createElement('button'); b.className = 'btn'; b.textContent = name;
  b.addEventListener('click', () => { flyTo(loc, z); });
  regBox.appendChild(b);
}

// ── panel: list views ───────────────────────────────────
let tab = 'ing', fragSort = 'family';
const listEl = $('#view-list'), detailEl = $('#view-detail'), filterEl = $('#filter');
$('#count-ing').textContent = INGREDIENTS.length; $('#count-frag').textContent = FRAGRANCES.length;
function setTab(t) {
  if (tab === 'col' && t !== 'col') markSeen();
  tab = t; $('#tab-ing').setAttribute('aria-selected', t === 'ing'); $('#tab-frag').setAttribute('aria-selected', t === 'frag'); $('#tab-col').setAttribute('aria-selected', t === 'col');
  filterEl.placeholder = { ing: 'Filter ingredients or countries…', frag: 'Filter perfumes or houses…', col: 'Filter your collection…' }[t];
  filterEl.value = ''; models?.cancelThumbnails(); renderList(true); listEl.scrollTop = 0; showList();
}
$('#tab-ing').addEventListener('click', () => setTab('ing'));
$('#tab-frag').addEventListener('click', () => setTab('frag'));
$('#tab-col').addEventListener('click', () => setTab('col'));
filterEl.addEventListener('input', () => { renderList(); showList(); });

function liquidFor(f) {
  // weighted blend of ingredient colors, pulled toward pale gold like real juice
  let r = 0, g = 0, b = 0, n = 0;
  const w = { top: 1, heart: 1.5, base: 2 };
  for (const t of ['top', 'heart', 'base']) for (const note of f.tiers[t]) { const id = noteId(note); if (!id) continue; const hx = parseInt(ING[id].c[0].slice(1), 16); r += ((hx >> 16) & 255) * w[t]; g += ((hx >> 8) & 255) * w[t]; b += (hx & 255) * w[t]; n += w[t]; }
  if (!n) return '#e9c46a';
  const mix = (v, gold) => Math.round(v / n * 0.45 + gold * 0.55);
  return '#' + [mix(r, 236), mix(g, 196), mix(b, 120)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function fragHex(f) {
  const w = { top: 1.4, heart: 1.6, base: 1 }, sc = {};
  for (const t of ['top', 'heart', 'base']) for (const n of f.tiers[t]) { const id = noteId(n); if (id) sc[id] = (sc[id] || 0) + w[t] * (0.15 + vividness(ING_COLOR[id]) * 2); }
  const top = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
  return top ? ING_COLOR[top[0]] : '#c9a227';
}
function swatch(f, px = 28) {
  const col = liquidFor(f);
  return `<span class="swatch" style="width:${px}px;height:${px}px;border-radius:${px > 20 ? 7 : 5}px;background:linear-gradient(160deg, color-mix(in srgb, ${col} 55%, white), ${col})"></span>`;
}

const FAMILY_INFO = {
  citrus: 'Cold-pressed peels that give a perfume its bright, fleeting opening.',
  floral: 'Petals and blossoms, the heart of most perfumes, from rose to tuberose.',
  green: 'Leaves, herbs and gums that smell freshly cut, crushed or brewed.',
  fruit: 'Juicy, sweet notes, mostly rebuilt in the lab from the scent of ripe fruit.',
  spice: 'Seeds, barks and roots that bring warmth, heat or sparkle.',
  wood: 'Heartwoods, roots and mosses that form the long-lasting base.',
  resin: 'Tree resins and balsams that melt into a warm, glowing amber.',
  gourmand: 'Edible notes like vanilla, tonka and cacao that smell good enough to eat.',
  animalic: 'Musks and ambergris that give skin-like warmth and help a scent last.',
  marine: 'Salt, sea air and ozone, mostly built from modern aroma molecules.',
};
const mix = (hex, to, k) => { const a = hexRgb(hex), b = hexRgb(to); return rgbHex(a.map((v, i) => v + (b[i] - v) * k)); };
function domFamily(f) {
  const w = { top: 1, heart: 1.5, base: 2 }, score = {};
  for (const t of ['top', 'heart', 'base']) for (const n of f.tiers[t]) { const id = noteId(n); if (id) score[ING[id].family] = (score[ING[id].family] || 0) + w[t]; }
  return Object.entries(score).sort((a, b) => b[1] - a[1])[0]?.[0] || 'floral';
}
const FRAG_FAM = Object.fromEntries(FRAGRANCES.map((f) => [f.id, domFamily(f)]));
const sweepFor = (hex) => isDark() ? [mix(hex, '#141110', 0.82), mix(hex, '#1d1916', 0.72)] : [mix(hex, '#fffdfa', 0.84), mix(hex, '#f3ede4', 0.7)];
const chevron = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="${d === 'l' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'}"/></svg>`;

let groups = []; // [{key, label, color, count}] for the category bar
function renderList(animate) {
  const q = filterEl.value.trim().toLowerCase();
  let html = ''; groups = [];
  if (tab === 'col') html = renderCollection(q);
  else if (tab === 'ing') {
    for (const [fam, f] of Object.entries(FAMILIES)) {
      if (hidden.has(fam)) continue;
      const items = INGREDIENTS.filter((i) => i.family === fam && (!q || (i.name + ' ' + i.country + ' ' + i.place + ' ' + i.latin).toLowerCase().includes(q)));
      if (!items.length) continue;
      groups.push({ key: fam, label: f.label, color: famHex(fam), count: items.length });
      html += `<section class="cat" id="cat-${fam}" data-group="${fam}" style="--c:${famHex(fam)}">
        <div class="cat-h"><div><div class="cat-t"><span class="dot"></span>${f.label}<span class="mono muted">${items.length}</span></div><p>${FAMILY_INFO[fam]}</p></div>
          <div class="cat-nav"><button class="btn icon ghost sm" data-scroll="-1" aria-label="Scroll ${f.label} left">${chevron('l')}</button><button class="btn icon ghost sm" data-scroll="1" aria-label="Scroll ${f.label} right">${chevron('r')}</button></div></div>
        <div class="rail" tabindex="-1">${items.map((i) => `<button class="card${sel.ing === i ? ' active' : ''}" data-ing="${i.id}" style="--c:${ingHex(i)};--c2:${i.c[1]}" title="${esc(i.name)}, ${esc(i.country)}">
          <span class="thumb" data-thumb="i:${i.id}"><span class="ph" style="background:radial-gradient(circle at 40% 35%, ${i.c[1]}, ${i.c[0]} 55%, ${i.c[2]})"></span></span>
          <span class="card-n">${esc(i.name)}</span><span class="card-s">${esc(i.country)}<span class="mono">${USES[i.id].length}</span></span></button>`).join('')}</div>
      </section>`;
    }
  } else {
    let items = FRAGRANCES.filter((f) => !q || (f.name + ' ' + f.house + ' ' + f.perfumer + ' ' + f.year).toLowerCase().includes(q));
    html += `<div class="toolbar" style="padding:8px 8px 4px"><span class="mono muted">${items.length} fragrances</span><div class="seg" id="sort">${['family', 'az', 'year', 'house'].map((s) => `<button data-sort="${s}" aria-pressed="${fragSort === s}">${{ family: 'Family', az: 'A–Z', year: 'Year', house: 'House' }[s]}</button>`).join('')}</div></div>`;
    const famOrder = Object.keys(FAMILIES);
    const by = { family: (a, b) => famOrder.indexOf(FRAG_FAM[a.id]) - famOrder.indexOf(FRAG_FAM[b.id]) || a.name.localeCompare(b.name), az: (a, b) => a.name.localeCompare(b.name), year: (a, b) => a.year - b.year, house: (a, b) => a.house.localeCompare(b.house) || a.year - b.year };
    items = items.sort(by[fragSort]);
    let group = null;
    for (const f of items) {
      const g = fragSort === 'family' ? FRAG_FAM[f.id] : fragSort === 'house' ? f.house : fragSort === 'year' ? `${Math.floor(f.year / 10) * 10}s` : f.name[0].toUpperCase().replace(/[^A-Z]/, '#');
      if (g !== group) {
        group = g; const label = fragSort === 'family' ? FAMILIES[g].label : g, key = 'g' + groups.length;
        groups.push({ key, label, color: fragSort === 'family' ? famHex(g) : null, count: 0 });
        html += `<div class="group-h" id="cat-${key}" data-group="${key}"><span style="display:flex;gap:8px;align-items:center">${fragSort === 'family' ? `<span class="dot" style="background:${famHex(g)}"></span>` : ''}${esc(label)}</span><span class="mono" data-n></span></div>`;
      }
      groups[groups.length - 1].count++;
      html += `<button class="row tinted${sel.frag === f ? ' active' : ''}" data-frag="${f.id}" style="--c:${fragHex(f)}"><span class="thumb sm" data-thumb="f:${f.id}">${swatch(f, 40)}</span><span class="name">${esc(f.name)}<span class="sub">${esc(f.house)}</span></span><span class="meta mono">${f.year}</span></button>`;
    }
  }
  const bar = groups.length > 1 ? `<nav class="catbar" aria-label="Jump to category"><button class="cb" data-jump="" aria-current="true">All<span class="mono">${tab !== 'frag' ? groups.reduce((a, g) => a + (g.n ?? g.count), 0) : FRAGRANCES.filter((f) => !q || (f.name + ' ' + f.house + ' ' + f.perfumer + ' ' + f.year).toLowerCase().includes(q)).length}</span></button>${groups.map((g) => `<button class="cb" data-jump="${g.key}">${g.color ? `<span class="dot" style="background:${g.color}"></span>` : ''}${esc(g.label)}<span class="mono">${g.count}</span></button>`).join('')}</nav>` : '';
  listEl.innerHTML = `${bar}<div class="list ${tab}">${html || '<div class="empty">Nothing matches that filter.</div>'}</div>`;
  listEl.querySelectorAll('.group-h [data-n]').forEach((el, k) => { el.textContent = groups[k]?.count ?? ''; });
  observeThumbs(); spy();
  if (animate) {
    cascade(listEl.querySelectorAll('.catbar .cb'), { cls: 'mv-pop', step: 30, max: 10 });
    cascade(listEl.querySelectorAll('.cat'), { step: 70, delay: 60, max: 6 });
    listEl.querySelectorAll('.cat').forEach((c, k) => k < 6 && cascade([...c.querySelectorAll('.card')].slice(0, 8), { cls: 'mv-pop', step: 40, delay: 140 + k * 70 }));
    cascade([...listEl.querySelectorAll('.list.frag > *')].slice(0, 18), { step: 28, delay: 60 });
    cascade(listEl.querySelectorAll('.col-stat, .col-rar > *'), { cls: 'mv-pop', step: 50, delay: 40 });
    cascade([...listEl.querySelectorAll('.ctile, .crow, .mile')].slice(0, 24), { cls: 'mv-pop', step: 22, delay: 160 });
    listEl.querySelectorAll('.col-stat b').forEach((el, k) => countUp(el, { ms: 900, delay: 120 + k * 80 }));
  }
}

// ── collection: notes named in play and the facts they dealt, laid out like an album ──
let colView = 'notes';
const pips = (n) => `<span class="fc-pips">${'<i></i>'.repeat(n)}</span>`;
function renderCollection(q) {
  const per = Object.fromEntries(RARITIES.map((r) => [r, { have: 0, all: 0 }]));
  for (const id in FACTS) if (ING[id]) for (const r of RARITIES) if (FACTS[id][r]) { per[r].all++; if (seenFacts.has(factKey(id, r))) per[r].have++; }
  const pct = (a, b) => `${b ? Math.max(a ? 2 : 0, Math.round(100 * a / b)) : 0}%`;
  let html = `<div class="col-hero">
    <div class="col-stats">
      <div class="col-stat"><b>${myNotes.size}</b><span>of ${INGREDIENTS.length} notes found</span><i style="--p:${pct(myNotes.size, INGREDIENTS.length)}"></i></div>
      <div class="col-stat"><b>${seenFacts.size}</b><span>of ${FACT_TOTAL.toLocaleString('en-US')} facts earned</span><i style="--p:${pct(seenFacts.size, FACT_TOTAL)}"></i></div>
    </div>
    <div class="col-rar">${RARITIES.map((r) => `<span style="--r:${RARITY[r].col}" title="${RARITY[r].label} facts turn up ${ODDS[r]}% of the time and pay ${YIELD[r]} drops of essence">${pips(RARITY[r].pips)}<b>${per[r].have}</b><small>/ ${per[r].all}</small><em>${ODDS[r]}%</em></span>`).join('')}</div>
    <p class="col-sync" data-st="${syncState}">${SYNC_TEXT[syncState]}</p>
    ${myNotes.size ? '' : `<div class="col-empty"><p>Your album is empty. Name notes in the daily scent: each one you find joins your collection and deals one of its fun facts.</p><button class="btn primary" data-act="col-play">Play the daily scent</button></div>`}
  </div>
  <div class="toolbar" style="padding:10px 16px 4px"><span class="mono muted">${colView === 'notes' ? 'Sorted by family' : colView === 'facts' ? `Rarest first${newFacts.size ? ` · ${newFacts.size} new` : ''}` : colView === 'lab' ? `${dropsTotal().toLocaleString('en-US')} drops` : `${MILESTONES.filter((m) => miles[m.id]).length} of ${MILESTONES.length} reached`}</span><div class="seg">${[['notes', 'Notes'], ['facts', 'Facts'], ['lab', 'Perfumes'], ['miles', 'Goals']].map(([v, l]) => `<button data-cview="${v}" aria-pressed="${colView === v}">${l}</button>`).join('')}</div></div>`;
  if (colView === 'miles') {
    html += `<p class="col-note">Each milestone pays out a bonus fact, at least as rare as shown, from a note you have already found.</p><div class="miles">${MILESTONES.map((m) => {
      const done = miles[m.id], [have, need, extra] = m.of(), f = done?.f?.split(':'), R = RARITY[f && RARITY[f[1]] ? f[1] : m.reward];
      return `<${f ? `button type="button" data-mile-fact="${done.f}"` : 'div'} class="mile${done ? ' done' : ''}" style="--r:${R.col}">
        <span class="mile-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[m.icon]}</svg></span>
        <span class="mile-t"><b>${esc(m.name)}</b><span>${esc(m.goal)}</span>
          ${done ? `<span class="mile-got">${f && FACTS[f[0]]?.[f[1]] ? `Bonus ${R.label.toLowerCase()} fact: ${esc(FACTS[f[0]][f[1]].title)}` : 'Reached'}</span>` : `<span class="mile-bar"><i style="--p:${Math.min(100, Math.round(100 * have / need))}%"></i></span><span class="mile-n mono">${Math.min(have, need).toLocaleString('en-US')} / ${need.toLocaleString('en-US')}${extra ? ` · ${esc(extra)}` : ''}</span>`}</span>
        <span class="mile-r">${done ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' : `${pips(R.pips)}<small>${R.label}</small>`}</span></${f ? 'button' : 'div'}>`;
    }).join('')}</div>`;
  } else if (colView === 'lab') {
    const rows = FRAGRANCES.filter((f) => !q || (f.name + ' ' + f.house).toLowerCase().includes(q)).map((f) => ({ f, r: readiness(f), n: lab.made[f.id] || 0 })).filter((x) => x.r.ids.length);
    // within each family: ready first, then the ones already blended, then the closest to ready
    const rank = (x) => (x.r.ready ? 2 : 0) + (x.n ? 1 : 0);
    rows.sort((a, b) => rank(b) - rank(a) || b.n - a.n || b.r.have / b.r.all - a.r.have / a.r.all || a.r.all - b.r.all || a.f.name.localeCompare(b.f.name));
    const ready = rows.filter((x) => x.r.ready), madeN = rows.filter((x) => x.n).length;
    const shelf = Object.keys(lab.got).filter((id) => ING[id] && essence(id) > 0).sort((a, b) => essence(b) - essence(a) || ING[a].name.localeCompare(ING[b].name));
    html += `<p class="col-note">Every fact a note deals also pays drops of its essence: ${RARITIES.map((r) => `${YIELD[r]} for ${an(RARITY[r].label.toLowerCase())}`).join(', ')} fact. Spend them to blend the fragrances in the atlas. Each note costs 1 drop in the top, 2 in the heart and 3 in the base.</p>
      <div class="lab-shelf">${shelf.length ? shelf.slice(0, 14).map((id) => `<button class="lab-e" data-ing="${id}" style="--c:${ingHex(ING[id])}"><span class="dot"></span>${esc(ING[id].name)}<b>${essence(id)}</b></button>`).join('') + (shelf.length > 14 ? `<span class="lab-more mono muted">+${shelf.length - 14} more in Notes</span>` : '') : '<span class="muted">No essences yet. Name notes in the daily scent to start your shelf.</span>'}</div>`;
    html += `<div class="lab-sum"><span class="mono muted">${ready.length ? `${ready.length} ready to blend` : 'Nothing ready yet'}${madeN ? ` · ${madeN} blended` : ''}</span>${ready.slice(0, 8).map((x) => `<button class="lab-e" data-frag="${x.f.id}" style="--c:${fragHex(x.f)}"><span class="dot"></span>${esc(x.f.name)}</button>`).join('')}${ready.length > 8 ? `<span class="lab-more mono muted">+${ready.length - 8} more below</span>` : ''}</div>`;
    for (const [fam, F] of Object.entries(FAMILIES)) {
      const list = rows.filter((x) => FRAG_FAM[x.f.id] === fam); if (!list.length) continue;
      const rd = list.filter((x) => x.r.ready).length, bl = list.filter((x) => x.n).length, cap = q ? 999 : Math.max(12, rd + bl);
      groups.push({ key: 'lf-' + fam, label: F.label, color: famHex(fam), count: list.length });
      html += `<section class="cat col-sec" id="cat-lf-${fam}" data-group="lf-${fam}" style="--c:${famHex(fam)}">
        <div class="cat-h"><div><div class="cat-t"><span class="dot"></span>${F.label}<span class="mono muted">${list.length} perfume${list.length === 1 ? '' : 's'}${rd ? ` · ${rd} ready` : ''}${bl ? ` · ${bl} blended` : ''}</span></div></div></div>
        <div class="lab-list">${list.slice(0, cap).map(labRow).join('')}</div>${list.length > cap ? `<p class="col-none">And ${list.length - cap} more ${F.label.toLowerCase()} perfumes. Filter by name to find one.</p>` : ''}</section>`;
    }
  } else if (colView === 'notes') {
    for (const [fam, f] of Object.entries(FAMILIES)) {
      const items = INGREDIENTS.filter((i) => i.family === fam && (!q || (myNotes.has(i.id) ? i.name + ' ' + i.country : i.country).toLowerCase().includes(q)));
      if (!items.length) continue;
      const got = items.filter((i) => myNotes.has(i.id)).length;
      groups.push({ key: fam, label: f.label, color: famHex(fam), count: `${got}/${items.length}`, n: got });
      html += `<section class="cat col-sec" id="cat-${fam}" data-group="${fam}" style="--c:${famHex(fam)}">
        <div class="cat-h"><div><div class="cat-t"><span class="dot"></span>${f.label}<span class="mono muted">${got} of ${items.length} found</span></div><span class="cat-bar"><i style="--p:${Math.round(100 * got / items.length)}%"></i></span></div></div>
        <div class="col-grid">${items.map((i) => {
          if (!myNotes.has(i.id)) return `<div class="ctile" style="--c:${ingHex(i)}" title="Not found yet: a note from ${esc(i.country)}"><span class="ct-q" aria-hidden="true">?</span><span class="ct-n">Not found</span><span class="ct-s">${esc(i.country)}</span></div>`;
          const mine = RARITIES.filter((r) => FACTS[i.id]?.[r]);
          const fresh = mine.some((r) => newFacts.has(factKey(i.id, r))), master = mine.every((r) => seenFacts.has(factKey(i.id, r)));
          return `<button class="ctile got${master ? ' master' : ''}${fresh ? ' fresh' : ''}" data-ing="${i.id}" style="--c:${ingHex(i)}" title="${esc(i.name)}, found ${myNotes.get(i.id)}×${master ? ', every fact earned' : ''}">${fresh ? '<em class="ct-new">New</em>' : ''}
            <span class="thumb" data-thumb="i:${i.id}"><span class="ph" style="background:radial-gradient(circle at 40% 35%, ${i.c[1]}, ${i.c[0]} 55%, ${i.c[2]})"></span></span>
            <span class="ct-n">${esc(i.name)}</span><span class="ct-f">${mine.map((r) => `<i style="--r:${RARITY[r].col}" class="${seenFacts.has(factKey(i.id, r)) ? 'on' : ''}" title="${RARITY[r].label}"></i>`).join('')}<span class="ct-d" title="${essence(i.id)} drops of essence">${DROP}${essence(i.id)}</span></span></button>`;
        }).join('')}</div></section>`;
    }
  } else {
    for (const r of [...RARITIES].reverse()) {
      const rows = [...seenFacts].map((k) => k.split(':')).filter(([id, t]) => t === r && ING[id] && FACTS[id]?.[t] && (!q || (FACTS[id][t].title + ' ' + ING[id].name).toLowerCase().includes(q)))
        .sort((a, b) => newFacts.has(factKey(...b)) - newFacts.has(factKey(...a)) || ING[a[0]].name.localeCompare(ING[b[0]].name));
      const R = RARITY[r];
      groups.push({ key: 'r-' + r, label: R.label, color: R.col, count: rows.length });
      html += `<section class="col-sec" id="cat-r-${r}" data-group="r-${r}" style="--r:${R.col}">
        <div class="group-h"><span class="col-rh">${pips(R.pips)}${R.label}</span><span class="mono">${rows.length} / ${per[r].all}</span></div>
        ${rows.length ? rows.map(([id, t]) => `<button class="row crow${newFacts.has(factKey(id, t)) ? ' fresh' : ''}" data-ing="${id}" data-fr="${t}" style="--c:${ingHex(ING[id])};--r:${R.col}"><span class="crow-b"></span><span class="name">${newFacts.has(factKey(id, t)) ? '<em class="ct-new">New</em>' : ''}${esc(FACTS[id][t].title)}<span class="sub">${esc(ING[id].name)} · ${esc(ING[id].country)}</span></span><span class="meta">${pips(R.pips)}</span></button>`).join('')
          : `<p class="col-none">No ${R.label.toLowerCase()} facts yet.${r === 'legendary' || r === 'epic' ? ' These turn up rarely, so keep naming notes.' : ''}</p>`}
      </section>`;
    }
  }
  return html;
}

const DROP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6c3.4 4.4 6.4 8.1 6.4 11.6a6.4 6.4 0 0 1-12.8 0c0-3.5 3-7.2 6.4-11.6z"/></svg>';
const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
function labRow({ f, r, n }) {
  const pct = Math.round(100 * r.have / r.all);
  return `<div class="lrow${r.ready ? ' ready' : ''}" style="--c:${fragHex(f)}"><button class="lrow-main" data-frag="${f.id}"><span class="thumb sm" data-thumb="f:${f.id}">${swatch(f, 40)}</span><span class="name">${esc(f.name)}<span class="sub">${esc(f.house)} · ${r.ok} of ${r.ids.length} notes ready${n ? ` · blended ${n}×` : ''}</span><span class="lrow-bar"><i style="--p:${Math.max(r.have ? 3 : 0, pct)}%"></i></span></span></button>${r.ready ? `<button class="btn sm primary" data-blend="${f.id}">Blend</button>` : `<span class="mono lrow-pct">${pct}%</span>`}</div>`;
}
// a fragrance's page: the formula against your shelf, and the button that blends it
function labCard(f) {
  const r = readiness(f), n = lab.made[f.id] || 0; if (!r.ids.length) return '';
  return `<div class="lab-card${r.ready ? ' ready' : ''}" id="lab-card" style="--c:${fragHex(f)}">
    <div class="lab-h"><b>Blend it yourself</b><span class="mono">${r.have} / ${r.all} drops</span></div>
    <span class="lrow-bar"><i style="--p:${Math.max(r.have ? 3 : 0, Math.round(100 * r.have / r.all))}%"></i></span>
    <div class="lab-notes">${r.ids.map((id) => { const e = essence(id), need = r.need[id]; return `<button class="lab-n${e >= need ? ' ok' : ''}" data-ing="${id}" style="--c:${ingHex(ING[id])}" title="${esc(ING[id].name)}: ${Math.min(e, need)} of ${need} drops"><span class="dot"></span>${esc(ING[id].name)}<span class="mono">${Math.min(e, need)}/${need}</span></button>`; }).join('')}</div>
    <div class="lab-f"><span class="muted">${r.ready ? `Blending spends ${r.all} drops from your shelf.` : n ? `You have blended this ${n}×. Collect ${r.all - r.have} more drops to blend it again.` : `Collect ${r.all - r.have} more drops: name these notes in upcoming daily scents.`}</span>
    <button class="btn ${r.ready ? 'primary' : ''}" data-blend="${f.id}" ${r.ready ? '' : 'disabled'}>${DROP}${r.ready ? 'Blend it' : 'Not ready'}</button></div>
    ${n ? `<span class="lab-made">Blended ${n}×</span>` : ''}
  </div>`;
}
function doBlend(id) {
  const f = FRAG[id]; if (!f || !blend(f)) return;
  if (sel.frag !== f) selectFragrance(id);
  else { const c = detailEl.querySelector('#lab-card'); if (c) c.outerHTML = labCard(f); }
  collectionChanged();
  // the notes travel from their origins into the bottle, then a note in the corner confirms the blend
  const tourDone = runTour(f) || Promise.resolve();
  tourDone.catch(() => {}).finally(() => {
  const el = document.createElement('div'); el.className = 'toast'; el.style.setProperty('--r', fragHex(f));
  el.innerHTML = `<span class="toast-ic">${DROP}</span><span class="toast-t"><span class="mono">Blended</span><b>${esc(f.name)}</b><span>${esc(f.house)}, ${f.year}. It joins your perfumes in the collection.</span></span><button class="toast-x" type="button" aria-label="Dismiss">×</button>`;
  el.addEventListener('click', () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); });
  toasts.append(el); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 6000);
  if (!reduceMotion) burst(el.querySelector('.toast-ic'), fragHex(f), { n: 16, spread: 50 });
  });
}

// 3D thumbnails, rendered lazily as cards scroll into view
let models = null, modelsPromise = null;
function getModels() {
  if (!modelsPromise) modelsPromise = import('./models.js').then((m) => (models = m)).catch((e) => { console.warn('3D models unavailable', e); return null; });
  return modelsPromise;
}
const thumbIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    thumbIO.unobserve(e.target);
    loadThumb(e.target);
  }
}, { root: listEl, rootMargin: '120px 200px' });
// the public site ships every list thumbnail as a ready-made image (see the fraguessr-thumbs meta tag);
// elsewhere, or if a file is missing, the thumbnail is rendered live in 3D
const THUMBS = document.querySelector('meta[name="fraguessr-thumbs"]')?.content;
function loadThumb(el) {
  el.classList.add('loading');
  if (THUMBS && !el.dataset.live) {
    const [k, id] = el.dataset.thumb.split(':');
    const img = new Image(); img.alt = ''; img.decoding = 'async';
    img.onload = () => { if (!el.isConnected) return; el.append(img); requestAnimationFrame(() => el.classList.add('ready')); };
    img.onerror = () => { el.dataset.live = '1'; loadThumb(el); };
    img.src = `${THUMBS}${k}-${id}${k === 'f' ? (isDark() ? '-d' : '-l') : ''}.webp`;
    return;
  }
  getModels().then((m) => {
    if (!m || !el.isConnected) return;
    const [k, id] = el.dataset.thumb.split(':');
    const key = el.dataset.thumb + (k === 'f' ? (isDark() ? ':d' : ':l') : '');
    const p = k === 'i' ? m.thumbnail(key, m.thumbBuilders.ingredient(ING[id]))
      : m.thumbnail(key, m.thumbBuilders.fragrance(FRAG[id], liquidFor(FRAG[id]), fragHex(FRAG[id])), sweepFor(fragHex(FRAG[id])));
    p.then((url) => {
      if (!url || !el.isConnected) return;
      const img = new Image(); img.alt = ''; img.decoding = 'async'; img.src = url;
      img.onload = () => { el.append(img); requestAnimationFrame(() => el.classList.add('ready')); };
    });
  });
}
function observeThumbs() { listEl.querySelectorAll('[data-thumb]').forEach((el) => thumbIO.observe(el)); }
// build tooling: ?prerender renders every list thumbnail for the current theme so a script can save them as files
if (new URLSearchParams(location.search).has('prerender')) {
  const keys = new URLSearchParams(location.search).get('prerender') || '';
  window.prerenderThumbs = () => getModels().then((m) => Promise.all([
    ...(keys.includes('i') ? INGREDIENTS.map((i) => m.thumbnail(`i:${i.id}`, m.thumbBuilders.ingredient(i))) : []),
    ...(keys.includes('f') ? FRAGRANCES.map((f) => m.thumbnail(`f:${f.id}:${isDark() ? 'd' : 'l'}`, m.thumbBuilders.fragrance(f, liquidFor(f), fragHex(f)), sweepFor(fragHex(f)))) : []),
  ]).then(() => m.renderedThumbs));
}

// category bar: jump + scrollspy
function spy() {
  const bar = listEl.querySelector('.catbar'); if (!bar) return;
  const top = listEl.getBoundingClientRect().top + bar.offsetHeight + 8;
  let cur = '';
  for (const sec of listEl.querySelectorAll('[data-group]')) { if (sec.getBoundingClientRect().top - top <= 4) cur = sec.dataset.group; else break; }
  if (listEl.scrollTop < 4) cur = '';
  bar.querySelectorAll('.cb').forEach((b) => {
    const on = b.dataset.jump === cur;
    if (on && b.getAttribute('aria-current') !== 'true') b.parentElement.scrollTo({ left: b.offsetLeft - bar.clientWidth / 2 + b.offsetWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
    b.setAttribute('aria-current', String(on));
  });
}
let spyRaf = 0;
listEl.addEventListener('scroll', () => { if (!spyRaf) spyRaf = requestAnimationFrame(() => { spyRaf = 0; spy(); }); }, { passive: true });
listEl.addEventListener('click', (e) => {
  const s = e.target.closest('[data-sort]'); if (s) { fragSort = s.dataset.sort; renderList(true); listEl.scrollTop = 0; return; }
  const j = e.target.closest('[data-jump]');
  if (j) {
    const bar = listEl.querySelector('.catbar'), sec = j.dataset.jump && listEl.querySelector(`#cat-${j.dataset.jump}`);
    listEl.scrollTo({ top: sec ? sec.offsetTop - bar.offsetHeight - 2 : 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    return;
  }
  const bl = e.target.closest('[data-blend]'); if (bl) { doBlend(bl.dataset.blend); return; }
  const cv = e.target.closest('[data-cview]'); if (cv) { colView = cv.dataset.cview; renderList(true); listEl.scrollTop = 0; return; }
  if (e.target.closest('[data-act="col-play"]')) { startPlay(); return; }
  const fr = e.target.closest('.crow'); if (fr) { selectIngredient(fr.dataset.ing, { fact: fr.dataset.fr }); return; }
  const mf = e.target.closest('[data-mile-fact]'); if (mf) { const [id, r] = mf.dataset.mileFact.split(':'); selectIngredient(id, { fact: r }); return; }
  const sc = e.target.closest('[data-scroll]');
  if (sc) { const rail = sc.closest('.cat').querySelector('.rail'); rail.scrollBy({ left: +sc.dataset.scroll * rail.clientWidth * 0.8, behavior: reduceMotion ? 'auto' : 'smooth' }); return; }
  const r = e.target.closest('.row, .card, .ctile[data-ing], .lrow-main, .lab-e'); if (!r) return;
  r.dataset.ing ? selectIngredient(r.dataset.ing) : selectFragrance(r.dataset.frag);
});

function showList() { listEl.classList.remove('off-left'); detailEl.classList.add('off-right'); listEl.inert = false; detailEl.inert = true; }
function showDetail() { listEl.classList.add('off-left'); detailEl.classList.remove('off-right'); detailEl.scrollTop = 0; listEl.inert = true; detailEl.inert = false; }

// ── detail views ───────────────────────────────────────
let vignette = null, modelStage = null;
function getStage() { return getModels().then((m) => m && (modelStage ||= m.createModelStage())); }

const TIER_LABEL = { top: 'Top', heart: 'Heart', base: 'Base' };
function noteChip(n) {
  const id = noteId(n);
  if (!id) return `<span class="badge note lab" title="Recreated with aroma molecules or not mapped to an origin">${esc(n)}</span>`;
  const i = ING[id];
  return `<button class="badge note tinted" data-ing="${id}" style="--c:${ingHex(i)}"><span class="dot" style="background:${ingHex(i)}"></span>${esc(n)}</button>`;
}

function describeFragrance(f) {
  const w = { top: 1, heart: 1.5, base: 2 }, score = {};
  for (const t of ['top', 'heart', 'base']) for (const n of f.tiers[t]) { const id = noteId(n); if (id) score[ING[id].family] = (score[ING[id].family] || 0) + w[t]; }
  const has = (id) => f.ingredients.includes(id);
  const fams = Object.entries(score).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  let genre;
  if (has('oakmoss') && has('bergamot') && (has('labdanum') || has('patchouli')) && !has('vanilla')) genre = 'chypre';
  else if (has('lavender') && (has('tonka') || has('oakmoss')) && (has('geranium') || has('vetiver') || has('musk') || has('vanilla'))) genre = 'aromatic fougère';
  else if (has('seasalt') && (fams[0] === 'wood' || fams[0] === 'citrus' || fams[0] === 'marine')) genre = 'fresh aquatic';
  else if (has('oud')) genre = 'oud';
  else if (has('birch') && (fams[0] === 'wood' || fams[0] === 'resin' || fams[0] === 'spice')) genre = 'leather';
  else {
    const name = { citrus: 'citrus', floral: 'floral', green: 'green', fruit: 'fruity', spice: 'spicy', wood: 'woody', resin: 'amber', gourmand: 'gourmand', animalic: 'musky', marine: 'aquatic' };
    genre = fams.length > 1 && fams[1] !== fams[0] ? `${name[fams[1]]} ${name[fams[0]]}` : name[fams[0]] || 'abstract';
  }
  const who = { Women: 'for women', Men: 'for men', Unisex: 'shared by everyone' }[f.audience];
  const by = f.perfumer === f.house ? `${f.house}'s in-house team` : f.perfumer.split(', ').length > 2 ? `a team of perfumers led by ${f.perfumer.split(', ')[0]}` : listText(f.perfumer.split(', '));
  const t3 = (t) => listText(f.tiers[t].slice(0, 3));
  const countries = [...new Set(f.ingredients.map((id) => ING[id].country))];
  const accords = f.ingredients.filter((id) => ING[id].accord).length;
  let text = `${f.name} is ${/^[aeiou]/.test(genre) ? 'an' : 'a'} ${genre} fragrance ${who}, composed by ${by} for ${f.house} in ${f.year}. `;
  if (f.tiers.top.join() === f.tiers.base.join()) text += `It is built around a single note, ${f.tiers.top[0]}, which stays the same from first spray to drydown. `;
  else text += `It opens with ${t3('top')}, moves into a heart of ${t3('heart')}, and settles on ${t3('base')}. `;
  if (countries.length) text += `Its mapped ingredients trace back to ${countries.length} ${countries.length === 1 ? 'country' : 'countries'}${countries.length > 1 ? `, from ${countries[0]} to ${countries[countries.length - 1]}` : ''}`;
  text += accords ? `, and ${accords} of them ${accords === 1 ? 'is a lab-built accord' : 'are lab-built accords'} rather than natural extracts.` : '.';
  return { genre, text };
}

function heroFor(kind, el, payload) {
  vignette?.stop(); vignette = null;
  const cv = el.querySelector('canvas.vignette');
  if (cv) vignette = createVignette(cv, payload.vig);
  const host = el.querySelector('.model');
  getStage().then((st) => {
    if (!st || !host.isConnected) { el.classList.add('no-3d'); return; }
    st.mount(host);
    const dark = isDark();
    if (kind === 'ing') {
      const ing = payload.ing;
      st.showIngredient(ing, ingHex(ing), dark ? mix(ingHex(ing), '#2a2a2e', 0.78) : mix(ingHex(ing), '#ffffff', 0.82));
    } else {
      const f = payload.f, sig = fragHex(f);
      const notes = f.ingredients.slice().sort((a, b) => vividness(ING_COLOR[b]) - vividness(ING_COLOR[a])).slice(0, 3).map((id) => ING[id]);
      st.showFragrance(f, payload.liquid, notes, dark ? mix(sig, '#332c27', 0.8) : mix(sig, '#ffffff', 0.88), sig, sweepFor(sig));
    }
    requestAnimationFrame(() => el.classList.add('loaded'));
  });
}

// ── selection tint: page accent, stage wash and globe glow follow the ingredient ──
let tintRgb = null; const glow = { cur: null, base: null };
function setTint(hex, palette) {
  if (!hex) { root.style.removeProperty('--accent-fg'); root.style.removeProperty('--accent'); root.style.removeProperty('--accent-soft'); root.style.removeProperty('--tint'); root.style.removeProperty('--tint-2'); root.style.removeProperty('--tint-3'); tintRgb = null; return; }
  const [r, g, b] = hexRgb(hex);
  // keep the accent legible on both themes
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const acc = !isDark() && lum > 0.62 ? rgbHex([r * 0.62, g * 0.62, b * 0.62]) : isDark() && lum < 0.3 ? rgbHex([r + (255 - r) * 0.45, g + (255 - g) * 0.45, b + (255 - b) * 0.45]) : hex;
  root.style.setProperty('--accent', acc);
  const [ar, ag, ab] = hexRgb(acc);
  root.style.setProperty('--accent-fg', (0.299 * ar + 0.587 * ag + 0.114 * ab) / 255 > 0.6 ? '#111111' : '#ffffff');
  root.style.setProperty('--accent-soft', `rgba(${r},${g},${b},0.16)`);
  root.style.setProperty('--tint', `rgba(${r},${g},${b},0.22)`);
  const p2 = hexRgb(palette?.[1] || hex), p3 = hexRgb(palette?.[2] || hex);
  root.style.setProperty('--tint-2', `rgba(${p2},0.18)`);
  root.style.setProperty('--tint-3', `rgba(${p3},0.16)`);
  tintRgb = [r / 255, g / 255, b / 255];
}
function selectIngredient(id, { fly = true, fact } = {}) {
  const ing = ING[id]; if (!ing) return;
  stopTour();
  setTint(ingHex(ing), ing.c);
  sel.ing = ing; sel.frag = null;
  if (fly) flyTo(ing.loc, Math.max(view.tScale, 2.1));
  const uses = USES[id];
  const by = { top: [], heart: [], base: [] }; uses.forEach((u) => by[u.tier].push(u.f));
  const usedList = (t) => by[t].length ? `<div class="tier"><span class="k">${TIER_LABEL[t]}</span><div class="notes">${by[t].sort((a, b) => a.name.localeCompare(b.name)).map((f) => `<button class="badge note" data-frag="${f.id}">${esc(f.name)} <span class="mono muted">${esc(f.house)}</span></button>`).join('')}</div></div>` : '';
  const fam = FAMILIES[ing.family];
  detailEl.innerHTML = `
    <div class="detail">
      <div class="detail-top"><button class="btn icon ghost" data-back aria-label="Back to list"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <div class="crumbs"><span>Ingredients</span><span>/</span><b>${esc(ing.name)}</b></div></div>
      <div class="hero" id="hero"><canvas class="vignette"></canvas><div class="fade"></div><div class="model"></div>
        <span class="badge glass tag mono">${esc(ing.place)}</span><span class="badge glass tag2 mono">Drag to turn</span></div>
      <div class="body">
        <div><h2 class="title">${esc(ing.name)}</h2><div class="latin">${esc(ing.latin)}</div></div>
        <div class="badges"><span class="badge"><span class="dot" style="background:${famHex(ing.family)}"></span>${fam.label}</span><span class="badge soft">${esc(ing.country)}</span><span class="badge palette" title="Color palette">${ing.c.map((c) => `<span class="dot" style="background:${c};box-shadow:0 0 0 1px rgba(0,0,0,.12)"></span>`).join('')}</span>${ing.accord ? '<span class="badge accent">Accord in perfume</span>' : '<span class="badge soft">Natural extract</span>'}</div>
        <p class="prose">${esc(ing.about)}</p>
        ${ing.accord ? `<div class="callout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg><span>Perfumers rebuild this note from aroma molecules. The pin marks where the plant or material comes from.</span></div>` : ''}
        <div class="facts">
          <div><span class="k">Origin</span><span class="v">${esc(ing.place)}</span></div>
          <div><span class="k">Part used</span><span class="v">${esc(ing.part)}</span></div>
          <div><span class="k">Method</span><span class="v">${esc(ing.method)}</span></div>
          <div><span class="k">Harvest</span><span class="v">${esc(ing.season)}</span></div>
        </div>
        ${FACTS[id] ? `<div class="fact-box"><div class="section-h"><span>Fun facts</span><span class="mono muted fact-count"></span></div><div class="fact-tiers" role="group" aria-label="Fun facts by rarity"></div><div class="fact-slot"></div></div>` : ''}
        <div class="section-h"><span>Used in ${uses.length} fragrance${uses.length === 1 ? '' : 's'}</span><span class="mono muted">by note position</span></div>
        <div class="pyramid">${usedList('top')}${usedList('heart')}${usedList('base')}</div>
      </div>
    </div>`;
  heroFor('ing', detailEl.querySelector('#hero'), { vig: ing, ing });
  mountFacts(id, fact);
  showDetail(); markActive(); setHash('i-' + id);
  if (fact) requestAnimationFrame(() => detailEl.querySelector('.fact-box')?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }));
  choreo(detailEl); selAt = performance.now();
}

// five facts per note, one per rarity: earned ones open as cards, the rest show only their rarity until the
// note is named in the daily scent (rarer ones turn up less often)
function mountFacts(id, pick) {
  const box = detailEl.querySelector('.fact-box'); if (!box || !FACTS[id]) return;
  const tiers = RARITIES.filter((r) => FACTS[id][r]), have = tiers.filter((r) => seenFacts.has(factKey(id, r)));
  const cur = tiers.includes(pick) ? pick : have[have.length - 1] || tiers[0];
  box.querySelector('.fact-count').textContent = `${have.length}/${tiers.length} found · ${seenFacts.size.toLocaleString('en-US')}/${FACT_TOTAL.toLocaleString('en-US')}`;
  const bar = box.querySelector('.fact-tiers');
  bar.innerHTML = tiers.map((r) => { const got = have.includes(r), R = RARITY[r]; return `<button type="button" class="ft${got ? ' got' : ''}${r === cur ? ' on' : ''}" data-r="${r}" style="--r:${R.col}" aria-pressed="${r === cur}" title="${R.label} fact${got ? '' : ', not found yet'}"><span class="fc-pips">${'<i></i>'.repeat(R.pips)}</span><b>${R.label}</b>${got ? '' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'}</button>`; }).join('');
  bar.querySelectorAll('.ft').forEach((b) => b.addEventListener('click', () => mountFacts(id, b.dataset.r)));
  const slot = box.querySelector('.fact-slot'), R = RARITY[cur];
  if (!seenFacts.has(factKey(id, cur))) {
    slot.innerHTML = `<div class="fc-lock" style="--r:${R.col}"><div class="fc-lock-art">?</div><div><span class="fc-rar"><span class="fc-pips">${'<i></i>'.repeat(R.pips)}</span>${R.label} fact</span><b>Not earned yet</b><p>Name ${esc(ING[id].name.toLowerCase())} in the daily scent to earn one of its facts. This one turns up ${factChance(id, cur)} times in 100.</p><button class="btn" type="button">Play the daily scent</button></div></div>`;
    slot.querySelector('button').addEventListener('click', () => startPlay());
    return;
  }
  mountFact(slot, id, cur);
}
// a compact fact card in a slot, with the ingredient's 3D thumbnail once it renders
function mountFact(slot, id, r, extra) {
  if (!cardKit) { slot.dataset.want = `${id}:${r}`; cardKitReady.then(() => { if (slot.isConnected && slot.dataset.want === `${id}:${r}`) mountFact(slot, id, r, extra); }); return null; }
  delete slot.dataset.want;
  const card = makeFact(id, r, { compact: true, ...extra });
  slot.replaceChildren(card.el); card.start();
  getModels().then((m) => m?.thumbnail('i:' + id, m.thumbBuilders.ingredient(ING[id])).then((url) => card.setThumb(url)));
  return card;
}

function selectFragrance(id) {
  const f = FRAG[id]; if (!f) return;
  stopTour();
  sel.frag = f; sel.ing = null;
  setTint(fragHex(f), f.ingredients.slice(0, 3).map((i) => ING_COLOR[i]));
  const pts = f.ingredients.map((i) => ING[i].loc).concat([HOUSES[f.house]]);
  const mean = U3mean(pts);
  flyTo(mean, 1.15);
  const liquid = liquidFor(f), { genre, text } = describeFragrance(f);
  const dists = f.ingredients.map((i) => haversine(ING[i].loc, HOUSES[f.house]));
  const total = Math.round(dists.reduce((a, b) => a + b, 0));
  const far = f.ingredients.length ? ING[f.ingredients[dists.indexOf(Math.max(...dists))]] : null;
  const lead = f.ingredients.slice().sort((a, b) => USES[a].length - USES[b].length)[0];
  detailEl.innerHTML = `
    <div class="detail">
      <div class="detail-top"><button class="btn icon ghost" data-back aria-label="Back to list"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <div class="crumbs"><span>Fragrances</span><span>/</span><b>${esc(f.name)}</b></div></div>
      <div class="hero frag" id="hero" style="--liquid:${liquid};--sig:${fragHex(f)}"><div class="model"></div><span class="badge glass tag mono">Drag to turn</span></div>
      <div class="body">
        <div><h2 class="title">${esc(f.name)}</h2><div class="latin" style="font-style:normal">${esc(f.house)} · ${f.year} · ${esc(f.perfumer)}</div></div>
        <div class="badges"><span class="badge" style="text-transform:capitalize">${esc(genre)}</span><span class="badge soft">${esc(f.audience)}</span><span class="badge soft">${f.ingredients.length} mapped origins</span></div>
        <p class="prose">${esc(text)}</p>
        <div class="stat-row">
          <div class="stat"><div class="n">${total.toLocaleString()}</div><div class="k">km travelled</div></div>
          <div class="stat"><div class="n">${new Set(f.ingredients.map((i) => ING[i].country)).size}</div><div class="k">countries</div></div>
          <div class="stat"><div class="n">${f.tiers.top.length + f.tiers.heart.length + f.tiers.base.length}</div><div class="k">listed notes</div></div>
        </div>
        ${labCard(f)}
        ${f.ingredients.length ? `<button class="btn" id="tour"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l14 8-14 8z"/></svg>Watch the notes travel to ${esc(f.house)}</button>` : ''}
        <div class="section-h"><span>Notes</span><span class="mono muted">tap a note to see its origin</span></div>
        <div class="pyramid">${['top', 'heart', 'base'].map((t) => `<div class="tier"><span class="k">${TIER_LABEL[t]}</span><div class="notes">${f.tiers[t].map(noteChip).join('')}</div></div>`).join('')}</div>
        ${far ? `<div class="callout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg><span>The farthest-travelled note is <b>${esc(far.name)}</b> from ${esc(far.place)}, ${esc(far.country)}, about ${Math.round(Math.max(...dists)).toLocaleString()} km from ${esc(f.house)}'s home city.${lead && lead !== far.id ? ` Its rarest mapped note in this atlas is <b>${esc(ING[lead].name)}</b>.` : ''}</span></div>` : ''}
      </div>
    </div>`;
  heroFor('frag', detailEl.querySelector('#hero'), { f, liquid });
  detailEl.querySelector('#tour')?.addEventListener('click', () => runTour(f));
  showDetail(); markActive(); setHash('f-' + id);
  choreo(detailEl); selAt = performance.now();
}
// a detail page arriving: the name writes itself in, then badges, facts, stats and notes follow in turn
function choreo(root) {
  letters(root.querySelector('.body .title'), { delay: 90, step: 26 });
  cascade(root.querySelectorAll('.body > *'), { step: 60, delay: 160, max: 12 });
  cascade(root.querySelectorAll('.body > .badges .badge'), { cls: 'mv-pop', step: 50, delay: 280 });
  cascade(root.querySelectorAll('.facts > div, .stat'), { cls: 'mv-pop', step: 70, delay: 400 });
  cascade(root.querySelectorAll('.pyramid .badge'), { cls: 'mv-deal', step: 22, delay: 520, max: 30 });
  root.querySelectorAll('.stat .n').forEach((el, k) => countUp(el, { delay: 420 + k * 90 }));
}
function U3mean(pts) {
  let x = 0, y = 0, z = 0; for (const p of pts) { const [a, b, c] = U(p); x += a; y += b; z += c; }
  const lat = Math.atan2(y, Math.hypot(x, z)) / DEG; let lng = (Math.atan2(z, -x) + Math.PI) / DEG; if (lng > 180) lng -= 360;
  return [lat, lng];
}

detailEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) { clearSelection(); showList(); return; }
  const bl = e.target.closest('[data-blend]'); if (bl) { doBlend(bl.dataset.blend); return; }
  const i = e.target.closest('[data-ing]'); if (i) { selectIngredient(i.dataset.ing); return; }
  const f = e.target.closest('[data-frag]'); if (f) selectFragrance(f.dataset.frag);
});
function markActive() { listEl.querySelectorAll('.active').forEach((el) => el.classList.remove('active')); const k = sel.ing ? `[data-ing="${sel.ing.id}"]` : sel.frag ? `[data-frag="${sel.frag.id}"]` : null; const el = k && listEl.querySelector(k); if (!el) return; el.classList.add('active');
  // keep the picked item in view for when the list slides back (without scrolling the page itself)
  const rail = el.closest('.rail'); if (rail) rail.scrollLeft = el.offsetLeft - rail.clientWidth / 2 + el.offsetWidth / 2;
  const host = el.closest('.cat') || el, bar = listEl.querySelector('.catbar')?.offsetHeight || 0;
  const top = host.getBoundingClientRect().top - listEl.getBoundingClientRect().top + listEl.scrollTop - bar;
  if (top < listEl.scrollTop || top + host.offsetHeight > listEl.scrollTop + listEl.clientHeight - bar) listEl.scrollTop = top - 4; }
function clearSelection() { setTint(null); sel.ing = null; sel.frag = null; vignette?.stop(); vignette = null; stopTour(); markActive(); setHash(''); pauseSpin(1500); view.tScale = Math.min(view.tScale, 1.3); }

// ── journey: collect each note where it grows, then blend them at the house ──
// The globe flies to every origin in pyramid order; a burst of petals, drops or chips is gathered into a
// droplet that flies down into a tray of vials. At the end the vials pour into a flask at the house,
// swirl together and settle into the fragrance's own colour before the bottle appears.
let tour = null; const caption = $('#caption'), jrEl = $('#journey'), jrTray = jrEl.querySelector('.jr-tray'), jrMix = jrEl.querySelector('.jr-mix');
const jr = { parts: [], rings: [], orbs: [], drops: [] };
const SHAPE = { citrus: 'drop', fruit: 'drop', gourmand: 'drop', floral: 'petal', green: 'leaf', spice: 'grain', wood: 'chip', resin: 'tear', animalic: 'spark', marine: 'drop' };
function stagePoint(el) { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return [r.left + r.width / 2 - s.left, r.top + r.height / 2 - s.top]; }
function harvest(ing) {
  const col = ingHex(ing), shape = SHAPE[ing.family] || 'drop', now = performance.now();
  jr.rings.push({ loc: ing.loc, col, t0: now }, { loc: ing.loc, col, t0: now + 260 });
  jr.orbs.push({ loc: ing.loc, col, t0: now + 500, life: 1650 });
  for (let i = 0; i < (reduceMotion ? 12 : 44); i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 90;
    jr.parts.push({ loc: ing.loc, col, shape, t0: now + Math.random() * 220, life: 1300 + Math.random() * 400, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 30, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6, s: 1.1 + Math.random() * 0.9 });
  }
}
function drawJourney(ctx, now) {
  if (!jr.parts.length && !jr.rings.length && !jr.orbs.length) return;
  const dark = isDark();
  jr.rings = jr.rings.filter((r) => now - r.t0 < 1400);
  for (const r of jr.rings) {
    const k = (now - r.t0) / 1400; if (k < 0) continue;
    const p = project(r.loc, 0); if (p.z < 0) continue;
    ctx.globalAlpha = (1 - k) * 0.9; ctx.strokeStyle = r.col; ctx.lineWidth = 2 * (1 - k) + 0.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 + k * 46, 0, Math.PI * 2); ctx.stroke();
  }
  jr.parts = jr.parts.filter((q) => now - q.t0 < q.life);
  jr.orbs = jr.orbs.filter((o) => now - o.t0 < o.life);
  ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
  // the droplet gathering above the origin: a soft orb that swells as the pieces arrive
  for (const o of jr.orbs) {
    const k = (now - o.t0) / o.life; if (k < 0) continue;
    const p = project(o.loc, 0); if (p.z < 0) continue;
    const r = 4 + 22 * Math.sin(Math.min(1, k * 1.25) * Math.PI / 2), [cr, cg, cb] = hexRgb(o.col);
    const gr = ctx.createRadialGradient(p.x, p.y - 26, 0, p.x, p.y - 26, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k * 0.5)})`); gr.addColorStop(0.25, `rgba(${cr},${cg},${cb},${0.8 * (1 - k * 0.4)})`); gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.globalAlpha = Math.min(1, k * 4); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y - 26, r, 0, Math.PI * 2); ctx.fill();
  }
  for (const q of jr.parts) {
    const t = (now - q.t0) / 1000; if (t < 0) continue;
    const k = (now - q.t0) / q.life, p = project(q.loc, 0); if (p.z < 0) continue;
    // fly outward, then get pulled into the droplet forming just above the origin
    const out = 1 - Math.exp(-t * 3), pull = Math.max(0, (k - 0.42) / 0.58) ** 2;
    const ox = q.vx * out * 0.55, oy = q.vy * out * 0.55 - 14 * t;
    const x = p.x + ox * (1 - pull), y = p.y + oy * (1 - pull) - 26 * pull;
    const s = q.s * (1 - pull * 0.7);
    ctx.globalAlpha = Math.min(1, k * 6) * (1 - pull * 0.6);
    ctx.fillStyle = q.col; ctx.save(); ctx.translate(x, y); ctx.rotate(q.rot + q.vr * t);
    ctx.beginPath();
    if (q.shape === 'petal') ctx.ellipse(0, 0, 5 * s, 2.6 * s, 0, 0, Math.PI * 2);
    else if (q.shape === 'leaf') { ctx.moveTo(-6 * s, 0); ctx.quadraticCurveTo(0, -4 * s, 6 * s, 0); ctx.quadraticCurveTo(0, 4 * s, -6 * s, 0); }
    else if (q.shape === 'grain') ctx.rect(-2 * s, -2 * s, 4 * s, 4 * s);
    else if (q.shape === 'chip') ctx.rect(-5 * s, -1.2 * s, 10 * s, 2.4 * s);
    else if (q.shape === 'spark') { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 5 * s, Math.sin(a) * 5 * s); } ctx.strokeStyle = q.col; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore(); continue; }
    else if (q.shape === 'tear') { ctx.moveTo(0, -4.5 * s); ctx.quadraticCurveTo(4 * s, 1 * s, 0, 4 * s); ctx.quadraticCurveTo(-4 * s, 1 * s, 0, -4.5 * s); }
    else ctx.arc(0, 0, 2.8 * s, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
// a glossy droplet that flies between two stage points along an arc
function flyDrop(col, from, to, ms = 760, lift = 70) {
  const d = document.createElement('i'); d.className = 'jr-drop'; d.style.setProperty('--c', col); jrEl.appendChild(d); jr.drops.push(d);
  const mid = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - lift];
  const kf = [0, 0.5, 1].map((t, i) => { const [x, y] = i === 0 ? from : i === 1 ? mid : to; return { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${i === 0 ? 0.3 : i === 1 ? 1.15 : 0.7})`, opacity: i === 2 ? 0.9 : 1 }; });
  const an = d.animate(kf, { duration: reduceMotion ? 1 : ms, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' });
  return an.finished.then(() => d.remove(), () => d.remove());
}
function tourDone() { stage.classList.remove('journeying'); caption.classList.remove('jr'); jrTray.innerHTML = ''; jrTray.className = 'jr-tray glass'; jrMix.innerHTML = ''; jrMix.className = 'jr-mix'; }
function stopTour() {
  if (tour) tour.cancelled = true; tour = null;
  caption.classList.remove('show'); jr.parts = []; jr.rings = []; jr.orbs = [];
  for (const d of jr.drops) d.remove(); jr.drops = [];
  tourDone();
}
// ── fun facts: earned by naming notes in the daily scent or practice rounds, kept per browser ──
const FACT_TOTAL = Object.keys(FACTS).filter((id) => ING[id]).reduce((n, id) => n + Object.keys(FACTS[id]).length, 0);
const factKey = (id, r) => id + ':' + r;
const seenFacts = new Set();
// stored as "note:rarity"; a bare note id is from when each note had one fact
function loadFacts() { seenFacts.clear(); try { for (const k of JSON.parse(localStorage.getItem('noteguessr:facts') || '[]')) { const [id, r = LEGACY_TIER[k]] = k.split(':'); if (FACTS[id]?.[r]) seenFacts.add(factKey(id, r)); } } catch {} }
loadFacts();
function discover(id, r) { const k = factKey(id, r); if (!FACTS[id]?.[r] || seenFacts.has(k)) return false; seenFacts.add(k); try { localStorage.setItem('noteguessr:facts', JSON.stringify([...seenFacts])); } catch {} newFacts.add(k); saveNew(); $('#tab-col').classList.add('has-new'); collectionChanged(); dirty(); return true; }
// notes named in play, with how many times each was found; older saves are rebuilt from past daily logs and earned facts
const myNotes = new Map();
try { for (const [id, n] of Object.entries(JSON.parse(localStorage.getItem('noteguessr:notes') || '{}'))) if (ING[id]) myNotes.set(id, n); } catch {}
if (!myNotes.size) try {
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^noteguessr:scent:\d{4}-/.test(k)) continue; for (const x of JSON.parse(localStorage.getItem(k))?.log || []) if (x.hit && ING[x.id]) myNotes.set(x.id, (myNotes.get(x.id) || 0) + 1); }
  for (const k of seenFacts) { const id = k.split(':')[0]; if (!myNotes.has(id)) myNotes.set(id, 1); }
} catch {}
$('#count-col').textContent = myNotes.size;
function collectNote(id) { if (!ING[id]) return false; const isNew = !myNotes.has(id); myNotes.set(id, (myNotes.get(id) || 0) + 1); try { localStorage.setItem('noteguessr:notes', JSON.stringify(Object.fromEntries(myNotes))); } catch {} collectionChanged(); dirty(); return isNew; }
function collectionChanged() { $('#count-col').textContent = myNotes.size; if (tab === 'col' && !play.active) { const y = listEl.scrollTop; renderList(); listEl.scrollTop = y; } }
// each note named in play deals one of its five facts, drawn at fixed odds whatever you already hold, so a rarity
// turns up exactly as often as its name says; a fact you already have still pays its drops of essence (see the lab)
const ODDS = { common: 60, uncommon: 22, rare: 10, epic: 6, legendary: 2 };
function factChance(id, r) { const tiers = RARITIES.filter((t) => FACTS[id]?.[t]); return Math.max(1, Math.round(100 * ODDS[r] / tiers.reduce((n, t) => n + ODDS[t], 0))); }
function drawFact(id) {
  const pool = RARITIES.filter((r) => FACTS[id]?.[r]);
  let x = Math.random() * pool.reduce((n, r) => n + ODDS[r], 0);
  for (const r of pool) { x -= ODDS[r]; if (x < 0) return r; }
  return pool[pool.length - 1];
}

// ── the perfumer's lab: every fact a note deals also pays drops of that note's essence, more the rarer the fact,
// and drops are spent to blend the fragrances in the atlas: each listed note costs 1 drop in the top, 2 in the
// heart and 3 in the base, the way a real formula leans on its base. Totals earned and spent only ever grow, so
// two devices merge by keeping the larger of each.
const YIELD = { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 };
const NEED = { top: 1, heart: 2, base: 3 };
const lab = (() => { try { const l = JSON.parse(localStorage.getItem('noteguessr:lab')); if (l?.got) return { got: l.got, used: l.used || {}, made: l.made || {} }; } catch {} return null; })() || (() => {
  // first visit since the lab opened: every fact already earned pays its drops once
  const l = { got: {}, used: {}, made: {} };
  for (const k of seenFacts) { const [id, r] = k.split(':'); l.got[id] = (l.got[id] || 0) + YIELD[r]; }
  try { localStorage.setItem('noteguessr:lab', JSON.stringify(l)); } catch {}
  return l;
})();
function loadLab() { try { const l = JSON.parse(localStorage.getItem('noteguessr:lab')); if (l?.got) Object.assign(lab, { got: l.got, used: l.used || {}, made: l.made || {} }); } catch {} }
const saveLab = () => { try { localStorage.setItem('noteguessr:lab', JSON.stringify(lab)); } catch {} dirty(); };
const essence = (id) => Math.max(0, (lab.got[id] || 0) - (lab.used[id] || 0));
const dropsTotal = () => Object.keys(lab.got).reduce((n, id) => n + essence(id), 0);
function earn(id, r) { if (!ING[id] || !YIELD[r]) return 0; lab.got[id] = (lab.got[id] || 0) + YIELD[r]; saveLab(); return YIELD[r]; }
// a fragrance's formula: drops of each mapped note (a note listed in two tiers needs both shares)
function recipe(f) {
  const need = {};
  for (const t of ['top', 'heart', 'base']) for (const n of f.tiers[t]) { const id = noteId(n); if (id) need[id] = (need[id] || 0) + NEED[t]; }
  return need;
}
function readiness(f) {
  const need = recipe(f), ids = Object.keys(need);
  const have = ids.reduce((n, id) => n + Math.min(essence(id), need[id]), 0), all = ids.reduce((n, id) => n + need[id], 0);
  return { need, ids, have, all, ok: ids.filter((id) => essence(id) >= need[id]).length, ready: ids.length > 0 && have === all };
}
function blend(f) {
  const r = readiness(f); if (!r.ready) return false;
  for (const id of r.ids) lab.used[id] = (lab.used[id] || 0) + r.need[id];
  lab.made[f.id] = (lab.made[f.id] || 0) + 1; saveLab();
  return true;
}
// facts earned since the collection was last looked at, so it can mark them New
const newFacts = new Set();
try { for (const k of JSON.parse(localStorage.getItem('noteguessr:newfacts') || '[]')) if (seenFacts.has(k)) newFacts.add(k); } catch {}
const saveNew = () => { try { localStorage.setItem('noteguessr:newfacts', JSON.stringify([...newFacts])); } catch {} };
function markSeen() { if (!newFacts.size) return; newFacts.clear(); saveNew(); $('#tab-col').classList.remove('has-new'); }
$('#tab-col').classList.toggle('has-new', newFacts.size > 0);

// ── milestones: goals in the collection, each paying out one bonus fact of at least a given rarity ──
// The bonus comes from a note you have already found, so every fact is still tied to something named in play.
const RANK = Object.fromEntries(RARITIES.map((r, k) => [r, k]));
const stats = (() => { try { return JSON.parse(localStorage.getItem('noteguessr:stats')) || {}; } catch { return {}; } })();
const miles = (() => { try { return JSON.parse(localStorage.getItem('noteguessr:miles')) || {}; } catch { return {}; } })();
const saveStats = () => { try { localStorage.setItem('noteguessr:stats', JSON.stringify(stats)); localStorage.setItem('noteguessr:miles', JSON.stringify(miles)); } catch {} dirty(); };
function bestStreak() {
  let n = stats.streak || 0;
  try { n = Math.max(n, JSON.parse(localStorage.getItem('noteguessr:scent:streak'))?.n || 0); } catch {}
  return n;
}
function bestFamily() {
  let best = { have: 0, all: 1, fam: 'citrus' };
  for (const fam of Object.keys(FAMILIES)) {
    const all = INGREDIENTS.filter((i) => i.family === fam), have = all.filter((i) => myNotes.has(i.id)).length;
    if (have / all.length > best.have / best.all) best = { have, all: all.length, fam };
  }
  return best;
}
const factsOn = (id) => RARITIES.filter((r) => seenFacts.has(factKey(id, r))).length;
const ICON = {
  leaf: '<path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14zM5 19l7-7"/>',
  drop: '<path d="M12 3c3.4 4.4 6.4 8.1 6.4 11.6a6.4 6.4 0 0 1-12.8 0C5.6 11.1 8.6 7.4 12 3z"/>',
  case: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 12h18"/>',
  organ: '<path d="M4 20h16M6 20V9M10 20V6M14 20V9M18 20V12"/><circle cx="6" cy="7" r="1.4"/><circle cx="10" cy="4" r="1.4"/><circle cx="14" cy="7" r="1.4"/><circle cx="18" cy="10" r="1.4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  nose: '<path d="M12 4v9l-3 3h6"/><path d="M5 20c2-1.5 4.5-2 7-2s5 .5 7 2"/>',
  flame: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-3-2 2-3 4.5-3 7a6 6 0 0 0 6 6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  fam: '<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><circle cx="12" cy="16" r="3"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
  crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
};
const MILESTONES = [
  { id: 'n10', icon: 'leaf', name: 'First pressing', goal: 'Find 10 notes', of: () => [myNotes.size, 10], reward: 'rare' },
  { id: 'n25', icon: 'drop', name: 'Apprentice nose', goal: 'Find 25 notes', of: () => [myNotes.size, 25], reward: 'rare' },
  { id: 'n50', icon: 'case', name: 'Sample case', goal: 'Find 50 notes', of: () => [myNotes.size, 50], reward: 'epic' },
  { id: 'n100', icon: 'organ', name: 'Perfumer’s organ', goal: 'Find 100 notes', of: () => [myNotes.size, 100], reward: 'epic' },
  { id: 'nall', icon: 'globe', name: 'The whole atlas', goal: `Find all ${INGREDIENTS.length} notes`, of: () => [myNotes.size, INGREDIENTS.length], reward: 'legendary' },
  { id: 'perfect', icon: 'nose', name: 'Perfect nose', goal: 'Name every note of a scent', of: () => [Math.min(1, stats.perfect || 0), 1], reward: 'epic' },
  { id: 's3', icon: 'flame', name: 'Three-day trail', goal: 'Play the daily scent 3 days in a row', of: () => [bestStreak(), 3], reward: 'rare' },
  { id: 's7', icon: 'sun', name: 'A week of scents', goal: 'Play the daily scent 7 days in a row', of: () => [bestStreak(), 7], reward: 'epic' },
  { id: 's30', icon: 'moon', name: 'Month in bloom', goal: 'Play the daily scent 30 days in a row', of: () => [bestStreak(), 30], reward: 'legendary' },
  { id: 'fam', icon: 'fam', name: 'Full family', goal: 'Find every note in one family', of: () => { const b = bestFamily(); return [b.have, b.all, `best: ${FAMILIES[b.fam].label}`]; }, reward: 'epic' },
  { id: 'master', icon: 'star', name: 'Mastered', goal: 'Earn all five facts of one note', of: () => [Math.max(0, ...[...myNotes.keys()].map(factsOn)), 5], reward: 'rare' },
  { id: 'f100', icon: 'book', name: 'Storyteller', goal: 'Earn 100 facts', of: () => [seenFacts.size, 100], reward: 'epic' },
  { id: 'leg', icon: 'crown', name: 'Legend', goal: 'Earn a legendary fact', of: () => [Math.min(1, [...seenFacts].filter((k) => k.endsWith(':legendary')).length), 1], reward: 'epic' },
];
// the open milestone closest to done, for the end of a game
function nextMilestone() {
  const open = MILESTONES.filter((m) => !miles[m.id]).map((m) => { const [have, need] = m.of(); return { m, have: Math.min(have, need), need }; });
  return open.sort((a, b) => b.have / b.need - a.have / a.need)[0] || null;
}
// a bonus fact from a found note, at least `min` rare (lowering the bar only when nothing that rare is left)
function bonusFact(min, avoid) {
  for (let floor = RANK[min]; floor >= 0; floor--) {
    const pool = [];
    for (const id of myNotes.keys()) if (!avoid?.has(id)) for (const r of RARITIES) if (RANK[r] >= floor && FACTS[id]?.[r] && !seenFacts.has(factKey(id, r))) pool.push([id, r]);
    if (!pool.length) continue;
    let x = Math.random() * pool.reduce((n, [, r]) => n + ODDS[r], 0);
    for (const p of pool) { x -= ODDS[p[1]]; if (x < 0) return p; }
    return pool[pool.length - 1];
  }
  return null;
}
// game events feed the stats; any milestone now complete is marked and pays out
// (ev.avoid: notes still hidden in the scent being played, so a bonus fact can't give one away)
function checkMilestones(ev = {}) {
  if (ev.perfect) stats.perfect = (stats.perfect || 0) + 1;
  stats.streak = bestStreak();
  const won = [];
  for (const m of MILESTONES) {
    if (miles[m.id]) continue;
    const [have, need] = m.of();
    if (have < need) continue;
    const b = bonusFact(m.reward, new Set(ev.avoid || [])), rec = { at: new Date().toISOString().slice(0, 10) };
    if (b) { rec.f = factKey(...b); discover(...b); earn(...b); }
    miles[m.id] = rec; won.push({ m, id: b?.[0], r: b?.[1] });
  }
  saveStats();
  if (won.length) { collectionChanged(); celebrate(won); }
  return won;
}
// a stack of toasts in the corner, one per milestone reached
const toasts = document.createElement('div'); toasts.className = 'toasts'; toasts.setAttribute('aria-live', 'polite'); document.body.append(toasts);
function celebrate(won) {
  won.forEach(({ m, id, r }, k) => setTimeout(() => {
    const R = r && RARITY[r], el = document.createElement('div');
    el.className = 'toast'; el.style.setProperty('--r', R ? R.col : 'var(--accent)');
    el.innerHTML = `<span class="toast-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[m.icon]}</svg></span>
      <span class="toast-t"><span class="mono">Milestone reached</span><b>${esc(m.name)}</b><span>${id ? `Bonus ${R.label.toLowerCase()} fact: ${esc(FACTS[id][r].title)} (${esc(ING[id].name)})` : 'Every fact from your notes is already yours.'}</span></span>
      ${id ? '<button class="btn sm" type="button">See it</button>' : ''}<button class="toast-x" type="button" aria-label="Dismiss">×</button>`;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    el.addEventListener('click', (e) => { if (!e.target.closest('.btn')) close(); }); // tapping the toast (or its ×) dismisses it
    el.querySelector('.btn')?.addEventListener('click', () => { close(); if (play.active && play.showFact) play.showFact(id, r); else selectIngredient(id, { fact: r }); });
    toasts.append(el);
    if (!reduceMotion) burst(el.querySelector('.toast-ic'), R ? R.col : '#cfae6e', { n: 14, spread: 46 });
    // it leaves on its own after a while, but not while the pointer or focus is on it
    let left = 9000, since = performance.now(), timer = setTimeout(close, left);
    const hold = () => { clearTimeout(timer); left -= performance.now() - since; }, go = () => { since = performance.now(); clearTimeout(timer); timer = setTimeout(close, Math.max(2500, left)); };
    el.addEventListener('pointerenter', hold); el.addEventListener('pointerleave', go); el.addEventListener('focusin', hold); el.addEventListener('focusout', go);
  }, k * 700));
}
// the card renderer and its scene direction are a third of the page's code, so they load after the first paint
let cardKit = null;
const cardKitReady = Promise.all([import('./facts-fx.js'), import('./scenes.js')]).then(([fx, sc]) => (cardKit = { factCard: fx.factCard, SCENES: sc.SCENES }));
// ── account sync: the collection follows a signed-in player between devices (sync.js) ──
let sync = null, syncState = 'local';
function dirty() { sync?.dirty(); }
// another device's progress arrived in localStorage: reload what the page holds in memory
function adoptSaved() {
  const before = new Set(seenFacts);
  loadFacts();
  for (const k of seenFacts) if (!before.has(k)) newFacts.add(k);
  if (newFacts.size) { saveNew(); $('#tab-col').classList.add('has-new'); }
  myNotes.clear(); try { for (const [id, n] of Object.entries(JSON.parse(localStorage.getItem('noteguessr:notes') || '{}'))) if (ING[id]) myNotes.set(id, n); } catch {}
  try { const m = JSON.parse(localStorage.getItem('noteguessr:miles')) || {}, st = JSON.parse(localStorage.getItem('noteguessr:stats')) || {}; for (const k in miles) delete miles[k]; Object.assign(miles, m); Object.assign(stats, st); } catch {}
  loadLab();
  collectionChanged();
}
const SYNC_TEXT = { local: 'Saved in this browser.', synced: 'Saved to your account, so it follows you to other devices.', retry: 'Saved in this browser. Your account couldn’t be reached just now, so it will try again.' };
function setSyncState(st) { syncState = st; const el = listEl.querySelector('.col-sync'); if (el) { el.textContent = SYNC_TEXT[st]; el.dataset.st = st; } }
function makeFact(id, r, extra) {
  const ing = ING[id];
  return cardKit.factCard(FACTS[id][r], { id: factKey(id, r), name: ing.name, place: ing.country, col: ingHex(ing), shape: SHAPE[ing.family], isDark, still: reduceMotion, scene: cardKit.SCENES[id]?.[r], ...extra });
}
// resolves after the card's reading time; hovering pauses it, tapping the card or Next skips ahead
function factWait(card, me) {
  return new Promise((res, rej) => {
    const bar = card.el.querySelector('.fc-timer i'), ms = card.duration;
    let done = 0;
    const finish = () => { card.el.removeEventListener('click', onClick); res(); };
    const onClick = (e) => { if (!e.target.closest('a')) me.nextFact = true; };
    card.el.addEventListener('click', onClick);
    (function step() {
      if (me.cancelled) { card.el.removeEventListener('click', onClick); rej(new Error('stop')); return; }
      if (me.nextFact || me.skipFacts) { me.nextFact = false; finish(); return; }
      if (!card.el.matches(':hover') && !document.hidden) done += 100;
      if (bar) bar.style.transform = `scaleX(${Math.min(1, done / ms)})`;
      if (done >= ms) { finish(); return; }
      setTimeout(step, 100);
    })();
  });
}

async function runTour(f) {
  stopTour();
  const me = (tour = { cancelled: false });
  const wait = (ms) => new Promise((res, rej) => setTimeout(() => (me.cancelled ? rej(new Error('stop')) : res()), reduceMotion ? Math.min(ms, 400) : ms));
  const steps = [];
  for (const t of ['top', 'heart', 'base']) for (const n of f.tiers[t]) { const id = noteId(n); if (id && !steps.some((s) => s.id === id) && !hidden.has(ING[id].family)) steps.push({ id, t, n }); }
  if (!steps.length) return;
  const models = getModels();
  // on phones the panel sits below the globe, so bring the globe back into view for the journey
  if (stage.getBoundingClientRect().top < 0) stage.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  stage.classList.add('journeying');
  jrTray.innerHTML = steps.map((s) => `<span class="jr-slot" style="--c:${ingHex(ING[s.id])}" title="${esc(ING[s.id].name)}"><i></i></span>`).join('') + '<button class="jr-skip" type="button">Skip to the blend</button>';
  jrTray.querySelector('.jr-skip').addEventListener('click', () => { me.skip = true; });
  const slots = [...jrTray.querySelectorAll('.jr-slot')];
  try {
    for (let k = 0; k < steps.length && !me.skip; k++) {
      const s = steps[k], ing = ING[s.id];
      flyTo(ing.loc, 2.6);
      caption.innerHTML = `<span class="jr-thumb" data-k="${s.id}"></span><span class="jr-cap"><span class="mono muted">${TIER_LABEL[s.t]} note · ${k + 1}/${steps.length}</span><b>${esc(ing.name)}</b><span class="muted">${esc(ing.part)} · ${esc(ing.method)}</span><span class="muted">${esc(ing.place)}, ${esc(ing.country)}</span></span>`;
      caption.classList.add('show', 'jr');
      models.then((m) => m?.thumbnail('i:' + s.id, m.thumbBuilders.ingredient(ing)).then((url) => { const el = caption.querySelector(`.jr-thumb[data-k="${s.id}"]`); if (url && el) el.style.backgroundImage = `url(${url})`; }));
      slots[k].classList.add('next');
      await wait(950);
      harvest(ing);
      await wait(1150);
      const p = project(ing.loc, 0);
      slots[k].classList.remove('next');
      if (p.z > 0) await flyDrop(ingHex(ing), [p.x, p.y - 26], stagePoint(slots[k]));
      if (me.cancelled) throw new Error('stop');
      slots[k].classList.add('full');
      await wait(250);
    }
    slots.forEach((el) => el.classList.add('full')); jrTray.classList.add('blending');
    // arrive at the house and blend
    flyTo(HOUSES[f.house], 2.2);
    const dists = steps.map((s) => haversine(ING[s.id].loc, HOUSES[f.house]));
    caption.innerHTML = `<span class="jr-cap"><span class="mono muted">${steps.length} notes collected</span><b>${esc(f.house)}</b><span class="muted">where they are blended into ${esc(f.name)}</span></span>`;
    await wait(1400);
    caption.classList.remove('show');
    const liquid = liquidFor(f), cols = steps.map((s) => ingHex(ING[s.id])), H0 = 112, step = Math.min(14, 74 / steps.length);
    jrMix.innerHTML = `
      <div class="jr-col"><div class="jr-facts" aria-live="polite"></div>
      <div class="jr-fnav"><button class="btn jr-next" type="button">Next fact</button><button class="btn ghost jr-skipf" type="button">Skip facts</button></div>
      <div class="jr-card glass">
        <div class="jr-stage">
          <svg class="jr-flask" viewBox="0 0 120 150" aria-hidden="true">
            <defs><clipPath id="jr-clip"><path d="M50 8h20v42l29 48a26 26 0 0 1-22 40H43a26 26 0 0 1-22-40l29-48z"/></clipPath>
              <radialGradient id="jr-shine" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
            <g clip-path="url(#jr-clip)">
              <g class="jr-layers">${cols.map((c, i) => `<rect x="0" y="${138 - (i + 1) * step}" width="120" height="${step + 0.6}" fill="${c}" style="--i:${i}"/>`).join('')}</g>
              <g class="jr-swirl" style="transform-origin:60px ${138 - steps.length * step / 2}px">${cols.map((c, i) => `<ellipse cx="60" cy="${138 - steps.length * step / 2}" rx="${10 + i * 34 / cols.length}" ry="${4 + i * 16 / cols.length}" fill="none" stroke="${c}" stroke-width="3" opacity=".8"/>`).join('')}</g>
              <rect class="jr-final" x="0" y="${138 - steps.length * step}" width="120" height="${steps.length * step + 2}" fill="${liquid}"/>
              <g class="jr-bubbles">${Array.from({ length: 9 }, (_, i) => `<circle cx="${34 + (i * 37) % 52}" cy="134" r="${1.2 + (i % 3)}" style="--d:${(i * 0.23).toFixed(2)}s"/>`).join('')}</g>
            </g>
            <path class="jr-glass" d="M50 8h20v42l29 48a26 26 0 0 1-22 40H43a26 26 0 0 1-22-40l29-48z"/>
            <path d="M47 8h26" class="jr-glass"/>
            <ellipse cx="44" cy="104" rx="10" ry="18" fill="url(#jr-shine)"/>
          </svg>
          <img class="jr-bottle" alt="">
        </div>
        <div class="jr-text"><span class="mono muted jr-k">Blending</span><b>${esc(f.name)}</b><span class="muted">${esc(f.house)} · ${f.year}</span>
          <span class="jr-sum">${steps.length} notes from ${new Set(steps.map((s) => ING[s.id].country)).size} countries, about ${Math.round(dists.reduce((a, b) => a + b, 0)).toLocaleString()} km of travel</span><span class="jr-found"></span></div>
        <button class="btn icon ghost jr-close" type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div></div>`;
    jrMix.querySelector('.jr-close').addEventListener('click', () => { stopTour(); flyTo(U3mean(f.ingredients.map((i) => ING[i].loc)), 1.15); });
    jrMix.querySelector('.jr-next').addEventListener('click', () => { me.nextFact = true; });
    jrMix.querySelector('.jr-skipf').addEventListener('click', () => { me.skipFacts = true; });
    models.then((m) => m?.thumbnail('jr:' + f.id + (isDark() ? ':d' : ':l'), m.thumbBuilders.fragrance(f, liquid, fragHex(f))).then((url) => { const img = jrMix.querySelector('.jr-bottle'); if (url && img) img.src = url; }));
    jrMix.classList.add('show');
    await wait(500);
    // pour each vial from the tray into the flask; as it lands, its note's fun fact is dealt like a card
    const flask = jrMix.querySelector('.jr-flask'), layers = [...jrMix.querySelectorAll('.jr-layers rect')], factHost = jrMix.querySelector('.jr-facts');
    const owned = (id) => RARITIES.filter((r) => seenFacts.has(factKey(id, r))), withFacts = steps.filter((s) => owned(s.id).length).length;
    let card = null, nFact = 0;
    if (withFacts) jrMix.classList.add('facting');
    const retire = (c) => { if (!c) return; c.el.classList.add('out'); setTimeout(() => { c.stop(); c.el.remove(); }, 450); };
    for (let i = 0; i < slots.length; i++) {
      const showFact = owned(steps[i].id).length && !me.skipFacts;
      const fr = flask.getBoundingClientRect(), st = stage.getBoundingClientRect(), hr = factHost.getBoundingClientRect();
      const to = fr.width ? [fr.left - st.left + fr.width / 2, fr.top - st.top + fr.height * 0.08] : [hr.left - st.left + hr.width / 2, hr.top - st.top + 30];
      flyDrop(cols[i], stagePoint(slots[i]), to, 620, 40).then(() => layers[i]?.classList.add('in'));
      slots[i].classList.remove('full'); slots[i].classList.add('poured');
      if (!showFact) { if (me.skipFacts) { retire(card); card = null; jrMix.classList.remove('facting'); } await wait(Math.max(90, 900 / slots.length)); continue; }
      await wait(380);
      const id = steps[i].id, mine = owned(id), r = mine[Math.floor(Math.random() * mine.length)];
      retire(card); await cardKitReady;
      card = makeFact(id, r, { index: ++nFact, total: withFacts });
      factHost.appendChild(card.el); card.start();
      const c = card;
      models.then((m) => m?.thumbnail('i:' + id, m.thumbBuilders.ingredient(ING[id])).then((url) => c.setThumb(url)));
      await factWait(card, me);
    }
    retire(card); card = null;
    jrMix.classList.remove('facting');
    const left = steps.length - withFacts;
    jrMix.querySelector('.jr-found').innerHTML = `<span>${withFacts ? `${withFacts} fact${withFacts === 1 ? '' : 's'} from your collection` : 'No facts from these notes in your collection yet'}${left && withFacts ? `, ${left} note${left === 1 ? '' : 's'} still to earn in Play` : ''}</span>`;
    await wait(900);
    jrMix.classList.add('swirl'); jrMix.querySelector('.jr-k').textContent = 'Mixing';
    await wait(2200);
    jrMix.classList.add('done'); jrMix.querySelector('.jr-k').textContent = 'Bottled';
    jrTray.classList.add('gone');
    await wait(6500);
    stopTour(); flyTo(U3mean(f.ingredients.map((i) => ING[i].loc)), 1.15);
  } catch (e) { if (e.message !== 'stop') throw e; }
}

// ── command palette ────────────────────────────────────
const cmdk = $('#cmdk'), cIn = $('#cmdk-input'), cList = $('#cmdk-list');
let cItems = [], cIdx = 0;
// closed, the palette is inert so Tab never lands in it; closing hands focus back to where it was
let cmdkFrom = null;
function openCmdk() { cmdkFrom = document.activeElement; cmdk.inert = false; cmdk.classList.add('open'); cIn.value = ''; renderCmdk(); setTimeout(() => cIn.focus(), 30); }
function closeCmdk() { if (!cmdk.classList.contains('open')) return; cmdk.classList.remove('open'); cmdk.inert = true; if (cmdkFrom?.isConnected && cmdk.contains(document.activeElement)) cmdkFrom.focus({ preventScroll: true }); cmdkFrom = null; }
function renderCmdk() {
  const q = cIn.value.trim().toLowerCase();
  const ings = INGREDIENTS.filter((i) => !q || (i.name + ' ' + i.country + ' ' + i.place + ' ' + i.latin).toLowerCase().includes(q)).slice(0, q ? 8 : 5);
  const frs = FRAGRANCES.filter((f) => !q || (f.name + ' ' + f.house + ' ' + f.perfumer).toLowerCase().includes(q)).slice(0, q ? 10 : 5);
  cItems = [...ings.map((i) => ({ k: 'ing', id: i.id })), ...frs.map((f) => ({ k: 'frag', id: f.id }))];
  cIdx = 0;
  let html = '', n = 0;
  if (ings.length) { html += '<div class="cmdk-group">Ingredients</div>'; for (const i of ings) html += `<div class="cmdk-item" data-i="${n++}" style="--c:${ingHex(i)}"><span class="dot" style="background:${ingHex(i)}"></span><span class="name">${esc(i.name)}</span><span class="mono muted">${esc(i.country)}</span></div>`; }
  if (frs.length) { html += '<div class="cmdk-group">Fragrances</div>'; for (const f of frs) html += `<div class="cmdk-item" data-i="${n++}">${swatch(f, 18)}<span class="name">${esc(f.name)}</span><span class="mono muted">${esc(f.house)}</span></div>`; }
  cList.innerHTML = html || '<div class="empty">No results. Try "rose", "Chanel" or "Madagascar".</div>';
  markCmdk();
}
function markCmdk() { cList.querySelectorAll('.cmdk-item').forEach((el) => { const on = +el.dataset.i === cIdx; el.setAttribute('aria-selected', on); if (on) el.scrollIntoView({ block: 'nearest' }); }); }
function pickCmdk(i) { const it = cItems[i]; if (!it) return; closeCmdk(); if (it.k === 'ing') { if (tab !== 'ing') setTab('ing'); selectIngredient(it.id); } else { if (tab !== 'frag') setTab('frag'); selectFragrance(it.id); } }
cIn.addEventListener('input', renderCmdk);
cIn.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { cIdx = Math.min(cItems.length - 1, cIdx + 1); markCmdk(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { cIdx = Math.max(0, cIdx - 1); markCmdk(); e.preventDefault(); }
  else if (e.key === 'Enter') pickCmdk(cIdx);
});
cList.addEventListener('click', (e) => { const it = e.target.closest('.cmdk-item'); if (it) pickCmdk(+it.dataset.i); });
cList.addEventListener('mousemove', (e) => { const it = e.target.closest('.cmdk-item'); if (it && +it.dataset.i !== cIdx) { cIdx = +it.dataset.i; markCmdk(); } });
cmdk.addEventListener('click', (e) => { if (e.target === cmdk) closeCmdk(); });
$('#open-search').addEventListener('click', openCmdk);
addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return; // a sheet handles its own keys
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmdk.classList.contains('open') ? closeCmdk() : openCmdk(); }
  else if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); openCmdk(); }
  else if (play.active) play.onKey?.(e);
  else if (e.key === 'Escape') { if (cmdk.classList.contains('open')) closeCmdk(); else if (sel.ing || sel.frag) { clearSelection(); showList(); } }
});

// ── deep links (#i-bergamot / #f-chanel-no-5) ───────────
function setHash(h) { try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch {} }
function fromHash() {
  const h = location.hash.slice(1);
  if (h.startsWith('play')) { startPlay(h.split('-')[1]); return; }
  if (h.startsWith('i-') && ING[h.slice(2)]) selectIngredient(h.slice(2));
  else if (h.startsWith('f-') && FRAG[h.slice(2)]) { setTab('frag'); selectFragrance(h.slice(2)); }
}

// ingredient density shading: a soft wash of each ingredient's color around its origin, weighted by use
function shadeList() {
  const focus = sel.frag ? new Set(sel.frag.ingredients) : null, out = [];
  for (const ing of INGREDIENTS) {
    if (hidden.has(ing.family)) continue;
    const on = focus ? focus.has(ing.id) : sel.ing ? sel.ing === ing : spot ? ing.family === spot : true;
    out.push({ loc: ing.loc, rgb: hexRgb(ingHex(ing)), w: USES[ing.id].length, a: on ? 1 : 0.18 });
  }
  return out;
}
// ── cartographic layer (atmosphere, graticule, place names) ──
const world = createWorldLayer($('#world'), { project, view, getSize: () => ({ W, H }), isDark, fit: () => fit, getDpr: renderDpr });
world.resize(); resizeDots();

// ── Fraguessr game ─────────────────────────────────────
let gamePromise = null;
function startPlay(mode) {
  stopTour(); if (sel.ing || sel.frag) clearSelection();
  closeCmdk();
  gamePromise ||= import('./game.js');
  gamePromise.then((m) => m.openGame({
    play, view, flyTo, setZoom, pauseSpin, project, unproject, haversine, midpoint: U3mean, refresh: () => { markerKey = ''; },
    ING, USES, ingHex, ingRgb, fragHex, liquidFor, isDark, esc, setTint, getStage, createVignette, mix, setHash,
    describe: describeFragrance, facts: { draw: drawFact, discover, earn, mount: mountFact, total: FACT_TOTAL, count: () => seenFacts.size }, notes: { collect: collectNote, count: () => myNotes.size }, milestones: checkMilestones, saved: dirty, nextMilestone: () => { const n = nextMilestone(); return n && { name: n.m.name, goal: n.m.goal, have: n.have, need: n.need, reward: RARITY[n.m.reward].label.toLowerCase() }; },
    collection: () => { setTab('col'); },
    els: { stage, labels: labelsEl, app: $('.app'), panel: $('.panel'), views: $('.views'), list: listEl, detail: detailEl },
    exit: () => { play.active = false; markerKey = ''; setTint(null); $('.app').classList.remove('playing'); $('.panel').classList.remove('playing'); if (tab === 'col') renderList(true); showList(); setHash('atlas'); view.tScale = 1; autoSpin = true; markMode('explore'); },
  }, mode));
  markMode('play');
}

// ── daily / explore switch ─────────────────────────────
const modesEl = $('.modes');
function markMode(m) {
  modesEl.dataset.mode = m;
  $('#m-explore').setAttribute('aria-selected', String(m === 'explore'));
  $('#play').setAttribute('aria-selected', String(m === 'play'));
}
function explore() { if (play.active) gamePromise?.then((g) => g.closeGame()); markMode('explore'); }
$('#m-explore').addEventListener('click', explore);
$('#play').addEventListener('click', () => (play.active ? null : startPlay()));
// the brand leads back to today's scent; help and stats live in the game module
$('.brand').addEventListener('click', () => (play.active ? gamePromise.then((m) => m.showDaily()) : startPlay()));
const withGame = (fn) => () => { gamePromise ||= import('./game.js'); gamePromise.then(fn); };
$('#open-help').addEventListener('click', withGame((m) => m.openHelp()));
$('#open-stats').addEventListener('click', withGame((m) => m.openStats()));

// ── boot ───────────────────────────────────────────────
new ResizeObserver(() => { size(); world.resize(); resizeDots(); globe?.update(globeSize()); }).observe(stage);
renderList(true);
initGlobe();
// the daily scent is the front door; a shared link to the atlas, an ingredient or a perfume opens the atlas
if (location.hash.length > 1 && !location.hash.startsWith('#play')) { markMode('explore'); fromHash(); } else startPlay();
(window.requestIdleCallback || setTimeout)(() => getModels()); // warm the 3D module in the background
import('./sync.js').then((m) => m.startSync({ onAdopt: adoptSaved, onState: setSyncState })).then((s) => { sync = s; }).catch(() => {});
