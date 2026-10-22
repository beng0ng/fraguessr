// The things passing in the sky (flyby.js), modelled and lit in 3D: a satellite in gold foil with solar wings, a
// cratered asteroid, comet and meteor heads, a rocket with a live flame, a folded paper plane, a striped hot-air
// balloon, a kite with a ribboned tail, butterflies with painted wings and a fuzzy bumblebee. One small renderer is
// shared and moved to whichever thing is passing; each model animates itself (wings beat, flames flicker, things
// tumble) while flyby.js carries it across the sky. Models face +x, like the flat art they replace.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const std = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, ...o });
const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
const texCache = new Map();
function canvasTex(key, w, h, draw, { srgb = true, wrap = false } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  texCache.set(key, t); return t;
}
const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// smooth 3D value noise, summed over octaves, for rock surfaces
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm = (x, y, z, o = 4) => { let a = 0, s = 0.5, f = 1; for (let i = 0; i < o; i++) { a += s * vnoise(x * f, y * f, z * f); f *= 2.03; s *= 0.5; } return a; };

// a lumpy, cratered body: noise for the lumps, bowls with raised rims for the craters
function rockGeo(r, { lump = 0.22, craters = 9, seed = 3, detail = 30, stretch = [1, 1, 1], tint = 0.35, deep = 1 } = {}) {
  let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const R = rnd(seed * 977 + 1), cs = Array.from({ length: craters }, () => ({ d: V(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), s: 0.14 + R() * 0.3, k: (0.05 + R() * 0.07) * deep }));
  const p = g.attributes.position, v = new THREE.Vector3(), col = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = (fbm(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6, 3) - 0.5) * lump * 2 + (fbm(v.x * 7, v.y * 7 + seed, v.z * 7, 2) - 0.5) * 0.05;
    for (const c of cs) { const a = Math.acos(Math.min(1, v.dot(c.d))) / c.s; if (a < 1) d -= c.k * (1 - a * a); else if (a < 1.35) d += c.k * 0.35 * Math.sin((a - 1) / 0.35 * Math.PI); }
    d += (fbm(v.x * 22 + seed, v.y * 22, v.z * 22, 2) - 0.5) * 0.025;
    p.setXYZ(i, v.x * r * (1 + d) * stretch[0], v.y * r * (1 + d) * stretch[1], v.z * r * (1 + d) * stretch[2]);
    // colour: broad mottling plus darker crater floors, from 3D noise so there is no seam
    const m = 1 - tint / 2 + tint * fbm(v.x * 3 + 9, v.y * 3, v.z * 3 + seed, 3) + Math.min(0, d) * 2.2;
    col.push(m, m * 0.98, m * 0.95);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); g = g.toNonIndexed();
  // spherical uvs for the fine bump and glow maps; a triangle that straddles the seam gets its u unwrapped
  const q = g.attributes.position, uv = new Float32Array(q.count * 2);
  for (let i = 0; i < q.count; i++) { v.fromBufferAttribute(q, i).normalize(); uv[i * 2] = Math.atan2(v.z, v.x) / TAU + 0.5; uv[i * 2 + 1] = Math.acos(Math.max(-1, Math.min(1, v.y))) / Math.PI; }
  for (let i = 0; i < q.count; i += 3) { const a = uv[i * 2], b = uv[i * 2 + 2], c = uv[i * 2 + 4], hi = Math.max(a, b, c); if (hi - Math.min(a, b, c) > 0.5) for (let k = 0; k < 3; k++) if (uv[(i + k) * 2] < hi - 0.5) uv[(i + k) * 2] += 1; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const grainTex = (key, base, spots, n = 1400) => canvasTex(key, 512, 256, (c, w, h) => {
  c.fillStyle = base; c.fillRect(0, 0, w, h); const R = rnd(key.length * 31 + 7);
  for (let i = 0; i < n; i++) { c.fillStyle = spots[(R() * spots.length) | 0]; c.globalAlpha = 0.15 + R() * 0.35; const x = R() * w, y = R() * h, r = 0.6 + R() * 3.2; for (const o of [-w, 0, w]) { c.beginPath(); c.arc(x + o, y, r, 0, TAU); c.fill(); } }
  c.globalAlpha = 1;
}, { wrap: true });
const bumpTex = (key, scale = 40) => canvasTex(key, 256, 256, (c, w, h) => {
  const img = c.createImageData(w, h);
  const k = scale * 0.25 / TAU;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = x / w * TAU, n = fbm(Math.cos(a) * k + 9, Math.sin(a) * k + 9, y / h * scale * 0.25, 4); const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = n * 255; img.data[i + 3] = 255; }
  c.putImageData(img, 0, 0);
}, { srgb: false, wrap: true });
// a soft round glow, for comet comae and burning meteors
const glowTex = () => canvasTex('glow', 128, 128, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
function glow(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1); return s;
}

// ── the models: each returns { group, tick(t) } ──────────────────────────────
const BUILD = {
  satellite() {
    const g = new THREE.Group(), body = new THREE.Group();
    const foil = std('#d6a43c', { metalness: 1, roughness: 0.32, bumpMap: bumpTex('foil', 90), bumpScale: 3 });
    const rad = canvasTex('radiator', 256, 256, (c, w, h) => { c.fillStyle = '#e9ecef'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(120,130,145,.55)'; c.lineWidth = 2; for (let x = 0; x <= w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y <= h; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } c.fillStyle = 'rgba(120,130,145,.6)'; for (let x = 16; x < w; x += 32) for (let y = 8; y < h; y += 16) c.fillRect(x - 1, y - 1, 2, 2); });
    const white = std('#ffffff', { map: rad, roughness: 0.3, metalness: 0.2, clearcoat: 0.6 });
    body.add(mesh(new THREE.BoxGeometry(0.42, 0.34, 0.34), foil));
    body.add(mesh(new THREE.BoxGeometry(0.44, 0.06, 0.36), white, 0, 0.2, 0));
    const cells = canvasTex('cells', 512, 128, (c, w, h) => {
      c.fillStyle = '#c9ced6'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
        const gx = 4 + x * 32, gy = 4 + y * 31, gr = c.createLinearGradient(gx, gy, gx + 28, gy + 27);
        gr.addColorStop(0, '#2c4f9a'); gr.addColorStop(0.5, '#173273'); gr.addColorStop(1, '#244a8e'); c.fillStyle = gr; c.fillRect(gx, gy, 28, 27);
        c.strokeStyle = 'rgba(160,190,240,.35)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(gx + 14, gy); c.lineTo(gx + 14, gy + 27); c.stroke();
      }
    });
    const panelM = std('#ffffff', { map: cells, metalness: 0.55, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
    const edge = std('#9aa3ad', { metalness: 1, roughness: 0.3 });
    const wings = new THREE.Group();
    for (const s of [-1, 1]) {
      const arm = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), edge, 0, 0, s * 0.25); arm.rotation.x = Math.PI / 2; wings.add(arm);
      for (let k = 0; k < 2; k++) {
        const pz = s * (0.43 + k * 0.33), panel = mesh(new THREE.BoxGeometry(0.3, 0.012, 0.31), [edge, edge, panelM, panelM, edge, edge], 0, 0, pz);
        wings.add(panel);
      }
    }
    body.add(wings);
    const dishG = new THREE.LatheGeometry([0, 0.02, 0.05, 0.09, 0.12, 0.135].map((r, i) => new THREE.Vector2(r, i * i * 0.006)), 40);
    const dish = mesh(dishG, std('#f4f5f6', { roughness: 0.25, side: THREE.DoubleSide, clearcoat: 1 }), 0.3, 0, 0); dish.rotation.z = -Math.PI / 2; body.add(dish);
    body.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), edge, 0.36, 0, 0).rotateZ(Math.PI / 2));
    body.add(mesh(new THREE.SphereGeometry(0.012, 12, 8), std('#ff5a4a', { emissive: new THREE.Color('#ff3a2a'), emissiveIntensity: 1.5 }), 0.42, 0, 0));
    const ant = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.28, 6), edge, -0.1, 0.36, 0.08); ant.rotation.z = 0.4; body.add(ant);
    body.rotation.set(0.5, -0.55, 0.1); g.add(body);
    return { group: g, tick: (t) => { body.rotation.x = 0.5 + Math.sin(t * 0.5) * 0.35; body.rotation.y = -0.55 + Math.sin(t * 0.33) * 0.12; wings.rotation.z = Math.sin(t * 0.6) * 0.15; } };
  },
  asteroid() {
    const g = new THREE.Group();
    const m = std('#9a8672', { roughness: 0.9, vertexColors: true, map: grainTex('rock', '#c9bba9', ['#8f8170', '#e6d9c6', '#a99782', '#f2e6d4']), bumpMap: bumpTex('rockb', 70), bumpScale: 2.5 });
    const rock = mesh(rockGeo(0.36, { lump: 0.2, craters: 13, seed: 5, stretch: [1.25, 0.9, 1], detail: 40, deep: 1.9 }), m); g.add(rock);
    const pebbles = [[0.55, 0.2, 0.1, 0.06], [-0.5, -0.28, 0.12, 0.045]].map(([x, y, z, r], i) => { const p = mesh(rockGeo(r, { craters: 2, seed: 9 + i, detail: 10 }), m, x, y, z); g.add(p); return p; });
    return { group: g, tick: (t) => { rock.rotation.set(t * 0.5, t * 0.8, t * 0.2); pebbles.forEach((p, i) => p.rotation.set(t * (1.3 + i), t, 0)); } };
  },
  comet() { return nucleus('#cfe6f5', '#7fd8ff', 7); },
  'gold-comet'() { return nucleus('#e9b748', '#ffc63a', 11, true); },
  meteor() {
    const g = new THREE.Group();
    const cracks = canvasTex('lava', 512, 256, (c, w, h) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h); const R = rnd(41); c.lineCap = 'round';
      for (let k = 0; k < 46; k++) { const pts = [[R() * w, R() * h]]; for (let s = 0; s < 6; s++) { const [x, y] = pts[s]; pts.push([x + (R() - 0.5) * 60, y + (R() - 0.5) * 40]); } c.strokeStyle = `rgba(255,${120 + R() * 110 | 0},40,${0.6 + R() * 0.4})`; c.lineWidth = 1.5 + R() * 4;
        for (const o of [-w, 0, w]) { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x + o, y) : c.moveTo(x + o, y))); c.stroke(); } }
    }, { wrap: true });
    const m = std('#5a3a2a', { roughness: 0.75, vertexColors: true, emissive: new THREE.Color('#ff8a3a'), emissiveMap: cracks, emissiveIntensity: 4, bumpMap: bumpTex('rockb', 70), bumpScale: 2.5 });
    const rock = mesh(rockGeo(0.3, { lump: 0.24, craters: 5, seed: 13 }), m); g.add(rock);
        const halo = glow('#ff8a3a', 1.7, 0.9); g.add(halo); const core = glow('#ffe2b0', 0.9, 0.8); core.position.set(0.12, 0, 0.3); g.add(core);
    return { group: g, tick: (t) => { rock.rotation.set(t * 2.2, t * 1.3, 0); halo.material.opacity = 0.7 + Math.sin(t * 23) * 0.12; } };
  },
  rocket() {
    const g = new THREE.Group(), ship = new THREE.Group();
    const white = std('#f6f4f0', { roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }), red = std('#e2412f', { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
    const prof = [[0, -0.42], [0.1, -0.42], [0.135, -0.34], [0.15, -0.1], [0.148, 0.12], [0.13, 0.26], [0.09, 0.4], [0.035, 0.5], [0, 0.52]].map(([a, b]) => new THREE.Vector2(a, b));
    const hull = new THREE.LatheGeometry(prof, 48); ship.add(mesh(hull, white));
    const nose = new THREE.LatheGeometry(prof.slice(5).map((v) => new THREE.Vector2(v.x + 0.003, v.y)), 48); ship.add(mesh(nose, red));
    ship.add(mesh(new THREE.TorusGeometry(0.149, 0.012, 10, 48).rotateX(Math.PI / 2), red, 0, -0.1, 0));
    const finS = new THREE.Shape(); finS.moveTo(0, 0); finS.lineTo(0.15, -0.14); finS.lineTo(0.15, -0.24); finS.lineTo(0, -0.18); finS.closePath();
    const finG = new THREE.ExtrudeGeometry(finS, { depth: 0.016, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }); finG.translate(0.12, -0.12, -0.008);
    for (let k = 0; k < 3; k++) { const f = mesh(finG, red); f.rotation.y = k * TAU / 3 + 0.4; ship.add(f); }
    const port = new THREE.Group(); port.add(mesh(new THREE.TorusGeometry(0.05, 0.012, 12, 32), std('#b9c0c8', { metalness: 1, roughness: 0.2 })));
    port.add(mesh(new THREE.CircleGeometry(0.05, 32), std('#5fb6ff', { roughness: 0.05, metalness: 0.2, clearcoat: 1, emissive: new THREE.Color('#1a5a9a'), emissiveIntensity: 0.4 })));
    port.position.set(0, 0.12, 0.148); ship.add(port);
    ship.add(mesh(new THREE.CylinderGeometry(0.075, 0.105, 0.08, 32, 1, true), std('#4a4f57', { metalness: 1, roughness: 0.35, side: THREE.DoubleSide }), 0, -0.46, 0));
    const flameT = canvasTex('flame', 64, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.18, 'rgba(255,214,90,.95)'); gr.addColorStop(0.55, 'rgba(255,110,30,.6)'); gr.addColorStop(1, 'rgba(255,60,20,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    const flame = new THREE.Group();
    const outer = mesh(new THREE.ConeGeometry(0.09, 0.5, 32, 1, true).translate(0, -0.25, 0).rotateX(Math.PI), new THREE.MeshBasicMaterial({ map: flameT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    outer.geometry.rotateX(Math.PI); flame.add(outer);
    const inner = mesh(new THREE.ConeGeometry(0.045, 0.26, 24, 1, true).translate(0, -0.13, 0), new THREE.MeshBasicMaterial({ color: '#fff6d8', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.add(inner); flame.add(glow('#ffb24a', 0.5, 0.9)); flame.position.y = -0.5; ship.add(flame);
    const lay = new THREE.Group(); lay.add(ship); lay.rotation.z = -Math.PI / 2; g.add(lay); g.rotation.x = 0.25;
    return { group: g, tick: (t) => { const k = 0.85 + Math.sin(t * 40) * 0.1 + Math.sin(t * 17) * 0.08; flame.scale.set(1, k, 1); ship.rotation.y = t * 1.2; flame.rotation.y = -t * 1.2; } };
  },
  plane() {
    const g = new THREE.Group();
    // a dart folded from one sheet: two wings, two keel faces, creased down the middle
    const N = [0.62, 0, 0], T = [-0.5, 0.02, 0], L = [-0.56, 0.08, 0.44], R = [-0.56, 0.08, -0.44], K = [-0.5, -0.17, 0], C = [-0.42, -0.02, 0.02];
    const tri = [N, L, T, N, T, R, N, K, C, N, C, K].flat();
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    const uv = []; for (let i = 0; i < tri.length; i += 3) uv.push((tri[i] + 0.6) / 1.2, (tri[i + 2] + 0.5));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
    const paper = canvasTex('paper', 256, 256, (c, w, h) => { c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, w, h); const R2 = rnd(5); for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(150,140,120,${R2() * 0.06})`; c.fillRect(R2() * w, R2() * h, 1 + R2() * 2, 1); } c.strokeStyle = 'rgba(120,150,210,.28)'; c.lineWidth = 1.2; for (let y = 20; y < h; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } c.strokeStyle = 'rgba(220,90,110,.35)'; c.beginPath(); c.moveTo(46, 0); c.lineTo(46, h); c.stroke(); });
    const m = std('#ffffff', { map: paper, roughness: 0.85, side: THREE.DoubleSide, flatShading: true, sheen: 0.3, sheenColor: new THREE.Color('#ffffff') });
    const plane = new THREE.Group(); plane.add(new THREE.Mesh(geo, m));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 10), new THREE.LineBasicMaterial({ color: '#a9a29a', transparent: true, opacity: 0.55 })); plane.add(edges);
    plane.rotation.set(-0.95, -0.3, 0.05); g.add(plane);
    return { group: g, tick: (t) => { plane.rotation.x = -0.95 + Math.sin(t * 2.1) * 0.12; plane.rotation.z = 0.05 + Math.sin(t * 1.4) * 0.05; } };
  },
  balloon() {
    const g = new THREE.Group(), rig = new THREE.Group();
    const cols = ['#e2483d', '#f6efe2', '#f0a63a', '#2f8f8a', '#f6efe2', '#c23a6a'];
    const gores = canvasTex('gores', 512, 256, (c, w, h) => {
      const n = 18; for (let k = 0; k < n; k++) { const gr = c.createLinearGradient(k * w / n, 0, (k + 1) * w / n, 0); const col = cols[k % cols.length]; gr.addColorStop(0, col); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(0,0,0,.18)'); c.fillStyle = col; c.fillRect(k * w / n, 0, w / n + 1, h); c.fillStyle = gr; c.globalAlpha = 0.35; c.fillRect(k * w / n, 0, w / n + 1, h); c.globalAlpha = 1; }
      c.fillStyle = '#2b2a4a'; c.fillRect(0, h * 0.58, w, h * 0.07); c.fillStyle = '#f2c14e'; for (let x = 8; x < w; x += 24) { c.beginPath(); c.arc(x, h * 0.615, 4, 0, TAU); c.fill(); }
      c.strokeStyle = 'rgba(60,30,20,.25)'; c.lineWidth = 1; for (let y = 10; y < h; y += 26) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    }, { wrap: true });
    const prof = []; for (let i = 0; i <= 28; i++) { const t = i / 28, y = -0.36 + t * 0.92; const r = t < 0.62 ? 0.07 + 0.31 * Math.sin((t / 0.62) * Math.PI / 2) ** 0.9 : 0.38 * Math.sqrt(Math.max(0, 1 - ((t - 0.62) / 0.38) ** 2)) + 0.0001; prof.push(new THREE.Vector2(Math.max(r, 0.0001), y)); }
    prof.reverse();
    const env = mesh(new THREE.LatheGeometry(prof, 64), std('#ffffff', { map: gores, roughness: 0.62, sheen: 0.25, sheenColor: new THREE.Color('#ffe8d0'), side: THREE.DoubleSide }), 0, 0.2, 0);
    env.geometry.scale(-1, 1, 1); rig.add(env);
    const weave = canvasTex('weave', 128, 64, (c, w, h) => { c.fillStyle = '#7a5530'; c.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { c.fillStyle = (x + y) % 16 ? '#a87a45' : '#946737'; c.fillRect(x + 1, y + 1, 6, 6); } }, { wrap: true });
    rig.add(mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.1, 24), std('#ffffff', { map: weave, roughness: 0.85 }), 0, -0.36, 0));
    rig.add(mesh(new THREE.TorusGeometry(0.076, 0.008, 8, 24).rotateX(Math.PI / 2), std('#5a3a1e', { roughness: 0.7 }), 0, -0.31, 0));
    const rope = std('#5a4632', { roughness: 0.8 });
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + 0.5, top = V(Math.cos(a) * 0.075, -0.16, Math.sin(a) * 0.075), bot = V(Math.cos(a) * 0.07, -0.31, Math.sin(a) * 0.07); const d = top.clone().sub(bot), c = mesh(new THREE.CylinderGeometry(0.003, 0.003, d.length(), 4), rope); c.position.copy(top).add(bot).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); rig.add(c); }
    const burner = glow('#ffb03a', 0.22, 0.95); burner.position.y = -0.24; rig.add(burner);
    rig.rotation.x = 0.12; g.add(rig);
    return { group: g, tick: (t) => { rig.rotation.y = t * 0.35; rig.rotation.z = Math.sin(t * 1.2) * 0.05; burner.material.opacity = 0.6 + Math.abs(Math.sin(t * 9)) * 0.4; } };
  },
  kite() {
    const g = new THREE.Group(), kite = new THREE.Group();
    const top = V(0, 0.5, 0), rt = V(0.27, 0.16, 0.03), bot = V(0, -0.34, 0), lf = V(-0.27, 0.16, 0.03), mid = V(0, 0.16, 0.07);
    const cols = ['#e2483d', '#f2c14e', '#2f7fd0', '#f6efe2'];
    const fabric = (c) => std(c, { roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide });
    [[top, rt, mid], [rt, bot, mid], [bot, lf, mid], [lf, top, mid]].forEach((tr, k) => { const geo = new THREE.BufferGeometry().setFromPoints(tr); geo.computeVertexNormals(); kite.add(new THREE.Mesh(geo, fabric(cols[k]))); });
    const spar = std('#6b4a2a', { roughness: 0.6 });
    const rod = (a, b) => { const d = b.clone().sub(a), c = mesh(new THREE.CylinderGeometry(0.006, 0.006, d.length(), 6), spar); c.position.copy(a).add(b).multiplyScalar(0.5).add(V(0, 0, 0.01)); c.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); kite.add(c); };
    rod(top, bot); rod(lf, rt);
    g.add(kite);
    // the tail: a string with silk bows, waving
    const tailM = std('#5a4632', { roughness: 0.8 }), bowG = new THREE.ConeGeometry(0.035, 0.06, 3, 1).rotateZ(Math.PI / 2), bows = [];
    let tail = null;
    for (let k = 0; k < 4; k++) { const b = new THREE.Group(), m = fabric(cols[k % 3]); const l = mesh(bowG, m, -0.03, 0, 0); const r = mesh(bowG, m, 0.03, 0, 0); r.rotation.z = Math.PI; b.add(l, r); g.add(b); bows.push(b); }
    const pts = Array.from({ length: 24 }, () => V(0, 0, 0));
    const tick = (t) => {
      for (let i = 0; i < pts.length; i++) { const u = i / (pts.length - 1); pts[i].set(Math.sin(t * 2.4 - u * 5) * 0.09 * u + Math.sin(t * 1.1) * 0.02, -0.34 - u * 0.62, Math.cos(t * 2 - u * 4) * 0.03 * u); }
      if (tail) { g.remove(tail); tail.geometry.dispose(); }
      tail = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.005, 5), tailM); g.add(tail);
      bows.forEach((b, k) => { const p = pts[5 + k * 5]; b.position.copy(p); b.rotation.z = Math.sin(t * 3 + k) * 0.4; });
      kite.rotation.set(Math.sin(t * 0.9) * 0.12, Math.sin(t * 1.3) * 0.25, Math.sin(t * 1.1) * 0.06);
    };
    tick(0);
    return { group: g, tick };
  },
  butterfly() { return butterfly('#f28a1e', '#ffc46a', '#1c120c'); },
  'gold-butterfly'() { return butterfly('#e3a51f', '#fff0a8', '#5a3600', true); },
  bee() {
    const g = new THREE.Group(), bee = new THREE.Group();
    const stripes = canvasTex('stripes', 64, 256, (c, w, h) => { const band = ['#f6c21c', '#1d1610', '#f6c21c', '#1d1610', '#f2b81a', '#1d1610', '#1d1610']; band.forEach((col, k) => { c.fillStyle = col; c.fillRect(0, k * h / band.length, w, h / band.length + 1); }); });
    const fuzz = (col, map) => std(col, { ...(map ? { map } : {}), roughness: 0.95, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color('#ffe9a0'), bumpMap: bumpTex('fuzz', 180), bumpScale: 2.5 });
    const abd = mesh(new THREE.SphereGeometry(0.2, 40, 28).rotateZ(Math.PI / 2).scale(1.25, 1, 1), fuzz('#ffffff', stripes), -0.18, 0, 0); bee.add(abd);
    bee.add(mesh(new THREE.SphereGeometry(0.14, 32, 24), fuzz('#c9921c'), 0.08, 0.02, 0));
    const head = mesh(new THREE.SphereGeometry(0.1, 28, 20), std('#1d1610', { roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color('#8a6a30') }), 0.24, 0.0, 0); bee.add(head);
    const eyeM = std('#0b0b10', { roughness: 0.1, clearcoat: 1 });
    for (const s of [-1, 1]) { bee.add(mesh(new THREE.SphereGeometry(0.045, 16, 12).scale(0.7, 1, 0.7), eyeM, 0.28, 0.04, s * 0.06)); const an = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.3, 0.06, s * 0.03), V(0.36, 0.16, s * 0.05), V(0.42, 0.18, s * 0.07)]), 12, 0.006, 5), eyeM); bee.add(an); }
    bee.add(mesh(new THREE.ConeGeometry(0.02, 0.07, 10).rotateZ(Math.PI / 2), std('#1d1610'), -0.45, 0, 0));
    const legM = std('#24180f', { roughness: 0.7 });
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) bee.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.12 - k * 0.08, -0.08, s * 0.05), V(0.1 - k * 0.1, -0.18, s * 0.1), V(0.06 - k * 0.12, -0.24, s * 0.09)]), 10, 0.008, 5), legM));
    const veins = canvasTex('wingveins', 256, 128, (c, w, h) => { c.fillStyle = 'rgba(255,255,255,0)'; c.clearRect(0, 0, w, h); c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, TAU); const wg = c.createLinearGradient(0, 0, w, 0); wg.addColorStop(0, 'rgba(150,165,185,.75)'); wg.addColorStop(1, 'rgba(215,228,245,.6)'); c.fillStyle = wg; c.fill(); c.strokeStyle = 'rgba(45,35,25,.85)'; c.lineWidth = 3; c.stroke(); c.lineWidth = 1.6; for (const [a, b, cc, d] of [[8, 64, 240, 40], [8, 64, 230, 80], [60, 50, 120, 110], [120, 30, 170, 100], [10, 64, 120, 64]]) { c.beginPath(); c.moveTo(a, b); c.quadraticCurveTo((a + cc) / 2, (b + d) / 2 - 10, cc, d); c.stroke(); } });
    const wingM = new THREE.MeshPhysicalMaterial({ map: veins, transparent: true, side: THREE.DoubleSide, roughness: 0.1, iridescence: 1, iridescenceIOR: 1.6, depthWrite: false });
    const wings = [];
    for (const s of [-1, 1]) { const hinge = new THREE.Group(); hinge.position.set(0.08, 0.13, s * 0.04); const w1 = mesh(new THREE.PlaneGeometry(0.36, 0.17).translate(-0.12, 0, 0.0), wingM); w1.rotation.x = -Math.PI / 2; w1.position.z = s * 0.09; const w2 = mesh(new THREE.PlaneGeometry(0.22, 0.11).translate(-0.12, 0, 0), wingM); w2.rotation.x = -Math.PI / 2; w2.position.set(-0.06, -0.005, s * 0.07); hinge.add(w1, w2); hinge.userData.s = s; bee.add(hinge); wings.push(hinge); }
    bee.rotation.set(0.45, -0.25, 0.05); g.add(bee);
    return { group: g, tick: (t) => { const a = Math.sin(t * 80) * 0.7; wings.forEach((w) => { w.rotation.x = w.userData.s * (0.35 + a); }); bee.position.y = Math.sin(t * 9) * 0.015; } };
  },
};
function nucleus(col, glowCol, seed, gold) {
  const g = new THREE.Group();
  const m = gold ? std(col, { metalness: 1, roughness: 0.35, bumpMap: bumpTex('rockb', 70), bumpScale: 3, emissive: new THREE.Color('#5a3a00'), emissiveIntensity: 0.5 })
    : std(col, { roughness: 0.75, map: grainTex('ice', '#c7dceb', ['#ffffff', '#8aa5ba', '#e8f4fb', '#6f8799']), bumpMap: bumpTex('rockb', 70), bumpScale: 3, emissive: new THREE.Color('#2a5a7a'), emissiveIntensity: 0.25 });
  const rock = mesh(rockGeo(0.3, { lump: 0.18, craters: 7, seed }), m); g.add(rock);
  const coma = glow(glowCol, 1.7, 0.75); g.add(coma); const inner = glow('#ffffff', 0.75, 0.55); g.add(inner);
  return { group: g, tick: (t) => { rock.rotation.set(t * 0.7, t * 1.1, 0); coma.material.opacity = 0.65 + Math.sin(t * 3) * 0.1; } };
}
// painted wings, two on each side, that fold up toward each other to beat
function butterfly(wing, light, ink, gold) {
  const g = new THREE.Group(), bfly = new THREE.Group();
  const paint = canvasTex(`wing${wing}`, 512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const fore = new Path2D('M8 250 C 60 120, 250 10, 470 40 C 500 60, 490 120, 440 170 C 360 240, 200 260, 8 262 Z');
    const hind = new Path2D('M8 262 C 160 270, 330 300, 380 380 C 410 440, 360 500, 290 490 C 190 470, 60 380, 8 280 Z');
    for (const p of [hind, fore]) {
      const gr = c.createRadialGradient(80, 256, 20, 160, 256, 420); gr.addColorStop(0, light); gr.addColorStop(0.55, wing); gr.addColorStop(1, wing);
      c.fillStyle = gr; c.fill(p); c.save(); c.clip(p);
      c.strokeStyle = ink; c.lineWidth = 7; c.globalAlpha = 0.9;
      for (const [x, y] of [[470, 60], [430, 150], [380, 210], [300, 250], [360, 400], [300, 480], [200, 430]]) { c.beginPath(); c.moveTo(10, 258); c.quadraticCurveTo((x + 10) / 2, (y + 258) / 2 - 25, x, y); c.stroke(); }
      c.globalAlpha = 1; c.lineWidth = 34; c.stroke(p); c.fillStyle = '#fff';
      for (let k = 0; k < 14; k++) { const a = k / 14; c.beginPath(); c.arc(140 + a * 330, 52 + Math.sin(a * 3) * 18 + a * 20, 5 + (k % 3), 0, TAU); c.fill(); }
      for (let k = 0; k < 8; k++) { c.beginPath(); c.arc(300 + k * 12, 470 - k * 14, 5, 0, TAU); c.fill(); }
      c.restore();
    }
  });
  const m = std('#ffffff', { map: paint, alphaTest: 0.5, side: THREE.DoubleSide, roughness: gold ? 0.25 : 0.6, metalness: gold ? 0.75 : 0, sheen: gold ? 0 : 0.8, sheenColor: new THREE.Color(light), iridescence: gold ? 0.6 : 0.25 });
  const half = (s) => { const h = new THREE.Group(); const p = mesh(new THREE.PlaneGeometry(0.62, 0.62).translate(0.31, 0, 0), m); p.scale.x = s; h.add(p); return h; };
  const L = half(-1), R = half(1); bfly.add(L, R);
  const bodyM = std(ink, { roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(gold ? '#ffd98a' : '#8a7a6a') });
  bfly.add(mesh(new THREE.CapsuleGeometry(0.03, 0.34, 6, 12), bodyM, 0, -0.04, 0.01));
  bfly.add(mesh(new THREE.SphereGeometry(0.04, 16, 12), bodyM, 0, 0.17, 0.01));
  for (const s of [-1, 1]) { bfly.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(s * 0.01, 0.2, 0.02), V(s * 0.06, 0.32, 0.03), V(s * 0.1, 0.4, 0.02)]), 12, 0.005, 5), bodyM)); bfly.add(mesh(new THREE.SphereGeometry(0.014, 10, 8), bodyM, s * 0.1, 0.4, 0.02)); }
  bfly.rotation.set(-0.5, 0, 0); g.add(bfly);
  return { group: g, tick: (t) => { const a = 0.15 + (0.5 + 0.5 * Math.sin(t * (gold ? 26 : 18))) * 1.05; R.rotation.y = -a; L.rotation.y = a; bfly.position.y = Math.sin(t * 6) * 0.02; } };
}

// ── one shared renderer ──────────────────────────────────────────────────
let R = null, envTex = null, live = null;
function renderer() {
  if (R) return R;
  try { R = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { return (R = false); }
  R.toneMapping = THREE.NeutralToneMapping; R.toneMappingExposure = 1.15; R.outputColorSpace = THREE.SRGBColorSpace;
  R.setClearColor(0x000000, 0);
  const pm = new THREE.PMREMGenerator(R); envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  R.domElement.className = 'fb-gl';
  return R;
}
// heads of streaking things sit at the bright end of their flat tail, which stays drawn in 2D
const HEAD = { comet: 1, 'gold-comet': 1, meteor: 1 };
export function mountFlyer(host, f, { w, h, night, reduce }) {
  stopFlyer();
  const r = renderer(); if (!r || !BUILD[f.id]) return null;
  const head = HEAD[f.id], cw = head ? Math.round(h * 1.5) : w, ch = head ? Math.round(h * 1.5) : h;
  r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.setSize(cw, ch, false);
  const cv = r.domElement; cv.style.cssText = head ? `position:absolute;width:${cw}px;height:${ch}px;left:calc(${(f.hx ?? 0.5) * 100}% - ${cw / 2}px);top:calc(50% - ${ch / 2}px)` : 'position:absolute;inset:0;width:100%;height:100%';
  r.toneMappingExposure = night ? 1.15 : 1.0;
  const scene = new THREE.Scene(); scene.environment = envTex; scene.environmentIntensity = night ? 0.55 : 0.8;
  const key = new THREE.DirectionalLight(night ? '#dfe8ff' : '#fff1de', night ? 2.2 : 2.6); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(night ? '#7fb2ff' : '#ffffff', night ? 2.4 : 0.8); rim.position.set(-3, 1, -2); scene.add(rim);
  const model = BUILD[f.id](); scene.add(model.group);
  // frame the model so it fills the space its flat art had, over the whole of its motion
  const box = new THREE.Box3(); for (let t = 0; t < 8; t += 0.37) { model.tick(t); model.group.updateMatrixWorld(true); box.expandByObject(model.group); }
  model.tick(0); const size = box.getSize(V(0, 0, 0)), mid = box.getCenter(V(0, 0, 0));
  const cam = new THREE.PerspectiveCamera(22, cw / ch, 0.05, 50), fit = Math.tan((22 * Math.PI) / 360);
  const dist = Math.max(size.y / 2 / fit, size.x / 2 / (fit * cw / ch)) * (head ? 1.05 : 1.08) + size.z / 2;
  cam.position.set(mid.x, mid.y, mid.z + dist); cam.lookAt(mid);
  host.append(cv); host.classList.add(head ? 'fb-3d-head' : 'fb-3d');
  const t0 = performance.now();
  const me = { stop: () => { cancelAnimationFrame(me.raf); cv.remove(); host.classList.remove('fb-3d', 'fb-3d-head'); scene.traverse((o) => { o.geometry?.dispose?.(); }); if (live === me) live = null; } };
  const draw = (t) => { model.tick((t - t0) / 1000); r.render(scene, cam); if (!reduce) me.raf = requestAnimationFrame(draw); };
  live = me; draw(t0);
  return me;
}
export function stopFlyer() { live?.stop(); }
