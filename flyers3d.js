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

// soft smoke puffs and four-point glints, for trails
const puffTex = () => canvasTex('puff', 128, 128, (c, w) => {
  const img = c.createImageData(w, w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const dx = x / w - 0.5, dy = y / w - 0.5, r = Math.hypot(dx, dy) * 2, n = fbm(x / 22, y / 22, 3.3, 3), a = Math.max(0, 1 - r) ** 1.6 * (0.55 + n * 0.9); const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, a * 255); }
  c.putImageData(img, 0, 0);
});
const glintTex = () => canvasTex('glint', 128, 128, (c, w) => {
  const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,.5)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w);
  c.fillStyle = 'rgba(255,255,255,.9)'; for (const r of [0, Math.PI / 2]) { c.save(); c.translate(w / 2, w / 2); c.rotate(r); c.beginPath(); c.moveTo(-w / 2, 0); c.quadraticCurveTo(0, -3, w / 2, 0); c.quadraticCurveTo(0, 3, -w / 2, 0); c.fill(); c.restore(); }
});
const dotTex = () => canvasTex('dot', 64, 64, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.95)'); g.addColorStop(0.7, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); });
// a pool of points that are born, drift, grow or shrink, and fade through a ramp of colours; drawn in one call
const PVS = `attribute float size; attribute vec4 tint; varying vec4 vT; uniform float uScale;
void main() { vT = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const PFS = `uniform sampler2D map; varying vec4 vT;
void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vT.rgb, vT.a * t.a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
class Trail {
  constructor({ max = 400, tex, add = true, ramp, uScale, twinkle = 0 }) {
    this.max = max; this.n = 0; this.acc = 0; this.twinkle = twinkle; this.t = 0;
    this.ramp = ramp.map(([t, c, a]) => { const k = new THREE.Color(c); return [t, k.r, k.g, k.b, a]; });
    this.p = new Float32Array(max * 12);
    const g = new THREE.BufferGeometry(), at = (n) => new THREE.BufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', (this.pos = at(3))); g.setAttribute('size', (this.size = at(1))); g.setAttribute('tint', (this.tint = at(4))); g.setDrawRange(0, 0);
    this.obj = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { map: { value: tex || glowTex() }, uScale: { value: uScale } }, vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.obj.frustumCulled = false; this.obj.renderOrder = add ? 2 : 1;
  }
  emit({ x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0, life = 1, s0 = 0.1, s1 = s0, drag = 0 }) {
    if (this.n >= this.max) return; const i = this.n++ * 12, p = this.p;
    p[i] = x; p[i + 1] = y; p[i + 2] = z; p[i + 3] = vx; p[i + 4] = vy; p[i + 5] = vz; p[i + 6] = 0; p[i + 7] = life; p[i + 8] = s0; p[i + 9] = s1; p[i + 10] = drag; p[i + 11] = Math.random() * TAU;
  }
  // rate per second, spread evenly over the frame so a slow frame does not leave gaps
  stream(rate, dt, fn) { this.acc += rate * dt; const n = Math.floor(this.acc); this.acc -= n; for (let k = 0; k < n; k++) fn((k + 0.5) / n); }
  update(dt, gx = 0, gy = 0) {
    const p = this.p, R = this.ramp, pos = this.pos.array, size = this.size.array, tint = this.tint.array; this.t += dt;
    for (let k = 0; k < this.n; k++) {
      const i = k * 12; p[i + 6] += dt;
      if (p[i + 6] >= p[i + 7]) { this.n--; if (k < this.n) { p.copyWithin(i, this.n * 12, this.n * 12 + 12); k--; } continue; }
      const d = Math.exp(-p[i + 10] * dt); p[i + 3] = p[i + 3] * d + gx * dt; p[i + 4] = p[i + 4] * d + gy * dt; p[i + 5] *= d;
      p[i] += p[i + 3] * dt; p[i + 1] += p[i + 4] * dt; p[i + 2] += p[i + 5] * dt;
      const u = p[i + 6] / p[i + 7]; let j = 0; while (j < R.length - 2 && u > R[j + 1][0]) j++;
      const a = R[j], b = R[j + 1], f = Math.min(1, Math.max(0, (u - a[0]) / ((b[0] - a[0]) || 1)));
      pos[k * 3] = p[i]; pos[k * 3 + 1] = p[i + 1]; pos[k * 3 + 2] = p[i + 2];
      size[k] = p[i + 8] + (p[i + 9] - p[i + 8]) * u;
      const tw = this.twinkle ? 1 - this.twinkle * (0.5 + 0.5 * Math.sin(this.t * 14 + p[i + 11] * 3)) : 1;
      tint[k * 4] = a[1] + (b[1] - a[1]) * f; tint[k * 4 + 1] = a[2] + (b[2] - a[2]) * f; tint[k * 4 + 2] = a[3] + (b[3] - a[3]) * f; tint[k * 4 + 3] = (a[4] + (b[4] - a[4]) * f) * tw;
    }
    this.obj.geometry.setDrawRange(0, this.n); this.pos.needsUpdate = this.size.needsUpdate = this.tint.needsUpdate = true;
  }
}
const jit = (k) => (Math.random() - 0.5) * 2 * k;

// ── the models: each returns { group, tick(t, m), fx?(ctx) } ─────────────────
// m is the flight: turn (degrees a second the heading is swinging, in the model's frame), speed (px a second)
// and dir (+1 when the model's +x is the way it is going). fx, after framing, adds trails to the scene.
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
    const beacon = mesh(new THREE.SphereGeometry(0.012, 12, 8), std('#ff5a4a', { emissive: new THREE.Color('#ff3a2a'), emissiveIntensity: 1.5 }), 0.42, 0, 0); body.add(beacon);
    const flash = glow('#ff6a55', 0.16, 0); flash.position.set(0.42, 0, 0); body.add(flash);
    // star tracker and thruster pods on the corners
    body.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 20), std('#2a2d33', { metalness: 0.8, roughness: 0.3 }), -0.12, 0.25, -0.1));
    body.add(mesh(new THREE.CircleGeometry(0.026, 20).rotateX(-Math.PI / 2), std('#0b1a2a', { roughness: 0.05, metalness: 0.5, clearcoat: 1 }), -0.12, 0.281, -0.1));
    const pods = [[0.21, -0.17, 0.17], [-0.21, -0.17, -0.17], [0.21, 0.17, -0.17]].map(([x, y, z]) => { const n = mesh(new THREE.ConeGeometry(0.018, 0.04, 12, 1, true), edge, x, y, z); n.lookAt(V(x * 3, y * 3, z * 3)); n.rotateX(Math.PI / 2); body.add(n); return V(x, y, z); });
    const ant = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.28, 6), edge, -0.1, 0.36, 0.08); ant.rotation.z = 0.4; body.add(ant);
    body.rotation.set(0.5, -0.55, 0.1); g.add(body);
    return { group: g, tick: (t) => { body.rotation.x = 0.5 + Math.sin(t * 0.5) * 0.35; body.rotation.y = -0.55 + Math.sin(t * 0.33) * 0.12; wings.rotation.z = Math.sin(t * 0.6) * 0.15; const on = (t * 0.9) % 1 < 0.12; flash.material.opacity = on ? 0.95 : 0; beacon.material.emissiveIntensity = on ? 4 : 0.6; },
      // a puff of cold gas from one thruster now and then, as it holds its attitude
      fx: (c) => { const gas = c.trail({ max: 80, tex: puffTex(), add: false, ramp: [[0, '#ffffff', 0.7], [1, '#cfd8e6', 0]] }), w = V(0, 0, 0), o = V(0, 0, 0); let next = 1.2, k = 0;
        return { update(t, dt) { if (t > next) { next = t + 2.2 + Math.random() * 1.6; const at = pods[k++ % pods.length]; body.localToWorld(w.copy(at)); body.localToWorld(o.copy(at).multiplyScalar(2.2)); o.sub(w).normalize();
          for (let n = 0; n < 14; n++) gas.emit({ x: w.x, y: w.y, z: w.z, vx: o.x * 0.5 + jit(0.12), vy: o.y * 0.5 + jit(0.12), vz: o.z * 0.5, life: 0.6 + Math.random() * 0.5, s0: 0.03, s1: 0.16, drag: 2.5 }); }
          gas.update(dt); } }; } };
  },
  asteroid() {
    const g = new THREE.Group();
    const m = std('#9a8672', { roughness: 0.9, vertexColors: true, map: grainTex('rock', '#c9bba9', ['#8f8170', '#e6d9c6', '#a99782', '#f2e6d4']), bumpMap: bumpTex('rockb', 70), bumpScale: 2.5 });
    const rock = mesh(rockGeo(0.36, { lump: 0.2, craters: 13, seed: 5, stretch: [1.25, 0.9, 1], detail: 40, deep: 1.9 }), m); g.add(rock);
    const pebbles = [[0.55, 0.2, 0.1, 0.06], [-0.5, -0.28, 0.12, 0.045]].map(([x, y, z, r], i) => { const p = mesh(rockGeo(r, { craters: 2, seed: 9 + i, detail: 10 }), m, x, y, z); g.add(p); return p; });
    // a loose cloud of grit and gravel that tumbles round it
    const R = rnd(77), grit = Array.from({ length: 11 }, (_, i) => { const r = 0.012 + R() * 0.028, p = mesh(rockGeo(r, { craters: 1, seed: 20 + i, detail: 4, lump: 0.35 }), m); g.add(p); return { p, a: R() * TAU, d: 0.48 + R() * 0.2, s: (0.25 + R() * 0.35) * (R() < 0.5 ? -1 : 1), tilt: (R() - 0.5) * 0.9, sp: 1 + R() * 3 }; });
    return { group: g, tick: (t) => { rock.rotation.set(t * 0.5, t * 0.8, t * 0.2); pebbles.forEach((p, i) => p.rotation.set(t * (1.3 + i), t, 0));
      for (const q of grit) { const a = q.a + t * q.s; q.p.position.set(Math.cos(a) * q.d * 1.15, Math.sin(a) * q.d * 0.35 + Math.cos(a) * q.tilt * 0.3, Math.sin(a) * q.d * 0.6); q.p.rotation.set(t * q.sp, t * q.sp * 0.7, 0); } } };
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
    return { group: g, tick: (t) => { rock.rotation.set(t * 2.2, t * 1.3, 0); halo.material.opacity = 0.7 + Math.sin(t * 23) * 0.12; },
      // it burns as it falls: a white-hot plume that cools to orange and red, sparks shed off it, and a faint glowing train
      fx: (c) => { const L = c.tail;
        const fire = c.trail({ max: 600, ramp: [[0, '#fffaf0', 1], [0.12, '#ffe0a0', 0.95], [0.4, '#ff8a30', 0.6], [0.75, '#c43a12', 0.25], [1, '#5a1206', 0]] });
        const train = c.trail({ max: 500, ramp: [[0, '#ffd9a8', 0.5], [0.5, '#9fd0ff', 0.18], [1, '#5a7aff', 0]] });
        const sparks = c.trail({ max: 160, ramp: [[0, '#ffffff', 1], [0.5, '#ffc060', 0.9], [1, '#ff5020', 0]] });
        return { update(t, dt) {
          fire.stream(380, dt, () => { const life = 0.28 + Math.random() * 0.3; fire.emit({ x: -0.05 + jit(0.06), y: jit(0.08), vx: -L / life * (0.25 + Math.random() * 0.35), vy: jit(0.25), life, s0: 0.34 + Math.random() * 0.12, s1: 0.04 }); });
          train.stream(220, dt, () => { const life = 1 + Math.random() * 0.5; train.emit({ x: -0.15, y: jit(0.015), vx: -L / life * (0.85 + Math.random() * 0.2), vy: jit(0.02), life, s0: 0.07, s1: 0.03 }); });
          sparks.stream(45, dt, () => { const life = 0.35 + Math.random() * 0.45; sparks.emit({ x: -0.1, y: jit(0.1), vx: -L * (0.6 + Math.random() * 0.8), vy: jit(1.3), life, s0: 0.06, s1: 0.02, drag: 1.5 }); });
          fire.update(dt); train.update(dt); sparks.update(dt, 0, -0.8);
        } }; } };
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
    const tip = V(0, 0, 0);
    return { group: g, tick: (t, m) => { const k = 0.85 + Math.sin(t * 40) * 0.1 + Math.sin(t * 17) * 0.08; flame.scale.set(1, k, 1); ship.rotation.y = t * 1.2; flame.rotation.y = -t * 1.2; g.rotation.x = 0.25 + Math.max(-0.5, Math.min(0.5, (m?.turn || 0) * 0.012)); },
      // a column of exhaust that billows and greys as it is left behind, with embers in it
      fx: (c) => { const smoke = c.trail({ max: 260, tex: puffTex(), add: false, ramp: [[0, '#fff2d8', 0], [0.05, '#ffe6bf', 0.6], [0.3, '#d9d3cc', 0.42], [1, '#8f8a85', 0]] });
        const embers = c.trail({ max: 120, ramp: [[0, '#fff6d0', 1], [0.4, '#ffae4a', 0.85], [1, '#ff4a1a', 0]] });
        return { update(t, dt, m) { flame.localToWorld(tip.set(0, -0.42, 0)); const v = Math.max(0.6, Math.min(2.4, (m.speed || 110) / c.ppu));
          smoke.stream(70, dt, (f) => smoke.emit({ x: tip.x - v * dt * f, y: tip.y + jit(0.02), z: tip.z, vx: -v * (0.75 + Math.random() * 0.25), vy: jit(0.12), vz: jit(0.08), life: 1.3 + Math.random() * 0.8, s0: 0.1, s1: 0.75 + Math.random() * 0.3, drag: 0.9 }));
          embers.stream(40, dt, () => embers.emit({ x: tip.x, y: tip.y + jit(0.03), z: tip.z, vx: -v * (1 + Math.random() * 0.6), vy: jit(0.6), life: 0.25 + Math.random() * 0.35, s0: 0.045, s1: 0.015, drag: 1 }));
          smoke.update(dt, 0, 0.05); embers.update(dt);
        } }; } };
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
    const tips = [V(-0.56, 0.08, 0.44), V(-0.56, 0.08, -0.44)], w = V(0, 0, 0);
    return { group: g, tick: (t, m) => { plane.rotation.x = -0.95 + Math.sin(t * 2.1) * 0.12 + Math.max(-0.45, Math.min(0.45, (m?.turn || 0) * 0.01)); plane.rotation.z = 0.05 + Math.sin(t * 1.4) * 0.05; },
      // thin wisps of air curl off each wingtip
      fx: (c) => { const air = c.trail({ max: 200, tex: puffTex(), add: false, ramp: [[0, '#ffffff', 0], [0.1, '#ffffff', 0.85], [1, '#f4f8ff', 0]] });
        return { update(t, dt, m) { const v = Math.max(0.4, Math.min(2, (m.speed || 90) / c.ppu));
          for (const p of tips) { plane.localToWorld(w.copy(p)); air.stream(36, dt, () => air.emit({ x: w.x, y: w.y, z: w.z, vx: -v * (0.9 + Math.random() * 0.2), vy: jit(0.03), life: 0.7 + Math.random() * 0.4, s0: 0.025, s1: 0.09, drag: 0.4 })); }
          air.update(dt); } }; } };
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
    // the burner fires in bursts: a blue-rooted flame licks up into the mouth and the envelope glows from inside
    const fl = new THREE.Group(); fl.position.y = -0.27; rig.add(fl);
    fl.add(mesh(new THREE.ConeGeometry(0.035, 0.16, 20, 1, true).translate(0, 0.08, 0), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    fl.add(mesh(new THREE.ConeGeometry(0.018, 0.08, 16, 1, true).translate(0, 0.04, 0), new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
    const heat = new THREE.PointLight('#ff9a3a', 0, 1.2, 1.6); heat.position.y = -0.02; rig.add(heat);
    env.material.emissive = new THREE.Color('#ff7a2a'); env.material.emissiveMap = gores;
    rig.rotation.x = 0.12; g.add(rig);
    return { group: g, tick: (t) => { rig.rotation.y = t * 0.35; rig.rotation.z = Math.sin(t * 1.2) * 0.05;
      const ph = t % 3.4, on = ph < 0.9 ? Math.sin(Math.min(1, ph / 0.15) * Math.PI / 2) * (ph > 0.7 ? (0.9 - ph) / 0.2 : 1) : 0, fk = 0.85 + Math.sin(t * 37) * 0.1 + Math.sin(t * 23) * 0.06;
      fl.scale.set(0.6 + on * 0.5, (0.25 + on * 1.1) * fk, 0.6 + on * 0.5); fl.visible = on > 0.02; heat.intensity = on * 2.6 * fk; env.material.emissiveIntensity = on * 0.12;
      burner.material.opacity = 0.5 + on * 0.5 + Math.abs(Math.sin(t * 9)) * 0.15; burner.scale.setScalar(0.22 + on * 0.18); } };
  },
  kite() {
    const g = new THREE.Group(), kite = new THREE.Group();
    const top = V(0, 0.5, 0), rt = V(0.27, 0.16, 0.03), bot = V(0, -0.34, 0), lf = V(-0.27, 0.16, 0.03), mid = V(0, 0.16, 0.07);
    const cols = ['#e2483d', '#f2c14e', '#2f7fd0', '#f6efe2'];
    const fabric = (c) => std(c, { roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide });
    // one ripstop sheet over the frame, four panels sewn together, that fills and ripples in the wind
    const silk = canvasTex('kitesilk', 512, 512, (c, w) => { const m = w / 2;
      [[[0, 0], [w, 0]], [[w, 0], [w, w]], [[w, w], [0, w]], [[0, w], [0, 0]]].forEach(([a, b], k) => { c.fillStyle = cols[k]; c.beginPath(); c.moveTo(m, m); c.lineTo(...a); c.lineTo(...b); c.closePath(); c.fill(); });
      c.strokeStyle = 'rgba(0,0,0,.07)'; c.lineWidth = 1.5; for (let x = 0; x <= w; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, w); c.stroke(); c.beginPath(); c.moveTo(0, x); c.lineTo(w, x); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3; c.setLineDash([9, 6]); for (const [x, y] of [[0, 0], [w, 0], [w, w], [0, w]]) { c.beginPath(); c.moveTo(m, m); c.lineTo(x, y); c.stroke(); }
      c.setLineDash([]); c.strokeStyle = 'rgba(70,40,20,.55)'; c.lineWidth = 10; c.strokeRect(0, 0, w, w); });
    const N = 16, sheet = new THREE.PlaneGeometry(1, 1, N, N), SP = sheet.attributes.position, SU = sheet.attributes.uv, rest = [], q = V(0, 0, 0);
    for (let i = 0; i < SP.count; i++) { const u = SU.getX(i), v = 1 - SU.getY(i); q.set(0, 0, 0).addScaledVector(top, (1 - u) * (1 - v)).addScaledVector(rt, u * (1 - v)).addScaledVector(bot, u * v).addScaledVector(lf, (1 - u) * v); rest.push(q.x, q.y, q.z, u, v); SP.setXYZ(i, q.x, q.y, q.z); }
    kite.add(new THREE.Mesh(sheet, std('#ffffff', { map: silk, roughness: 0.5, sheen: 0.9, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide })));
    const billow = (t) => { for (let i = 0; i < SP.count; i++) { const [x, y, z, u, v] = rest.slice(i * 5, i * 5 + 5), b = Math.sin(Math.PI * u) * Math.sin(Math.PI * v); SP.setXYZ(i, x, y, z + b * (0.06 + 0.015 * Math.sin(t * 2.3)) + b * 0.012 * Math.sin(t * 11 + u * 9 + v * 6)); } SP.needsUpdate = true; sheet.computeVertexNormals(); };
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
      kite.rotation.set(Math.sin(t * 0.9) * 0.12, Math.sin(t * 1.3) * 0.25, Math.sin(t * 1.1) * 0.06); billow(t);
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
    // each wing is drawn three times a little apart in its beat, fainter behind, so it reads as a blur
    const wings = [];
    for (const s of [-1, 1]) for (const [lag, op] of [[0, 1], [0.55, 0.45], [1.1, 0.22]]) { const wm = wingM.clone(); wm.opacity = op; const hinge = new THREE.Group(); hinge.position.set(0.08, 0.13, s * 0.04); const w1 = mesh(new THREE.PlaneGeometry(0.36, 0.17).translate(-0.12, 0, 0.0), wm); w1.rotation.x = -Math.PI / 2; w1.position.z = s * 0.09; const w2 = mesh(new THREE.PlaneGeometry(0.22, 0.11).translate(-0.12, 0, 0), wm); w2.rotation.x = -Math.PI / 2; w2.position.set(-0.06, -0.005, s * 0.07); hinge.add(w1, w2); hinge.userData = { s, lag }; bee.add(hinge); wings.push(hinge); }
    bee.rotation.set(0.45, -0.25, 0.05); g.add(bee);
    return { group: g, tick: (t, m) => { wings.forEach((w) => { w.rotation.x = w.userData.s * (0.35 + Math.sin(t * 80 - w.userData.lag) * 0.7); }); bee.position.y = Math.sin(t * 9) * 0.015; bee.rotation.x = 0.45 + Math.max(-0.5, Math.min(0.5, (m?.turn || 0) * 0.006)); abd.rotation.z = Math.sin(t * 7) * 0.06; },
      // a little pollen falls from its legs as it goes
      fx: (c) => { const dust = c.trail({ max: 90, tex: dotTex(), add: false, ramp: [[0, '#f5b800', 1], [0.6, '#e9a400', 0.8], [1, '#d08a00', 0]] });
        return { update(t, dt, m) { const v = Math.max(0.3, Math.min(2, (m.speed || 150) / c.ppu)); dust.stream(26, dt, () => dust.emit({ x: -0.05 + jit(0.08), y: -0.2, vx: -v * 0.6, vy: -0.05, life: 0.8 + Math.random() * 0.6, s0: 0.045, s1: 0.02, drag: 1.2 })); dust.update(dt, 0, -0.35); } }; } };
  },
};
function nucleus(col, glowCol, seed, gold) {
  const g = new THREE.Group();
  const m = gold ? std(col, { metalness: 1, roughness: 0.35, bumpMap: bumpTex('rockb', 70), bumpScale: 3, emissive: new THREE.Color('#5a3a00'), emissiveIntensity: 0.5 })
    : std(col, { roughness: 0.75, map: grainTex('ice', '#c7dceb', ['#ffffff', '#8aa5ba', '#e8f4fb', '#6f8799']), bumpMap: bumpTex('rockb', 70), bumpScale: 3, emissive: new THREE.Color('#2a5a7a'), emissiveIntensity: 0.25 });
  const rock = mesh(rockGeo(0.3, { lump: 0.18, craters: 7, seed }), m); g.add(rock);
  const coma = glow(glowCol, 1.7, 0.75); g.add(coma); const inner = glow('#ffffff', 0.75, 0.55); g.add(inner);
  // jets of gas boil off the sunward side
  const jets = [0, 1, 2].map(() => { const j = glow('#ffffff', 0.3, 0.4); g.add(j); return j; });
  return { group: g, tick: (t) => { rock.rotation.set(t * 0.7, t * 1.1, 0); coma.material.opacity = 0.65 + Math.sin(t * 3) * 0.1; jets.forEach((j, k) => { const a = t * 1.1 + k * 2.1; j.position.set(0.18 + Math.sin(a) * 0.05, Math.cos(a * 1.3) * 0.16, 0.1); j.material.opacity = 0.25 + 0.2 * Math.sin(t * 4 + k * 2); }); },
    // two tails: a straight, streaming ion tail and a broader dust tail that curves away and spreads
    fx: (c) => { const L = c.tail;
      const ion = c.trail({ max: 560, ramp: gold ? [[0, '#fffbe8', 0.8], [0.3, '#ffe08a', 0.45], [1, '#ff9a1a', 0]] : [[0, '#ffffff', 0.75], [0.25, '#b4ecff', 0.45], [1, '#2f6dff', 0]] });
      const dust = c.trail({ max: 520, ramp: gold ? [[0, '#ffffff', 0.45], [0.3, '#ffd57a', 0.25], [1, '#b8741a', 0]] : [[0, '#ffffff', 0.4], [0.3, '#e8f3ff', 0.22], [1, '#9fb2c8', 0]] });
      const glit = gold ? c.trail({ max: 90, tex: glintTex(), twinkle: 0.8, ramp: [[0, '#fffbe0', 1], [1, '#ffcc4a', 0]] }) : null;
      // under the particles, a smooth sheet of light that widens and fades down the tail
      const sheet = canvasTex(`tail${gold ? 'g' : 'b'}`, 512, 128, (cx, w, h) => { const img = cx.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = 1 - x / w, half = 0.08 + u * 0.42, d = Math.abs(y / h - 0.5) / half, a = Math.max(0, 1 - d * d) * (1 - u) ** 1.6; const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255; } cx.putImageData(img, 0, 0); });
      c.add(mesh(new THREE.PlaneGeometry(L, 0.9).translate(-L / 2, 0, -0.05), new THREE.MeshBasicMaterial({ map: sheet, color: glowCol, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
      return { update(t, dt) {
        ion.stream(380, dt, () => { const life = 0.8 + Math.random() * 0.4; ion.emit({ x: jit(0.04), y: jit(0.035), vx: -L / life * (0.95 + Math.random() * 0.25), vy: jit(0.04), life, s0: 0.13, s1: 0.035 }); });
        dust.stream(200, dt, () => { const life = 1 + Math.random() * 0.5; dust.emit({ x: jit(0.06), y: jit(0.06), vx: -L / life * (0.45 + Math.random() * 0.35), vy: jit(0.2) + 0.05, life, s0: 0.18, s1: 0.6 }); });
        glit?.stream(30, dt, () => glit.emit({ x: jit(0.1), y: jit(0.1), vx: -L * (0.3 + Math.random() * 0.5), vy: jit(0.25), life: 1 + Math.random() * 0.6, s0: 0.16, s1: 0.04 }));
        ion.update(dt); dust.update(dt, 0, 0.32); glit?.update(dt);
      } }; } };
}
// painted wings, two on each side, that fold up toward each other to beat
function butterfly(wing, light, ink, gold) {
  const g = new THREE.Group(), bfly = new THREE.Group();
  const paint = (which) => canvasTex(`wing${wing}${which}`, 512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const fore = new Path2D('M8 250 C 60 120, 250 10, 470 40 C 500 60, 490 120, 440 170 C 360 240, 200 260, 8 262 Z');
    const hind = new Path2D('M8 262 C 160 270, 330 300, 380 380 C 410 440, 360 500, 290 490 C 190 470, 60 380, 8 280 Z');
    for (const p of which === 'f' ? [fore] : [hind]) {
      // fine scales: a speckle of light and dark under the veins
      c.save(); c.clip(p); const R = rnd(which === 'f' ? 3 : 4); for (let k = 0; k < 900; k++) { c.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; c.fillRect(R() * w, R() * h, 2 + R() * 3, 1.5); } c.restore();
      const gr = c.createRadialGradient(80, 256, 20, 160, 256, 420); gr.addColorStop(0, light); gr.addColorStop(0.55, wing); gr.addColorStop(1, wing);
      c.globalCompositeOperation = 'destination-over'; c.fillStyle = gr; c.fill(p); c.globalCompositeOperation = 'source-over'; c.save(); c.clip(p);
      c.strokeStyle = ink; c.lineWidth = 7; c.globalAlpha = 0.9;
      for (const [x, y] of [[470, 60], [430, 150], [380, 210], [300, 250], [360, 400], [300, 480], [200, 430]]) { c.beginPath(); c.moveTo(10, 258); c.quadraticCurveTo((x + 10) / 2, (y + 258) / 2 - 25, x, y); c.stroke(); }
      c.globalAlpha = 1; c.lineWidth = 34; c.stroke(p); c.fillStyle = '#fff';
      for (let k = 0; k < 14; k++) { const a = k / 14; c.beginPath(); c.arc(140 + a * 330, 52 + Math.sin(a * 3) * 18 + a * 20, 5 + (k % 3), 0, TAU); c.fill(); }
      for (let k = 0; k < 8; k++) { c.beginPath(); c.arc(300 + k * 12, 470 - k * 14, 5, 0, TAU); c.fill(); }
      c.restore();
    }
  });
  const mat = (which) => std('#ffffff', { map: paint(which), alphaTest: 0.5, side: THREE.DoubleSide, roughness: gold ? 0.25 : 0.6, metalness: gold ? 0.75 : 0, sheen: gold ? 0 : 0.8, sheenColor: new THREE.Color(light), iridescence: gold ? 0.6 : 0.25 });
  const mf = mat('f'), mh = mat('h');
  const half = (s, m) => { const h = new THREE.Group(); const p = mesh(new THREE.PlaneGeometry(0.62, 0.62).translate(0.31, 0, 0), m); p.scale.x = s; h.add(p); return h; };
  const LF = half(-1, mf), RF = half(1, mf), LH = half(-1, mh), RH = half(1, mh); LH.position.z = RH.position.z = -0.004; bfly.add(LF, RF, LH, RH);
  const bodyM = std(ink, { roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(gold ? '#ffd98a' : '#8a7a6a') });
  bfly.add(mesh(new THREE.CapsuleGeometry(0.03, 0.34, 6, 12), bodyM, 0, -0.04, 0.01));
  bfly.add(mesh(new THREE.SphereGeometry(0.04, 16, 12), bodyM, 0, 0.17, 0.01));
  for (const s of [-1, 1]) { bfly.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(s * 0.01, 0.2, 0.02), V(s * 0.06, 0.32, 0.03), V(s * 0.1, 0.4, 0.02)]), 12, 0.005, 5), bodyM)); bfly.add(mesh(new THREE.SphereGeometry(0.014, 10, 8), bodyM, s * 0.1, 0.4, 0.02)); }
  bfly.rotation.set(-0.5, 0, 0); g.add(bfly);
  const sp = gold ? 26 : 18, beat = (t) => 0.15 + (0.5 + 0.5 * Math.sin(t * sp)) * 1.05;
  return { group: g, tick: (t) => { const a = beat(t), b = beat(t - 0.045); RF.rotation.y = -a; LF.rotation.y = a; RH.rotation.y = -b; LH.rotation.y = b;
      bfly.position.y = Math.sin(t * 6) * 0.02 - Math.cos(t * sp) * 0.012; bfly.rotation.x = -0.5 + Math.cos(t * sp) * 0.06; bfly.rotation.z = Math.sin(t * 2.2) * 0.08; },
    // the golden one sheds glitter from its wings: gold flecks that flash as they turn, and a few bright glints
    fx: gold ? (c) => { const glit = c.trail({ max: 160, tex: dotTex(), add: false, twinkle: 0.6, ramp: [[0, '#ffd34a', 1], [0.5, '#e8a40c', 0.9], [1, '#b87808', 0]] });
      const star = c.trail({ max: 40, tex: glintTex(), add: false, twinkle: 0.5, ramp: [[0, '#ffffff', 1], [1, '#fff0b0', 0]] });
      const sh = (tr, s0) => tr.emit({ x: jit(0.3), y: jit(0.18), z: 0.15, vx: -(m0.dir || 1) * (0.25 + Math.random() * 0.35), vy: -0.05, life: 1 + Math.random() * 0.8, s0, s1: s0 * 0.35, drag: 0.6 }); let m0 = {};
      return { update(t, dt, m) { m0 = m; glit.stream(40, dt, () => sh(glit, 0.05)); star.stream(8, dt, () => sh(star, 0.22)); glit.update(dt, 0, -0.3); star.update(dt, 0, -0.3); } }; } : null };
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
// streaking things are framed on their head; the rest of the element (and some room around it) holds their tail.
// pad: room around the element for trails, as fractions of its width (l, r) and height (t, b)
const HEAD = { comet: 1, 'gold-comet': 1, meteor: 1 };
const PAD = { comet: [0.04, 0.12, 0.5, 0.5], 'gold-comet': [0.04, 0.12, 0.6, 0.6], meteor: [0.05, 0.12, 0.9, 0.9], rocket: [1, 0.1, 0.45, 0.45], plane: [0.7, 0.1, 0.3, 0.3], bee: [0.5, 0.1, 0.25, 0.5], 'gold-butterfly': [0.45, 0.45, 0.2, 0.6], satellite: [0.15, 0.15, 0.2, 0.2], asteroid: [0.12, 0.12, 0.15, 0.15] };
export function mountFlyer(host, f, { w, h, night, reduce }) {
  stopFlyer();
  const r = renderer(); if (!r || !BUILD[f.id]) return null;
  const head = HEAD[f.id], hx = (f.hx ?? 0.5) * w;
  // the model fills this rect (element px); the canvas covers the element plus padding
  const fr = head ? { x: hx - h * 0.75, y: -h * 0.25, w: h * 1.5, h: h * 1.5 } : { x: 0, y: 0, w, h };
  const [pl, pr, pt, pb] = reduce ? [0, 0, 0, 0] : PAD[f.id] || [0, 0, 0, 0];
  const cx = Math.round(Math.min(fr.x, -pl * w)), cy = Math.round(Math.min(fr.y, -pt * h)), cw = Math.round(Math.max(fr.x + fr.w, w + pr * w)) - cx, ch = Math.round(Math.max(fr.y + fr.h, h + pb * h)) - cy;
  const dpr = Math.min(2, devicePixelRatio || 1);
  r.setPixelRatio(dpr); r.setSize(cw, ch, false);
  const cv = r.domElement; cv.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:${cw}px;height:${ch}px`;
  r.toneMappingExposure = night ? 1.15 : 1.0;
  const scene = new THREE.Scene(); scene.environment = envTex; scene.environmentIntensity = night ? 0.55 : 0.8;
  const key = new THREE.DirectionalLight(night ? '#dfe8ff' : '#fff1de', night ? 2.2 : 2.6); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(night ? '#7fb2ff' : '#ffffff', night ? 2.4 : 0.8); rim.position.set(-3, 1, -2); scene.add(rim);
  const model = BUILD[f.id](), still = { turn: 0, speed: 0, dir: 1 }; scene.add(model.group);
  // frame the model so it fills its rect over the whole of its motion
  const box = new THREE.Box3(); for (let t = 0; t < 8; t += 0.37) { model.tick(t, still); model.group.updateMatrixWorld(true); box.expandByObject(model.group); }
  model.tick(0, still); const size = box.getSize(V(0, 0, 0)), mid = box.getCenter(V(0, 0, 0));
  const fov = 22, fit = Math.tan((fov * Math.PI) / 360), cam = new THREE.PerspectiveCamera(fov, fr.w / fr.h, 0.05, 60);
  const dist = Math.max(size.y / 2 / fit, size.x / 2 / (fit * fr.w / fr.h)) * (head ? 1.05 : 1.08) + size.z / 2;
  cam.position.set(mid.x, mid.y, mid.z + dist); cam.lookAt(mid);
  cam.setViewOffset(fr.w, fr.h, cx - fr.x, cy - fr.y, cw, ch); cam.updateProjectionMatrix();
  const ppu = fr.h / (2 * dist * fit);
  const ctx = { ppu, night, tail: (fr.x + fr.w / 2) / ppu, add: (o) => scene.add(o), trail: (o) => { const tr = new Trail({ ...o, uScale: (fr.h * dpr) / (2 * fit) }); scene.add(tr.obj); return tr; } };
  const fx = !reduce && model.fx ? model.fx(ctx) : null;
  host.append(cv); host.classList.add(head ? 'fb-3d-head' : 'fb-3d');
  const t0 = performance.now(); let last = t0;
  const me = { scene, motion: { turn: 0, speed: 0, dir: 1 }, stop: () => { cancelAnimationFrame(me.raf); cv.remove(); host.classList.remove('fb-3d', 'fb-3d-head'); scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material?.isShaderMaterial) o.material.dispose(); }); if (live === me) live = null; } };
  const draw = (now) => { const t = (now - t0) / 1000, dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; model.tick(t, me.motion); fx?.update(t, dt, me.motion); r.render(scene, cam); if (!reduce) me.raf = requestAnimationFrame(draw); };
  live = me; draw(t0);
  return me;
}
export function stopFlyer() { live?.stop(); }
