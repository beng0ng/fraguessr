// Procedural 3D models: perfume bottles, essential-oil vials and a raw-material
// specimen for every ingredient, shot on a turntable plinth with studio lighting.
// One live stage renders the detail hero; a small offscreen renderer makes list thumbnails.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ── randomness & noise ────────────────────────────────────
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function h3(x, y, z) { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); }
// lattice values are memoised in a small direct-mapped table: neighbouring samples share corners, so most lookups skip the sine
const HN = 1 << 16, hX = new Int32Array(HN), hY = new Int32Array(HN), hZ = new Int32Array(HN), hV = new Float64Array(HN).fill(-1);
function hc(x, y, z) {
  const k = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (HN - 1);
  if (hV[k] >= 0 && hX[k] === x && hY[k] === y && hZ[k] === z) return hV[k];
  hX[k] = x; hY[k] = y; hZ[k] = z; return (hV[k] = h3(x, y, z));
}
// a second small table keeps whole cells (their eight corners), since runs of samples fall in the same cell
const CN = 256, cX = new Int32Array(CN), cY = new Int32Array(CN), cZ = new Int32Array(CN), cOk = new Uint8Array(CN), cV = new Float64Array(CN * 8);
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const X = xi | 0, Y = yi | 0, Z = zi | 0;
  if (X !== xi || Y !== yi || Z !== zi) return noise3slow(xi, yi, zi, u, v, w);
  const k = (Math.imul(X, 73856093) ^ Math.imul(Y, 19349663) ^ Math.imul(Z, 83492791)) & (CN - 1), o = k * 8;
  if (!cOk[k] || cX[k] !== X || cY[k] !== Y || cZ[k] !== Z) {
    cOk[k] = 1; cX[k] = X; cY[k] = Y; cZ[k] = Z;
    cV[o] = hc(X, Y, Z); cV[o + 1] = hc(X + 1, Y, Z); cV[o + 2] = hc(X, Y + 1, Z); cV[o + 3] = hc(X + 1, Y + 1, Z);
    cV[o + 4] = hc(X, Y, Z + 1); cV[o + 5] = hc(X + 1, Y, Z + 1); cV[o + 6] = hc(X, Y + 1, Z + 1); cV[o + 7] = hc(X + 1, Y + 1, Z + 1);
  }
  const a0 = cV[o], a1 = cV[o + 1], b0 = cV[o + 2], b1 = cV[o + 3], c0 = cV[o + 4], c1 = cV[o + 5], d0 = cV[o + 6], d1 = cV[o + 7];
  const p = a0 + (a1 - a0) * u, q = b0 + (b1 - b0) * u, r = c0 + (c1 - c0) * u, s = d0 + (d1 - d0) * u;
  const lo = p + (q - p) * v, hi = r + (s - r) * v;
  return lo + (hi - lo) * w;
}
function noise3slow(xi, yi, zi, u, v, w) {
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(xi, yi, zi), h3(xi + 1, yi, zi), u), L(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), u), v),
           L(L(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), u), L(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), u), v), w);
}
function fbm(x, y, z, oct = 3) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * noise3(x * f, y * f, z * f); a *= 0.5; f *= 2.03; } return s; }
// fbm over a w×h grid at a fixed depth z, for canvas textures: the same noise as fbm(), but the lattice hash's sine is
// split as sin(a + b) = sin a·cos b + cos a·sin b, so each lattice column and row pays for its sines once instead of every pixel
function fbmImage(w, h, scale, z, oct) {
  const out = new Float64Array(w * h), xi = new Int32Array(w), xu = new Float64Array(w);
  let amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) {
    let x0 = 2147483647, x1 = -2147483648;
    for (let px = 0; px < w; px++) { const x = (px / w) * scale * f, i = Math.floor(x), t = x - i; xi[px] = i; xu[px] = t * t * (3 - 2 * t); if (i < x0) x0 = i; if (i + 1 > x1) x1 = i + 1; }
    const nx = x1 - x0 + 1, sx = new Float64Array(nx), cx = new Float64Array(nx);
    for (let j = 0; j < nx; j++) { const a = (x0 + j) * 127.1; sx[j] = Math.sin(a); cx[j] = Math.cos(a); }
    const zz = z * f, zi = Math.floor(zz), zt = zz - zi, ww = zt * zt * (3 - 2 * zt);
    const r00 = new Float64Array(nx), r10 = new Float64Array(nx), r01 = new Float64Array(nx), r11 = new Float64Array(nx);
    let lastY = NaN;
    for (let py = 0; py < h; py++) {
      const y = (py / h) * scale * f, yi = Math.floor(y), t = y - yi, v = t * t * (3 - 2 * t);
      if (yi !== lastY) {
        lastY = yi;
        // lattice values along this row for the four (y, z) corners
        const rows = [[r00, yi, zi], [r10, yi + 1, zi], [r01, yi, zi + 1], [r11, yi + 1, zi + 1]];
        for (const [r, Y, Z] of rows) {
          const b = Y * 311.7 + Z * 74.7, sb = Math.sin(b), cb = Math.cos(b);
          for (let j = 0; j < nx; j++) { const q = (sx[j] * cb + cx[j] * sb) * 43758.5453; r[j] = q - Math.floor(q); }
        }
      }
      const row = py * w;
      for (let px = 0; px < w; px++) {
        const j = xi[px] - x0, u = xu[px];
        const p = r00[j] + (r00[j + 1] - r00[j]) * u, q = r10[j] + (r10[j + 1] - r10[j]) * u, r = r01[j] + (r01[j + 1] - r01[j]) * u, s = r11[j] + (r11[j + 1] - r11[j]) * u;
        const lo = p + (q - p) * v, hi = r + (s - r) * v;
        out[row + px] += amp * (lo + (hi - lo) * ww);
      }
    }
    amp *= 0.5; f *= 2.03;
  }
  return out;
}

// three's mergeVertices, keyed by numbers in an open-addressed table instead of strings: same tolerance, same vertex order
function weld(geo) {
  const names = Object.keys(geo.attributes), attrs = names.map((n) => geo.attributes[n]);
  if (attrs.some((a) => a.isInterleavedBufferAttribute || a.normalized) || Object.keys(geo.morphAttributes).length) return mergeVertices(geo);
  const idx = geo.getIndex(), n = idx ? idx.count : geo.attributes.position.count, width = attrs.reduce((s, a) => s + a.itemSize, 0);
  const tol = 1e-4, mul = Math.pow(10, Math.log10(1 / tol)), add = tol * 0.5 * mul;
  let size = 16; while (size < n * 2) size <<= 1;
  const mask = size - 1, table = new Int32Array(size).fill(-1), keys = new Int32Array(n * width), key = new Int32Array(width);
  const out = attrs.map((a) => new a.array.constructor(a.count * a.itemSize)), newIndices = [];
  let next = 0;
  for (let i = 0; i < n; i++) {
    const v = idx ? idx.getX(i) : i; let h = 0, o = 0;
    for (const a of attrs) { const s = a.itemSize, arr = a.array; for (let k = 0; k < s; k++) { const q = ~~(arr[v * s + k] * mul + add); key[o++] = q; h = Math.imul(h ^ q, 16777619); } }
    let slot = (h ^ (h >>> 15)) & mask, hit = -1;
    while (table[slot] !== -1) {
      const c = table[slot], b = c * width; let same = true;
      for (let k = 0; k < width; k++) if (keys[b + k] !== key[k]) { same = false; break; }
      if (same) { hit = c; break; }
      slot = (slot + 1) & mask;
    }
    if (hit >= 0) { newIndices.push(hit); continue; }
    table[slot] = next; keys.set(key, next * width);
    attrs.forEach((a, j) => { const s = a.itemSize; for (let k = 0; k < s; k++) out[j][next * s + k] = a.array[v * s + k]; });
    newIndices.push(next++);
  }
  const res = geo.clone();
  attrs.forEach((a, j) => res.setAttribute(names[j], new a.constructor(out[j].slice(0, next * a.itemSize), a.itemSize, a.normalized)));
  res.setIndex(newIndices);
  return res;
}

// displace along normals with fbm; geometry should be smooth/indexed
function displace(geo, amp, freq, oct = 3, seed = 0) {
  geo = weld(geo);
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = (fbm(x * freq + seed, y * freq, z * freq, oct) - 0.5) * 2 * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}
function blob(r, amp, freq, seed, detail = 4) { return displace(new THREE.IcosahedronGeometry(r, detail), amp, freq, 3, seed); }

// ── canvas textures ───────────────────────────────────────
const texCache = new Map();
function canvasTex(key, w, h, draw, { srgb = true, repeat } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  texCache.set(key, t);
  return t;
}
function noiseTex(key, scale = 6, contrast = 1, repeat) {
  return canvasTex('n' + key + scale + contrast, 256, 256, (g, w, h) => {
    const img = g.createImageData(w, h), n = fbmImage(w, h, scale, hash(key) % 97, 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = n[y * w + x];
      const c = Math.max(0, Math.min(255, 128 + (v - 0.5) * 255 * contrast));
      const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat });
}
// micro-surface: roughness that varies between 0.75 and 1.0 of the base value, plus fine pores for bump
function microTex(key, scale, lo = 0.75, repeat = [3, 3]) {
  return canvasTex('micro' + key + scale + lo, 256, 256, (g, w, h) => {
    const img = g.createImageData(w, h), n = fbmImage(w, h, scale, hash(key) % 89, 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = n[y * w + x];
      const c = Math.round(255 * (lo + (1 - lo) * Math.max(0, Math.min(1, (v - 0.2) / 0.6))));
      const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat });
}
function contactTex() {
  return canvasTex('contact', 128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.38)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
}
// soft ambient-occlusion pool where an object meets the surface it stands on
function contactShadow(radius, y = 0, opacity = 1, sx = 1, x = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2 * sx, radius * 2), new THREE.MeshBasicMaterial({ map: contactTex(), transparent: true, opacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.002, z); m.renderOrder = 1; m.userData.noFrame = true;
  return m;
}
function leafTex(color, vein, kind = 'ovate') {
  return canvasTex(`leaf${color}${vein}${kind}`, 128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.beginPath();
    if (kind === 'lobed') {
      g.moveTo(w / 2, h);
      for (let i = 0; i <= 40; i++) { const t = i / 40, a = Math.PI * t; const lobe = 0.75 + 0.25 * Math.cos(t * TAU * 2.5); g.lineTo(w / 2 + Math.sin(a) * w * 0.48 * lobe, h - t * h); }
      for (let i = 40; i >= 0; i--) { const t = i / 40, a = Math.PI * t; const lobe = 0.75 + 0.25 * Math.cos(t * TAU * 2.5); g.lineTo(w / 2 - Math.sin(a) * w * 0.48 * lobe, h - t * h); }
    } else if (kind === 'heart') {
      g.moveTo(w / 2, h * 0.95);
      g.bezierCurveTo(w * 1.05, h * 0.75, w * 0.95, h * 0.05, w / 2, h * 0.02);
      g.bezierCurveTo(w * 0.05, h * 0.05, -w * 0.05, h * 0.75, w / 2, h * 0.95);
    } else {
      const serr = kind === 'serrated';
      g.moveTo(w / 2, h);
      for (let i = 0; i <= 50; i++) { const t = i / 50, wd = Math.sin(Math.PI * Math.pow(t, 0.8)) * w * 0.46 * (serr && i % 2 ? 0.9 : 1); g.lineTo(w / 2 + wd, h - t * h); }
      for (let i = 50; i >= 0; i--) { const t = i / 50, wd = Math.sin(Math.PI * Math.pow(t, 0.8)) * w * 0.46 * (serr && i % 2 ? 0.9 : 1); g.lineTo(w / 2 - wd, h - t * h); }
    }
    g.closePath();
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, color); gr.addColorStop(1, shade(color, -0.25));
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    g.strokeStyle = vein; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 4); g.stroke();
    g.lineWidth = 1.2;
    for (let i = 1; i < 9; i++) { const y = h - (i / 9) * h; g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w * 0.7, y - 18, w, y - 34); g.moveTo(w / 2, y); g.quadraticCurveTo(w * 0.3, y - 18, 0, y - 34); g.stroke(); }
    g.restore();
  });
}
function petalTex(c0, c1, c2, kind = 'round') {
  return canvasTex(`petal${c0}${c1}${c2}${kind}`, 128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.beginPath();
    if (kind === 'long') { g.moveTo(w / 2, h); g.bezierCurveTo(w * 0.95, h * 0.7, w * 0.7, h * 0.05, w / 2, 0); g.bezierCurveTo(w * 0.3, h * 0.05, w * 0.05, h * 0.7, w / 2, h); }
    else if (kind === 'ruffle') { g.moveTo(w / 2, h); g.bezierCurveTo(w * 1.1, h * 0.6, w * 1.0, h * 0.1, w * 0.8, h * 0.06); for (let i = 0; i <= 8; i++) g.lineTo(w * (0.8 - i * 0.075), h * (0.04 + (i % 2) * 0.04)); g.bezierCurveTo(0, h * 0.1, -w * 0.1, h * 0.6, w / 2, h); }
    else { g.moveTo(w / 2, h); g.bezierCurveTo(w * 1.08, h * 0.62, w * 0.98, -h * 0.02, w / 2, h * 0.04); g.bezierCurveTo(w * 0.02, -h * 0.02, -w * 0.08, h * 0.62, w / 2, h); }
    g.closePath();
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, c2); gr.addColorStop(0.35, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr; g.fill();
    g.save(); g.clip(); g.globalAlpha = 0.18; g.strokeStyle = shade(c0, -0.3); g.lineWidth = 1;
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w / 2 + i * 6, h * 0.5, w / 2 + i * 10, 0); g.stroke(); }
    g.restore();
  });
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return '#' + [f(r), f(g), f(b)].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

// ── materials ─────────────────────────────────────────────
const M = {
  std(color, o = {}) { return new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, metalness: 0, ...o }); },
  glass(o = {}) { return new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 1, thickness: 0.35, ior: 1.52, dispersion: 0.25, attenuationColor: new THREE.Color('#dfeee6'), attenuationDistance: 2.5, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, envMapIntensity: 1.4, ...o }); },
  liquid(color, o = {}) { return new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, transmission: 0.9, thickness: 0.9, ior: 1.36, attenuationColor: color, attenuationDistance: 0.55, ...o }); },
  // juice seen through glass: transmissive objects can't see each other in three.js, so this one stays opaque and glows a little like back-lit liquid
  juice(color, o = {}) { const c = new THREE.Color(color); return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, emissive: c.clone().multiplyScalar(0.28), sheen: 0.4, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.5), ...o }); },
  // bottle wall: a thin reflective shell, so the liquid inside can be the refracting (transmissive) body
  shell(o = {}) { return new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, envMapIntensity: 2.2, ...o }); },
  perfume(color, o = {}) { const c = new THREE.Color(color); return new THREE.MeshPhysicalMaterial({ color: c.clone().lerp(new THREE.Color(0xffffff), 0.5), roughness: 0.0, transmission: 1, thickness: 0.9, ior: 1.36, attenuationColor: c, attenuationDistance: 1.1, clearcoat: 1, specularIntensity: 1, envMapIntensity: 1.4, ...o }); },
  metal(color, rough = 0.18) { return new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: rough, clearcoat: 0.4, clearcoatRoughness: 0.1 }); },
  leaf(color, vein, kind) { return new THREE.MeshPhysicalMaterial({ map: leafTex(color, vein, kind), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color(shade(color, 0.4)), clearcoat: 0.3, clearcoatRoughness: 0.4 }); },
  petal(c0, c1, c2, kind) { return new THREE.MeshPhysicalMaterial({ map: petalTex(c0, c1, c2, kind), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(c1), transmission: 0.15, thickness: 0.02 }); },
};

// ── geometry helpers ──────────────────────────────────────
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function bendPlane(w, h, { cup = 0, curl = 0, twist = 0, droop = 0, wave = 0, seed = 0 } = {}) {
  const g = new THREE.PlaneGeometry(w, h, 10, 20); g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), t = y / h, u = x / (w / 2);
    let z = cup * u * u * w * 0.5 + curl * t * t * h + droop * t * t * h * -1 + wave * Math.sin(u * 6 + seed) * 0.02 * t;
    const a = twist * t;
    p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a) * 0.3, y, z + x * Math.sin(a));
  }
  g.computeVertexNormals();
  return g;
}
function tube(points, r, seg = 24, radial = 8, taper = 0) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, seg, r, radial, false);
  if (taper) { const p = g.attributes.position; const n = (radial + 1); for (let i = 0; i < p.count; i++) { const t = Math.floor(i / n) / seg, c = curve.getPointAt(Math.min(1, t)); const k = 1 - taper * t; p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k); } g.computeVertexNormals(); }
  return g;
}
function place(obj, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) { obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); obj.scale.setScalar(s); return obj; }
// scatter copies of a geometry as a little mound
function pile(geo, mat, n, radius, seed, { height = 0.6, size = [0.8, 1.2], flat = false } = {}) {
  const r = rng(seed), im = new THREE.InstancedMesh(geo, mat, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  geo.computeBoundingSphere(); const br = geo.boundingSphere.radius;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * radius, s = size[0] + r() * (size[1] - size[0]);
    const y = (1 - d / radius) * radius * height + br * s * 0.6;
    e.set(flat ? Math.PI / 2 + (r() - 0.5) * 0.4 : r() * TAU, r() * TAU, flat ? (r() - 0.5) * 0.4 : r() * TAU); q.setFromEuler(e);
    m4.compose(V3(Math.cos(a) * d, y, Math.sin(a) * d), q, V3(s, s, s)); im.setMatrixAt(i, m4);
  }
  im.castShadow = im.receiveShadow = true;
  return im;
}
function dish(radius = 0.6, color = 0xffffff, glass = true) {
  const pts = [[0, 0], [radius * 0.8, 0], [radius, 0.08], [radius * 1.02, 0.1], [radius * 0.96, 0.1], [radius * 0.78, 0.025], [0, 0.025]].map(([x, y]) => new THREE.Vector2(x, y));
  return mesh(new THREE.LatheGeometry(pts, 64), glass ? M.glass({ thickness: 0.1 }) : M.std(color, { roughness: 0.35 }));
}
function stem(points, r = 0.012, color = '#4f7a3a') { return mesh(tube(points, r, 30, 6), M.std(color, { roughness: 0.6 })); }

// ── specimens ─────────────────────────────────────────────
function citrus(ing) {
  const id = ing.id, g = new THREE.Group();
  const R = { cedrat: 0.52, grapefruit: 0.5, orange: 0.44, lemon: 0.38, lime: 0.32, mandarin: 0.36, yuzu: 0.38, bergamot: 0.4 }[id] || 0.4;
  const peel = { cedrat: '#d6cf3c', grapefruit: '#f5c35e', orange: '#f28a1a', lemon: '#f5d93a', lime: '#4fa83a', mandarin: '#f6921e', yuzu: '#e9c936', bergamot: '#b9c84a' }[id] || ing.c[0];
  const flesh = { cedrat: '#f3efc2', grapefruit: '#f2685a', orange: '#ffa53a', lemon: '#f9e98a', lime: '#b8e07a', mandarin: '#ffb04a', yuzu: '#fbe48a', bergamot: '#e9ef9a' }[id] || ing.c[1];
  const bump = noiseTex('peel', 60, 1.4);
  const peelMat = M.std(peel, { roughness: 0.42, bumpMap: bump, bumpScale: 2.2, clearcoat: 0.35, clearcoatRoughness: 0.5 });
  let whole = new THREE.SphereGeometry(R, 64, 48);
  if (id === 'lemon') whole.scale(1, 0.86, 1.3);
  if (id === 'mandarin') whole.scale(1, 0.78, 1);
  if (id === 'yuzu') whole = displace(whole, 0.025, 4, 2, 3);
  if (id === 'cedrat') { whole = displace(whole, 0.05, 3, 3, 5); whole.scale(1, 1, 1.3); }
  if (id === 'bergamot') { const p = whole.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y * (y > 0 ? 1.15 : 0.95)); } whole.computeVertexNormals(); }
  const w = mesh(whole, peelMat, -0.32, R * (id === 'mandarin' ? 0.78 : id === 'lemon' ? 0.86 : 1), -0.1);
  w.rotation.z = id === 'lemon' ? 0.2 : 0; g.add(w);
  // cut half
  const segs = id === 'mandarin' ? 10 : id === 'lime' ? 10 : 11;
  const face = canvasTex(`cut${id}`, 512, 512, (c, W) => {
    const cx = W / 2;
    c.fillStyle = peel; c.beginPath(); c.arc(cx, cx, cx, 0, TAU); c.fill();
    c.fillStyle = '#fbf6e6'; c.beginPath(); c.arc(cx, cx, cx * 0.9, 0, TAU); c.fill();
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU + 0.035, a1 = ((i + 1) / segs) * TAU - 0.035;
      const gr = c.createRadialGradient(cx, cx, cx * 0.1, cx, cx, cx * 0.84); gr.addColorStop(0, shade(flesh, 0.35)); gr.addColorStop(1, flesh);
      c.fillStyle = gr; c.beginPath(); c.moveTo(cx + Math.cos((a0 + a1) / 2) * cx * 0.1, cx + Math.sin((a0 + a1) / 2) * cx * 0.1); c.arc(cx, cx, cx * 0.83, a0, a1); c.closePath(); c.fill();
      c.globalAlpha = 0.35; c.strokeStyle = '#ffffff'; c.lineWidth = 1.2;
      for (let k = 0; k < 14; k++) { const a = a0 + (a1 - a0) * (k / 14), r0 = cx * (0.2 + 0.6 * ((k * 37) % 10) / 10); c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * (r0 + 22), cx + Math.sin(a) * (r0 + 22)); c.stroke(); }
      c.globalAlpha = 1;
    }
    c.fillStyle = '#fbf6e6'; c.beginPath(); c.arc(cx, cx, cx * 0.07, 0, TAU); c.fill();
  });
  const half = new THREE.Group();
  const dome = new THREE.SphereGeometry(R, 64, 32, 0, TAU, 0, Math.PI / 2); dome.rotateX(Math.PI);
  half.add(mesh(dome, peelMat));
  const cap = new THREE.CircleGeometry(R, 64); cap.rotateX(-Math.PI / 2);
  half.add(mesh(cap, M.std(0xffffff, { map: face, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.4 }), 0, 0.001, 0));
  half.rotation.set(0.75, 0.3, 0); half.position.set(0.32, R * 0.75, 0.22); g.add(half);
  // leaf
  const lf = mesh(bendPlane(0.22, 0.5, { cup: 0.4, curl: 0.2 }), M.leaf('#3f7d32', '#7fb46a'));
  lf.rotation.set(-1.2, 0.8, 0); lf.position.set(-0.3, 0.05, 0.42); g.add(lf);
  return g;
}

function flowerHead(ing, { petals = 5, layers = 1, len = 0.28, wid = 0.2, kind = 'round', open = 1.1, cup = 0.5, twist = 0, droop = 0, center = '#f5c542', centerR = 0.04, colors } = {}) {
  const [c0, c1, c2] = colors || ing.c;
  const g = new THREE.Group();
  const mat = M.petal(c0, c1, c2, kind), r = rng(hash(ing.id));
  for (let L = 0; L < layers; L++) {
    const k = layers === 1 ? 1 : L / (layers - 1); // 0 inner → 1 outer
    const n = petals + (layers > 1 ? L * 2 : 0), tilt = layers === 1 ? open : 0.2 + k * open;
    const s = layers === 1 ? 1 : 0.45 + 0.55 * k;
    for (let i = 0; i < n; i++) {
      const geo = bendPlane(wid * s, len * s, { cup: cup * (1.2 - k * 0.6), curl: layers > 1 ? -0.25 * k : 0, twist, droop, wave: kind === 'ruffle' ? 1 : 0, seed: i });
      const p = mesh(geo, mat); p.castShadow = true;
      const a = (i / n) * TAU + L * 0.5 + r() * 0.2;
      const holder = new THREE.Group(); holder.rotation.y = a; p.rotation.x = tilt + (r() - 0.5) * 0.15; holder.add(p); g.add(holder);
    }
  }
  if (centerR) g.add(mesh(new THREE.SphereGeometry(centerR, 16, 12), M.std(center, { roughness: 0.7 }), 0, centerR * 0.4, 0));
  return g;
}
// a rose-like head: petals spiral out on the golden angle, tight and cupped at the heart,
// opening and rolling back at the tips toward the outside
function rosePetal(w, h, cup, reflex, ruffle, seed) {
  const g = new THREE.PlaneGeometry(w, h, 12, 18); g.translate(0, h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), t = y / h, u = x / (w / 2);
    let z = cup * u * u * w * 0.55 * (1 - 0.35 * t) + 0.12 * h * Math.sin(t * Math.PI * 0.8);
    z -= reflex * Math.max(0, t - 0.55) ** 2 * h * 2.4 + reflex * Math.abs(u) ** 3 * t * h * 0.18;
    z += ruffle * Math.sin(u * 7 + seed * 3.1) * Math.sin(t * Math.PI) * 0.018;
    p.setXYZ(i, x * (1 - 0.18 * (1 - t)), y, z);
  }
  g.computeVertexNormals();
  return g;
}
function roseHead(ing, { n = 34, open = 1.25, size = 0.3, kind = 'round', ruffle = 0, colors } = {}) {
  const [c0, c1, c2] = colors || ing.c, g = new THREE.Group(), r = rng(hash(ing.id + n));
  const inner = M.petal(shade(c0, -0.12), c0, shade(c2, -0.1), kind), outer = M.petal(c0, c1, c2, kind);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1), s = 0.32 + 0.68 * Math.pow(k, 0.65);
    const geo = rosePetal(size * 1.2 * s, size * s, 2.2 - k * 1.4, Math.pow(k, 1.8) * 0.8, ruffle, i);
    const pm = mesh(geo, k < 0.4 ? inner : outer);
    const holder = new THREE.Group(); holder.rotation.y = i * 2.39996 + r() * 0.15;
    pm.position.z = 0.006 + k * size * 0.12; pm.rotation.x = 0.06 + Math.pow(k, 1.4) * open * 0.88 + (r() - 0.5) * 0.08;
    holder.add(pm); g.add(holder);
  }
  // receptacle and sepals underneath
  const hip = new THREE.SphereGeometry(size * 0.16, 20, 14); hip.scale(1, 0.8, 1);
  g.add(mesh(hip, M.std('#4f7a36', { roughness: 0.55 }), 0, -size * 0.06, 0));
  for (let i = 0; i < 5; i++) { const sp = mesh(bendPlane(size * 0.12, size * 0.5, { cup: 0.6, curl: -0.4 }), M.std('#3f6e2e', { side: THREE.DoubleSide, roughness: 0.6 })); const hd = new THREE.Group(); hd.rotation.y = i * 1.2566; sp.rotation.x = Math.PI - 0.9; sp.position.y = -size * 0.04; hd.add(sp); g.add(hd); }
  return g;
}
function flowerSpecimen(ing) {
  const id = ing.id, g = new THREE.Group(), r = rng(hash(id));
  const addHead = (head, x, z, y, rx = -0.35, s = 1, withStem = true) => {
    head.position.set(x, y, z); head.rotation.x = rx; head.scale.setScalar(s); g.add(head);
    if (withStem) g.add(stem([V3(x, y - 0.02, z), V3(x + 0.05, y * 0.5, z + 0.05), V3(x + 0.1, 0.02, z + 0.25)], 0.012));
  };
  const leaf = (x, z, rot, kind = 'ovate', col = '#3e7a35', s = 1) => { const l = mesh(bendPlane(0.2 * s, 0.42 * s, { cup: 0.5, curl: 0.25 }), M.leaf(col, shade(col, 0.35), kind)); l.rotation.set(-1.25, rot, 0); l.position.set(x, 0.02, z); g.add(l); };
  if (id === 'rose' || id === 'rose_turkey' || id === 'rose_centifolia' || id === 'peony') {
    const opts = id === 'peony' ? { petals: 6, layers: 7, len: 0.3, wid: 0.28, kind: 'ruffle', open: 1.25, cup: 0.9, centerR: 0.03 }
      : id === 'rose_centifolia' ? { petals: 6, layers: 8, len: 0.26, wid: 0.25, open: 1.25, cup: 1.1, centerR: 0 }
      : { petals: 5, layers: 6, len: 0.28, wid: 0.25, open: 1.15, cup: 1.0, centerR: 0 };
    const ro = id === 'peony' ? { n: 52, open: 1.45, size: 0.32, kind: 'ruffle', ruffle: 1 } : id === 'rose_centifolia' ? { n: 48, open: 1.2, size: 0.28 } : { n: 34, open: 1.25, size: 0.3 };
    addHead(roseHead(ing, ro), -0.15, 0, 0.42, 0.6);
    addHead(roseHead(ing, { ...ro, n: Math.round(ro.n * 0.55), open: 0.5 }), 0.38, -0.15, 0.3, 0.35, 0.7);
    leaf(0.1, 0.35, 0.6, 'serrated'); leaf(-0.45, 0.2, -0.7, 'serrated');
    for (let i = 0; i < 6; i++) { const pm = mesh(bendPlane(0.16, 0.2, { cup: 0.8, curl: -0.2 }), M.petal(ing.c[0], ing.c[1], ing.c[2])); pm.rotation.set(-Math.PI / 2 + 0.2, r() * TAU, 0); pm.position.set((r() - 0.3) * 1.0, 0.02, 0.2 + r() * 0.35); g.add(pm); }
  } else if (id === 'jasmine' || id === 'sambac' || id === 'neroli' || id === 'tuberose') {
    const opts = { jasmine: { petals: 5, len: 0.2, wid: 0.12, kind: 'long', open: 1.35, cup: 0.15, center: '#f1d88a', centerR: 0.02 },
      sambac: { petals: 6, layers: 2, len: 0.18, wid: 0.13, open: 1.2, cup: 0.4, center: '#e7efd9', centerR: 0.02 },
      neroli: { petals: 5, len: 0.18, wid: 0.12, kind: 'long', open: 1.0, cup: 0.6, center: '#f2c230', centerR: 0.035 },
      tuberose: { petals: 6, len: 0.2, wid: 0.13, open: 1.2, cup: 0.3, center: '#f4f0d0', centerR: 0.02 } }[id];
    const cols = id === 'sambac' || id === 'jasmine' || id === 'tuberose' ? ['#fffdf6', '#ffffff', id === 'tuberose' ? '#e9d6f0' : '#f3e7c2'] : ['#fffef8', '#ffffff', '#f3ead0'];
    const spots = [[-0.3, 0, 0.38], [0.15, -0.15, 0.48], [0.4, 0.15, 0.3], [-0.05, 0.3, 0.22], [0.5, -0.3, 0.42]];
    spots.forEach(([x, z, y], i) => addHead(flowerHead(ing, { ...opts, colors: cols }), x, z, y, -0.5 - r() * 0.4, 0.9 + r() * 0.3, i < 3));
    // buds
    for (let i = 0; i < 4; i++) g.add(place(mesh(new THREE.CapsuleGeometry(0.025, 0.08, 6, 12), M.std(id === 'tuberose' ? '#e8d0e6' : '#f2ecd8', { roughness: 0.5, sheen: 1 })), -0.4 + i * 0.3, 0.05, 0.4, 1.3, 0, r()));
    leaf(-0.2, 0.3, 0.4); leaf(0.35, 0.35, -0.5);
    if (id === 'neroli') g.add(mesh(new THREE.SphereGeometry(0.12, 32, 24), M.std('#e36b12', { bumpMap: noiseTex('peel', 60, 1.4), bumpScale: 2, roughness: 0.4 }), 0.55, 0.12, 0.1));
  } else if (id === 'ylang') {
    for (let f = 0; f < 3; f++) {
      const head = flowerHead(ing, { petals: 6, len: 0.36, wid: 0.06, kind: 'long', open: 1.9, cup: 0.6, twist: 2.2, droop: 0.4, center: '#8a7a2a', centerR: 0.025, colors: ['#e9d73d', '#f6ef9a', '#9fa83a'] });
      addHead(head, -0.35 + f * 0.35, (f - 1) * 0.1, 0.5 - f * 0.08, 0.1, 1);
    }
  } else if (id === 'lavender') {
    for (let s = 0; s < 9; s++) {
      const x = -0.35 + s * 0.09 + (r() - 0.5) * 0.04, lean = (s - 4) * 0.06, top = 0.75 + r() * 0.15;
      g.add(stem([V3(x - lean * 2, 0.02, 0.3), V3(x - lean, top * 0.5, 0.1), V3(x, top, 0)], 0.007, '#6f8a5a'));
      const bud = new THREE.SphereGeometry(0.018, 10, 8); bud.scale(0.8, 1.3, 0.8);
      const n = 26, im = new THREE.InstancedMesh(bud, M.std(ing.c[0], { roughness: 0.65, sheen: 1, sheenColor: new THREE.Color(ing.c[1]) }), n); const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) { const t = i / n, y = top - t * 0.3, a = i * 2.4; m4.compose(V3(x + Math.cos(a) * 0.022, y, Math.sin(a) * 0.022), new THREE.Quaternion(), V3(1, 1, 1).multiplyScalar(1 - t * 0.3)); im.setMatrixAt(i, m4); }
      im.castShadow = true; g.add(im);
    }
    g.add(mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 32), M.std('#c9a874', { roughness: 0.9 }), -0.3, 0.1, 0.24));
  } else if (id === 'lotv' || id === 'freesia') {
    for (let s = 0; s < 2; s++) {
      const x0 = -0.2 + s * 0.4, pts = [V3(x0, 0.02, 0.1), V3(x0, 0.45, 0), V3(x0 + 0.18, 0.62, -0.02), V3(x0 + 0.34, 0.55, 0)];
      g.add(stem(pts, 0.008, '#5f8f45'));
      const curve = new THREE.CatmullRomCurve3(pts);
      const bell = id === 'lotv'
        ? new THREE.LatheGeometry([[0, 0], [0.04, 0.005], [0.05, 0.03], [0.045, 0.06], [0.055, 0.075], [0.06, 0.08]].map(([a, b]) => new THREE.Vector2(a, b)), 24)
        : new THREE.LatheGeometry([[0.01, 0], [0.02, 0.04], [0.04, 0.09], [0.07, 0.13], [0.08, 0.14]].map(([a, b]) => new THREE.Vector2(a, b)), 24);
      bell.rotateX(id === 'lotv' ? Math.PI : Math.PI / 2);
      const bm = M.std(id === 'lotv' ? '#fbfbf5' : ing.c[s ? 2 : 0], { roughness: 0.45, sheen: 1, side: THREE.DoubleSide, transmission: 0.15, thickness: 0.05 });
      for (let i = 0; i < 6; i++) { const p = curve.getPointAt(0.55 + i * 0.075); g.add(mesh(bell, bm, p.x, p.y - (id === 'lotv' ? 0.05 : 0), p.z)); }
    }
    leaf(-0.35, 0.25, 0.3, 'ovate', '#3e7a35', 1.5); leaf(0.4, 0.2, -0.4, 'ovate', '#3e7a35', 1.3);
  } else if (id === 'violet') {
    for (let i = 0; i < 4; i++) addHead(flowerHead(ing, { petals: 5, len: 0.12, wid: 0.11, open: 1.45, cup: 0.4, center: '#f5d142', centerR: 0.015 }), -0.3 + i * 0.22, (i % 2) * 0.15, 0.28 + r() * 0.08, -0.9);
    for (let i = 0; i < 4; i++) leaf(-0.4 + i * 0.28, 0.32, (i - 1.5) * 0.4, 'heart', '#3f7034', 0.9);
  } else if (id === 'iris') {
    const root = new THREE.MeshPhysicalMaterial({ color: '#d9c7a4', roughness: 0.85, bumpMap: noiseTex('root', 30, 1.8), bumpScale: 3 });
    for (let i = 0; i < 4; i++) { const geo = displace(new THREE.CapsuleGeometry(0.07, 0.3, 8, 16), 0.025, 6, 3, i); g.add(place(mesh(geo, root), -0.35 + i * 0.22, 0.08, (i % 2) * 0.2, Math.PI / 2, r() * 2, 0.2)); }
    const powder = new THREE.ConeGeometry(0.28, 0.16, 48, 4); g.add(mesh(displace(powder, 0.012, 8, 2, 1), M.std('#efe6d6', { roughness: 1, sheen: 1, sheenColor: new THREE.Color('#ffffff') }), 0.38, 0.08, -0.25));
    addHead(flowerHead(ing, { petals: 6, len: 0.22, wid: 0.15, kind: 'ruffle', open: 1.3, cup: 0.6, twist: 0.4, center: '#f2c94c', centerR: 0.02 }), -0.1, -0.35, 0.55, -0.3, 0.9);
  } else if (id === 'mimosa' || id === 'osmanthus' || id === 'heliotrope') {
    g.add(stem([V3(-0.6, 0.05, 0.2), V3(-0.1, 0.25, 0), V3(0.5, 0.35, -0.1)], 0.015, '#6c7d4e'));
    const mainCurve = new THREE.CatmullRomCurve3([V3(-0.6, 0.05, 0.2), V3(-0.1, 0.25, 0), V3(0.5, 0.35, -0.1)]);
    const unit = id === 'mimosa' ? displace(new THREE.IcosahedronGeometry(0.045, 3), 0.008, 30, 2, 2) : id === 'osmanthus' ? (() => { const f = new THREE.ConeGeometry(0.025, 0.02, 4); f.rotateX(Math.PI); return f; })() : new THREE.SphereGeometry(0.02, 8, 6);
    const n = id === 'mimosa' ? 60 : 120, im = new THREE.InstancedMesh(unit, M.std(ing.c[0], { roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(ing.c[1]) }), n), m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { const c = mainCurve.getPointAt(0.2 + r() * 0.8); const a = r() * TAU, d = 0.03 + r() * (id === 'heliotrope' ? 0.12 : 0.18); m4.compose(V3(c.x + Math.cos(a) * d, c.y + 0.04 + r() * 0.12, c.z + Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * TAU, r() * TAU, 0)), V3(1, 1, 1).multiplyScalar(0.7 + r() * 0.5)); im.setMatrixAt(i, m4); }
    im.castShadow = true; g.add(im);
    if (id === 'mimosa') for (let i = 0; i < 5; i++) { const l = mesh(bendPlane(0.12, 0.35, { cup: 0.3 }), M.leaf('#7d9a7a', '#a9c2a6', 'serrated')); l.rotation.set(-1.0, -0.6 + i * 0.3, 0); l.position.set(-0.4 + i * 0.2, 0.15, 0.25); g.add(l); }
    else for (let i = 0; i < 3; i++) leaf(-0.4 + i * 0.4, 0.3, (i - 1) * 0.5, 'ovate', id === 'osmanthus' ? '#2f5a2a' : '#3e6b35');
  } else if (id === 'geranium') {
    for (let i = 0; i < 5; i++) { const l = mesh(bendPlane(0.36, 0.36, { cup: 0.35, curl: 0.15 }), M.leaf('#4f8a42', '#9cc58b', 'lobed')); l.rotation.set(-1.1, i * 1.25, 0); l.position.set(Math.cos(i * 1.25) * 0.15, 0.05 + i * 0.02, Math.sin(i * 1.25) * 0.15); g.add(l); }
    for (let i = 0; i < 7; i++) addHead(flowerHead(ing, { petals: 5, len: 0.08, wid: 0.07, open: 1.3, cup: 0.2, center: '#ffffff', centerR: 0.01, colors: ['#e85d8a', '#f7a8c2', '#c2185b'] }), (r() - 0.5) * 0.2, (r() - 0.5) * 0.2, 0.5 + r() * 0.08, -0.6, 1, false);
    g.add(stem([V3(0, 0.05, 0), V3(0.02, 0.3, 0), V3(0, 0.48, 0)], 0.01));
  } else {
    addHead(flowerHead(ing, {}), 0, 0, 0.4, -0.4);
  }
  return g;
}

function greens(ing) {
  const id = ing.id, g = new THREE.Group(), r = rng(hash(id));
  const kind = { sage: 'serrated', patchouli: 'serrated', mint: 'serrated', basil: 'ovate', petitgrain: 'ovate', fig: 'lobed', geranium: 'lobed' }[id] || 'ovate';
  const col = { sage: '#8fa38c', patchouli: '#6b5134', mint: '#3f9a4a', basil: '#3a8f3a', petitgrain: '#2f6e3a', fig: '#4c8a36', tea: '#5a7a3a' }[id] || ing.c[0];
  if (id === 'rosemary' || id === 'cypress') {
    for (let s = 0; s < 3; s++) {
      const pts = [V3(-0.5, 0.05 + s * 0.04, 0.1 - s * 0.15), V3(0, 0.12 + s * 0.05, -s * 0.1), V3(0.5, 0.08, 0.05 - s * 0.12)];
      g.add(stem(pts, 0.012, '#6a5a3a'));
      const curve = new THREE.CatmullRomCurve3(pts);
      const ng = id === 'rosemary' ? (() => { const c = new THREE.CapsuleGeometry(0.008, 0.11, 4, 6); c.translate(0, 0.06, 0); return c; })() : (() => { const c = new THREE.ConeGeometry(0.03, 0.08, 6); c.translate(0, 0.04, 0); return c; })();
      const n = id === 'rosemary' ? 70 : 90, im = new THREE.InstancedMesh(ng, M.std(id === 'rosemary' ? '#5d7f62' : '#2e6b33', { roughness: 0.6, sheen: 0.6 }), n), m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) { const t = 0.05 + (i / n) * 0.93, p = curve.getPointAt(t), a = i * 2.39; m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1)), V3(1, 1, 1)); im.setMatrixAt(i, m4); }
      im.castShadow = true; g.add(im);
    }
    if (id === 'cypress') for (let i = 0; i < 3; i++) g.add(mesh(displace(new THREE.SphereGeometry(0.07, 24, 16), 0.012, 10, 2, i), M.std('#7a6a4a', { roughness: 0.8 }), 0.2 + i * 0.15, 0.07, 0.3));
    return g;
  }
  if (id === 'tea') {
    const curl = displace(new THREE.CapsuleGeometry(0.018, 0.07, 4, 8), 0.006, 30, 2, 3);
    g.add(place(dish(0.45, '#f0ebe0', false), 0, 0, 0));
    const p = pile(curl, M.std('#3e3a24', { roughness: 0.75 }), 160, 0.38, 5, { height: 0.35 }); p.position.y = 0.03; g.add(p);
    for (let i = 0; i < 3; i++) { const l = mesh(bendPlane(0.15, 0.3, { cup: 0.4 }), M.leaf('#4f7a2f', '#8bb06b', 'serrated')); l.rotation.set(-1.3, i * 0.8, 0); l.position.set(0.45 + i * 0.05, 0.03, 0.3 - i * 0.2); g.add(l); }
    return g;
  }
  if (id === 'galbanum') {
    g.add(place(mesh(displace(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 16, 8), 0.02, 6, 2, 1), M.std('#8a7d55', { roughness: 0.8 })), -0.25, 0.08, 0, Math.PI / 2, 0.3, 0));
    for (let i = 0; i < 9; i++) g.add(place(mesh(blob(0.06, 0.02, 6, i, 3), M.liquid('#b7c95a', { roughness: 0.3, transmission: 0.6, attenuationDistance: 0.3 })), 0.05 + (r() - 0.3) * 0.6, 0.05, (r() - 0.5) * 0.5, r(), r(), r(), 0.8 + r() * 0.6));
    return g;
  }
  if (id === 'fig') {
    const fig = new THREE.LatheGeometry([[0, 0], [0.12, 0.02], [0.2, 0.12], [0.2, 0.22], [0.14, 0.33], [0.05, 0.4], [0.03, 0.44], [0, 0.45]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
    const fm = M.std('#5b2a4a', { roughness: 0.5, sheen: 1, sheenColor: new THREE.Color('#a77aa0'), bumpMap: noiseTex('fig', 40, 1), bumpScale: 1 });
    g.add(place(mesh(fig, fm), -0.25, 0, 0.05, 0, 0, 0.15));
    const half = new THREE.LatheGeometry([[0, 0], [0.12, 0.02], [0.2, 0.12], [0.2, 0.22], [0.14, 0.33], [0.05, 0.4], [0, 0.42]].map(([a, b]) => new THREE.Vector2(a, b)), 48, 0, Math.PI);
    const inside = canvasTex('figcut', 256, 256, (c, W) => { c.fillStyle = '#f4e6c4'; c.fillRect(0, 0, W, W); const gr = c.createRadialGradient(W / 2, W * 0.55, 10, W / 2, W * 0.55, W * 0.4); gr.addColorStop(0, '#d4446a'); gr.addColorStop(1, '#f0b7a0'); c.fillStyle = gr; c.beginPath(); c.ellipse(W / 2, W * 0.55, W * 0.32, W * 0.38, 0, 0, TAU); c.fill(); c.fillStyle = '#f7e2a8'; for (let i = 0; i < 120; i++) { c.beginPath(); c.arc(W / 2 + (Math.random() - 0.5) * W * 0.5, W * 0.55 + (Math.random() - 0.5) * W * 0.6, 2, 0, TAU); c.fill(); } });
    const cutFace = new THREE.PlaneGeometry(0.4, 0.44); cutFace.translate(0, 0.22, 0);
    const hg = new THREE.Group(); hg.add(mesh(half, fm)); const cf = mesh(cutFace, M.std(0xffffff, { map: inside, roughness: 0.35, side: THREE.DoubleSide })); cf.rotation.y = Math.PI / 2; hg.add(cf);
    g.add(place(hg, 0.25, 0.2, 0.15, 0, -0.9, Math.PI / 2 - 0.15));
    const l = mesh(bendPlane(0.6, 0.6, { cup: 0.3, curl: 0.2 }), M.leaf('#4c8a36', '#9cc27f', 'lobed')); l.rotation.set(-1.35, 0.4, 0); l.position.set(0, 0.01, -0.35); g.add(l);
    return g;
  }
  // sprig / leaf pile (mint, basil, sage, petitgrain, patchouli)
  const leafMat = M.leaf(col, shade(col, 0.35), kind);
  if (id === 'patchouli') {
    for (let i = 0; i < 14; i++) { const lg = displace(bendPlane(0.2, 0.3, { cup: 0.6, curl: 0.4 }), 0.02, 8, 2, i); const l = mesh(lg, M.leaf(i % 3 ? '#6b5134' : '#4a3a26', '#9a7b54', 'serrated')); l.rotation.set(-1.2 + r() * 0.8, r() * TAU, r() * 0.6); l.position.set((r() - 0.5) * 0.8, 0.03 + r() * 0.1, (r() - 0.5) * 0.6); g.add(l); }
    return g;
  }
  for (let s = 0; s < 2; s++) {
    const x0 = -0.25 + s * 0.4, top = 0.55 + s * 0.1;
    g.add(stem([V3(x0, 0.02, 0.25), V3(x0 + 0.02, top * 0.5, 0.05), V3(x0, top, 0)], 0.012, id === 'sage' ? '#7e8f74' : '#4c7a3a'));
    const pairs = 5;
    for (let p = 0; p < pairs; p++) for (const sgn of [-1, 1]) {
      const t = 0.25 + p / pairs * 0.75, s2 = 1.1 - t * 0.6;
      const lf = mesh(bendPlane(0.13 * s2, 0.26 * s2, { cup: id === 'basil' ? 1.0 : 0.5, curl: 0.25 }), leafMat);
      const hold = new THREE.Group(); hold.position.set(x0, top * t, 0.25 * (1 - t)); hold.rotation.y = sgn > 0 ? 0 : Math.PI; hold.rotation.y += p * 1.57;
      lf.rotation.z = -sgn * 0; lf.rotation.x = 0; lf.rotation.set(0, 0, sgn * 1.0); hold.add(lf); g.add(hold);
    }
  }
  if (id === 'petitgrain') for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.06, 24, 18), M.std('#3f7d2a', { bumpMap: noiseTex('peel', 60, 1.4), bumpScale: 2, roughness: 0.4 }), 0.35 + i * 0.12, 0.06, 0.25 - i * 0.1));
  return g;
}

function fruits(ing) {
  const id = ing.id, g = new THREE.Group(), r = rng(hash(id));
  const glossy = (c, o = {}) => M.std(c, { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, ...o });
  if (id === 'blackcurrant' || id === 'juniper') {
    const berry = new THREE.SphereGeometry(id === 'juniper' ? 0.045 : 0.05, 24, 18);
    const mat = id === 'juniper' ? M.std('#3a4a7a', { roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#9fb0d8'), sheenRoughness: 0.4 }) : glossy('#1e0f2e');
    for (let c = 0; c < 3; c++) {
      const pts = [V3(-0.3 + c * 0.3, 0.45, -0.1), V3(-0.25 + c * 0.3, 0.3, 0), V3(-0.2 + c * 0.32, 0.1, 0.15)];
      g.add(stem(pts, 0.006, '#5a6a3a'));
      const curve = new THREE.CatmullRomCurve3(pts);
      for (let i = 0; i < 7; i++) { const p = curve.getPointAt(0.2 + i * 0.11); g.add(mesh(berry, mat, p.x + (r() - 0.5) * 0.08, p.y - 0.03, p.z + (r() - 0.5) * 0.08)); }
    }
    if (id === 'juniper') for (let i = 0; i < 40; i++) g.add(place(mesh(new THREE.ConeGeometry(0.006, 0.12, 4), M.std('#4a6a4a')), (r() - 0.5) * 0.8, 0.02, (r() - 0.5) * 0.5, Math.PI / 2, r() * TAU, 0));
    else { const l = mesh(bendPlane(0.4, 0.4, { cup: 0.3 }), M.leaf('#3f7d32', '#8fbf7a', 'lobed')); l.rotation.set(-1.3, 0.3, 0); l.position.set(0.1, 0.01, 0.35); g.add(l); }
    return g;
  }
  if (id === 'raspberry' || id === 'blackberry') {
    const drupe = new THREE.SphereGeometry(0.028, 14, 10), mat = M.std(id === 'blackberry' ? '#1a0c1e' : '#c2164f', { roughness: 0.25, transmission: 0.25, thickness: 0.05, clearcoat: 1, sheen: 0.4 });
    for (let k = 0; k < 4; k++) {
      const grp = new THREE.Group();
      for (let i = 0; i < 70; i++) { const y = i / 70, phi = Math.acos(1 - 1.6 * y), th = i * 2.39996; grp.add(mesh(drupe, mat, Math.sin(phi) * Math.cos(th) * 0.1, Math.cos(phi) * 0.12, Math.sin(phi) * Math.sin(th) * 0.1)); }
      g.add(place(grp, -0.35 + k * 0.25, 0.12, (k % 2) * 0.2, 0.4 * (k - 2), r(), 0.5));
    }
    return g;
  }
  if (id === 'strawberry') {
    const seeds = canvasTex('strawb', 256, 256, (c, W) => { c.fillStyle = '#d62a2a'; c.fillRect(0, 0, W, W); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const px = (x + (y % 2) * 0.5) * W / 16, py = y * W / 16; c.fillStyle = '#9e1515'; c.beginPath(); c.ellipse(px, py, 5, 7, 0, 0, TAU); c.fill(); c.fillStyle = '#f2d24a'; c.beginPath(); c.ellipse(px, py, 2, 3, 0, 0, TAU); c.fill(); } });
    const body = new THREE.LatheGeometry([[0, 0], [0.04, 0.02], [0.1, 0.1], [0.14, 0.2], [0.13, 0.26], [0.06, 0.29], [0, 0.29]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Group(); s.add(mesh(body, M.std(0xffffff, { map: seeds, roughness: 0.3, clearcoat: 0.8 })));
      for (let i = 0; i < 6; i++) { const l = mesh(bendPlane(0.05, 0.12, { cup: 0.6 }), M.leaf('#3f8a32', '#7cc06a')); const h = new THREE.Group(); h.rotation.y = i; l.rotation.x = 1.9; h.add(l); h.position.y = 0.28; s.add(h); }
      g.add(place(s, -0.4 + k * 0.27, 0.13, (k % 2) * 0.22 - 0.1, Math.PI / 2 + 0.3, r() * TAU, 0));
    }
    return g;
  }
  if (id === 'pineapple') {
    const scales = canvasTex('pine', 256, 512, (c, W, H) => { c.fillStyle = '#b8862a'; c.fillRect(0, 0, W, H); for (let y = 0; y < 14; y++) for (let x = 0; x < 8; x++) { const px = (x + (y % 2) * 0.5) * W / 8, py = y * H / 14 + 18; const gr = c.createRadialGradient(px, py, 2, px, py, 18); gr.addColorStop(0, '#f2c14a'); gr.addColorStop(0.7, '#c98d22'); gr.addColorStop(1, '#6b4a14'); c.fillStyle = gr; c.beginPath(); c.moveTo(px, py - 18); c.lineTo(px + 16, py); c.lineTo(px, py + 18); c.lineTo(px - 16, py); c.fill(); } });
    const body = new THREE.LatheGeometry([[0, 0], [0.18, 0.02], [0.24, 0.15], [0.25, 0.32], [0.21, 0.5], [0.12, 0.58], [0, 0.59]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
    g.add(mesh(body, M.std(0xffffff, { map: scales, roughness: 0.5, bumpMap: scales, bumpScale: 2 }), 0, 0, 0));
    for (let i = 0; i < 18; i++) { const l = mesh(bendPlane(0.06, 0.38 + r() * 0.15, { curl: 0.3 }), M.std('#4a7a4a', { side: THREE.DoubleSide, roughness: 0.5, sheen: 0.6 })); const h = new THREE.Group(); h.rotation.y = i * 2.4; l.rotation.x = -0.3 - (i / 18) * 0.6; h.add(l); h.position.y = 0.56; g.add(h); }
    return g;
  }
  if (id === 'coconut') {
    const husk = M.std('#6d4a2e', { roughness: 0.9, bumpMap: noiseTex('husk', 50, 2), bumpScale: 4 });
    const shell = new THREE.SphereGeometry(0.3, 48, 32, 0, TAU, 0, Math.PI / 2); shell.rotateX(Math.PI);
    const flesh = new THREE.SphereGeometry(0.27, 48, 32, 0, TAU, 0, Math.PI / 2); flesh.rotateX(Math.PI);
    const h = new THREE.Group(); h.add(mesh(shell, husk)); const fm = mesh(flesh, M.std('#fbf8f0', { roughness: 0.4, side: THREE.BackSide, sheen: 0.5 })); h.add(fm);
    const rim = new THREE.RingGeometry(0.27, 0.3, 64); rim.rotateX(-Math.PI / 2); h.add(mesh(rim, M.std('#f4efe2')));
    g.add(place(h, 0.15, 0.22, 0.05, 0.6, 0, 0)); g.add(mesh(displace(new THREE.SphereGeometry(0.3, 48, 32), 0.02, 6, 2, 3), husk, -0.35, 0.3, -0.15));
    return g;
  }
  // apple, pear, peach
  const prof = id === 'pear' ? [[0, 0], [0.12, 0.01], [0.22, 0.08], [0.25, 0.18], [0.2, 0.3], [0.12, 0.4], [0.09, 0.5], [0.04, 0.55], [0, 0.56]]
    : id === 'apple' ? [[0, 0.03], [0.08, 0.0], [0.2, 0.04], [0.27, 0.16], [0.26, 0.3], [0.16, 0.4], [0.05, 0.38], [0, 0.34]]
    : [[0, 0], [0.12, 0.02], [0.23, 0.12], [0.25, 0.24], [0.2, 0.36], [0.08, 0.43], [0, 0.42]];
  const geo = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 64);
  const color = { apple: '#c9262a', pear: '#c2c13a', peach: '#f39a5b' }[id] || ing.c[0];
  const blush = canvasTex('blush' + id, 256, 256, (c, W) => { const gr = c.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, color); gr.addColorStop(0.5, id === 'apple' ? '#e8483a' : id === 'pear' ? '#d9cf55' : '#ffb37a'); gr.addColorStop(1, id === 'peach' ? '#e5533a' : id === 'pear' ? '#c48a3a' : '#a01818'); c.fillStyle = gr; c.fillRect(0, 0, W, W); c.globalAlpha = 0.25; for (let i = 0; i < 300; i++) { c.fillStyle = id === 'pear' ? '#8a6a2a' : '#ffe9a0'; c.fillRect(Math.random() * W, Math.random() * W, 2, 2); } });
  const mat = id === 'peach' ? M.std(0xffffff, { map: blush, roughness: 0.7, sheen: 1, sheenColor: new THREE.Color('#ffe2c8'), sheenRoughness: 0.6 }) : M.std(0xffffff, { map: blush, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.25 });
  for (let k = 0; k < 2; k++) {
    const f = new THREE.Group(); f.add(mesh(geo, mat));
    f.add(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 8), M.std('#5a3a1e'), 0, prof[prof.length - 1][1] + 0.04, 0));
    if (k === 0) { const l = mesh(bendPlane(0.1, 0.22, { cup: 0.5 }), M.leaf('#3f8a32', '#89c06f')); l.rotation.set(-0.6, 0.4, -0.9); l.position.y = prof[prof.length - 1][1] + 0.06; f.add(l); }
    g.add(place(f, -0.25 + k * 0.5, 0, (k ? -0.15 : 0.1), 0, r() * TAU, k ? 0.35 : 0, k ? 0.85 : 1));
  }
  return g;
}

function spices(ing) {
  const id = ing.id, g = new THREE.Group(), r = rng(hash(id));
  g.add(dish(0.55, '#ece6da', id !== 'saffron' ? false : true));
  const add = (obj) => { obj.position.y += 0.03; g.add(obj); };
  if (id === 'pepper' || id === 'pinkpepper' || id === 'coriander') {
    const s = displace(new THREE.IcosahedronGeometry(id === 'coriander' ? 0.035 : 0.03, 3), id === 'pepper' ? 0.006 : 0.003, 40, 2, 1);
    const col = { pepper: '#2b2420', pinkpepper: '#d8456a', coriander: '#b89466' }[id];
    add(pile(s, M.std(col, { roughness: id === 'pinkpepper' ? 0.35 : 0.8, clearcoat: id === 'pinkpepper' ? 0.6 : 0 }), 260, 0.45, 2, { height: 0.45 }));
  } else if (id === 'cumin') {
    const s = displace(new THREE.CapsuleGeometry(0.012, 0.05, 4, 8), 0.003, 50, 2, 1);
    add(pile(s, M.std('#8a6c40', { roughness: 0.85 }), 420, 0.45, 2, { height: 0.4 }));
  } else if (id === 'clove') {
    const head = new THREE.SphereGeometry(0.022, 12, 10); head.translate(0, 0.07, 0);
    const shaft = new THREE.CylinderGeometry(0.008, 0.014, 0.11, 8); shaft.translate(0, 0.0, 0);
    const sep = []; for (let i = 0; i < 4; i++) { const c = new THREE.ConeGeometry(0.01, 0.03, 4); c.rotateZ(Math.PI / 2.4); c.rotateY(i * Math.PI / 2); c.translate(Math.cos(i * Math.PI / 2) * 0.015, 0.06, -Math.sin(i * Math.PI / 2) * 0.015); sep.push(c); }
    const clove = mergeGeometries([head, shaft, ...sep].map((x) => x.toNonIndexed()));
    add(pile(clove, M.std('#5a2f1c', { roughness: 0.7 }), 140, 0.42, 3, { height: 0.35 }));
  } else if (id === 'cardamom') {
    const pod = displace(new THREE.CapsuleGeometry(0.035, 0.07, 6, 16), 0.006, 20, 2, 2); pod.scale(1, 1, 0.85);
    add(pile(pod, M.std('#9cb860', { roughness: 0.6, sheen: 0.6 }), 45, 0.42, 4, { height: 0.35, flat: true }));
  } else if (id === 'nutmeg') {
    const nut = displace(new THREE.SphereGeometry(0.07, 32, 24), 0.008, 14, 3, 5); nut.scale(1, 0.85, 0.85);
    add(pile(nut, M.std('#7a5236', { roughness: 0.7, bumpMap: noiseTex('nut', 30, 2), bumpScale: 3 }), 11, 0.38, 2, { height: 0.25 }));
    const mace = tube([V3(-0.1, 0.2, 0.2), V3(0, 0.25, 0.25), V3(0.1, 0.22, 0.2), V3(0.15, 0.18, 0.15)], 0.01, 20, 6); g.add(mesh(mace, M.std('#c7372a', { roughness: 0.5 })));
  } else if (id === 'cinnamon') {
    const sp = new THREE.Shape(); const turns = 1.8, steps = 60;
    for (let i = 0; i <= steps; i++) { const a = (i / steps) * turns * TAU, rr = 0.025 + 0.025 * (i / steps); sp.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    for (let i = steps; i >= 0; i--) { const a = (i / steps) * turns * TAU, rr = 0.025 + 0.025 * (i / steps) + 0.006; sp.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    const quill = new THREE.ExtrudeGeometry(sp, { depth: 0.75, bevelEnabled: false, curveSegments: 4 }); quill.translate(0, 0, -0.375);
    const bark = M.std('#9a5a2e', { roughness: 0.75, bumpMap: noiseTex('cinna', 40, 1.6, [1, 4]), bumpScale: 3 });
    for (let i = 0; i < 5; i++) g.add(place(mesh(quill, bark), -0.2 + i * 0.1, 0.06 + (i % 2) * 0.06, (r() - 0.5) * 0.2, 0, 0.4 + (r() - 0.5) * 0.4, r() * TAU));
    g.add(mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 32), M.std('#c9a874', { roughness: 0.9 }), 0, 0.1, 0));
  } else if (id === 'saffron') {
    const geos = [];
    for (let i = 0; i < 60; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.3, x = Math.cos(a) * d, z = Math.sin(a) * d, y = 0.04 + r() * 0.06, b = r() * TAU; const tg = tube([V3(x, y, z), V3(x + Math.cos(b) * 0.05, y + 0.01, z + Math.sin(b) * 0.05), V3(x + Math.cos(b + 0.6) * 0.1, y, z + Math.sin(b + 0.6) * 0.1)], 0.004, 10, 5); geos.push(tg.toNonIndexed()); }
    g.add(mesh(mergeGeometries(geos), M.std('#c41a12', { roughness: 0.45, clearcoat: 0.5 })));
    const fl = flowerHead(ing, { petals: 6, len: 0.24, wid: 0.12, open: 0.9, cup: 0.7, center: '#e8a020', centerR: 0.02, colors: ['#9b6ed0', '#d9c4f0', '#5e2f8a'] }); g.add(place(fl, 0.55, 0.05, -0.2, -0.6, 0, 0, 1));
  } else if (id === 'ginger') {
    const mat = M.std('#d4b07a', { roughness: 0.7, bumpMap: noiseTex('ginger', 40, 1.6), bumpScale: 2 });
    for (let i = 0; i < 6; i++) { const geo = displace(new THREE.CapsuleGeometry(0.06, 0.16, 8, 16), 0.015, 8, 3, i); g.add(place(mesh(geo, mat), -0.15 + Math.cos(i) * 0.15, 0.1, Math.sin(i) * 0.1, Math.PI / 2, i * 1.1, 0.3 * i)); }
    const slice = new THREE.CylinderGeometry(0.07, 0.07, 0.015, 32); g.add(mesh(slice, M.std('#f1dfa4', { roughness: 0.4, clearcoat: 0.6 }), 0.32, 0.04, 0.2));
  } else if (id === 'staranise') {
    const carpel = new THREE.SphereGeometry(0.05, 16, 10); carpel.scale(1.6, 0.5, 0.6); carpel.translate(0.08, 0, 0);
    const star = mergeGeometries(Array.from({ length: 8 }, (_, i) => { const c = carpel.clone(); c.rotateY((i / 8) * TAU); return c.toNonIndexed(); }));
    add(pile(star, M.std('#6e3a1e', { roughness: 0.6, bumpMap: noiseTex('anise', 40, 2), bumpScale: 2 }), 9, 0.35, 5, { height: 0.15, flat: false, size: [0.9, 1.1] }));
  } else {
    add(pile(new THREE.IcosahedronGeometry(0.03, 2), M.std(ing.c[0]), 200, 0.45, 2));
  }
  return g;
}

function woods(ing) {
  const id = ing.id, g = new THREE.Group(), r = rng(hash(id));
  if (id === 'vetiver' || id === 'oakmoss') {
    const geos = [];
    if (id === 'vetiver') for (let i = 0; i < 70; i++) { const a = r() * TAU, len = 0.5 + r() * 0.4, pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(V3(Math.cos(a) * 0.03 * (1 + t * 8) + Math.sin(t * 9 + i) * 0.03, 0.65 - t * len, Math.sin(a) * 0.03 * (1 + t * 6) + Math.cos(t * 7 + i) * 0.03)); } geos.push(tube(pts, 0.006 * (0.6 + r()), 16, 4).toNonIndexed()); }
    else { const grow = (p, dir, len, depth) => { if (depth > 4) return; const e = p.clone().add(dir.clone().multiplyScalar(len)); geos.push(tube([p, p.clone().lerp(e, 0.5).add(V3(0, 0.02, 0)), e], 0.012 * (1 - depth * 0.18), 8, 5).toNonIndexed()); for (let b = 0; b < 2; b++) { const nd = dir.clone().applyAxisAngle(V3(0, 1, 0), (b ? 0.6 : -0.6) + (r() - 0.5) * 0.3).applyAxisAngle(V3(1, 0, 0), (r() - 0.3) * 0.5).normalize(); grow(e, nd, len * 0.72, depth + 1); } }; for (let i = 0; i < 9; i++) grow(V3((r() - 0.5) * 0.3, 0.02, (r() - 0.5) * 0.3), V3(Math.cos(i * 0.7), 0.8, Math.sin(i * 0.7)).normalize(), 0.16, 0); }
    g.add(mesh(mergeGeometries(geos), M.std(id === 'vetiver' ? '#b89a68' : '#8e9e7a', { roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color(id === 'vetiver' ? '#e8d4a8' : '#c8d4b8') })));
    if (id === 'vetiver') g.add(mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 24), M.std('#6b5a3a', { roughness: 0.9 }), 0, 0.62, 0)).rotation.x = Math.PI / 2;
    if (id === 'vetiver') g.add(stem([V3(0, 0.62, 0), V3(0.02, 0.8, 0.02), V3(-0.02, 0.95, 0)], 0.03, '#a59a6a'));
    if (id === 'oakmoss') g.add(place(mesh(displace(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 24, 10), 0.03, 4, 3, 2), M.std('#5a4a3a', { roughness: 0.95, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 4 })), 0, 0.1, -0.35, Math.PI / 2, 0, 0.4));
    return g;
  }
  if (id === 'oud') {
    const chips = canvasTex('oudtex', 256, 256, (c, W) => { c.fillStyle = '#c9a77a'; c.fillRect(0, 0, W, W); for (let i = 0; i < 70; i++) { c.strokeStyle = `rgba(30,18,10,${0.3 + Math.random() * 0.6})`; c.lineWidth = 2 + Math.random() * 10; c.beginPath(); const y = Math.random() * W; c.moveTo(0, y); c.bezierCurveTo(W * 0.3, y + 20 * Math.sin(i), W * 0.6, y - 20, W, y + 10); c.stroke(); } });
    const geo = displace(new THREE.BoxGeometry(0.22, 0.05, 0.08, 8, 3, 4), 0.012, 10, 2, 1);
    for (let i = 0; i < 9; i++) g.add(place(mesh(geo, M.std(0xffffff, { map: chips, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 })), (r() - 0.5) * 0.7, 0.04 + r() * 0.06, (r() - 0.5) * 0.5, r() * 0.5, r() * TAU, r() * 0.4, 0.9 + r() * 0.8));
    g.add(dish(0.5, '#2a2420', false)); g.children[g.children.length - 1].position.y = -0.005;
    return g;
  }
  if (id === 'birch') {
    const bark = canvasTex('birchbark', 512, 256, (c, W, H) => { c.fillStyle = '#efece4'; c.fillRect(0, 0, W, H); for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(30,30,30,${0.4 + Math.random() * 0.5})`; c.fillRect(Math.random() * W, Math.random() * H, 10 + Math.random() * 60, 2 + Math.random() * 4); } for (let i = 0; i < 20; i++) { c.fillStyle = 'rgba(160,140,120,.35)'; c.fillRect(0, Math.random() * H, W, 1); } });
    const ends = ringTex('#e8d9b8', '#c8a878', 'birchend');
    const log = new THREE.CylinderGeometry(0.2, 0.21, 0.8, 48, 1);
    const lm = [M.std(0xffffff, { map: bark, roughness: 0.6, bumpMap: bark, bumpScale: 1 }), M.std(0xffffff, { map: ends, roughness: 0.8 }), M.std(0xffffff, { map: ends, roughness: 0.8 })];
    g.add(place(mesh(log, lm), 0, 0.2, 0, Math.PI / 2, 0.4, 0));
    const tar = new THREE.Group(); tar.add(dish(0.25, '#222', true)); tar.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 48), M.std('#120c08', { roughness: 0.05, clearcoat: 1 }), 0, 0.03, 0));
    g.add(place(tar, 0.35, 0, 0.35));
    return g;
  }
  // logs & chips: sandalwood, cedar, guaiac
  const cols = { sandalwood: ['#e2c49a', '#b88f5e', '#8a6a46'], cedar: ['#c58a5a', '#8e5534', '#6e4a32'], guaiac: ['#7b5b3a', '#4a3a24', '#3a2c20'] }[id] || [ing.c[0], ing.c[2], ing.c[2]];
  const bark = M.std(cols[2], { roughness: 0.95, bumpMap: noiseTex('bark' + id, 20, 2.2, [3, 1]), bumpScale: 6 });
  const end = M.std(0xffffff, { map: ringTex(cols[0], cols[1], id), roughness: 0.7 });
  const log = displace(new THREE.CylinderGeometry(0.22, 0.24, 0.75, 48, 6), 0.01, 5, 2, 3);
  g.add(place(mesh(log, [bark, end, end]), -0.15, 0.22, 0, Math.PI / 2, 0.5, 0));
  g.add(place(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 48), [M.std(cols[2], { roughness: 0.9 }), end, end]), 0.38, 0.04, 0.3, 0, 0, 0));
  const chip = displace(new THREE.BoxGeometry(0.1, 0.012, 0.04, 4, 1, 2), 0.004, 12, 2, 2);
  const cp = pile(chip, M.std(cols[0], { roughness: 0.7 }), 40, 0.25, 9, { height: 0.12, flat: true }); cp.position.set(0.35, 0, -0.2); g.add(cp);
  return g;
}
function ringTex(c0, c1, key) {
  return canvasTex('ring' + key, 256, 256, (c, W) => {
    const cx = W / 2; c.fillStyle = c0; c.fillRect(0, 0, W, W);
    for (let i = 0; i < 26; i++) { c.strokeStyle = i % 4 === 0 ? shade(c1, -0.2) : c1; c.globalAlpha = 0.25 + (i % 3) * 0.15; c.lineWidth = 1 + (i % 4 === 0 ? 2 : 0); c.beginPath(); for (let k = 0; k <= 64; k++) { const a = (k / 64) * TAU, rr = (i / 26) * cx * (1 + 0.04 * Math.sin(a * 3 + i)); c.lineTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr); } c.stroke(); }
    c.globalAlpha = 0.5; c.strokeStyle = shade(c1, -0.3); c.lineWidth = 2; for (let i = 0; i < 5; i++) { const a = Math.random() * TAU; c.beginPath(); c.moveTo(cx, cx); c.lineTo(cx + Math.cos(a) * cx * 0.9, cx + Math.sin(a) * cx * 0.9); c.stroke(); }
  });
}

function resins(ing) {
  const id = ing.id, g = new THREE.Group(), r = rng(hash(id));
  if (id === 'styrax' || id === 'balsam' || id === 'labdanum') {
    g.add(dish(0.45, '#fff', true));
    const col = { styrax: '#4a2e1c', balsam: '#3a1e10', labdanum: '#6a3a10' }[id];
    const pool = displace(new THREE.SphereGeometry(0.38, 48, 24, 0, TAU, 0, Math.PI / 2), 0.015, 4, 2, 2); pool.scale(1, 0.18, 1);
    g.add(mesh(pool, M.liquid(col, { transmission: 0.5, roughness: 0.03, clearcoat: 1, attenuationDistance: 0.15 }), 0, 0.025, 0));
    // dripping stick
    g.add(place(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 12), M.std('#c9a874', { roughness: 0.8 })), 0.25, 0.35, 0, 0, 0, -0.6));
    g.add(place(mesh(new THREE.CapsuleGeometry(0.03, 0.14, 6, 12), M.liquid(col, { transmission: 0.4, clearcoat: 1, attenuationDistance: 0.1 })), 0.07, 0.12, 0, 0, 0, -0.1));
    if (id === 'labdanum') for (let i = 0; i < 3; i++) { const l = mesh(bendPlane(0.08, 0.32, { cup: 0.6, curl: 0.2 }), M.leaf('#3a5a3a', '#6a8a6a')); l.rotation.set(-1.3, -0.6 + i * 0.6, 0); l.position.set(-0.45 + i * 0.1, 0.03, 0.4); g.add(l); }
    return g;
  }
  const col = { frankincense: '#f1e6c0', myrrh: '#a3361a', benzoin: '#d9973a', elemi: '#e5e8a0' }[id] || ing.c[0];
  const rough = { frankincense: 0.55, myrrh: 0.35, benzoin: 0.3, elemi: 0.25 }[id] ?? 0.3;
  const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: rough, transmission: 0.7, thickness: 0.3, ior: 1.54, attenuationColor: col, attenuationDistance: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.4, sheen: id === 'frankincense' ? 0.8 : 0, sheenColor: new THREE.Color('#ffffff') });
  for (let i = 0; i < 16; i++) { const geo = blob(0.06 + r() * 0.05, 0.02, 7, i, 3); geo.scale(1, 0.8 + r() * 0.6, 0.9); g.add(place(mesh(geo, mat), (r() - 0.5) * 0.8, 0.05, (r() - 0.5) * 0.6, r() * 3, r() * 3, r() * 3)); }
  if (id === 'frankincense' || id === 'myrrh') g.add(place(mesh(displace(new THREE.CylinderGeometry(0.05, 0.07, 0.7, 16, 8), 0.02, 6, 2, 3), M.std('#8a7a68', { roughness: 0.9, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 3 })), 0, 0.07, -0.38, Math.PI / 2, 0, 1.3));
  return g;
}

function gourmands(ing) {
  const id = ing.id, g = new THREE.Group(), r = rng(hash(id));
  if (id === 'vanilla') {
    const geos = [];
    for (let i = 0; i < 7; i++) { const z = (i - 3) * 0.05, y = 0.03 + (i % 2) * 0.035, bend = (r() - 0.5) * 0.18; const tg = tube([V3(-0.5, y + bend * 0.2, z * 1.4), V3(0, y + 0.02, z + bend * 0.4), V3(0.5, y, z * 1.6 - bend * 0.5)], 0.028, 40, 10); tg.scale(1, 0.7, 1); geos.push(tg.toNonIndexed()); }
    g.add(mesh(mergeGeometries(geos), M.std('#2a1a12', { roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3, bumpMap: noiseTex('vanilla', 40, 1.5, [6, 1]), bumpScale: 2 })));
    { const tie = place(mesh(new THREE.TorusGeometry(0.2, 0.014, 8, 48), M.std('#c9a874', { roughness: 0.9 })), 0, 0.055, 0, 0, Math.PI / 2, 0); tie.scale.set(1, 0.36, 1); g.add(tie); }
    const fl = flowerHead(ing, { petals: 6, len: 0.2, wid: 0.1, kind: 'long', open: 1.1, cup: 0.5, center: '#f0d060', centerR: 0.03, colors: ['#f0ecc0', '#fffbe6', '#c8c080'] }); g.add(place(fl, 0.4, 0.12, 0.35, -0.8, 0, 0, 1));
    return g;
  }
  if (id === 'honey') {
    const hex = new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6, 1, true);
    const wax = M.std('#e8b23a', { roughness: 0.45, side: THREE.DoubleSide, transmission: 0.3, thickness: 0.05 });
    const fill = new THREE.CylinderGeometry(0.056, 0.056, 0.16, 6); const honey = M.liquid('#e09a12', { transmission: 0.7, attenuationDistance: 0.12, clearcoat: 1 });
    const comb = new THREE.Group();
    for (let q = -3; q <= 3; q++) for (let s = -2; s <= 2; s++) { const x = q * 0.104 + (s % 2 ? 0.052 : 0), z = s * 0.09; if (Math.hypot(x, z) > 0.33) continue; comb.add(mesh(hex, wax, x, 0.09, z)); if (r() > 0.25) comb.add(mesh(fill, honey, x, 0.085, z)); }
    g.add(comb);
    const dipper = new THREE.LatheGeometry([[0, 0], [0.06, 0.01], [0.07, 0.04], [0.05, 0.06], [0.07, 0.08], [0.05, 0.1], [0.07, 0.12], [0.03, 0.15], [0.015, 0.16], [0.015, 0.7], [0, 0.71]].map(([a, b]) => new THREE.Vector2(a, b)), 32);
    g.add(place(mesh(dipper, M.std('#b8864a', { roughness: 0.6 })), 0.38, 0.08, 0.3, 0.2, 0, -1.3));
    return g;
  }
  if (id === 'cacao') {
    const pod = new THREE.LatheGeometry([[0, 0], [0.1, 0.03], [0.16, 0.15], [0.17, 0.3], [0.13, 0.45], [0.05, 0.56], [0, 0.6]].map(([a, b]) => new THREE.Vector2(a, b)), 64);
    const p = pod.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.06 * Math.cos(a * 10); p.setX(i, x * k); p.setZ(i, z * k); } pod.computeVertexNormals();
    g.add(place(mesh(pod, M.std('#a8521e', { roughness: 0.5, bumpMap: noiseTex('cacao', 30, 1.4), bumpScale: 2 })), -0.2, 0.17, 0, 0, 0, Math.PI / 2 - 0.1));
    const bean = displace(new THREE.SphereGeometry(0.05, 24, 16), 0.006, 10, 2, 1); bean.scale(1.3, 0.6, 0.9);
    const bp = pile(bean, M.std('#4a2a1a', { roughness: 0.6 }), 16, 0.22, 4, { height: 0.2 }); bp.position.set(0.32, 0, 0.2); g.add(bp);
    return g;
  }
  if (id === 'coffee' || id === 'tonka' || id === 'almond') {
    let bean, mat, n = 90;
    if (id === 'coffee') { bean = new THREE.SphereGeometry(0.04, 24, 16); bean.scale(1, 0.62, 1.35); const p = bean.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); if (y < 0) p.setY(i, y + 0.012 * Math.exp(-(x * x) / 0.00008)); } bean.computeVertexNormals(); mat = M.std('#3a2214', { roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.3 }); }
    else if (id === 'tonka') { bean = displace(new THREE.CapsuleGeometry(0.022, 0.08, 6, 12), 0.006, 40, 3, 2); bean.scale(1, 1, 0.7); mat = M.std('#1e1410', { roughness: 0.5, clearcoat: 0.3 }); n = 70; }
    else { bean = new THREE.LatheGeometry([[0, 0], [0.025, 0.02], [0.035, 0.05], [0.03, 0.08], [0.012, 0.105], [0, 0.11]].map(([a, b]) => new THREE.Vector2(a, b)), 24); bean.scale(1, 1, 0.55); mat = M.std('#b47a48', { roughness: 0.7, bumpMap: noiseTex('almond', 60, 2), bumpScale: 2 }); n = 60; }
    g.add(dish(0.55, id === 'coffee' ? '#f3efe8' : '#f0e8da', false));
    const pp = pile(bean, mat, n, 0.45, 7, { height: 0.35 }); pp.position.y = 0.03; g.add(pp);
    return g;
  }
  if (id === 'tobacco') {
    for (let i = 0; i < 9; i++) { const lg = displace(bendPlane(0.32, 0.8, { cup: 0.5, curl: 0.15 }), 0.015, 9, 3, i); const l = mesh(lg, M.leaf(i % 2 ? '#8a5a2a' : '#6b4220', '#b8864a', 'ovate')); l.rotation.set(-1.35 + r() * 0.3, -0.4 + i * 0.1, 0); l.position.set(-0.3 + i * 0.05, 0.03 + i * 0.012, 0.35); g.add(l); }
    g.add(place(mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 24), M.std('#5a3a1e', { roughness: 0.9 })), -0.15, 0.06, 0.28, Math.PI / 2, 0, 0));
    return g;
  }
  return g;
}

function animalic(ing) {
  const g = new THREE.Group();
  if (ing.id === 'ambergris') {
    const tex = canvasTex('ambergris', 256, 256, (c, W) => { c.fillStyle = '#b8b2a2'; c.fillRect(0, 0, W, W); for (let i = 0; i < 400; i++) { c.fillStyle = Math.random() > 0.5 ? 'rgba(80,72,60,.25)' : 'rgba(240,236,224,.35)'; c.beginPath(); c.arc(Math.random() * W, Math.random() * W, Math.random() * 6, 0, TAU); c.fill(); } });
    const rock = displace(new THREE.IcosahedronGeometry(0.32, 5), 0.07, 2.5, 4, 3); rock.scale(1.3, 0.75, 1);
    g.add(mesh(rock, M.std(0xffffff, { map: tex, roughness: 0.85, bumpMap: noiseTex('rock', 30, 2), bumpScale: 4 }), 0, 0.22, 0));
    g.add(mesh(displace(new THREE.IcosahedronGeometry(0.1, 4), 0.03, 4, 3, 7), M.std(0xffffff, { map: tex, roughness: 0.85 }), 0.5, 0.08, 0.25));
    return g;
  }
  g.add(dish(0.45, '#34343a', false));
  const crystal = new THREE.OctahedronGeometry(0.03, 0); crystal.scale(1, 1.6, 1);
  const pp = pile(crystal, new THREE.MeshPhysicalMaterial({ color: '#f6f2fb', roughness: 0.18, clearcoat: 1, iridescence: 0.7, iridescenceIOR: 1.6, sheen: 0.5, sheenColor: new THREE.Color('#d9c8ff') }), 260, 0.34, 3, { height: 0.4 }); pp.position.y = 0.03; g.add(pp);
  // a few loose flakes beside the dish
  const flakes = pile(crystal, pp.material, 14, 0.18, 9, { height: 0.02 }); flakes.position.set(0.62, 0, 0.18); g.add(flakes);
  return g;
}

function marine(ing) {
  const g = new THREE.Group();
  const bowl = new THREE.LatheGeometry([[0, 0], [0.3, 0], [0.45, 0.06], [0.52, 0.18], [0.5, 0.19], [0.42, 0.08], [0.28, 0.03], [0, 0.03]].map(([a, b]) => new THREE.Vector2(a, b)), 64);
  g.add(mesh(bowl, M.std('#9c7a56', { roughness: 0.55, bumpMap: noiseTex('bowl', 6, 1, [1, 6]), bumpScale: 2 })));
  const xtal = new THREE.BoxGeometry(0.04, 0.04, 0.04);
  const pp = pile(xtal, new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, transmission: 0.6, thickness: 0.05, ior: 1.54 }), 320, 0.4, 5, { height: 0.35, size: [0.5, 1.3] }); pp.position.y = 0.05; g.add(pp);
  const shell = new THREE.SphereGeometry(0.16, 48, 24, 0, Math.PI, 0, Math.PI / 2); const p = shell.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x); const k = 1 + 0.05 * Math.cos(a * 18); p.setX(i, x * k); p.setZ(i, z * k); } shell.computeVertexNormals(); shell.scale(1, 0.35, 1);
  g.add(place(mesh(shell, M.std('#f2d8c8', { roughness: 0.4, side: THREE.DoubleSide, sheen: 1, iridescence: 0.3 })), 0.55, 0.02, 0.35, -Math.PI / 2 + 0.2, 0.6, 0));
  return g;
}

// transmissive materials only refract what is opaque behind them, and the ingredient stage is see-through,
// so specimens trade transmission for translucency: they read the same on any background
function translucent(g) {
  const rough = microTex('rough', 18), pores = microTex('pores', 64, 0, [2, 2]);
  g.traverse((o) => {
    const mats = !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      // break up perfectly uniform CG surfaces: varied roughness and fine pores, like real organic material
      if (m.isMeshPhysicalMaterial && !m.transmission && !m.transparent && m.metalness < 0.5) {
        if (!m.roughnessMap) { m.roughnessMap = rough; m.roughness = Math.min(1, m.roughness * 1.14); }
        if (!m.bumpMap) { m.bumpMap = pores; m.bumpScale = 0.35; }
        m.specularIntensity = Math.min(m.specularIntensity, 0.85);
      }
      if (!m.transmission) continue;
      const t = m.transmission; m.transmission = 0;
      if (m.attenuationColor && m.attenuationDistance < 5) m.color.lerp(m.attenuationColor, 0.5);
      m.transparent = true; m.opacity = Math.max(0.35, 1 - t * 0.55); m.depthWrite = t < 0.7;
      m.clearcoat = Math.max(m.clearcoat, 0.8); m.envMapIntensity = 1.6;
    }
  });
  return g;
}
// ── specimens for the newer ingredients ───────────────────
function sphereFruit(r0, mat, { sx = 1, sy = 1, sz = 1, crease = 0, bump = 0, seed = 0 } = {}) {
  let geo = new THREE.SphereGeometry(r0, 64, 48);
  if (bump) geo = displace(geo, bump, 40, 2, seed);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (crease) { const a = Math.atan2(z, x); x *= 1 - crease * Math.exp(-((a - Math.PI / 2) ** 2) * 30); }
    p.setXYZ(i, x * sx, y * sy, z * sz);
  }
  geo.computeVertexNormals();
  return mesh(geo, mat);
}
function leafAt(g, x, z, rot, col = '#3f7d32', s = 1, kind = 'ovate', y = 0.02, tilt = -1.25) {
  const l = mesh(bendPlane(0.2 * s, 0.42 * s, { cup: 0.45, curl: 0.25 }), M.leaf(col, shade(col, 0.35), kind));
  l.rotation.set(tilt, rot, 0); l.position.set(x, y, z); g.add(l); return l;
}
function flowersOnStems(g, heads, { stemCol = '#4f7a3a' } = {}) {
  for (const [head, x, z, y, rx, s] of heads) {
    head.position.set(x, y, z); head.rotation.x = rx; head.scale.setScalar(s); g.add(head);
    g.add(stem([V3(x, y - 0.02, z), V3(x + 0.04, y * 0.5, z + 0.05), V3(x + 0.08, 0.02, z + 0.22)], 0.011, stemCol));
  }
}
function extras(ing) {
  const id = ing.id, r = rng(hash(id)), g = new THREE.Group(), [c0, c1, c2] = ing.c;
  const glossy = (c, o = {}) => M.std(c, { roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.18, ...o });
  switch (id) {
    case 'kumquat': {
      const peel = M.std('#f5951c', { roughness: 0.38, bumpMap: noiseTex('peel', 60, 1.4), bumpScale: 1.8, clearcoat: 0.5, clearcoatRoughness: 0.35 });
      const spots = [[-0.25, 0.05, 0], [0.02, -0.1, 0.6], [0.25, 0.12, 1.4], [-0.05, 0.25, 2.2], [0.35, -0.2, 0.3]];
      for (const [x, z, a] of spots) { const f = sphereFruit(0.1, peel, { sx: 0.82, sz: 1.15 }); f.position.set(x, 0.082, z); f.rotation.y = a; g.add(f); }
      g.add(stem([V3(-0.45, 0.04, 0.2), V3(-0.1, 0.12, 0.1), V3(0.3, 0.2, 0)], 0.01, '#5a6b3a'));
      leafAt(g, -0.4, 0.3, 0.5, '#2f6b2a', 0.9); leafAt(g, 0.2, 0.35, -0.6, '#2f6b2a', 0.8); leafAt(g, 0.45, -0.1, 1.8, '#2f6b2a', 0.8);
      return g;
    }
    case 'magnolia': case 'lotus': case 'champaca': case 'narcissus': case 'frangipani': case 'gardenia': case 'carnation': case 'hyacinth':
      return newFlower(ing);
    case 'eucalyptus': {
      const leafMat = M.leaf('#8aa7a0', '#c9d8d2', 'heart'); leafMat.sheen = 1; leafMat.sheenColor = new THREE.Color('#e6f0ee');
      for (let s = 0; s < 3; s++) {
        const pts = [V3(-0.45 + s * 0.3, 0.02, 0.3), V3(-0.4 + s * 0.32, 0.35, 0.05), V3(-0.3 + s * 0.35, 0.7 - s * 0.08, -0.05)];
        g.add(stem(pts, 0.009, '#8a6a5a'));
        const curve = new THREE.CatmullRomCurve3(pts);
        for (let i = 0; i < 7; i++) { const t = 0.2 + i * 0.12, p = curve.getPointAt(Math.min(1, t)), sz = 0.16 - i * 0.012;
          const l = mesh(bendPlane(sz, sz, { cup: 0.3 }), leafMat); const h = new THREE.Group(); h.position.copy(p); h.rotation.y = i * 1.6 + s; l.rotation.set(0.3, 0, 1.2); h.add(l); g.add(h); }
      }
      return g;
    }
    case 'thyme': {
      const leaf = new THREE.SphereGeometry(0.012, 8, 6); leaf.scale(1, 0.4, 1.8);
      const mat = M.std('#5f7a52', { roughness: 0.7, sheen: 0.8, sheenColor: new THREE.Color('#b8c8a8') });
      for (let s = 0; s < 6; s++) {
        const x0 = -0.35 + s * 0.13, top = 0.45 + r() * 0.2, lean = (r() - 0.5) * 0.3;
        const pts = [V3(x0, 0.02, 0.25), V3(x0 + lean * 0.5, top * 0.5, 0.1), V3(x0 + lean, top, 0)];
        g.add(stem(pts, 0.006, '#7a5a42'));
        const curve = new THREE.CatmullRomCurve3(pts), n = 46, im = new THREE.InstancedMesh(leaf, mat, n), m4 = new THREE.Matrix4();
        for (let i = 0; i < n; i++) { const p = curve.getPointAt(0.3 + (i / n) * 0.7), a = i * 2.4; m4.compose(V3(p.x + Math.cos(a) * 0.015, p.y, p.z + Math.sin(a) * 0.015), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() - 0.5, a, 0.6)), V3(1, 1, 1)); im.setMatrixAt(i, m4); }
        im.castShadow = true; g.add(im);
        const fl = flowerHead(ing, { petals: 5, len: 0.03, wid: 0.025, open: 1.2, cup: 0.3, centerR: 0.006, center: '#f0d8f0', colors: ['#d8b4e2', '#f4e6f8', '#b98cc9'] }); fl.position.copy(curve.getPointAt(1)); g.add(fl);
      }
      g.add(mesh(new THREE.TorusGeometry(0.07, 0.01, 8, 24), M.std('#c9a874', { roughness: 0.9 }), -0.05, 0.1, 0.19));
      return g;
    }
    case 'lemongrass': {
      const bulb = M.std('#e9ecc8', { roughness: 0.5, sheen: 0.6 }), blade = M.std('#7fae4a', { roughness: 0.5, side: THREE.DoubleSide, sheen: 0.5 });
      for (let i = 0; i < 7; i++) {
        const st = new THREE.Group(), len = 0.9 + r() * 0.15;
        const geo = new THREE.CylinderGeometry(0.03, 0.045, len, 20, 12);
        st.add(mesh(geo, bulb, 0, 0, 0));
        const top = mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.35, 16), blade, 0, len / 2 + 0.17, 0); st.add(top);
        st.add(place(mesh(bendPlane(0.03, 0.4, { curl: 0.5 }), blade), 0, len / 2 + 0.3, 0, -0.3, r() * TAU, 0));
        g.add(place(st, (i - 3) * 0.05, 0.05 + (i % 2) * 0.04, (i % 3 - 1) * 0.05, Math.PI / 2, 0.15 + (r() - 0.5) * 0.1, 0));
      }
      g.add(place(mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 32), M.std('#c9a874', { roughness: 0.9 })), -0.1, 0.09, 0, 0, Math.PI / 2, 0));
      const cut = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 24), M.std('#f1f0d8', { roughness: 0.6 })); cut.position.set(0.3, 0.015, 0.3); g.add(cut);
      return g;
    }
    case 'plum': {
      const mat = M.std('#4a1f4f', { roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#9c8cc0'), sheenRoughness: 0.5, clearcoat: 0.3 });
      [[-0.25, 0, 0], [0.18, 0.12, 1.6], [0.05, -0.25, 3]].forEach(([x, z, a], k) => { const f = sphereFruit(0.17, mat, { sx: 0.95, sz: 1.05, crease: 0.08 }); f.position.set(x, 0.165, z); f.rotation.y = a; g.add(f);
        g.add(mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.07, 8), M.std('#5a3a1e'), x, 0.35, z)); });
      leafAt(g, 0.35, 0.3, -0.5, '#3f6e2e', 1);
      return g;
    }
    case 'cherry': {
      const mat = glossy('#8e0f1c', { sheen: 0.3 });
      for (let k = 0; k < 3; k++) {
        const pr = new THREE.Group(), top = V3(0, 0.42, 0);
        for (const sgn of [-1, 1]) {
          const fx = sgn * 0.09, f = sphereFruit(0.085, mat, { sy: 0.9, crease: 0.12 }); f.position.set(fx, 0.08, 0); pr.add(f);
          pr.add(stem([V3(fx, 0.15, 0), V3(fx * 0.8, 0.3, 0.02), top], 0.005, '#6a7a3a'));
        }
        g.add(place(pr, -0.35 + k * 0.33, 0, (k % 2) * 0.2 - 0.05, 0, r() * TAU, k === 1 ? 0.0 : (k - 1) * 0.5));
      }
      leafAt(g, 0.1, 0.35, 0.4, '#3f7d32', 1, 'serrated');
      return g;
    }
    case 'lychee': {
      const skin = M.std('#c2303a', { roughness: 0.6, bumpMap: microTex('lychee', 90, 0), bumpScale: 3 });
      for (let k = 0; k < 4; k++) { const f = sphereFruit(0.12, skin, { sy: 1.08, bump: 0.008, seed: k }); f.position.set(-0.3 + k * 0.2, 0.125, (k % 2) * 0.18 - 0.1); g.add(f); }
      const peeled = sphereFruit(0.11, M.std('#f4f0e8', { roughness: 0.15, clearcoat: 1, transmission: 0.5, thickness: 0.2, ior: 1.4, attenuationColor: new THREE.Color('#efe4d0'), attenuationDistance: 0.4 }), { sy: 1.1 });
      peeled.position.set(0.45, 0.115, 0.2); g.add(peeled);
      const half = new THREE.SphereGeometry(0.12, 32, 16, 0, TAU, Math.PI / 2, Math.PI / 2); g.add(mesh(half, M.std('#c2303a', { side: THREE.DoubleSide, roughness: 0.6, bumpMap: microTex('lychee', 90, 0), bumpScale: 3 }), 0.45, 0.12, 0.2));
      return g;
    }
    case 'passionfruit': {
      const skin = M.std('#4b2140', { roughness: 0.45, bumpMap: noiseTex('wrinkle', 8, 2), bumpScale: 4, clearcoat: 0.4 });
      const pf = sphereFruit(0.22, skin, { sy: 0.95, bump: 0.01, seed: 2 }); pf.position.set(-0.25, 0.21, 0); g.add(pf);
      const shell = new THREE.SphereGeometry(0.21, 48, 24, 0, TAU, 0, Math.PI / 2); shell.rotateX(Math.PI);
      const h = new THREE.Group(); h.add(mesh(shell, skin)); h.add(mesh(new THREE.SphereGeometry(0.19, 48, 24, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI), M.std('#f7f1e0', { side: THREE.BackSide, roughness: 0.6 })));
      const pulp = new THREE.CircleGeometry(0.185, 48); pulp.rotateX(-Math.PI / 2);
      const pulpTex = canvasTex('pulp', 256, 256, (c, W) => { c.fillStyle = '#e8a91c'; c.fillRect(0, 0, W, W); for (let i = 0; i < 90; i++) { const x = Math.random() * W, y = Math.random() * W; const gr = c.createRadialGradient(x, y, 1, x, y, 11); gr.addColorStop(0, '#1a120a'); gr.addColorStop(0.45, '#2a1a0a'); gr.addColorStop(0.55, '#f2c440'); gr.addColorStop(1, 'rgba(242,196,64,0)'); c.fillStyle = gr; c.beginPath(); c.arc(x, y, 11, 0, TAU); c.fill(); } });
      h.add(mesh(pulp, M.std(0xffffff, { map: pulpTex, roughness: 0.1, clearcoat: 1, bumpMap: pulpTex, bumpScale: 2 }), 0, -0.02, 0));
      g.add(place(h, 0.25, 0.17, 0.12, 0.5, 0.4, 0));
      return g;
    }
    case 'mango': {
      const tex = canvasTex('mango', 256, 256, (c, W) => { const gr = c.createLinearGradient(0, 0, W, W); gr.addColorStop(0, '#5f9a2e'); gr.addColorStop(0.45, '#e8b62a'); gr.addColorStop(1, '#d9472a'); c.fillStyle = gr; c.fillRect(0, 0, W, W); c.globalAlpha = 0.35; for (let i = 0; i < 400; i++) { c.fillStyle = '#fff3c0'; c.fillRect(Math.random() * W, Math.random() * W, 1.5, 1.5); } });
      const mat = M.std(0xffffff, { map: tex, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.3 });
      const f = sphereFruit(0.2, mat, { sx: 0.85, sy: 0.8, sz: 1.35 }); const p = f.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setX(i, p.getX(i) + Math.max(0, z) * z * 0.6); } f.geometry.computeVertexNormals();
      f.position.set(-0.2, 0.16, 0); f.rotation.y = 0.4; g.add(f);
      const cheek = new THREE.SphereGeometry(0.18, 48, 24, 0, TAU, 0, Math.PI / 2); cheek.scale(0.85, 0.5, 1.3);
      const ch = new THREE.Group(); ch.add(mesh(cheek, mat));
      const flesh = canvasTex('mangoflesh', 256, 256, (c, W) => { c.fillStyle = '#f7a518'; c.fillRect(0, 0, W, W); c.strokeStyle = '#ffd36a'; c.lineWidth = 3; for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(i * W / 8, 0); c.lineTo(i * W / 8, W); c.stroke(); c.beginPath(); c.moveTo(0, i * W / 8); c.lineTo(W, i * W / 8); c.stroke(); } });
      const face = new THREE.CircleGeometry(0.18, 48); face.rotateX(-Math.PI / 2); face.scale(0.85, 1, 1.3);
      ch.add(mesh(face, M.std(0xffffff, { map: flesh, roughness: 0.15, clearcoat: 1 }), 0, 0.001, 0));
      ch.rotation.x = Math.PI; g.add(place(ch, 0.28, 0.1, 0.2, 0, 0.9, 0)); ch.rotation.x = 0;
      leafAt(g, -0.1, 0.38, 0.2, '#2f5a2a', 1.4, 'ovate');
      return g;
    }
    case 'sichuan': case 'pimento': {
      g.add(dish(0.55, '#ece6da', false));
      const s = displace(new THREE.IcosahedronGeometry(id === 'pimento' ? 0.04 : 0.028, 3), id === 'sichuan' ? 0.009 : 0.004, 30, 2, 4);
      if (id === 'sichuan') s.scale(1, 0.8, 1);
      const pp = pile(s, M.std(id === 'sichuan' ? '#8a2a1c' : '#5a3826', { roughness: 0.75 }), 220, 0.45, 4, { height: 0.42 }); pp.position.y = 0.03; g.add(pp);
      if (id === 'sichuan') { const b = new THREE.SphereGeometry(0.014, 8, 6); const seeds = pile(b, glossy('#151010'), 30, 0.2, 6, { height: 0.02 }); seeds.position.set(0.62, 0, 0.15); g.add(seeds); }
      else leafAt(g, 0.55, 0.3, -0.6, '#3a6a32', 1.1);
      return g;
    }
    case 'palosanto': {
      const wood = M.std('#d8c49c', { roughness: 0.75, bumpMap: noiseTex('grain', 30, 1.8, [1, 6]), bumpScale: 2 });
      const end = M.std(0xffffff, { map: ringTex('#e2d0a8', '#b89a6a', 'palo'), roughness: 0.7 });
      for (let i = 0; i < 6; i++) { const geo = new THREE.BoxGeometry(0.06, 0.06, 0.62, 2, 2, 8); g.add(place(mesh(displace(geo, 0.004, 8, 2, i), [wood, wood, wood, wood, end, end]), -0.15 + (i % 3) * 0.075, 0.035 + Math.floor(i / 3) * 0.06, (i % 2) * 0.02, 0, 0.2, 0)); }
      const burnt = M.std('#1c1714', { roughness: 0.95 });
      const st = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), [wood, wood, wood, wood, burnt, end]); st.position.set(0.35, 0.12, 0.2); st.rotation.set(-0.45, -0.7, 0); g.add(st);
      return g;
    }
    case 'fir': {
      const needle = new THREE.CapsuleGeometry(0.004, 0.06, 2, 4); needle.translate(0, 0.035, 0);
      const mat = M.std('#2f5a3a', { roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#8fb29a') });
      for (let s = 0; s < 3; s++) {
        const pts = [V3(-0.55, 0.06 + s * 0.04, 0.2 - s * 0.18), V3(0, 0.1 + s * 0.04, -s * 0.12), V3(0.5, 0.07, 0.1 - s * 0.16)];
        g.add(stem(pts, 0.012, '#6a4a32'));
        const curve = new THREE.CatmullRomCurve3(pts), n = 140, im = new THREE.InstancedMesh(needle, mat, n), m4 = new THREE.Matrix4();
        for (let i = 0; i < n; i++) { const p = curve.getPointAt(0.04 + (i / n) * 0.94), a = (i % 2 ? 1 : -1) * (1.1 + r() * 0.3); m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4 * (r() - 0.5), 0, a)), V3(1, 1, 1)); im.setMatrixAt(i, m4); }
        im.castShadow = true; g.add(im);
      }
      const cone = new THREE.Group(); const scale = new THREE.ConeGeometry(0.035, 0.03, 5); scale.rotateX(Math.PI);
      for (let i = 0; i < 40; i++) { const t = i / 40; cone.add(place(mesh(scale, M.std('#6e4a2c', { roughness: 0.8 })), Math.cos(i * 2.4) * 0.05 * Math.sin(t * Math.PI + 0.3), t * 0.22, Math.sin(i * 2.4) * 0.05 * Math.sin(t * Math.PI + 0.3), 0.6 * Math.cos(i * 2.4), 0, 0.6 * Math.sin(i * 2.4))); }
      g.add(place(cone, 0.3, 0.06, 0.32, Math.PI / 2, 0.3, 0));
      for (let i = 0; i < 4; i++) g.add(place(mesh(blob(0.035, 0.01, 7, i, 3), new THREE.MeshPhysicalMaterial({ color: '#e8d48a', roughness: 0.2, transmission: 0.7, thickness: 0.2, ior: 1.52, attenuationColor: new THREE.Color('#d4a42a'), attenuationDistance: 0.2 })), -0.2 + i * 0.12, 0.03, 0.42, 0, 0, 0));
      return g;
    }
    case 'rum': {
      const prof = [[0, 0], [0.2, 0], [0.22, 0.03], [0.22, 0.55], [0.16, 0.66], [0.07, 0.72], [0.065, 0.92], [0.075, 0.94]];
      const glass = M.shell({ opacity: 0.25 });
      g.add(mesh(lathe(prof), glass, -0.2, 0, 0));
      g.add(mesh(lathe(prof, 0.88, 0.02, 0.5), M.juice('#7a3410', { emissive: new THREE.Color('#2a0e02') }), -0.2, 0.02, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 24), M.std('#2a1a10', { roughness: 0.5 }), -0.2, 0.96, 0));
      const tumbler = [[0, 0], [0.13, 0], [0.14, 0.02], [0.15, 0.2], [0.14, 0.2], [0.13, 0.03], [0, 0.03]];
      g.add(mesh(new THREE.LatheGeometry(tumbler.map(([a, b]) => new THREE.Vector2(a, b)), 48), M.glass({ thickness: 0.05 }), 0.25, 0, 0.15));
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 32), M.juice('#8a3a10', { emissive: new THREE.Color('#2a0e02') }), 0.25, 0.07, 0.15));
      const cane = M.std('#b8a46a', { roughness: 0.6 }); for (let i = 0; i < 2; i++) { const c = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 16, 6), cane); c.position.set(0.05 + i * 0.07, 0.03, 0.45); c.rotation.set(Math.PI / 2, 0, 1.2); g.add(c); for (let k = -2; k <= 2; k++) g.add(place(mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 20), cane), 0.05 + i * 0.07 + Math.cos(1.2) * k * 0.1, 0.03, 0.45 - Math.sin(1.2) * k * 0.1, 0, Math.PI / 2 - 1.2, 0)); }
      return g;
    }
    case 'hazelnut': case 'pistachio': {
      g.add(dish(0.5, '#efe8dc', false));
      let nut, mat;
      if (id === 'hazelnut') { nut = new THREE.SphereGeometry(0.06, 24, 18); const p = nut.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y * (y > 0 ? 1.15 : 0.95)); p.setX(i, p.getX(i) * (1 - Math.max(0, y) * 2.5)); p.setZ(i, p.getZ(i) * (1 - Math.max(0, y) * 2.5)); } nut.computeVertexNormals(); mat = glossy('#8a5426', { roughness: 0.4, bumpMap: noiseTex('nut', 20, 1, [1, 3]), bumpScale: 1.5 }); }
      else { nut = new THREE.SphereGeometry(0.045, 24, 18); nut.scale(0.8, 0.75, 1.3); mat = M.std('#d8c29a', { roughness: 0.6 }); }
      const pp = pile(nut, mat, 70, 0.4, 7, { height: 0.35 }); pp.position.y = 0.03; g.add(pp);
      if (id === 'pistachio') { const kernel = new THREE.SphereGeometry(0.033, 16, 12); kernel.scale(0.8, 0.75, 1.3); const kp = pile(kernel, M.std('#8aa13a', { roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#c8a0b8') }), 18, 0.18, 3, { height: 0.05 }); kp.position.set(0.62, 0, 0.2); g.add(kp); }
      else { const kernel = new THREE.SphereGeometry(0.045, 20, 16); kernel.scale(1, 1.1, 1); const kp = pile(kernel, M.std('#e8d2a8', { roughness: 0.7 }), 10, 0.16, 3, { height: 0.05 }); kp.position.set(0.62, 0, 0.2); g.add(kp); }
      return g;
    }
    case 'licorice': {
      const root = M.std('#6a4228', { roughness: 0.92, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 4 });
      const end = M.std(0xffffff, { map: ringTex('#e8c86a', '#a8742a', 'lico'), roughness: 0.8 });
      for (let i = 0; i < 7; i++) { const geo = displace(new THREE.CylinderGeometry(0.03, 0.035, 0.7, 16, 10), 0.008, 5, 2, i); g.add(place(mesh(geo, [root, end, end]), -0.15 + (i % 4) * 0.06, 0.035 + Math.floor(i / 4) * 0.055, (i % 2) * 0.03, Math.PI / 2, 0.25 + (r() - 0.5) * 0.15, 0)); }
      g.add(place(mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 32), M.std('#c9a874', { roughness: 0.9 })), -0.06, 0.07, 0, 0, Math.PI / 2 + 0.25, 0));
      const coin = new THREE.CylinderGeometry(0.04, 0.04, 0.015, 32); for (let i = 0; i < 6; i++) g.add(place(mesh(coin, glossy('#141010', { roughness: 0.35 })), 0.4 + (i % 3) * 0.08, 0.008 + Math.floor(i / 3) * 0.015, 0.3 - (i % 2) * 0.05, 0, 0, 0));
      return g;
    }
    case 'caramel': {
      const amber = M.std('#a9561a', { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.3, sheenColor: new THREE.Color('#f2b26a'), emissive: new THREE.Color('#3a1404') });
      const cube = new RoundedBoxGeometry(0.12, 0.1, 0.12, 4, 0.02);
      for (let i = 0; i < 6; i++) g.add(place(mesh(cube, M.std('#b8742c', { roughness: 0.35, clearcoat: 0.8, sheen: 0.4, sheenColor: new THREE.Color('#f2c98b') })), -0.35 + (i % 3) * 0.15, 0.05, 0.2 + Math.floor(i / 3) * 0.15, 0, r() * 0.6, 0));
      const pot = [[0, 0], [0.18, 0], [0.2, 0.02], [0.2, 0.16], [0.19, 0.16], [0.17, 0.03], [0, 0.03]];
      g.add(mesh(new THREE.LatheGeometry(pot.map(([a, b]) => new THREE.Vector2(a, b)), 48), M.std('#efe9df', { roughness: 0.3, clearcoat: 0.6 }), 0.25, 0, -0.15));
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 40), amber, 0.25, 0.08, -0.15));
      const drip = tube([V3(0.33, 0.24, -0.1), V3(0.36, 0.3, -0.08), V3(0.2, 0.5, -0.1)], 0.012, 16, 6, 0.6); g.add(mesh(drip, amber));
      g.add(place(mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.5, 12), M.std('#c9a874', { roughness: 0.7 })), 0.2, 0.42, -0.1, 0.2, 0, 0.4));
      return g;
    }
    case 'ambrette': {
      g.add(dish(0.45, '#efe8dc', false));
      const seed = new THREE.SphereGeometry(0.03, 16, 12); seed.scale(1, 0.55, 0.85); const pos = seed.attributes.position; for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (1 + 0.15 * Math.sign(pos.getX(i)) * Math.abs(pos.getZ(i)) * 20)); seed.computeVertexNormals();
      const pp = pile(seed, M.std('#5a4a3a', { roughness: 0.65, bumpMap: microTex('seedridge', 70, 0), bumpScale: 2 }), 200, 0.36, 3, { height: 0.35 }); pp.position.y = 0.03; g.add(pp);
      const pod = displace(new THREE.CapsuleGeometry(0.07, 0.25, 8, 16), 0.01, 6, 2, 5); const pm = M.std('#7a6a42', { roughness: 0.8, sheen: 1, sheenColor: new THREE.Color('#c8b888') });
      g.add(place(mesh(pod, pm), 0.6, 0.07, 0.2, Math.PI / 2, 0.6, 0));
      const fl = flowerHead(ing, { petals: 5, len: 0.12, wid: 0.11, open: 1.0, cup: 0.6, centerR: 0.02, center: '#5a1a2a', colors: ['#f3e58a', '#fff6c0', '#7a2a3a'] }); fl.position.set(0.55, 0.05, -0.25); fl.rotation.x = -0.6; g.add(fl);
      return g;
    }
    case 'seaweed': {
      const kelp = M.std('#4a4a1e', { roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.2, side: THREE.DoubleSide, sheen: 0.6, sheenColor: new THREE.Color('#9ab05a') });
      for (let i = 0; i < 6; i++) { const geo = bendPlane(0.14 + r() * 0.06, 0.8 + r() * 0.3, { wave: 3, curl: 0.1, twist: 0.8 * (r() - 0.5), seed: i }); g.add(place(mesh(geo, kelp), -0.35 + i * 0.12, 0.02 + i * 0.008, 0.25 - r() * 0.2, -Math.PI / 2 + 0.05, (r() - 0.5) * 0.9, 0)); }
      const sea = M.std('#7a2a3a', { roughness: 0.3, clearcoat: 0.8 });
      const frond = []; const grow = (p, dir, len, d) => { if (d > 4) return; const e = p.clone().add(dir.clone().multiplyScalar(len)); frond.push(tube([p, p.clone().lerp(e, 0.5).add(V3(0, 0.01, 0)), e], 0.008 * (1 - d * 0.15), 6, 5)); for (const s of [-0.5, 0.5]) grow(e, dir.clone().applyAxisAngle(V3(0, 1, 0), s), len * 0.75, d + 1); };
      grow(V3(0.4, 0.02, 0.3), V3(0, 0, -1), 0.12, 0); g.add(mesh(mergeGeometries(frond), sea));
      for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, transmission: 0.6, thickness: 0.05, ior: 1.54 }), -0.1 + i * 0.07, 0.03, 0.45));
      return g;
    }
  }
  return moreNotes(ing);
}
function newFlower(ing) {
  const id = ing.id, r = rng(hash(id)), g = new THREE.Group();
  const glossyLeaf = (x, z, rot, col, s) => { const l = leafAt(g, x, z, rot, col, s); l.material.clearcoat = 0.8; l.material.clearcoatRoughness = 0.15; };
  if (id === 'magnolia') {
    const cols = ['#fbeef3', '#ffffff', '#c8628c'];
    const head = (open) => { const h = flowerHead(ing, { petals: 3, layers: 3, len: 0.36, wid: 0.2, kind: 'long', open, cup: 1.1, centerR: 0, colors: cols }); h.add(mesh(new THREE.ConeGeometry(0.04, 0.14, 16), M.std('#d8b862', { roughness: 0.7, bumpMap: microTex('stamen', 50, 0), bumpScale: 3 }), 0, 0.07, 0)); return h; };
    flowersOnStems(g, [[head(0.75), -0.15, 0, 0.45, 0.4, 1], [head(0.25), 0.35, -0.1, 0.35, 0.2, 0.7]], { stemCol: '#6a5a4a' });
    glossyLeaf(0.0, 0.35, 0.5, '#2f5a2a', 1.4); glossyLeaf(-0.45, 0.2, -0.6, '#2f5a2a', 1.2);
  } else if (id === 'lotus') {
    const cols = ['#f7b9cc', '#fff2f5', '#d8517a'];
    const h = flowerHead(ing, { petals: 7, layers: 3, len: 0.36, wid: 0.18, kind: 'long', open: 0.9, cup: 1.0, centerR: 0, colors: cols });
    const pod = new THREE.CylinderGeometry(0.07, 0.04, 0.06, 32); h.add(mesh(pod, M.std('#d6cf6a', { roughness: 0.6 }), 0, 0.05, 0));
    for (let i = 0; i < 9; i++) h.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 8), M.std('#7a8a3a'), Math.cos(i * 0.7) * 0.04 * (i ? 1 : 0), 0.083, Math.sin(i * 0.7) * 0.04 * (i ? 1 : 0)));
    h.position.set(-0.05, 0.18, 0); h.rotation.x = 0.35; g.add(h);
    const pad = new THREE.CircleGeometry(0.42, 64, 0.2, TAU - 0.4); pad.rotateX(-Math.PI / 2); const pp = pad.attributes.position; for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), z = pp.getZ(i); pp.setY(i, 0.04 * Math.hypot(x, z) ** 2 + 0.005 * Math.sin(Math.atan2(z, x) * 9)); } pad.computeVertexNormals();
    g.add(mesh(pad, M.std('#3f7a3a', { roughness: 0.3, clearcoat: 0.7, sheen: 0.6, side: THREE.DoubleSide, bumpMap: noiseTex('pad', 20, 1), bumpScale: 1 }), 0.15, 0.01, 0.1));
    g.add(stem([V3(-0.05, 0.16, 0), V3(-0.08, 0.08, 0.05), V3(-0.02, 0.02, 0.1)], 0.015, '#5a7a3a'));
  } else if (id === 'champaca') {
    const cols = ['#f2a33b', '#ffd27a', '#d4721a'];
    const spots = [[-0.3, 0, 0.32], [0.1, -0.15, 0.4], [0.35, 0.15, 0.28]];
    flowersOnStems(g, spots.map(([x, z, y], i) => [flowerHead(ing, { petals: 6, layers: 2, len: 0.24, wid: 0.06, kind: 'long', open: 0.75 + i * 0.15, cup: 0.6, twist: 0.4, centerR: 0.02, center: '#c88a2a', colors: cols }), x, z, y, 0.3, 1]));
    glossyLeaf(-0.1, 0.35, 0.3, '#3a6a2a', 1.3);
  } else if (id === 'narcissus') {
    const cols = ['#fbfaf2', '#ffffff', '#e9e4c8'];
    const head = () => { const h = flowerHead(ing, { petals: 6, len: 0.15, wid: 0.11, open: 1.45, cup: 0.25, centerR: 0, colors: cols }); h.add(mesh(new THREE.LatheGeometry([[0.02, 0], [0.035, 0.02], [0.045, 0.045], [0.05, 0.05]].map(([a, b]) => new THREE.Vector2(a, b)), 32), M.std('#f2b416', { roughness: 0.5, side: THREE.DoubleSide, sheen: 0.6 }), 0, 0.005, 0)); h.add(mesh(new THREE.TorusGeometry(0.05, 0.004, 6, 32).rotateX(Math.PI / 2), M.std('#d9481a'), 0, 0.05, 0)); return h; };
    flowersOnStems(g, [[head(), -0.3, 0, 0.5, 1.0, 1], [head(), 0, -0.1, 0.58, 0.9, 1], [head(), 0.3, 0.05, 0.46, 1.1, 1]], { stemCol: '#5a8a4a' });
    for (let i = 0; i < 4; i++) { const l = mesh(bendPlane(0.04, 0.6, { curl: 0.4 }), M.std('#4f8a4a', { side: THREE.DoubleSide, roughness: 0.5 })); l.position.set(-0.3 + i * 0.2, 0.02, 0.2); l.rotation.set(-0.2, i, (i - 1.5) * 0.25); g.add(l); }
  } else if (id === 'frangipani') {
    const cols = ['#fffbf2', '#ffffff', '#f4c537'];
    [[-0.3, 0.05, 0], [0.05, -0.1, 1.1], [0.32, 0.15, 2.3], [-0.05, 0.3, 3.2], [0.4, -0.25, 4]].forEach(([x, z, a], i) => { const h = flowerHead(ing, { petals: 5, len: 0.2, wid: 0.13, open: 1.45, cup: 0.35, twist: 0.9, centerR: 0.012, center: '#f4c537', colors: cols }); h.position.set(x, 0.04 + (i % 2) * 0.02, z); h.rotation.set(-0.15, a, 0.1); g.add(h); });
    glossyLeaf(-0.2, -0.3, 2.6, '#2f6a2a', 1.6);
  } else if (id === 'gardenia') {
    const cols = ['#fbf8ee', '#ffffff', '#efe7c8'];
    flowersOnStems(g, [[roseHead(ing, { n: 16, open: 1.4, size: 0.24, colors: cols }), -0.15, 0, 0.42, 0.6, 1], [roseHead(ing, { n: 10, open: 0.4, size: 0.2, colors: cols }), 0.3, -0.1, 0.3, 0.35, 0.8]], { stemCol: '#3f5a2a' });
    glossyLeaf(0.05, 0.35, 0.6, '#1f4a22', 1.3); glossyLeaf(-0.45, 0.15, -0.6, '#1f4a22', 1.2);
  } else if (id === 'carnation') {
    flowersOnStems(g, [[roseHead(ing, { n: 44, open: 1.35, size: 0.2, kind: 'ruffle', ruffle: 1.6 }), -0.15, 0, 0.5, 0.6, 1], [roseHead(ing, { n: 30, open: 1.1, size: 0.18, kind: 'ruffle', ruffle: 1.6 }), 0.28, -0.1, 0.4, 0.4, 0.85]], { stemCol: '#6a8a6a' });
    for (let i = 0; i < 3; i++) { const l = mesh(bendPlane(0.03, 0.4, { curl: 0.5 }), M.std('#7a9a86', { side: THREE.DoubleSide, roughness: 0.5 })); l.position.set(-0.2 + i * 0.25, 0.02, 0.25); l.rotation.set(-1.2, i * 0.8, 0); g.add(l); }
  } else if (id === 'hyacinth') {
    const floret = flowerHead(ing, { petals: 6, len: 0.06, wid: 0.035, kind: 'long', open: 1.6, cup: 0.4, twist: 0.3, centerR: 0.01, center: ing.c[2] });
    for (let s = 0; s < 2; s++) {
      const x0 = -0.15 + s * 0.35, h0 = 0.3 + s * 0.06;
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, h0, 16), M.std('#5a8a4a', { roughness: 0.5 }), x0, h0 / 2, 0));
      for (let i = 0; i < 34; i++) { const t = i / 34, a = i * 2.4, f = floret.clone(); f.position.set(x0 + Math.cos(a) * 0.06, h0 + t * 0.32, Math.sin(a) * 0.06); f.lookAt(x0 + Math.cos(a) * 2, h0 + t * 0.32 + 0.3, Math.sin(a) * 2); f.rotateX(Math.PI / 2); f.scale.setScalar(1 - t * 0.35); g.add(f); }
      for (let i = 0; i < 3; i++) { const l = mesh(bendPlane(0.07, 0.5, { cup: 0.6, curl: 0.3 }), M.std('#4f8a4a', { side: THREE.DoubleSide, roughness: 0.45, clearcoat: 0.5 })); l.position.set(x0, 0.02, 0); l.rotation.set(-0.25, i * 2.1 + s, 0); g.add(l); }
    }
    g.add(mesh(sphereFruit(0.1, M.std('#8a6a5a', { roughness: 0.8 })).geometry, M.std('#8a6a5a', { roughness: 0.8 }), 0.45, 0.08, 0.3));
  }
  return g;
}
export function specimen(ing) { return translucent(buildSpecimen(ing)); }
function buildSpecimen(ing) {
  const x = extras(ing); if (x) return x;
  switch (ing.family) {
    case 'citrus': return ing.id === 'petitgrain' ? greens(ing) : citrus(ing);
    case 'floral': return ing.id === 'geranium' ? flowerSpecimen(ing) : flowerSpecimen(ing);
    case 'green': return greens(ing);
    case 'fruit': return fruits(ing);
    case 'spice': return spices(ing);
    case 'wood': return ing.id === 'juniper' ? fruits(ing) : ing.id === 'cypress' ? greens(ing) : ing.id === 'patchouli' ? greens(ing) : woods(ing);
    case 'resin': return resins(ing);
    case 'gourmand': return gourmands(ing);
    case 'animalic': return animalic(ing);
    case 'marine': return marine(ing);
    default: return new THREE.Group();
  }
}

// ── perfume bottle ────────────────────────────────────────
const LATHE = {
  round: [[0, 0], [0.5, 0], [0.62, 0.04], [0.76, 0.25], [0.8, 0.52], [0.68, 0.86], [0.34, 1.0], [0.2, 1.04]],
  flask: [[0, 0], [0.48, 0], [0.6, 0.06], [0.62, 0.2], [0.62, 0.95], [0.5, 1.1], [0.22, 1.2], [0.2, 1.24]],
  bell: [[0, 0], [0.72, 0], [0.8, 0.06], [0.76, 0.2], [0.6, 0.6], [0.4, 0.95], [0.22, 1.08], [0.2, 1.12]],
  tall: [[0, 0], [0.4, 0], [0.46, 0.04], [0.46, 1.35], [0.32, 1.45], [0.18, 1.5]],
  vial: [[0, 0], [0.28, 0], [0.34, 0.04], [0.34, 0.9], [0.24, 1.0], [0.14, 1.04], [0.14, 1.1]],
};
const SHAPES = ['box', 'slab', 'round', 'flask', 'bell', 'tall', 'cube'];
const HOUSE_SHAPE = { 'Chanel': 'box', 'Dior': 'round', 'Guerlain': 'bell', 'Hermès': 'cube', 'Tom Ford': 'slab', 'Creed': 'flask', 'Le Labo': 'flask', 'Byredo': 'tall', 'Jo Malone London': 'cube', 'Diptyque': 'tall', 'Maison Francis Kurkdjian': 'slab', 'Giorgio Armani': 'round', 'Prada': 'tall', 'Mugler': 'bell', 'Yves Saint Laurent': 'slab', 'Parfums de Marly': 'box', 'Kilian Paris': 'slab', 'Xerjoff': 'round', 'Amouage': 'bell' };
const PAPER_LABEL = new Set(['Le Labo', 'Byredo', 'Diptyque', 'Jo Malone London', 'Acqua di Parma', 'Maison Margiela', 'Creed', 'Juliette Has a Gun', 'Glossier']);

// round off a bottle profile with a spline so the glass silhouette has no hard facets
function smoothProfile(profile) {
  if (profile.length < 4) return profile;
  const curve = new THREE.SplineCurve(profile.slice(1).map(([r, y]) => new THREE.Vector2(r, y)));
  const out = [profile[0]];
  for (const v of curve.getSpacedPoints(56)) out.push([Math.max(0, v.x), Math.max(0, v.y)]);
  return out;
}
const SMOOTH = new Map();
function lathe(profile, sx = 1, inset = 0, cut = 99) {
  if (!SMOOTH.has(profile)) SMOOTH.set(profile, smoothProfile(profile));
  profile = SMOOTH.get(profile);
  const prof = [];
  for (let i = 0; i < profile.length; i++) { const [r, y] = profile[i]; if (y <= cut + 1e-6) { prof.push([r, y]); continue; } const [r0, y0] = profile[i - 1]; prof.push([r0 + (r - r0) * ((cut - y0) / (y - y0)), cut]); break; }
  if (cut < 99) prof.push([0, prof[prof.length - 1][1]]);
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r * sx - inset), y)), 96);
}
function labelTex(title, sub, tint, paper) {
  return canvasTex(`label${title}${sub}${tint}${paper}`, 1024, 512, (g, w, h) => {
    if (paper) {
      g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.06; for (let i = 0; i < 2000; i++) { g.fillStyle = '#000'; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); } g.globalAlpha = 1;
      g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(24, 24, w - 48, h - 48);
      g.fillStyle = '#111'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = '500 34px "Geist Mono", ui-monospace, monospace'; g.fillText(sub.toUpperCase(), 60, 110);
      let s = 92; g.font = `600 ${s}px Geist, ui-sans-serif, sans-serif`; while (g.measureText(title).width > w - 120 && s > 40) { s -= 4; g.font = `600 ${s}px Geist, ui-sans-serif, sans-serif`; }
      g.fillText(title, 60, 290);
      g.fillStyle = tint; g.fillRect(60, 360, 120, 10);
      g.font = '400 28px "Geist Mono", ui-monospace, monospace'; g.fillStyle = '#555'; g.fillText('EAU DE PARFUM · 100 ML', 60, 430);
    } else {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(20,20,20,0.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      let s = 110; g.font = `600 ${s}px Geist, ui-sans-serif, sans-serif`; while (g.measureText(title.toUpperCase()).width > w - 100 && s > 40) { s -= 4; g.font = `600 ${s}px Geist, ui-sans-serif, sans-serif`; }
      g.fillText(title.toUpperCase(), w / 2, h * 0.45);
      g.font = '500 34px "Geist Mono", ui-monospace, monospace'; g.fillStyle = 'rgba(20,20,20,0.7)'; g.fillText(sub.toUpperCase(), w / 2, h * 0.72);
    }
  });
}

export function bottle(f, liquid, { tint = '#c9a227' } = {}) {
  const h = hash(f.id), g = new THREE.Group();
  const shape = HOUSE_SHAPE[f.house] || SHAPES[h % SHAPES.length];
  const caps = ['cyl', 'ball', 'cube', 'wood', 'cyl', 'facet'];
  const cap = f.house === 'Chanel' ? 'facet' : f.house === 'Guerlain' ? 'ball' : f.house === 'Le Labo' || f.house === 'Byredo' ? 'cyl' : f.house === 'Tom Ford' ? 'cube' : caps[(h >>> 3) % caps.length];
  const capColors = [0xd4af37, 0xd8d8d8, 0x111111, 0xb87333, 0xe8e2d6];
  const capColor = cap === 'wood' ? 0x8b6b4a : capColors[(h >>> 5) % capColors.length];
  const fill = 0.66 + ((h >>> 7) % 22) / 100;
  const paper = PAPER_LABEL.has(f.house);
  const glass = M.shell();
  const juice = M.perfume(liquid);
  const baseGlass = M.glass({ thickness: 0.4, attenuationColor: new THREE.Color('#d6ebe2'), attenuationDistance: 1.2 });
  let topY, neckR = 0.15, labelMesh;
  if (shape === 'box' || shape === 'slab' || shape === 'cube') {
    const [w, ht, d] = shape === 'box' ? [1.1, 1.05, 0.52] : shape === 'slab' ? [0.95, 1.2, 0.42] : [0.92, 0.92, 0.92];
    const base = 0.18; // heavy glass base, like real perfume bottles
    g.add(mesh(new RoundedBoxGeometry(w, ht, d, 6, 0.07), glass, 0, ht / 2, 0));
    const ih = (ht - base - 0.08) * fill;
    g.add(mesh(new RoundedBoxGeometry(w - 0.12, ih, d - 0.12, 4, 0.05), juice, 0, base + ih / 2, 0));
    g.add(mesh(new RoundedBoxGeometry(w - 0.02, base - 0.01, d - 0.02, 4, 0.06), baseGlass, 0, base / 2, 0));
    topY = ht;
    const lw = Math.min(0.7, w * 0.66);
    labelMesh = mesh(new THREE.PlaneGeometry(lw, lw / 2), new THREE.MeshPhysicalMaterial({ map: labelTex(f.name, f.house, tint, paper), transparent: !paper, roughness: paper ? 0.8 : 0.3, metalness: 0 }), 0, ht * 0.5, d / 2 + 0.003);
  } else {
    const prof = LATHE[shape], maxY = prof[prof.length - 1][1];
    g.add(mesh(lathe(prof), glass));
    const inner = lathe(prof, 0.8, 0.035, maxY * fill * 0.78); inner.translate(0, 0.14, 0);
    g.add(mesh(inner, juice));
    const foot = lathe(prof, 0.97, 0.005, 0.13); g.add(mesh(foot, baseGlass));
    topY = maxY; neckR = prof[prof.length - 1][0];
    const maxR = Math.max(...prof.map(([r]) => r)), mid = prof.reduce((b, [r, y]) => (y > maxY * 0.2 && y < maxY * 0.75 && r > b[0] ? [r, y] : b), [0, 0]);
    const lw = maxR * 1.1, lh = lw / 2, arc = Math.min(1.7, lw / mid[0]);
    labelMesh = mesh(new THREE.CylinderGeometry(mid[0] + 0.004, mid[0] + 0.004, lh, 64, 1, true, -arc / 2, arc), new THREE.MeshPhysicalMaterial({ map: labelTex(f.name, f.house, tint, paper), transparent: !paper, roughness: paper ? 0.8 : 0.3 }));
    labelMesh.position.y = Math.max(lh / 2 + 0.15, mid[1]);
  }
  labelMesh.castShadow = false; g.add(labelMesh);
  // dip tube inside the juice
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, topY - 0.15, 12), M.shell({ opacity: 0.5 }), 0.0, (topY + 0.15) / 2, 0));
  // atomizer: ribbed ferrule + actuator
  const ferrule = new THREE.CylinderGeometry(neckR * 1.15, neckR * 1.2, 0.1, 48, 1);
  const ribs = M.metal(capColor === 0x111111 ? 0xd4af37 : capColor, 0.15);
  ribs.bumpMap = canvasTex('ribs', 256, 16, (c, W, H) => { for (let x = 0; x < W; x += 8) { c.fillStyle = '#fff'; c.fillRect(x, 0, 4, H); c.fillStyle = '#000'; c.fillRect(x + 4, 0, 4, H); } }, { srgb: false, repeat: [4, 1] }); ribs.bumpScale = 1.2;
  g.add(mesh(ferrule, ribs, 0, topY + 0.05, 0));
  g.add(mesh(new THREE.CylinderGeometry(neckR * 0.8, neckR * 0.8, 0.07, 32), M.metal(0xdedede, 0.12), 0, topY + 0.135, 0));
  // cap
  const capMat = cap === 'wood' ? M.std(capColor, { roughness: 0.55, map: ringTex('#a07850', '#6e4a2a', 'capgrain'), clearcoat: 0.3 }) : capColor === 0x111111 ? M.std(0x0c0c0c, { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 }) : M.metal(capColor, 0.16);
  let capMesh;
  const cy = topY + 0.1;
  if (cap === 'ball') capMesh = mesh(new THREE.SphereGeometry(neckR * 1.9, 64, 48), M.glass({ thickness: 0.6, color: new THREE.Color(liquid).lerp(new THREE.Color(0xffffff), 0.6) }), 0, cy + neckR * 1.8, 0);
  else if (cap === 'cube') capMesh = mesh(new RoundedBoxGeometry(neckR * 3.4, neckR * 2.4, neckR * 3.4, 4, 0.03), capMat, 0, cy + neckR * 1.2, 0);
  else if (cap === 'facet') capMesh = mesh(new RoundedBoxGeometry(neckR * 3.6, neckR * 1.9, neckR * 3.6, 2, 0.015), M.glass({ thickness: 0.5, dispersion: 0.6 }), 0, cy + neckR * 0.95, 0);
  else if (cap === 'wood') capMesh = mesh(new THREE.CylinderGeometry(neckR * 1.55, neckR * 1.55, 0.44, 64), capMat, 0, cy + 0.22, 0);
  else { const prof = [[0, 0], [neckR * 1.45, 0], [neckR * 1.5, 0.01], [neckR * 1.5, 0.34], [neckR * 1.45, 0.36], [0, 0.36]]; capMesh = mesh(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 64), capMat, 0, cy, 0); }
  g.add(capMesh);
  return g;
}

export function vial(ing, color, { title = ing.name, sub = ing.latin } = {}) {
  const g = new THREE.Group(), prof = LATHE.vial, maxY = prof[prof.length - 1][1];
  g.add(mesh(lathe(prof), M.glass({ color: new THREE.Color('#d9a560'), thickness: 0.3, attenuationColor: new THREE.Color('#b8742a'), attenuationDistance: 0.8 })));
  const inner = lathe(prof, 0.86, 0.015, maxY * 0.6); inner.translate(0, 0.06, 0);
  g.add(mesh(inner, M.juice(color, { emissive: new THREE.Color(color).multiplyScalar(0.2) })));
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 32), M.metal(0xc8a86b, 0.25), 0, maxY + 0.06, 0));
  const bulb = new THREE.CapsuleGeometry(0.1, 0.16, 8, 24); g.add(mesh(bulb, M.std(0x1b1b1b, { roughness: 0.55, clearcoat: 0.2 }), 0, maxY + 0.3, 0));
  const lbl = mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.3, 48, 1, true, -0.9, 1.8), new THREE.MeshPhysicalMaterial({ map: labelTex(title, sub, color, true), roughness: 0.8 }));
  lbl.position.y = 0.45; g.add(lbl);
  return g;
}

// ── stage ─────────────────────────────────────────────────
// fit the camera to the object's bounding box: fixed 3/4 elevation, then solve distance and vertical centring from the projected corners.
// The camera only ever slides along one fixed direction, so each sampled vertex is put into the camera's frame once and every
// trial distance after that is a few multiplies per point instead of a full matrix projection.
function frame(group, camera, aspect, { pad = 1.18 } = {}) {
  const box = new THREE.Box3(); group.updateWorldMatrix(true, true); group.traverse((o) => { if (o.isMesh && !o.userData.noFrame) box.expandByObject(o, false); }); const center = box.getCenter(new THREE.Vector3());
  // sample real vertices (box corners overshoot round shapes like the plinth)
  const pts = [], v = new THREE.Vector3();
  group.traverse((o) => {
    if (!o.isMesh || !o.visible || o.userData.noFrame) return;
    if (o.isInstancedMesh) { o.computeBoundingBox(); const b = o.boundingBox; for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld); pts.push(v.x, v.y, v.z); } return; }
    const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 160)), e = o.matrixWorld.elements;
    for (let i = 0; i < pos.count; i += step) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      pts.push((e[0] * x + e[4] * y + e[8] * z + e[12]) * w, (e[1] * x + e[5] * y + e[9] * z + e[13]) * w, (e[2] * x + e[6] * y + e[10] * z + e[14]) * w);
    }
  });
  if (!pts.length) pts.push(box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z);
  camera.aspect = aspect; camera.updateProjectionMatrix();
  const el = 0.2, sE = Math.sin(el), cE = Math.cos(el), dir = new THREE.Vector3(0, sE, cE), target = center.clone();
  const tH = Math.tan((camera.fov * Math.PI) / 360) / camera.zoom, kx = 1 / (tH * aspect), ky = 1 / tH;
  // camera frame relative to the box centre: x stays x, A is height on screen, B depth toward the camera
  const n = pts.length / 3, PX = new Float64Array(n), A = new Float64Array(n), B = new Float64Array(n);
  for (let i = 0; i < n; i++) { const x = pts[i * 3] - center.x, y = pts[i * 3 + 1] - center.y, z = pts[i * 3 + 2] - center.z; PX[i] = x; A[i] = y * cE - z * sE; B[i] = y * sE + z * cE; }
  const place = (d) => { camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateMatrixWorld(); };
  let ty = 0;
  const extent = (d) => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const dd = d + ty * sE, ay = ty * cE;
    for (let i = 0; i < n; i++) { const q = 1 / (dd - B[i]), px = kx * PX[i] * q, py = ky * (A[i] - ay) * q; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    return { x0, x1, y0, y1 };
  };
  let d = box.getSize(v).length() * 2;
  for (let it = 0; it < 3; it++) {
    let lo = 0.2, hi = d * 3;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2, e = extent(m); if (Math.max(e.x1, -e.x0, e.y1 - e.y0 > 0 ? (e.y1 - e.y0) / 2 : 0) * pad < 1 && Math.max(e.x1 - e.x0) / 2 * pad < 1) hi = m; else lo = m; }
    d = hi;
    // re-centre vertically so the projected box sits in the middle
    const e = extent(d), off = (e.y1 + e.y0) / 2, h = Math.tan((camera.fov * Math.PI) / 360) * d;
    ty += off * h;
  }
  target.y = center.y + ty; place(d);
}

// photographic studio for reflections: big overhead softbox, two strip lights, a front fill card
// and a warm kicker, inside a grey cyclorama that darkens toward the floor
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 48, 24), pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10, v = y < -0.05 ? 0.12 + (y + 1) * 0.08 : 0.26 + y * 0.32; col.push(v, v * 0.985, v * 0.96); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  const panel = (w, h, k, x, y, z, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(6, 4, 9, 1.5, 7.5, 2.5, 0xfff5ea);
  panel(1.1, 7, 6, -7.5, 1.5, 1.5, 0xf0f5ff);
  panel(1.1, 7, 4.5, 7.5, 1.5, -1.5);
  panel(6, 2.2, 1.8, 0, 0.6, 8.5);
  panel(3, 3, 1.4, -3, 3.5, -8, 0xffe3c4);
  const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(env, 0.025).texture;
  pm.dispose(); geo.dispose();
  return tex;
}
function buildScene(renderer) {
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xfff4e6, 2.2); key.position.set(2.5, 4, 2.5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 5; key.shadow.blurSamples = 16; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 12 });
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.2); rim.position.set(-3, 2.5, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 0.35));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.3 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // studio sweep: gives glass something to refract, like a product shot
  const bc = document.createElement('canvas'); bc.width = 4; bc.height = 256;
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace;
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(18, 48, 32), new THREE.MeshBasicMaterial({ map: btex, side: THREE.BackSide, depthWrite: false, toneMapped: false }));
  backdrop.visible = false; backdrop.renderOrder = -1; scene.add(backdrop);
  backdrop.paint = (top, floor) => {
    const g = bc.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top); gr.addColorStop(0.44, top); gr.addColorStop(0.5, floor); gr.addColorStop(1, floor);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256); btex.needsUpdate = true; backdrop.visible = true;
  };
  return { scene, key, backdrop };
}
// honed stone for the plinth: soft cloudy mottling, a few faint veins and pits, tinted by the material color
function stoneTex() {
  return canvasTex('stone', 512, 512, (g, w, h) => {
    const img = g.createImageData(w, h), N = fbmImage(w, h, 5, 11, 4), M2 = fbmImage(w, h, 22, 3, 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = N[y * w + x], m = M2[y * w + x];
      const v = 238 + (n - 0.5) * 30 + (m - 0.5) * 10;
      const i = (y * w + x) * 4; img.data[i] = v; img.data[i + 1] = v - 2; img.data[i + 2] = v - 5; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const r = rng(7); g.filter = 'blur(1.5px)';
    for (let k = 0; k < 5; k++) {
      g.strokeStyle = `rgba(120,110,100,${0.08 + r() * 0.08})`; g.lineWidth = 0.6 + r() * 1.6; g.beginPath();
      let x = r() * w, y = r() * h; g.moveTo(x, y);
      for (let j = 0; j < 8; j++) { const nx = x + (r() - 0.3) * 140, ny = y + (r() - 0.5) * 120; g.quadraticCurveTo((x + nx) / 2 + (r() - 0.5) * 60, (y + ny) / 2 + (r() - 0.5) * 60, nx, ny); x = nx; y = ny; }
      g.stroke();
    }
    g.filter = 'none';
    for (let k = 0; k < 260; k++) { g.fillStyle = `rgba(90,80,70,${0.08 + r() * 0.15})`; g.beginPath(); g.arc(r() * w, r() * h, 0.4 + r() * 1.3, 0, TAU); g.fill(); }
  });
}
function plinth(color, radius = 1.25) {
  const p = new THREE.Group();
  const prof = [[0, 0], [radius - 0.03, 0], [radius, 0.012], [radius + 0.01, 0.05], [radius - 0.02, 0.07]];
  const mat = new THREE.MeshPhysicalMaterial({ color, map: stoneTex(), roughnessMap: microTex('stone', 26, 0.7), roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.32, sheen: 0.2, sheenColor: new THREE.Color(color) });
  p.add(mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 128), mat));
  const top = new THREE.CircleGeometry(radius - 0.02, 128); top.rotateX(-Math.PI / 2);
  p.add(mesh(top, mat, 0, 0.07, 0));
  return p;
}
// scale an object so its largest side is `size`, centred on x/z with its base at y = 0
function normalize(obj, size, { by = 'max' } = {}) {
  const box = new THREE.Box3().setFromObject(obj), d = box.getSize(new THREE.Vector3());
  const k = size / (by === 'y' ? d.y : Math.max(d.x, d.y, d.z));
  const c = box.getCenter(new THREE.Vector3());
  // rest on the bulk of the object, not on a stray leaf tip or petal that pokes lower
  const ys = [], v = new THREE.Vector3(); obj.updateWorldMatrix(true, true);
  obj.traverse((o) => { if (!o.isMesh || o.isInstancedMesh) return; const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 400)); for (let i = 0; i < pos.count; i += step) ys.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).y); });
  ys.sort((a, b) => a - b);
  const base = ys.length > 50 ? Math.min(box.min.y + d.y * 0.12, ys[Math.floor(ys.length * 0.012)]) : box.min.y;
  const wrap = new THREE.Group(); obj.position.set(-c.x, -base, -c.z); wrap.add(obj); wrap.scale.setScalar(k);
  wrap.userData.foot = Math.max(d.x, d.z) * k / 2;
  return wrap;
}
const TOP = 0.07; // plinth height
function composeIngredient(ing, oilColor, plinthColor, label) {
  const g = new THREE.Group();
  const s = normalize(specimen(ing), 1.25);
  const v = normalize(vial(ing, oilColor, label), 0.8, { by: 'y' }); v.rotation.y = -0.5;
  s.position.set(-0.2, TOP, 0.05); v.position.set(s.userData.foot * 0.85 + 0.12, TOP, -0.2);
  g.add(s, v, plinth(plinthColor, Math.max(0.9, s.userData.foot + 0.4)));
  g.add(contactShadow(s.userData.foot * 0.95, TOP, 0.6, 1.15, -0.2, 0.05), contactShadow(v.userData.foot * 1.5, TOP, 0.8, 1, v.position.x, v.position.z));
  return g;
}
function composeFragrance(f, liquid, notes, plinthColor, tint) {
  const g = new THREE.Group();
  const b = normalize(bottle(f, liquid, { tint }), 1.45, { by: 'y' }); b.position.y = TOP;
  g.add(b, contactShadow(b.userData.foot * 1.25, TOP, 0.95));
  const R = b.userData.foot + 0.3;
  notes.slice(0, 3).forEach((ing, i) => {
    const s = normalize(specimen(ing), 0.56);
    const a = [-1.05, 1.0, 2.6][i];
    s.position.set(Math.sin(a) * R, TOP, Math.cos(a) * R * 0.85); s.rotation.y = a * 0.6;
    g.add(s, contactShadow(s.userData.foot * 1.1, TOP, 0.75, 1, s.position.x, s.position.z));
  });
  g.add(plinth(plinthColor, R + 0.2));
  return g;
}
function dispose(o) {
  o.traverse((x) => { if (x.geometry) x.geometry.dispose(); const mats = Array.isArray(x.material) ? x.material : x.material ? [x.material] : []; mats.forEach((m) => m.dispose()); });
}

export function createModelStage() {
  const canvas = document.createElement('canvas'); canvas.className = 'bottle-canvas';
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
  const { scene, backdrop } = buildScene(renderer);
  const camera = new THREE.PerspectiveCamera(22, 1, 0.05, 80);
  const turntable = new THREE.Group(); scene.add(turntable);
  let host = null, parked = false, holdMs = 0, holdUntil = 0, raf = 0, tick = 0, lastT = 0, shownAt = 0, dirty = true, rotY = 0, velY = 0, dragging = false, lastX = 0, onScreen = true, aspect = 1, current = null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; });

  // shaders compile in the background (KHR_parallel_shader_compile where the browser has it), so picking a new
  // model doesn't freeze the page; nothing is drawn until they are ready and the canvas stays clear meanwhile
  let ready = Promise.resolve(), live = true;
  // glass and liquids go through a transmission pass that first redraws everything opaque into a linear render target
  // (back faces of two-sided glass too); those shader variants would otherwise compile on the first frame and stall it,
  // so they are started here alongside the normal ones, and the model waits until every one has finished
  const warmRT = new THREE.WebGLRenderTarget(1, 1);
  function compileAll(group) {
    if (!renderer.compileAsync) return Promise.resolve();
    let glass = false; const backs = [];
    group.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m?.transmission > 0) { glass = true; if (m.side === THREE.DoubleSide) backs.push(m); } });
    if (glass) {
      renderer.setRenderTarget(warmRT); renderer.compile(scene, camera);
      if (backs.length) { backs.forEach((m) => { m.side = THREE.BackSide; }); renderer.compile(scene, camera); backs.forEach((m) => { m.side = THREE.DoubleSide; m.needsUpdate = true; }); }
      renderer.setRenderTarget(null);
    }
    return renderer.compileAsync(scene, camera).then(() => new Promise((res) => {
      const check = () => (renderer.info.programs.every((p) => !p.isReady || p.isReady()) ? res() : setTimeout(check, 10));
      check();
    }));
  }
  function show(group) {
    if (current) { turntable.remove(current); dispose(current); }
    current = group; turntable.add(group);
    turntable.rotation.y = rotY = -0.35; velY = 1.6; shownAt = performance.now(); dirty = true;
    frame(turntable, camera, aspect);
    live = false; renderer.setRenderTarget(null); renderer.clear();
    const hold = holdMs; holdMs = 0;
    const done = () => { if (current !== group) return; live = true; dirty = true; shownAt = lastT = performance.now(); holdUntil = shownAt + hold; shownAt += hold; };
    ready = compileAll(group).then(done, done);
    return ready;
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!host || parked || !onScreen || document.hidden || !live) return;
    // held still at first (while a picture of this same frame fades away above it), unless it is dragged
    if (!dragging && performance.now() < holdUntil) { lastT = performance.now(); if (dirty) { dirty = false; turntable.rotation.y = rotY; renderer.render(scene, camera); } return; }
    // after each pick the turntable turns slowly for a while, then comes to rest and stops redrawing until it is dragged
    const now = performance.now(), dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
    const cruise = reduce || now - shownAt > 6000 ? 0 : 0.22;
    if (!dragging) { velY += (cruise - velY) * (1 - Math.pow(0.97, dt * 60)); rotY += velY * dt; }
    if (!dragging && !dirty && Math.abs(velY) < 0.002) return;
    // while it cruises at its slow turn, every other frame is enough
    if (!dragging && cruise && Math.abs(velY - cruise) < 0.05 && (++tick & 1)) return;
    dirty = false;
    turntable.rotation.y = rotY;
    renderer.render(scene, camera);
  }
  function resize() {
    if (!host) return; const r = host.getBoundingClientRect(); if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false); aspect = r.width / r.height; camera.aspect = aspect; camera.updateProjectionMatrix(); dirty = true;
    if (current) frame(turntable, camera, aspect);
  }
  const ro = new ResizeObserver(resize);
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; rotY += dx * 0.012; velY = dx * 0.7; });
  const up = () => { dragging = false; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  return {
    mount(el) { host = el; parked = false; dirty = true; el.appendChild(canvas); ro.disconnect(); ro.observe(el); io.disconnect(); io.observe(el); resize(); if (!raf) loop(); },
    showIngredient(ing, oilColor, plinthColor, label) { backdrop.visible = false; return show(composeIngredient(ing, oilColor, plinthColor, label)); },
    showFragrance(f, liquid, notes, plinthColor, tint, sweep) { if (sweep) backdrop.paint(sweep[0], sweep[1]); else backdrop.visible = false; return show(composeFragrance(f, liquid, notes, plinthColor, tint)); },
    ready: () => ready,
    // the detail panel slid away: stop drawing until the next model is mounted
    pause() { parked = true; },
    // keep the next model at its first pose for this long once it appears
    holdNext(ms) { holdMs = ms; },
    // build tooling: the model's first frame as a picture, saved as the placeholder shown while the live model loads
    snapshot(type = 'image/png', q) { turntable.rotation.y = -0.35; renderer.render(scene, camera); return canvas.toDataURL(type, q); },
  };
}

// small offscreen renderer for list thumbnails (queued, one per idle slot)
let thumbR = null, thumbScene = null, thumbCam = null, thumbBack = null;
const thumbCache = new Map(), queue = [];
let pumping = false;
function pump() {
  if (pumping) return; pumping = true;
  const step = () => {
    const job = queue.shift();
    if (!job) { pumping = false; return; }
    if (thumbCache.has(job.key)) { job.done(thumbCache.get(job.key)); }
    else {
      if (!thumbR) {
        const c = document.createElement('canvas');
        thumbR = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
        thumbR.setPixelRatio(1); thumbR.setSize(176, 176, false);
        thumbR.toneMapping = THREE.NeutralToneMapping; thumbR.toneMappingExposure = 1.15;
        thumbR.shadowMap.enabled = true; thumbR.shadowMap.type = THREE.PCFSoftShadowMap;
        ({ scene: thumbScene, backdrop: thumbBack } = buildScene(thumbR)); thumbScene.traverse((o) => { if (o.material?.isShadowMaterial) o.material.opacity = 0.14; }); thumbCam = new THREE.PerspectiveCamera(24, 1, 0.05, 80);
      }
      if (job.sweep) thumbBack.paint(job.sweep[0], job.sweep[1]); else thumbBack.visible = false;
      const obj = job.build(); thumbScene.add(obj); frame(obj, thumbCam, 1, { pad: 1.1 });
      if (job.size) thumbR.setSize(job.size, job.size, false);
      thumbR.render(thumbScene, thumbCam);
      const url = thumbR.domElement.toDataURL(job.sweep ? 'image/jpeg' : 'image/png', 0.9);
      if (job.size) thumbR.setSize(176, 176, false);
      thumbScene.remove(obj); dispose(obj);
      thumbCache.set(job.key, url); job.done(url);
    }
    (window.requestIdleCallback || ((f) => setTimeout(f, 16)))(step, { timeout: 120 });
  };
  step();
}
// size renders a larger picture than the list cards use; first jumps the queue (the welcome card's bottle)
export function thumbnail(key, build, sweep, { size = 0, first = false } = {}) {
  if (thumbCache.has(key)) return Promise.resolve(thumbCache.get(key));
  return new Promise((done) => { const job = { key, build, sweep, done, size }; first ? queue.unshift(job) : queue.push(job); pump(); });
}
export function cancelThumbnails() { queue.length = 0; }
export const renderedThumbs = thumbCache; // read by the build script that saves thumbnails as files
export const thumbBuilders = {
  ingredient: (ing) => () => { const s = normalize(specimen(ing), 1); s.rotation.y = -0.4; const g = new THREE.Group(); g.add(s, contactShadow(s.userData.foot * 1.05, 0, 0.7, 1.1)); return g; },
  fragrance: (f, liquid, tint) => () => { const b = normalize(bottle(f, liquid, { tint }), 1, { by: 'y' }); b.rotation.y = -0.45; const g = new THREE.Group(); g.add(b, contactShadow(b.userData.foot * 1.3, 0, 0.8)); return g; },
};

// ── specimens for the third wave of notes ─────────────────
// a branch with leaves set along it, alternate or in pairs
function sprig(g, pts, { col = '#3f6e2e', kind = 'ovate', n = 10, size = 0.14, aspect = 2.2, pairs = false, stemCol = '#6a5a3a', r0 = 0.008, gloss = 0, spread = 1.1, seed = 1 } = {}) {
  g.add(stem(pts, r0, stemCol));
  const curve = new THREE.CatmullRomCurve3(pts), r = rng(seed), mat = M.leaf(col, shade(col, 0.4), kind);
  if (gloss) { mat.clearcoat = gloss; mat.clearcoatRoughness = 0.12; }
  const geo = bendPlane(size, size * aspect, { cup: 0.5, curl: 0.15 });
  for (let i = 0; i < n; i++) {
    const t = 0.12 + (i / n) * 0.86, p = curve.getPointAt(Math.min(1, t)), s = 1 - t * 0.35;
    for (const side of pairs ? [0, Math.PI] : [i % 2 ? 0 : Math.PI]) {
      const h = new THREE.Group(); h.position.copy(p); h.rotation.y = side + i * (pairs ? 1.57 : 0.5) + r() * 0.3;
      const l = mesh(geo, mat); l.rotation.set(spread + (r() - 0.5) * 0.3, 0, 0); l.scale.setScalar(s); h.add(l); g.add(h);
    }
  }
  return curve;
}
// a flat-topped umbel: rays fanning from one point, each ending in a little cluster of florets
function umbel(g, top, { rays = 18, len = 0.16, col = '#f4f1e6', fr = 0.012, per = 9, seed = 2, stemCol = '#5f8a4a' } = {}) {
  const r = rng(seed), geos = [], fl = new THREE.SphereGeometry(fr, 8, 6), pts = [];
  for (let i = 0; i < rays; i++) {
    const a = i * 2.39996, d = len * Math.sqrt((i + 1) / rays), e = V3(top.x + Math.cos(a) * d, top.y + 0.05 + (1 - d / len) * 0.03, top.z + Math.sin(a) * d);
    geos.push(tube([top, top.clone().lerp(e, 0.5).add(V3(0, 0.03, 0)), e], 0.0025, 6, 4).toNonIndexed());
    for (let k = 0; k < per; k++) { const b = r() * TAU, q = r() * 0.03; pts.push(V3(e.x + Math.cos(b) * q, e.y + 0.006 + r() * 0.01, e.z + Math.sin(b) * q)); }
  }
  g.add(mesh(mergeGeometries(geos), M.std(stemCol, { roughness: 0.6 })));
  const im = new THREE.InstancedMesh(fl, M.std(col, { roughness: 0.6, sheen: 0.6 }), pts.length), m4 = new THREE.Matrix4();
  pts.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m4); }); im.castShadow = true; g.add(im);
}
// roots and rhizomes: knobbly capsules with a rough skin
function rhizomes(g, mat, { n = 6, r0 = 0.05, len = 0.16, seed = 3, spread = 0.18 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { const geo = displace(new THREE.CapsuleGeometry(r0 * (0.7 + r() * 0.5), len * (0.7 + r() * 0.6), 8, 16), r0 * 0.3, 8, 3, i + seed); g.add(place(mesh(geo, mat), (r() - 0.5) * spread * 2, r0 * 0.9, (r() - 0.5) * spread * 1.5, Math.PI / 2, r() * TAU, (r() - 0.5) * 0.5)); }
}
function halfFruit(g, R, skin, faceTex, x, y, z, rx = 0.8, ry = 0.3, sy = 1) {
  const h = new THREE.Group();
  const dome = new THREE.SphereGeometry(R, 48, 24, 0, TAU, 0, Math.PI / 2); dome.rotateX(Math.PI); dome.scale(1, sy, 1); h.add(mesh(dome, skin));
  const cap = new THREE.CircleGeometry(R, 48); cap.rotateX(-Math.PI / 2); h.add(mesh(cap, M.std(0xffffff, { map: faceTex, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 }), 0, 0.001, 0));
  h.rotation.set(rx, ry, 0); h.position.set(x, y, z); g.add(h); return h;
}
function glassOf(g, prof, liquidCol, x, z, fill = 0.4, o = {}) {
  const pts = prof.map(([a, b]) => new THREE.Vector2(a, b));
  g.add(mesh(new THREE.LatheGeometry(pts, 64), M.glass({ thickness: 0.04, ...o }), x, 0, z));
  const top = Math.max(...prof.map((p) => p[1])), inner = prof.filter(([, b]) => b <= top * fill).map(([a, b]) => new THREE.Vector2(Math.max(0, a - 0.012), b));
  if (inner.length > 1) { inner.push(new THREE.Vector2(0, inner[inner.length - 1].y)); g.add(mesh(new THREE.LatheGeometry(inner, 48), M.juice(liquidCol, { emissive: new THREE.Color(liquidCol).multiplyScalar(0.25) }), x, 0.006, z)); }
}
function moreNotes(ing) {
  const id = ing.id, r = rng(hash(id)), g = new THREE.Group(), [c0, c1, c2] = ing.c;
  const glossy = (c, o = {}) => M.std(c, { roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.18, ...o });
  switch (id) {
    case 'apricot': {
      const skin = M.std('#f29a3a', { roughness: 0.6, sheen: 1, sheenColor: new THREE.Color('#ffd8a0'), sheenRoughness: 0.4, map: canvasTex('apriskin', 128, 128, (c, W) => { const gr = c.createLinearGradient(0, 0, W, W); gr.addColorStop(0, '#f7b24a'); gr.addColorStop(0.6, '#f0902e'); gr.addColorStop(1, '#d9572a'); c.fillStyle = gr; c.fillRect(0, 0, W, W); c.globalAlpha = 0.4; for (let i = 0; i < 120; i++) { c.fillStyle = '#c8401e'; c.fillRect(Math.random() * W, Math.random() * W, 1.5, 1.5); } }) });
      [[-0.3, 0.05, 0.3], [0.0, -0.22, 1.9]].forEach(([x, z, a]) => { const f = sphereFruit(0.16, skin, { sy: 0.95, crease: 0.12 }); f.position.set(x, 0.155, z); f.rotation.y = a; g.add(f); });
      const face = canvasTex('apriface', 256, 256, (c, W) => { c.fillStyle = '#f5a23a'; c.fillRect(0, 0, W, W); const gr = c.createRadialGradient(W / 2, W / 2, 10, W / 2, W / 2, W / 2); gr.addColorStop(0, '#ffc865'); gr.addColorStop(0.85, '#f7a33a'); gr.addColorStop(1, '#e0761e'); c.fillStyle = gr; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.fill(); });
      halfFruit(g, 0.155, skin, face, 0.3, 0.1, 0.18, 0.15, 0.4);
      const pit = blob(0.06, 0.01, 10, 4, 3); pit.scale(1, 0.55, 1.25); g.add(place(mesh(pit, M.std('#9a5a32', { roughness: 0.7, bumpMap: noiseTex('pit', 30, 2), bumpScale: 3 })), 0.31, 0.135, 0.17, 0.15, 0.4, 0));
      leafAt(g, -0.05, 0.35, 0.3, '#3f7a2e', 1.2, 'serrated');
      return g;
    }
    case 'melon': {
      const rind = canvasTex('charentais', 256, 256, (c, W) => { c.fillStyle = '#c9cfa0'; c.fillRect(0, 0, W, W); c.strokeStyle = '#4f7a3a'; c.lineWidth = 6; for (let i = 0; i < 10; i++) { c.beginPath(); c.moveTo(i * W / 10, 0); c.bezierCurveTo(i * W / 10 + 6, W * 0.4, i * W / 10 - 6, W * 0.6, i * W / 10, W); c.stroke(); } c.globalAlpha = 0.2; for (let i = 0; i < 600; i++) { c.fillStyle = '#8a9a6a'; c.fillRect(Math.random() * W, Math.random() * W, 2, 2); } });
      const skin = M.std(0xffffff, { map: rind, roughness: 0.55, bumpMap: noiseTex('melon', 30, 1.2), bumpScale: 1.5 });
      const m = sphereFruit(0.3, skin, { sy: 0.92 }); const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.025 * Math.cos(a * 10); p.setX(i, x * k); p.setZ(i, z * k); } m.geometry.computeVertexNormals();
      m.position.set(-0.22, 0.275, -0.05); g.add(m);
      const sh = new THREE.Shape(); sh.absarc(0, 0, 0.28, 0, Math.PI, false); sh.lineTo(-0.16, 0); sh.absarc(0, 0, 0.16, Math.PI, 0, true); sh.lineTo(0.28, 0);
      const wedge = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 32 });
      const flesh = M.std('#f39a3a', { roughness: 0.18, clearcoat: 1, sheen: 0.5, sheenColor: new THREE.Color('#ffd09a') });
      g.add(place(mesh(wedge, [flesh, M.std('#b8c28a', { roughness: 0.5 })]), 0.32, 0.03, 0.25, -Math.PI / 2, 0.5, 0));
      return g;
    }
    case 'pomegranate': {
      const skin = glossy('#b3202a', { roughness: 0.35, bumpMap: noiseTex('pomeg', 20, 1), bumpScale: 1.2, sheen: 0.3, sheenColor: new THREE.Color('#ffb0a0') });
      const f = sphereFruit(0.22, skin, { sy: 0.92, bump: 0.008, seed: 3 }); f.position.set(-0.25, 0.205, 0); g.add(f);
      const crown = new THREE.Group(); for (let i = 0; i < 6; i++) { const c = mesh(new THREE.ConeGeometry(0.018, 0.07, 6), skin); c.position.set(Math.cos(i) * 0.025, 0.03, Math.sin(i) * 0.025); c.rotation.set(Math.sin(i) * 0.6, 0, -Math.cos(i) * 0.6); crown.add(c); }
      crown.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.04, 16), skin)); crown.position.set(-0.25, 0.41, 0); g.add(crown);
      const pith = canvasTex('pomface', 256, 256, (c, W) => { c.fillStyle = '#f3e3c8'; c.fillRect(0, 0, W, W); c.fillStyle = '#b3202a'; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.lineWidth = 10; c.strokeStyle = '#b3202a'; c.stroke(); });
      const h = halfFruit(g, 0.2, skin, pith, 0.27, 0.16, 0.12, 0.35, -0.3, 0.9);
      const aril = new THREE.SphereGeometry(0.018, 12, 10); aril.scale(1, 1.25, 1);
      const arilMat = M.std('#c8102e', { roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, sheen: 0.5, sheenColor: new THREE.Color('#ff8090'), emissive: new THREE.Color('#3a0006') });
      const im = new THREE.InstancedMesh(aril, arilMat, 120), m4 = new THREE.Matrix4();
      for (let i = 0; i < 120; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.17; if (Math.abs(Math.sin(a * 3)) < 0.12) { i--; continue; } m4.compose(V3(Math.cos(a) * d, 0.012, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(r(), r(), r())), V3(1, 1, 1)); im.setMatrixAt(i, m4); }
      im.castShadow = true; h.add(im);
      const loose = pile(aril, arilMat, 26, 0.12, 5, { height: 0.08 }); loose.position.set(0.1, 0, 0.42); g.add(loose);
      return g;
    }
    case 'rhubarb': {
      const tex = canvasTex('rhubarb', 64, 256, (c, W, H) => { const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#9ec04a'); gr.addColorStop(0.35, '#d0485a'); gr.addColorStop(1, '#b01a3a'); c.fillStyle = gr; c.fillRect(0, 0, W, H); c.globalAlpha = 0.25; c.strokeStyle = '#fff0f0'; for (let x = 4; x < W; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } });
      const mat = M.std(0xffffff, { map: tex, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
      for (let i = 0; i < 5; i++) { const geo = new THREE.CylinderGeometry(0.035, 0.042, 0.95, 20, 8); geo.scale(1, 1, 0.7); g.add(place(mesh(geo, mat), -0.25 + i * 0.07, 0.04 + (i % 2) * 0.05, (i % 3) * 0.04 - 0.04, Math.PI / 2, 0.15 + (r() - 0.5) * 0.12, Math.PI / 2)); }
      const leaf = displace(bendPlane(0.6, 0.55, { cup: 0.35, wave: 4, seed: 3 }), 0.02, 5, 2, 2);
      g.add(place(mesh(leaf, M.leaf('#4f8a2e', '#d6e8a8', 'heart')), 0.25, 0.06, 0.05, -1.35, -1.6, 0, 1.4));
      const cut = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 20), M.std('#e8f0c8', { roughness: 0.4 })); cut.geometry.scale(1, 1, 0.7); g.add(place(cut, -0.1, 0.03, 0.38));
      return g;
    }
    case 'date': {
      g.add(dish(0.5, '#efe5d6', false));
      const d = displace(new THREE.CapsuleGeometry(0.032, 0.075, 8, 16), 0.005, 30, 2, 2);
      const pp = pile(d, M.std('#5a2a14', { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.35, bumpMap: noiseTex('wrinkle', 8, 2), bumpScale: 3, sheen: 0.4, sheenColor: new THREE.Color('#c88a5a') }), 40, 0.38, 3, { height: 0.3 }); pp.position.y = 0.03; g.add(pp);
      const open = displace(new THREE.CapsuleGeometry(0.032, 0.075, 8, 16), 0.004, 30, 2, 5); g.add(place(mesh(open, M.std('#6a3218', { roughness: 0.35, clearcoat: 0.7 })), 0.6, 0.033, 0.25, Math.PI / 2, 0.6, 0));
      const stone = new THREE.CapsuleGeometry(0.012, 0.05, 6, 10); g.add(place(mesh(stone, M.std('#c8b08a', { roughness: 0.6 })), 0.68, 0.014, 0.08, Math.PI / 2, 0.2, 0));
      return g;
    }
    case 'honeysuckle': {
      const cols = ['#fbf3cf', '#fffdf0', '#f2d06a'];
      const floret = () => { const f = new THREE.Group(); const tb = mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.14, 10), M.std('#f7ecc0', { roughness: 0.5, sheen: 0.8 }), 0, 0.07, 0); f.add(tb);
        const lip = flowerHead(ing, { petals: 5, len: 0.09, wid: 0.04, kind: 'long', open: 1.75, cup: 0.6, twist: 0.5, centerR: 0, colors: cols }); lip.position.y = 0.14; f.add(lip); f.scale.setScalar(1.5);
        for (let k = 0; k < 5; k++) f.add(stem([V3(0, 0.12, 0), V3(Math.cos(k) * 0.02, 0.19, Math.sin(k) * 0.02), V3(Math.cos(k) * 0.04, 0.23, Math.sin(k) * 0.04)], 0.0015, '#f2e6a0')); return f; };
      for (let s = 0; s < 2; s++) {
        const pts = [V3(-0.5 + s * 0.2, 0.02, 0.25 - s * 0.3), V3(-0.1 + s * 0.1, 0.12, 0.05 - s * 0.2), V3(0.3 + s * 0.1, 0.18 + s * 0.05, -0.05 - s * 0.15)];
        const curve = sprig(g, pts, { col: '#4a7a3a', n: 6, size: 0.12, aspect: 1.8, pairs: true, stemCol: '#7a5a4a', seed: s + 3 });
        const end = curve.getPointAt(1);
        for (let k = 0; k < 7; k++) { const f = floret(); f.position.copy(end); f.rotation.set(0.4 + (k % 3) * 0.3, k * 0.9, 0.25); f.scale.setScalar(1.5 - (k % 2) * 0.25); g.add(f); }
      }
      return g;
    }
    case 'bay': {
      for (let s = 0; s < 3; s++) sprig(g, [V3(-0.5 + s * 0.12, 0.02, 0.3 - s * 0.2), V3(-0.1, 0.07 + s * 0.03, 0.05 - s * 0.15), V3(0.35 - s * 0.05, 0.1, -0.2 - s * 0.05)], { col: '#2f5a2a', n: 7, size: 0.13, aspect: 2.4, gloss: 0.9, stemCol: '#7a6a4a', seed: s + 11 });
      const berry = new THREE.SphereGeometry(0.02, 12, 10); const bp = pile(berry, glossy('#2a1a22', { roughness: 0.3 }), 24, 0.12, 4, { height: 0.15 }); bp.position.set(0.3, 0, 0.35); g.add(bp);
      return g;
    }
    case 'caraway': {
      g.add(dish(0.5, '#ece6da', false));
      const seed = new THREE.CapsuleGeometry(0.008, 0.05, 4, 8); { const p = seed.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + y * y * 3); } seed.computeVertexNormals(); }
      const pp = pile(seed, M.std('#5a4028', { roughness: 0.75, bumpMap: microTex('seedridge', 70, 0), bumpScale: 2 }), 480, 0.4, 6, { height: 0.35 }); pp.position.y = 0.03; g.add(pp);
      const top = V3(0.6, 0.4, -0.15); g.add(stem([V3(0.5, 0.02, 0.2), V3(0.56, 0.2, 0.05), top], 0.006, '#5f8a4a')); umbel(g, top, { rays: 12, len: 0.1, col: '#f6f1e2', fr: 0.008, per: 7, seed: 4 });
      return g;
    }
    case 'artemisia': {
      const leaf = new THREE.CapsuleGeometry(0.005, 0.05, 2, 4); leaf.scale(1, 1, 0.5); leaf.translate(0, 0.027, 0);
      const mat = M.std('#a8b4a2', { roughness: 0.75, sheen: 1, sheenColor: new THREE.Color('#eef2ea'), sheenRoughness: 0.4 });
      for (let s = 0; s < 7; s++) {
        const x0 = -0.35 + s * 0.11, top = 0.5 + r() * 0.25, lean = (r() - 0.5) * 0.35;
        const pts = [V3(x0, 0.02, 0.25), V3(x0 + lean * 0.4, top * 0.5, 0.1), V3(x0 + lean, top, 0)];
        g.add(stem(pts, 0.005, '#8a7a62'));
        const curve = new THREE.CatmullRomCurve3(pts), n = 150, im = new THREE.InstancedMesh(leaf, mat, n), m4 = new THREE.Matrix4();
        for (let i = 0; i < n; i++) { const p = curve.getPointAt(0.2 + (i / n) * 0.8), a = i * 2.4; m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9 * Math.cos(a), a, 0.9 * Math.sin(a))), V3(1, 1, 1)); im.setMatrixAt(i, m4); }
        im.castShadow = true; g.add(im);
      }
      g.add(place(mesh(new THREE.TorusGeometry(0.075, 0.01, 8, 24), M.std('#c9a874', { roughness: 0.9 })), -0.02, 0.12, 0.18, 0.3, 0, 0));
      return g;
    }
    case 'angelica': {
      const stalk = M.std('#6a9a4a', { roughness: 0.4, clearcoat: 0.4, map: canvasTex('angstalk', 64, 256, (c, W, H) => { const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#7fae52'); gr.addColorStop(1, '#8a5a6a'); c.fillStyle = gr; c.fillRect(0, 0, W, H); c.globalAlpha = 0.3; c.strokeStyle = '#d8e8b8'; for (let x = 3; x < W; x += 7) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); } }) });
      const top = V3(-0.1, 0.72, 0); g.add(mesh(tube([V3(-0.2, 0.02, 0.2), V3(-0.14, 0.35, 0.08), top], 0.022, 20, 12), stalk));
      umbel(g, top, { rays: 16, len: 0.24, col: '#c8d88a', fr: 0.016, per: 14, seed: 6, stemCol: '#7a9a52' });
      leafAt(g, 0.15, 0.3, 0.5, '#4a7a32', 1.5, 'serrated'); leafAt(g, -0.4, 0.15, -0.8, '#4a7a32', 1.3, 'serrated');
      const root = M.std('#d8c49a', { roughness: 0.8, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 3 });
      const rg = new THREE.Group(); rhizomes(rg, root, { n: 5, r0: 0.035, len: 0.14, seed: 7, spread: 0.12 }); rg.position.set(0.4, 0, 0.3); g.add(rg);
      return g;
    }
    case 'myrtle': {
      for (let s = 0; s < 3; s++) sprig(g, [V3(-0.45 + s * 0.15, 0.02, 0.3 - s * 0.2), V3(-0.1 + s * 0.05, 0.15 + s * 0.04, 0.05 - s * 0.1), V3(0.25 + s * 0.05, 0.3 + s * 0.05, -0.1 - s * 0.05)], { col: '#2f5a2a', n: 12, size: 0.07, aspect: 2.4, pairs: true, gloss: 0.8, stemCol: '#6a4a3a', seed: s + 21 });
      const berry = new THREE.SphereGeometry(0.03, 16, 12); berry.scale(1, 1.15, 1);
      const bm = M.std('#2a2340', { roughness: 0.35, sheen: 1, sheenColor: new THREE.Color('#8a90c8'), sheenRoughness: 0.3 });
      for (let i = 0; i < 9; i++) g.add(place(mesh(berry, bm), 0.25 + (r() - 0.5) * 0.3, 0.03, 0.3 + (r() - 0.5) * 0.2));
      for (let i = 0; i < 2; i++) { const fl = flowerHead(ing, { petals: 5, len: 0.05, wid: 0.045, open: 1.4, cup: 0.4, centerR: 0.008, center: '#f2e6a8', colors: ['#fbf8f0', '#ffffff', '#efe2d0'] }); for (let k = 0; k < 40; k++) { const a = k * 2.4, d = 0.006 + (k % 6) * 0.004; fl.add(stem([V3(0, 0.005, 0), V3(Math.cos(a) * d, 0.03, Math.sin(a) * d), V3(Math.cos(a) * d * 1.6, 0.05, Math.sin(a) * d * 1.6)], 0.001, '#fbf6e0')); } g.add(place(fl, -0.15 + i * 0.25, 0.25 + i * 0.05, -0.05, -0.5, 0, 0.3)); }
      return g;
    }
    case 'immortelle': {
      const head = new THREE.CylinderGeometry(0.018, 0.012, 0.022, 14); const hm = M.std('#e8b51a', { roughness: 0.75, bumpMap: microTex('immort', 60, 0), bumpScale: 2, sheen: 0.4 });
      const stalks = M.std('#a8b09a', { roughness: 0.7, sheen: 1, sheenColor: new THREE.Color('#e8ece0') });
      for (let s = 0; s < 9; s++) {
        const x0 = (r() - 0.5) * 0.08, top = V3(-0.1 + (s % 3) * 0.1 + (r() - 0.5) * 0.06, 0.55 + r() * 0.12, (Math.floor(s / 3) - 1) * 0.08);
        g.add(mesh(tube([V3(x0, 0.02, 0.32), V3((x0 + top.x) / 2, 0.3, 0.15), top], 0.004, 12, 5), stalks));
        for (let k = 0; k < 9; k++) { const a = k * 2.4, d = 0.012 + Math.sqrt(k) * 0.016; g.add(place(mesh(head, hm), top.x + Math.cos(a) * d, top.y + 0.01 - d * 0.3, top.z + Math.sin(a) * d)); }
      }
      g.add(place(mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 24), M.std('#c9a874', { roughness: 0.9 })), -0.02, 0.2, 0.22, 0.6, 0, 0));
      return g;
    }
    case 'verbena': {
      for (let s = 0; s < 3; s++) sprig(g, [V3(-0.45 + s * 0.15, 0.02, 0.3 - s * 0.15), V3(-0.15 + s * 0.12, 0.2, 0.05 - s * 0.1), V3(0.1 + s * 0.12, 0.42 + s * 0.04, -0.1)], { col: '#6aa83a', n: 9, size: 0.07, aspect: 4, stemCol: '#7a8a4a', seed: s + 31, spread: 0.9 });
      const fl = flowerHead(ing, { petals: 4, len: 0.018, wid: 0.016, open: 1.4, centerR: 0.004, center: '#f0e0f0', colors: ['#e6d4ec', '#fbf6fc', '#c8a8d8'] });
      for (let i = 0; i < 30; i++) { const f = fl.clone(); f.position.set(0.4 + Math.cos(i * 2.4) * 0.02, 0.4 + i * 0.006, -0.08 + Math.sin(i * 2.4) * 0.02); f.rotation.set(Math.cos(i) * 0.8, 0, Math.sin(i) * 0.8); g.add(f); }
      g.add(stem([V3(0.3, 0.02, 0.1), V3(0.38, 0.2, 0), V3(0.4, 0.4, -0.08)], 0.005, '#7a8a4a'));
      return g;
    }
    case 'olive': {
      sprig(g, [V3(-0.55, 0.06, 0.25), V3(-0.15, 0.12, 0.05), V3(0.35, 0.2, -0.15)], { col: '#6a7a5a', n: 14, size: 0.05, aspect: 5.5, pairs: true, stemCol: '#8a7a6a', seed: 41, spread: 1.0 });
      const olive = new THREE.SphereGeometry(0.045, 24, 16); olive.scale(0.8, 0.8, 1.2);
      [['#5a6a2a', -0.2, 0.15], ['#3a2a3a', 0.0, 0.3], ['#2a1a26', 0.15, 0.25], ['#6a7a2a', -0.35, 0.35]].forEach(([c, x, z]) => g.add(place(mesh(olive, glossy(c, { roughness: 0.2 })), x, 0.04, z, 0, r() * TAU, 0)));
      glassOf(g, [[0, 0], [0.11, 0], [0.12, 0.015], [0.12, 0.16], [0.112, 0.16], [0.108, 0.015], [0, 0.015]], '#c8a828', 0.4, -0.3, 0.55);
      return g;
    }
    case 'tagetes': {
      const cols = ['#f08a14', '#ffc23a', '#c8501a'];
      flowersOnStems(g, [[roseHead(ing, { n: 46, open: 1.45, size: 0.15, kind: 'ruffle', ruffle: 1.4, colors: cols }), -0.2, 0, 0.42, 0.5, 1], [roseHead(ing, { n: 40, open: 1.4, size: 0.14, kind: 'ruffle', ruffle: 1.4, colors: ['#f6b21e', '#ffe07a', '#d8801a'] }), 0.22, -0.12, 0.36, 0.4, 1], [roseHead(ing, { n: 30, open: 1.2, size: 0.12, kind: 'ruffle', ruffle: 1.4, colors: cols }), 0.05, 0.2, 0.25, 0.8, 1]], { stemCol: '#4f7a3a' });
      for (let i = 0; i < 4; i++) leafAt(g, -0.3 + i * 0.2, 0.32, i * 0.9, '#3f6e2e', 0.9, 'serrated');
      return g;
    }
    case 'carrotseed': {
      g.add(dish(0.45, '#ece6da', false));
      const seed = displace(new THREE.SphereGeometry(0.012, 10, 8), 0.004, 60, 2, 3); seed.scale(1, 0.6, 1.6);
      const pp = pile(seed, M.std('#8a7452', { roughness: 0.85 }), 420, 0.34, 6, { height: 0.32 }); pp.position.y = 0.03; g.add(pp);
      for (let k = 0; k < 2; k++) { const top = V3(0.45 + k * 0.2, 0.5 - k * 0.1, -0.2 + k * 0.15); g.add(stem([V3(0.4, 0.02, 0.3), V3(0.45 + k * 0.1, 0.25, 0.05), top], 0.006, '#5f8a4a')); umbel(g, top, { rays: 22, len: 0.14, col: '#f8f5ec', fr: 0.008, per: 10, seed: 8 + k }); g.add(mesh(new THREE.SphereGeometry(0.008, 8, 6), M.std('#5a1a2a'), top.x, top.y + 0.085, top.z)); }
      return g;
    }
    case 'mate': {
      const gourd = new THREE.LatheGeometry([[0, 0], [0.1, 0.01], [0.17, 0.08], [0.19, 0.17], [0.16, 0.27], [0.11, 0.33], [0.1, 0.36], [0.105, 0.37], [0.09, 0.37]].map(([a, b]) => new THREE.Vector2(a, b)), 64);
      g.add(mesh(gourd, M.std('#7a4a26', { roughness: 0.4, clearcoat: 0.5, bumpMap: noiseTex('gourd', 12, 1), bumpScale: 1.5 }), -0.15, 0, 0));
      g.add(mesh(new THREE.TorusGeometry(0.1, 0.012, 10, 48).rotateX(Math.PI / 2), M.metal('#c8c8cc', 0.25), -0.15, 0.365, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.02, 40), M.std('#6a7a2a', { roughness: 0.9, bumpMap: microTex('yerba', 40, 0), bumpScale: 4 }), -0.15, 0.35, 0));
      const straw = mesh(tube([V3(-0.12, 0.2, 0), V3(-0.08, 0.45, 0), V3(-0.02, 0.62, 0.02)], 0.009, 20, 10), M.metal('#d8d8dc', 0.2)); g.add(straw);
      const flake = new THREE.BoxGeometry(0.03, 0.004, 0.02); const fp = pile(flake, M.std('#6f7f32', { roughness: 0.85 }), 260, 0.25, 7, { height: 0.25, flat: true }); fp.position.set(0.35, 0, 0.15); g.add(fp);
      leafAt(g, 0.3, -0.25, -0.5, '#2f5a2a', 0.9, 'serrated');
      return g;
    }
    case 'oak': {
      const staves = canvasTex('barrel', 512, 128, (c, W, H) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#9a6a3e' : '#8a5a32'; c.fillRect(i * W / 16, 0, W / 16, H); c.fillStyle = 'rgba(40,20,10,.5)'; c.fillRect(i * W / 16, 0, 2, H); } c.globalAlpha = 0.2; for (let i = 0; i < 300; i++) { c.fillStyle = '#3a2010'; c.fillRect(Math.random() * W, Math.random() * H, 1, 8 + Math.random() * 20); } });
      const barrel = new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.24, 0.12], [0.255, 0.25], [0.24, 0.38], [0.2, 0.5], [0, 0.5]].map(([a, b]) => new THREE.Vector2(a, b)), 64);
      g.add(place(mesh(barrel, M.std(0xffffff, { map: staves, roughness: 0.65, bumpMap: staves, bumpScale: 1 })), -0.15, 0.255, 0, 0, 0, Math.PI / 2));
      for (const y of [0.06, 0.16, 0.34, 0.44]) { const rr = 0.2 + 0.055 * Math.sin((y / 0.5) * Math.PI); g.add(place(mesh(new THREE.TorusGeometry(rr + 0.004, 0.008, 8, 48), M.metal('#3a3632', 0.5)), -0.15 - y, 0.255, 0, 0, Math.PI / 2, 0)); }
      const acorn = new THREE.Group(); const nut = new THREE.SphereGeometry(0.035, 20, 14); nut.scale(1, 1.35, 1); acorn.add(mesh(nut, glossy('#9a6a2a'), 0, 0.02, 0));
      const cup = new THREE.SphereGeometry(0.038, 20, 10, 0, TAU, 0, Math.PI / 2); acorn.add(mesh(cup, M.std('#7a6a4a', { roughness: 0.9, bumpMap: microTex('cupule', 40, 0), bumpScale: 4, side: THREE.DoubleSide }), 0, 0.035, 0));
      for (let i = 0; i < 3; i++) g.add(place(acorn.clone(), 0.15 + i * 0.09, 0.035, 0.3 - (i % 2) * 0.08, Math.PI / 2 - 0.3, i, 0));
      leafAt(g, 0.25, -0.15, -0.8, '#4f6e2e', 1.3, 'lobed'); leafAt(g, 0.05, 0.4, 0.6, '#8a7a3a', 1.1, 'lobed');
      return g;
    }
    case 'chamomile': {
      const daisy = () => { const h = flowerHead(ing, { petals: 18, len: 0.08, wid: 0.022, kind: 'long', open: 1.62, cup: 0.2, centerR: 0, colors: ['#fbfbf6', '#ffffff', '#efece0'] }); const c = new THREE.SphereGeometry(0.03, 20, 14, 0, TAU, 0, Math.PI / 2); c.scale(1, 1.3, 1); h.add(mesh(c, M.std('#f2c21a', { roughness: 0.7, bumpMap: microTex('disc', 50, 0), bumpScale: 3 }), 0, 0.003, 0)); return h; };
      flowersOnStems(g, [[daisy(), -0.25, 0, 0.42, 0.5, 1], [daisy(), 0.05, -0.1, 0.5, 0.4, 1], [daisy(), 0.3, 0.05, 0.38, 0.6, 1], [daisy(), -0.05, 0.2, 0.3, 0.8, 0.9], [daisy(), 0.2, -0.25, 0.28, 0.3, 0.85]], { stemCol: '#6a9a4a' });
      const head = new THREE.SphereGeometry(0.02, 12, 10); const dp = pile(head, M.std('#d8b84a', { roughness: 0.9 }), 40, 0.15, 3, { height: 0.12 }); dp.position.set(0.45, 0, 0.35); g.add(dp);
      return g;
    }
    case 'cognac': {
      glassOf(g, [[0, 0], [0.08, 0], [0.09, 0.012], [0.02, 0.025], [0.012, 0.06], [0.012, 0.12], [0.08, 0.15], [0.15, 0.24], [0.16, 0.32], [0.13, 0.42], [0.1, 0.46]], '#a8501a', -0.15, 0, 0.62);
      const grape = new THREE.SphereGeometry(0.035, 20, 14); grape.scale(1, 1.1, 1);
      const gm = M.std('#c8cc7a', { roughness: 0.25, clearcoat: 0.6, sheen: 1, sheenColor: new THREE.Color('#eef0d8'), sheenRoughness: 0.5 });
      for (let i = 0; i < 18; i++) { const row = Math.floor(Math.sqrt(i * 2)), y = 0.04 + (5 - row) * 0.035; g.add(place(mesh(grape, gm), 0.3 + (r() - 0.5) * 0.06 * (6 - row), y * 0.6 + 0.03, 0.15 + (r() - 0.5) * 0.08, 0, 0, 0)); }
      leafAt(g, 0.42, 0.35, -0.4, '#5a7a32', 1.3, 'lobed');
      return g;
    }
    case 'whisky': {
      glassOf(g, [[0, 0], [0.13, 0], [0.14, 0.02], [0.15, 0.22], [0.14, 0.22], [0.13, 0.04], [0, 0.04]], '#b8661c', 0.25, 0.2, 0.42);
      const ice = new RoundedBoxGeometry(0.07, 0.07, 0.07, 3, 0.012); g.add(place(mesh(ice, new THREE.MeshPhysicalMaterial({ color: '#eef6fa', roughness: 0.1, transmission: 0.9, thickness: 0.07, ior: 1.31 })), 0.25, 0.1, 0.2, 0.3, 0.5, 0.2));
      const bottle = [[0, 0], [0.13, 0], [0.135, 0.02], [0.135, 0.45], [0.1, 0.52], [0.045, 0.58], [0.04, 0.72], [0.045, 0.74]];
      g.add(mesh(lathe(bottle), M.shell({ opacity: 0.3, color: '#cfe0c8' }), -0.15, 0, -0.05));
      g.add(mesh(lathe(bottle, 0.88, 0.02, 0.42), M.juice('#a4561a', { emissive: new THREE.Color('#2a1004') }), -0.15, 0.02, -0.05));
      g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 20), M.std('#2a1a10'), -0.15, 0.77, -0.05));
      const peat = displace(new THREE.BoxGeometry(0.24, 0.08, 0.12, 8, 3, 4), 0.012, 6, 3, 2); g.add(place(mesh(peat, M.std('#3a2a1c', { roughness: 0.98, bumpMap: noiseTex('peat', 20, 2), bumpScale: 5 })), 0.3, 0.04, -0.25, 0, 0.4, 0));
      return g;
    }
    case 'cade': case 'amyris': case 'cypriol': {
      if (id === 'amyris') return woods(ing);
      if (id === 'cypriol') {
        const tuber = M.std('#3a2418', { roughness: 0.85, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 4 });
        const tg = new THREE.Group(); rhizomes(tg, tuber, { n: 14, r0: 0.03, len: 0.05, seed: 9, spread: 0.2 }); tg.position.set(0.25, 0, 0.2); g.add(tg);
        const geos = []; for (let i = 0; i < 40; i++) { const a = r() * TAU; geos.push(tube([V3(0.25, 0.02, 0.2), V3(0.25 + Math.cos(a) * 0.15, 0.01, 0.2 + Math.sin(a) * 0.15), V3(0.25 + Math.cos(a + 0.4) * 0.26, 0.005, 0.2 + Math.sin(a + 0.4) * 0.26)], 0.0025, 8, 4).toNonIndexed()); }
        g.add(mesh(mergeGeometries(geos), M.std('#6a4a32', { roughness: 0.9 })));
        const top = V3(-0.25, 0.85, -0.05); g.add(mesh(tube([V3(-0.3, 0.02, 0.1), V3(-0.27, 0.4, 0.03), top], 0.016, 20, 3), M.std('#6a9a3a', { roughness: 0.5 })));
        const rays = []; for (let i = 0; i < 90; i++) { const a = i * 2.39996, el = 0.2 + (i % 7) * 0.12, L = 0.18 + r() * 0.06, e = V3(top.x + Math.cos(a) * Math.cos(el) * L, top.y + Math.sin(el) * L * 0.6 - L * 0.25 * (1 - Math.sin(el)), top.z + Math.sin(a) * Math.cos(el) * L); rays.push(tube([top, top.clone().lerp(e, 0.5).add(V3(0, 0.04, 0)), e], 0.002, 8, 3).toNonIndexed()); }
        g.add(mesh(mergeGeometries(rays), M.std('#8ab04a', { roughness: 0.55 })));
        return g;
      }
      const wood = M.std('#a8603a', { roughness: 0.8, bumpMap: noiseTex('bark', 20, 2.2, [3, 1]), bumpScale: 4 });
      const end = M.std(0xffffff, { map: ringTex('#d89a68', '#8a4a2a', 'cade'), roughness: 0.7 });
      for (let i = 0; i < 3; i++) g.add(place(mesh(displace(new THREE.CylinderGeometry(0.07, 0.075, 0.6, 24, 6), 0.01, 5, 2, i), [wood, end, end]), -0.3 + i * 0.06, 0.07 + (i === 2 ? 0.12 : 0), -0.1 + i * 0.13 - (i === 2 ? 0.07 : 0), Math.PI / 2, 0.3, 0));
      const tar = new THREE.Group(); tar.add(dish(0.25, '#222', true)); tar.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 48), M.std('#1a0c06', { roughness: 0.04, clearcoat: 1, sheen: 0.3, sheenColor: new THREE.Color('#6a2a10') }), 0, 0.03, 0)); g.add(place(tar, 0.35, 0, 0.3));
      const needle = new THREE.CapsuleGeometry(0.004, 0.05, 2, 4); const np = pile(needle, M.std('#4a6a4a', { roughness: 0.6 }), 60, 0.15, 3, { height: 0.04, flat: true }); np.position.set(0.4, 0, -0.25); g.add(np);
      return g;
    }
    case 'turmeric': {
      const skin = M.std('#a8763a', { roughness: 0.8, bumpMap: noiseTex('ginger', 40, 1.6), bumpScale: 2 });
      const rg = new THREE.Group(); rhizomes(rg, skin, { n: 7, r0: 0.03, len: 0.14, seed: 12, spread: 0.18 }); rg.position.set(-0.25, 0, 0); g.add(rg);
      const slice = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 24); for (let i = 0; i < 4; i++) g.add(place(mesh(slice, M.std('#f08a0a', { roughness: 0.35, clearcoat: 0.6, emissive: new THREE.Color('#3a1400') })), 0.05 + i * 0.07, 0.007, 0.35 - (i % 2) * 0.05, 0, 0, 0));
      g.add(place(dish(0.28, '#efe8dc', false), 0.35, 0, -0.1));
      const mound = displace(new THREE.ConeGeometry(0.2, 0.14, 48, 8), 0.006, 30, 2, 3); g.add(mesh(mound, M.std('#f2a20c', { roughness: 0.95, bumpMap: microTex('powder', 80, 0), bumpScale: 2 }), 0.35, 0.095, -0.1));
      return g;
    }
    case 'civet': {
      const pot = new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.18, 0.02], [0.19, 0.14], [0.17, 0.17], [0.16, 0.18], [0.15, 0.18], [0.155, 0.16], [0.165, 0.14], [0.16, 0.03], [0, 0.03]].map(([a, b]) => new THREE.Vector2(a, b)), 64);
      g.add(mesh(pot, M.std('#3a3a40', { roughness: 0.3, clearcoat: 0.8 }), -0.2, 0, 0));
      g.add(mesh(displace(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 48, 2), 0.006, 8, 2, 4), M.std('#4a3218', { roughness: 0.2, clearcoat: 0.9 }), -0.2, 0.15, 0));
      g.add(place(mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.4, 12), M.std('#c9a874', { roughness: 0.7 })), -0.08, 0.27, 0.02, 0, 0, -0.7));
      g.add(dish(0.3, '#34343a', false).translateX(0.35).translateZ(0.2));
      const crystal = new THREE.OctahedronGeometry(0.025, 0); crystal.scale(1, 1.6, 1);
      const pp = pile(crystal, new THREE.MeshPhysicalMaterial({ color: '#f4f0e8', roughness: 0.2, clearcoat: 1, iridescence: 0.5, sheen: 0.5 }), 120, 0.22, 4, { height: 0.35 }); pp.position.set(0.35, 0.03, 0.2); g.add(pp);
      return g;
    }
    case 'spikenard': case 'costus': {
      if (id === 'spikenard') {
        for (let k = 0; k < 4; k++) {
          const core = displace(new THREE.CapsuleGeometry(0.04, 0.12, 6, 12), 0.01, 8, 2, k), x = -0.3 + k * 0.2, z = (k % 2) * 0.15;
          g.add(place(mesh(core, M.std('#5a3020', { roughness: 0.9 })), x, 0.05, z, Math.PI / 2, k, 0));
          const geos = []; for (let i = 0; i < 70; i++) { const a = r() * TAU, y0 = (r() - 0.5) * 0.12, p0 = V3(x + Math.cos(a) * 0.03, 0.05 + y0 * 0.2, z + Math.sin(a) * 0.03 + y0); geos.push(tube([p0, p0.clone().add(V3(Math.cos(a) * 0.04, 0.03, Math.sin(a) * 0.04)), p0.clone().add(V3(Math.cos(a + 0.5) * 0.07, 0.02 + r() * 0.04, Math.sin(a + 0.5) * 0.07))], 0.0025, 8, 3).toNonIndexed()); }
          g.add(mesh(mergeGeometries(geos), M.std('#8a4a2a', { roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color('#c88a5a') })));
        }
        return g;
      }
      const root = M.std('#8a7460', { roughness: 0.9, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 4 });
      for (let i = 0; i < 7; i++) { const geo = blob(0.06 + r() * 0.03, 0.025, 6, i, 3); geo.scale(1.6, 0.8, 1); g.add(place(mesh(geo, root), -0.35 + (i % 4) * 0.15, 0.05, -0.1 + Math.floor(i / 4) * 0.18, 0, r() * TAU, 0)); }
      g.add(place(dish(0.26, '#efe8dc', false), 0.38, 0, 0.25));
      g.add(mesh(displace(new THREE.ConeGeometry(0.18, 0.1, 48, 6), 0.005, 30, 2, 2), M.std('#b8a488', { roughness: 0.95 }), 0.38, 0.075, 0.25));
      return g;
    }
    case 'boronia': {
      const bell = new THREE.LatheGeometry([[0.002, 0], [0.02, 0.004], [0.03, 0.018], [0.032, 0.03]].map(([a, b]) => new THREE.Vector2(a, b)), 20);
      const out = M.std('#5a1e1e', { roughness: 0.4, side: THREE.FrontSide, sheen: 0.6, sheenColor: new THREE.Color('#b05a3a') }), inn = M.std('#e8c21a', { roughness: 0.5, side: THREE.BackSide });
      const needle = new THREE.CapsuleGeometry(0.003, 0.04, 2, 4); needle.translate(0, 0.02, 0);
      for (let s = 0; s < 5; s++) {
        const x0 = -0.3 + s * 0.15, top = 0.45 + r() * 0.2, pts = [V3(x0, 0.02, 0.25), V3(x0 + 0.05, top * 0.5, 0.08), V3(x0 + 0.08, top, -0.05)];
        g.add(stem(pts, 0.005, '#5a4a3a'));
        const curve = new THREE.CatmullRomCurve3(pts), im = new THREE.InstancedMesh(needle, M.std('#3f5a32', { roughness: 0.55 }), 50), m4 = new THREE.Matrix4();
        for (let i = 0; i < 50; i++) { const p = curve.getPointAt(0.2 + (i / 50) * 0.8), a = i * 2.4; m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.8 * Math.cos(a), a, 0.8 * Math.sin(a))), V3(1, 1, 1)); im.setMatrixAt(i, m4); }
        g.add(im);
        for (let k = 0; k < 7; k++) { const p = curve.getPointAt(0.35 + k * 0.09), b = new THREE.Group(); b.add(mesh(bell, out)); b.add(mesh(bell, inn)); b.add(stem([V3(0, 0, 0), V3(0, -0.015, 0), V3(0, -0.03, 0.01)], 0.0015, '#5a4a3a')); b.position.set(p.x + Math.cos(k * 2.3) * 0.03, p.y - 0.03, p.z + Math.sin(k * 2.3) * 0.03); b.rotation.set(Math.PI + 0.3 * Math.cos(k), 0, 0.3 * Math.sin(k)); g.add(b); }
      }
      return g;
    }
    case 'karokarounde': {
      const cols = ['#fbfbf4', '#ffffff', '#f0ecd8'];
      const star = () => { const h = new THREE.Group(); h.add(mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.1, 8), M.std('#f4f0e0'), 0, -0.05, 0)); const f = flowerHead(ing, { petals: 6, len: 0.14, wid: 0.034, kind: 'long', open: 1.55, cup: 0.5, twist: 0.4, droop: 0.15, centerR: 0.008, center: '#f2e6b0', colors: cols }); h.add(f); h.scale.setScalar(1.35); return h; };
      for (let s = 0; s < 2; s++) {
        const pts = [V3(-0.45 + s * 0.25, 0.02, 0.3 - s * 0.35), V3(-0.1 + s * 0.15, 0.15, 0.05 - s * 0.2), V3(0.2 + s * 0.15, 0.3, -0.05 - s * 0.1)];
        const curve = sprig(g, pts, { col: '#2f5a2a', n: 5, size: 0.13, aspect: 2, pairs: true, gloss: 0.8, stemCol: '#6a5a4a', seed: s + 51 });
        const end = curve.getPointAt(1); for (let k = 0; k < 5; k++) { const f = star(); f.position.set(end.x + Math.cos(k * 1.3) * 0.06, end.y + 0.05 + (k % 2) * 0.03, end.z + Math.sin(k * 1.3) * 0.06); f.rotation.set(-0.4 + Math.cos(k) * 0.4, 0, Math.sin(k) * 0.4); g.add(f); }
      }
      return g;
    }
    case 'buchu': {
      const leaf = new THREE.SphereGeometry(0.018, 10, 8); leaf.scale(1, 0.25, 1.5); leaf.translate(0, 0, 0.02);
      const lm = M.std('#3f6a2a', { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
      const fl = flowerHead(ing, { petals: 5, len: 0.022, wid: 0.016, open: 1.4, centerR: 0.004, center: '#6a3a5a', colors: ['#f2d4e6', '#fff6fb', '#d89ac0'] });
      for (let s = 0; s < 6; s++) {
        const x0 = -0.3 + s * 0.12, top = 0.38 + r() * 0.2, lean = (r() - 0.5) * 0.3, pts = [V3(x0, 0.02, 0.25), V3(x0 + lean * 0.4, top * 0.5, 0.1), V3(x0 + lean, top, 0)];
        g.add(stem(pts, 0.005, '#7a4a3a'));
        const curve = new THREE.CatmullRomCurve3(pts), n = 40, im = new THREE.InstancedMesh(leaf, lm, n), m4 = new THREE.Matrix4();
        for (let i = 0; i < n; i++) { const p = curve.getPointAt(0.2 + (i / n) * 0.8), a = i * 2.4; m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.6, a, 0)), V3(1, 1, 1)); im.setMatrixAt(i, m4); }
        im.castShadow = true; g.add(im);
        for (let k = 0; k < 3; k++) { const f = fl.clone(); f.position.copy(curve.getPointAt(0.6 + k * 0.17)).add(V3(Math.cos(k * 2) * 0.025, 0.01, Math.sin(k * 2) * 0.025)); f.rotation.set(Math.cos(k) * 0.6, 0, Math.sin(k) * 0.6); g.add(f); }
      }
      return g;
    }
    case 'cascarilla': {
      const bark = canvasTex('cascarilla', 256, 256, (c, W) => { c.fillStyle = '#8a7a6a'; c.fillRect(0, 0, W, W); for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(${Math.random() > 0.5 ? '236,232,220' : '60,50,40'},${0.3 + Math.random() * 0.5})`; c.beginPath(); c.ellipse(Math.random() * W, Math.random() * W, 2 + Math.random() * 7, 1 + Math.random() * 3, 0, 0, TAU); c.fill(); } });
      const sp = new THREE.Shape(); const steps = 50; for (let i = 0; i <= steps; i++) { const a = (i / steps) * 1.4 * TAU, rr = 0.03 + 0.012 * (i / steps); sp.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } for (let i = steps; i >= 0; i--) { const a = (i / steps) * 1.4 * TAU, rr = 0.037 + 0.012 * (i / steps); sp.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      const quill = new THREE.ExtrudeGeometry(sp, { depth: 0.6, bevelEnabled: false, curveSegments: 4 }); quill.translate(0, 0, -0.3);
      const mat = M.std(0xffffff, { map: bark, roughness: 0.85, bumpMap: bark, bumpScale: 3 });
      for (let i = 0; i < 6; i++) g.add(place(mesh(quill, [mat, M.std('#6a4a32', { roughness: 0.8 })]), -0.25 + i * 0.09, 0.05 + (i % 2) * 0.05, (r() - 0.5) * 0.2, 0, 0.4 + (r() - 0.5) * 0.3, r() * TAU));
      const chip = displace(new THREE.BoxGeometry(0.05, 0.012, 0.03, 3, 1, 2), 0.004, 12, 2, 2); const cp = pile(chip, M.std('#7a5a42', { roughness: 0.85 }), 30, 0.15, 4, { height: 0.06, flat: true }); cp.position.set(0.4, 0, 0.3); g.add(cp);
      return g;
    }
    case 'copaiba': {
      g.add(dish(0.42, '#fff', true));
      const pool = displace(new THREE.SphereGeometry(0.36, 48, 24, 0, TAU, 0, Math.PI / 2), 0.012, 4, 2, 2); pool.scale(1, 0.16, 1);
      g.add(mesh(pool, M.liquid('#d8a02a', { transmission: 0.5, roughness: 0.02, clearcoat: 1, attenuationDistance: 0.3 }), 0, 0.025, 0));
      const bark = M.std('#6a5a42', { roughness: 0.95, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 4 }), end = M.std(0xffffff, { map: ringTex('#d8b88a', '#9a6a3a', 'copaiba'), roughness: 0.7 });
      g.add(place(mesh(displace(new THREE.CylinderGeometry(0.14, 0.15, 0.22, 32, 4), 0.01, 5, 2, 3), [bark, end, end]), 0.5, 0.11, -0.25));
      g.add(mesh(tube([V3(0.5, 0.22, -0.11), V3(0.52, 0.12, -0.1), V3(0.53, 0.02, -0.09)], 0.01, 12, 8, 0.4), M.liquid('#d8a02a', { transmission: 0.5, clearcoat: 1, attenuationDistance: 0.1 })));
      return g;
    }
    case 'truffle': {
      g.add(dish(0.5, '#efe8dc', false));
      const tm = M.std('#c8aa78', { roughness: 0.85, bumpMap: noiseTex('truffle', 50, 2), bumpScale: 4 });
      [[-0.2, 0.05, 0.13], [0.12, -0.12, 0.1], [0.05, 0.22, 0.08]].forEach(([x, z, s], i) => { const geo = blob(s, s * 0.22, 3.5, i + 2, 5); geo.scale(1.15, 0.85, 1); g.add(mesh(geo, tm, x, s * 0.85 + 0.02, z)); });
      const marble = canvasTex('trufflecut', 256, 256, (c, W) => { c.fillStyle = '#d8c09a'; c.fillRect(0, 0, W, W); c.strokeStyle = 'rgba(250,244,230,.85)'; c.lineWidth = 2; for (let i = 0; i < 40; i++) { c.beginPath(); let x = Math.random() * W, y = Math.random() * W; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; c.lineTo(x, y); } c.stroke(); } });
      for (let i = 0; i < 5; i++) { const sl = new THREE.CylinderGeometry(0.07, 0.07, 0.004, 32); sl.scale(1.15, 1, 1); g.add(place(mesh(sl, M.std(0xffffff, { map: marble, roughness: 0.6 })), 0.55 + (i % 2) * 0.05, 0.004 + i * 0.004, 0.25 - i * 0.03, 0, i * 0.4, 0)); }
      return g;
    }
    case 'chestnut': {
      const nut = new THREE.SphereGeometry(0.07, 32, 24); { const p = nut.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); p.setZ(i, z > 0 ? z * 0.45 : z); if (y > 0.04) { p.setX(i, p.getX(i) * (1 - (y - 0.04) * 8)); p.setZ(i, p.getZ(i) * (1 - (y - 0.04) * 8)); } } nut.computeVertexNormals(); }
      const nm = M.std('#5a2a14', { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.2, bumpMap: noiseTex('chest', 10, 1, [1, 4]), bumpScale: 1 });
      [[-0.3, 0.1, 0.3, 0.3], [-0.1, 0.25, -0.4, -1.2], [0.1, 0.35, 0.2, 0.6], [-0.4, -0.15, 0.9, 1.1]].forEach(([x, z, ry, rx]) => g.add(place(mesh(nut, nm), x, 0.04, z, rx, ry, 0)));
      const burr = new THREE.Group(); const husk = new THREE.SphereGeometry(0.15, 32, 16, 0, TAU, 0, Math.PI * 0.62); burr.add(mesh(husk, M.std('#8aa83a', { roughness: 0.6, side: THREE.DoubleSide })));
      const spike = new THREE.ConeGeometry(0.004, 0.08, 4); spike.translate(0, 0.04, 0); const im = new THREE.InstancedMesh(spike, M.std('#a8b85a', { roughness: 0.5 }), 260), m4 = new THREE.Matrix4(), up = V3(0, 1, 0);
      for (let i = 0; i < 260; i++) { const t = Math.acos(1 - r() * (1 - Math.cos(Math.PI * 0.6))), a = r() * TAU, n = V3(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)); m4.compose(n.clone().multiplyScalar(0.15), new THREE.Quaternion().setFromUnitVectors(up, n), V3(1, 1, 1)); im.setMatrixAt(i, m4); }
      im.castShadow = true; burr.add(im); burr.add(place(mesh(nut, nm), 0, 0.02, 0, -Math.PI / 2, 0, 0, 1.2));
      g.add(place(burr, 0.3, 0.14, -0.05, Math.PI - 0.3, 0.5, 0));
      return g;
    }
  }
  return fourthNotes(ing);
}

// ── specimens for the fourth wave of notes ─────────────────
// one merged geometry for a small open floret, so hundreds can be instanced
function floretGeo({ petals = 4, len = 0.03, wid = 0.024, open = 1.3, cup = 0.5, twist = 0, droop = 0 } = {}) {
  const parts = [];
  for (let i = 0; i < petals; i++) { const p = bendPlane(wid, len, { cup, twist, droop, seed: i }); p.rotateX(open); p.rotateY((i / petals) * TAU); parts.push(p); }
  return mergeGeometries(parts);
}
// a pea flower: an upright banner, two wings and a keel
function peaGeo(s = 1) {
  const banner = bendPlane(0.06 * s, 0.055 * s, { cup: 0.7, curl: -0.3 }); banner.rotateX(-0.25); banner.translate(0, 0, -0.008 * s);
  const wl = bendPlane(0.03 * s, 0.045 * s, { cup: 0.9 }); wl.rotateX(1.2); wl.rotateY(0.7);
  const wr = bendPlane(0.03 * s, 0.045 * s, { cup: 0.9 }); wr.rotateX(1.2); wr.rotateY(-0.7);
  const keel = bendPlane(0.022 * s, 0.04 * s, { cup: 1.4 }); keel.rotateX(1.45);
  return mergeGeometries([banner, wl, wr, keel]);
}
// place copies of a geometry: each entry is [position, direction the copy's +y faces, scale, spin about that axis]
function instances(g, geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), up = V3(0, 1, 0), q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  list.forEach(([p, d, s, spin = 0], i) => { q.setFromUnitVectors(up, d.clone().normalize()); q2.setFromAxisAngle(up, spin); q.multiply(q2); m4.compose(p, q, V3(s, s, s)); im.setMatrixAt(i, m4); });
  im.castShadow = true; im.receiveShadow = true; g.add(im); return im;
}
// a cone of florets along an axis (lilac panicles stand up, wisteria racemes hang down)
function raceme(g, base, axis, L, R, n, geo, mat, { seed = 1, s = 1, stemCol = '#6a7a4a', taper = 0.8 } = {}) {
  const r = rng(seed), a = axis.clone().normalize(), t1 = Math.abs(a.x) > 0.9 ? V3(0, 0, 1) : V3(1, 0, 0);
  const u = t1.clone().cross(a).normalize(), w = a.clone().cross(u), list = [];
  g.add(mesh(tube([base, base.clone().addScaledVector(a, L * 0.5), base.clone().addScaledVector(a, L)], 0.005, 12, 6, 0.6), M.std(stemCol, { roughness: 0.6 })));
  for (let i = 0; i < n; i++) {
    const t = Math.pow(r(), 0.85), ang = i * 2.39996, rad = R * (1 - t * taper) * (0.55 + r() * 0.45);
    const o = u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(w, Math.sin(ang));
    list.push([base.clone().addScaledVector(a, L * t).addScaledVector(o, rad), o.clone().multiplyScalar(0.8).addScaledVector(a, 0.45), s * (0.8 + r() * 0.35) * (1 - t * 0.3), r() * TAU]);
  }
  return instances(g, geo, mat, list);
}
// a flared trumpet with pointed lobes at the mouth (datura, tobacco flower)
function trumpetGeo(len, r0, r1, { lobes = 5, tip = 0.25 } = {}) {
  const prof = []; for (let i = 0; i <= 18; i++) { const t = i / 18; prof.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(t, 3.2), len * t)); }
  const geo = new THREE.LatheGeometry(prof, 64), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = y / len, lobe = Math.pow(Math.abs(Math.cos(Math.atan2(z, x) * lobes / 2)), 4), k = 1 + Math.pow(t, 4) * tip * lobe;
    p.setXYZ(i, x * k, y + Math.pow(t, 4) * lobe * len * 0.08, z * k);
  }
  geo.computeVertexNormals(); return geo;
}
const gradTex = (key, stops) => canvasTex(key, 8, 128, (c, W, H) => { const gr = c.createLinearGradient(0, H, 0, 0); stops.forEach(([t, col]) => gr.addColorStop(t, col)); c.fillStyle = gr; c.fillRect(0, 0, W, H); });
function segmented(len, r0, nodes, { ridge = 0.06, groove = 0 } = {}) {
  const geo = new THREE.CylinderGeometry(r0, r0 * 1.04, len, 32, nodes * 6), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = ((y / len + 0.5) * nodes) % 1, bump = 1 + ridge * Math.exp(-((t - 0.02) ** 2) * 900) - ridge * 0.3 * Math.exp(-((t - 0.97) ** 2) * 400);
    const gr = groove ? 1 - groove * Math.pow(Math.abs(Math.cos(Math.atan2(z, x) * 6)), 6) : 1;
    p.setXYZ(i, x * bump * gr, y, z * bump * gr);
  }
  geo.computeVertexNormals(); return geo;
}
function spikyPod(g, R, col, spikeCol, n, x, y, z) {
  const pod = new THREE.Group(); pod.add(mesh(new THREE.SphereGeometry(R, 32, 24), M.std(col, { roughness: 0.5 })));
  const spike = new THREE.ConeGeometry(R * 0.06, R * 0.45, 5); spike.translate(0, R * 0.2, 0);
  const list = []; for (let i = 0; i < n; i++) { const t = Math.acos(1 - 2 * (i + 0.5) / n), a = i * 2.39996, d = V3(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)); list.push([d.clone().multiplyScalar(R * 0.95), d, 1]); }
  instances(pod, spike, M.std(spikeCol, { roughness: 0.5 }), list); pod.position.set(x, y, z); g.add(pod); return pod;
}
function cutFace(key, draw) { return canvasTex(key, 256, 256, (c, W) => draw(c, W)); }

function fourthNotes(ing) {
  const id = ing.id, r = rng(hash(id)), g = new THREE.Group(), [c0, c1, c2] = ing.c;
  const glossy = (c, o = {}) => M.std(c, { roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.18, ...o });
  switch (id) {
    case 'lily': {
      const cols = ['#fffdf6', '#ffffff', '#e8efc8'];
      const head = () => { const h = new THREE.Group(); h.add(flowerHead(ing, { petals: 6, len: 0.3, wid: 0.1, kind: 'long', open: 1.15, cup: 0.7, twist: 0.15, droop: 0.35, centerR: 0.014, center: '#cfe08a', colors: cols }));
        for (let k = 0; k < 6; k++) { const a = k * TAU / 6, e = V3(Math.cos(a) * 0.07, 0.17, Math.sin(a) * 0.07); h.add(stem([V3(0, 0, 0), V3(e.x * 0.5, 0.1, e.z * 0.5), e], 0.0025, '#e8eac0')); h.add(place(mesh(new THREE.CapsuleGeometry(0.008, 0.026, 4, 8), M.std('#a0461e', { roughness: 0.9 })), e.x, e.y + 0.004, e.z, 0, a, Math.PI / 2)); }
        h.add(stem([V3(0, 0, 0), V3(0.01, 0.1, 0), V3(0.015, 0.2, 0.01)], 0.004, '#d8e8a0')); return h; };
      const s = [V3(0.05, 0.02, 0.3), V3(0.0, 0.3, 0.1), V3(-0.05, 0.62, -0.05)]; sprig(g, s, { col: '#3f7a2e', n: 12, size: 0.05, aspect: 5, stemCol: '#4f7a3a', r0: 0.011, spread: 0.9, seed: 4 });
      const top = s[2];
      [[-0.22, 0.04, -0.05, 0.9, 0.5], [0.2, -0.02, 0.06, 0.7, -0.4]].forEach(([dx, dy, dz, rx, rz], i) => { const h = head(); g.add(stem([top, top.clone().add(V3(dx * 0.5, 0.05, dz)), top.clone().add(V3(dx, dy, dz))], 0.007, '#4f7a3a')); place(h, top.x + dx, top.y + dy, top.z + dz, rx, i * 1.3, rz, 1.35 - i * 0.12); g.add(h); });
      const bud = new THREE.CapsuleGeometry(0.03, 0.16, 8, 16); bud.scale(1, 1, 1); g.add(place(mesh(bud, M.std('#e6efc8', { roughness: 0.5, sheen: 0.6 })), top.x + 0.02, top.y + 0.14, top.z - 0.05, -0.3, 0, 0.2));
      return g;
    }
    case 'lilac': {
      const geo = floretGeo({ petals: 4, len: 0.032, wid: 0.028, open: 1.45, cup: 0.6 });
      const mats = [M.petal('#b48ad8', '#e2cdf2', '#8a5ab8'), M.petal('#c8a2e2', '#f0e2fa', '#9a6ac8')];
      [[V3(-0.12, 0.3, 0), V3(-0.15, 1, 0.1), 0.42], [V3(0.16, 0.24, -0.05), V3(0.25, 1, -0.05), 0.36]].forEach(([b, a, L], i) => { g.add(stem([V3(b.x * 0.6, 0.02, 0.2), V3(b.x * 0.9, b.y * 0.5, 0.1), b], 0.012, '#6a5a3a')); raceme(g, b, a, L, 0.14, 260, geo, mats[i], { seed: 3 + i, s: 1, stemCol: '#7a6a5a' }); });
      leafAt(g, 0.0, 0.3, 0.3, '#3f6e2e', 1.3, 'heart', 0.02); leafAt(g, -0.35, 0.15, -0.9, '#3f6e2e', 1.1, 'heart'); leafAt(g, 0.35, 0.2, 1.2, '#3f6e2e', 1.15, 'heart');
      return g;
    }
    case 'wisteria': {
      const branch = [V3(-0.55, 0.78, 0), V3(-0.2, 0.84, 0.05), V3(0.15, 0.76, -0.04), V3(0.5, 0.82, 0.02)];
      g.add(mesh(tube(branch, 0.025, 30, 10), M.std('#5a4a3e', { roughness: 0.9, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 3 })));
      const geo = peaGeo(0.7), curve = new THREE.CatmullRomCurve3(branch);
      const mats = [M.petal('#9a7ad8', '#d8c8f4', '#6a4ab0'), M.petal('#b49ae2', '#ece2fa', '#7a5ac0')];
      for (let i = 0; i < 6; i++) { const b = curve.getPointAt(0.08 + i * 0.16); raceme(g, b.clone().add(V3(0, -0.02, (i % 2) * 0.05 - 0.03)), V3((r() - 0.5) * 0.15, -1, (r() - 0.5) * 0.1), 0.42 + r() * 0.2, 0.08, 120, geo, mats[i % 2], { seed: 9 + i, stemCol: '#8a7a5a', taper: 0.9 }); }
      for (let i = 0; i < 3; i++) sprig(g, [curve.getPointAt(0.2 + i * 0.3), curve.getPointAt(0.2 + i * 0.3).add(V3(0.08, 0.12, 0.05)), curve.getPointAt(0.2 + i * 0.3).add(V3(0.18, 0.16, 0.1))], { col: '#5a8a3a', n: 9, size: 0.05, aspect: 2.2, pairs: true, stemCol: '#6a7a4a', r0: 0.004, seed: 30 + i });
      return g;
    }
    case 'hawthorn': {
      const bark = '#4a3a30', twig = [V3(-0.5, 0.05, 0.2), V3(-0.15, 0.3, 0.05), V3(0.15, 0.42, -0.05), V3(0.45, 0.6, -0.1)];
      g.add(mesh(tube(twig, 0.018, 30, 8, 0.5), M.std(bark, { roughness: 0.85 })));
      const curve = new THREE.CatmullRomCurve3(twig), geo = floretGeo({ petals: 5, len: 0.03, wid: 0.032, open: 1.5, cup: 0.4 }), pm = M.petal('#fbf8f2', '#ffffff', '#f2e4e0');
      const anther = new THREE.SphereGeometry(0.004, 6, 4), am = M.std('#b0485a', { roughness: 0.6 }), fl = [], an = [];
      for (let c = 0; c < 4; c++) {
        const base = curve.getPointAt(0.25 + c * 0.22).add(V3(0, 0.08, (c % 2 ? 1 : -1) * 0.06));
        g.add(stem([curve.getPointAt(0.22 + c * 0.22), base], 0.005, '#5a4a3a'));
        for (let k = 0; k < 14; k++) { const a = k * 2.39996, d = 0.1 * Math.sqrt(k / 14), p = base.clone().add(V3(Math.cos(a) * d, 0.03 - d * 0.3, Math.sin(a) * d)); fl.push([p, V3(Math.cos(a) * d * 2, 1, Math.sin(a) * d * 2), 1.7, r() * TAU]); for (let m = 0; m < 5; m++) an.push([p.clone().add(V3(Math.cos(m * 1.26 + a) * 0.013, 0.02, Math.sin(m * 1.26 + a) * 0.013)), V3(0, 1, 0), 1.3]); }
      }
      instances(g, geo, pm, fl); instances(g, anther, am, an);
      for (let i = 0; i < 7; i++) { const p = curve.getPointAt(0.1 + i * 0.12); leafAt(g, p.x, p.z + (i % 2 ? 0.08 : -0.08), i * 1.3, '#3f6e2e', 0.55, 'lobed', p.y, -0.6 + (i % 2) * 0.3); }
      const haw = new THREE.SphereGeometry(0.03, 20, 14); haw.scale(1, 1.15, 1); const hm = glossy('#b01e1e');
      for (let i = 0; i < 8; i++) g.add(place(mesh(haw, hm), 0.3 + (r() - 0.5) * 0.25, 0.03, 0.3 + (r() - 0.5) * 0.2, r(), r() * TAU, 0));
      return g;
    }
    case 'cyclamen': {
      for (let i = 0; i < 7; i++) { const a = i * 0.9; leafAt(g, Math.cos(a) * 0.18, Math.sin(a) * 0.18 + 0.05, -a + Math.PI / 2, '#2f4a2a', 0.9, 'heart', 0.03 + (i % 2) * 0.01, -1.45); }
      const pm = M.petal('#e0307a', '#f8a8c8', '#8a1040');
      for (let f = 0; f < 4; f++) {
        const x = -0.15 + f * 0.1, z = -0.05 + (f % 2) * 0.1, h = 0.38 + r() * 0.12, top = V3(x + 0.05, h, z);
        g.add(stem([V3(x, 0.02, z + 0.05), V3(x, h * 0.6, z), V3(x + 0.03, h + 0.02, z), top], 0.005, '#7a3a4a'));
        const head = new THREE.Group();
        for (let k = 0; k < 5; k++) { const p = mesh(bendPlane(0.05, 0.13, { cup: 0.6, twist: 0.7, curl: 0.15 }), pm); const hd = new THREE.Group(); hd.rotation.y = k * TAU / 5; p.rotation.x = 0.28; hd.add(p); head.add(hd); }
        head.add(mesh(new THREE.SphereGeometry(0.018, 12, 10), M.std('#6a0a2a', { roughness: 0.5 })));
        head.position.copy(top); head.rotation.z = (r() - 0.5) * 0.3; g.add(head);
      }
      const tuber = blob(0.12, 0.012, 4, 3, 4); tuber.scale(1, 0.45, 1); g.add(mesh(tuber, M.std('#6a4a32', { roughness: 0.95, bumpMap: noiseTex('bark', 30, 2), bumpScale: 3 }), 0.4, 0.04, 0.25));
      return g;
    }
    case 'mahogany': case 'teak': case 'sycamore': {
      const w = woods(ing); g.add(w);
      const plank = new THREE.BoxGeometry(0.55, 0.035, 0.16, 1, 1, 1);
      const grain = canvasTex('grain' + id, 512, 128, (c, W, H) => { c.fillStyle = c0; c.fillRect(0, 0, W, H); for (let i = 0; i < 70; i++) { c.strokeStyle = `rgba(40,16,8,${0.12 + Math.random() * 0.25})`; c.lineWidth = 1 + Math.random() * 3; c.beginPath(); const y = Math.random() * H; c.moveTo(0, y); c.bezierCurveTo(W * 0.3, y + 12 * Math.sin(i), W * 0.7, y - 10, W, y + 6); c.stroke(); } });
      const pm = M.std(0xffffff, { map: grain, roughness: id === 'mahogany' ? 0.15 : 0.4, clearcoat: id === 'mahogany' ? 1 : 0.4, clearcoatRoughness: 0.08 });
      g.add(place(mesh(plank, pm), -0.1, 0.018, 0.4, 0, 0.2, 0)); g.add(place(mesh(plank, pm), -0.06, 0.053, 0.38, 0, 0.32, 0));
      if (id === 'sycamore') {
        leafAt(g, 0.3, 0.45, 0.6, '#5a8a32', 1.3, 'lobed');
        const wing = bendPlane(0.045, 0.12, { cup: 0.3, twist: 0.4 }), wm = M.std('#c8a868', { roughness: 0.7, side: THREE.DoubleSide, transmission: 0.2, thickness: 0.01 });
        for (let i = 0; i < 3; i++) { const s = new THREE.Group(); s.add(mesh(new THREE.SphereGeometry(0.014, 12, 10), M.std('#9a7a4a'))); const w1 = mesh(wing, wm); w1.rotation.z = -0.5; const w2 = mesh(wing, wm); w2.rotation.z = 0.5; s.add(w1, w2); place(s, 0.45 + i * 0.07, 0.015, 0.1 - i * 0.12, Math.PI / 2, i, 0); g.add(s); }
      }
      return g;
    }
    case 'bamboo': {
      const cm = M.std('#7fa83a', { roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2, map: gradTex('bamboo', [[0, '#8a9a3a'], [0.5, '#7fae42'], [1, '#a8c058']]) });
      [[-0.2, 0, 0.95, 0.045], [0.0, -0.12, 0.8, 0.04], [0.16, 0.06, 0.68, 0.035]].forEach(([x, z, h, rr], i) => { g.add(mesh(segmented(h, rr, 5, { ridge: 0.09 }), cm, x, h / 2, z)); const tp = V3(x, h, z); sprig(g, [tp.clone().add(V3(0, -0.15, 0)), tp.clone().add(V3(0.1, -0.05, 0.05)), tp.clone().add(V3(0.22, 0.02, 0.08))], { col: '#4f8a32', n: 6, size: 0.04, aspect: 6, stemCol: '#6a8a3a', r0: 0.003, spread: 1.3, seed: 70 + i }); });
      const cut = new THREE.Group(); cut.add(mesh(segmented(0.22, 0.05, 1, { ridge: 0.08 }), cm)); cut.add(mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.225, 24, 1, true), M.std('#efe6c0', { roughness: 0.6, side: THREE.BackSide })));
      cut.add(mesh(new THREE.RingGeometry(0.042, 0.05, 32).rotateX(-Math.PI / 2).translate(0, 0.111, 0), M.std('#e8dca8', { roughness: 0.7 })));
      place(cut, 0.35, 0.05, 0.3, Math.PI / 2, 0.8, 0); g.add(cut);
      return g;
    }
    case 'tarragon': {
      for (let s = 0; s < 6; s++) { const x0 = -0.3 + s * 0.11, top = 0.45 + r() * 0.25, lean = (r() - 0.5) * 0.4; sprig(g, [V3(x0, 0.02, 0.2), V3(x0 + lean * 0.4, top * 0.5, 0.08), V3(x0 + lean, top, 0)], { col: '#4a7a32', n: 18, size: 0.028, aspect: 7, stemCol: '#6a7a42', r0: 0.004, spread: 0.75, seed: 80 + s }); }
      g.add(place(mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 24), M.std('#c9a874', { roughness: 0.9 })), 0, 0.1, 0.16, 0.3, 0, 0));
      return g;
    }
    case 'oregano': {
      for (let s = 0; s < 5; s++) {
        const x0 = -0.32 + s * 0.13, top = 0.4 + r() * 0.15, lean = (r() - 0.5) * 0.3, pts = [V3(x0, 0.02, 0.2), V3(x0 + lean * 0.4, top * 0.5, 0.08), V3(x0 + lean, top, 0)];
        sprig(g, pts, { col: '#4f7a3a', n: 8, size: 0.05, aspect: 1.2, pairs: true, stemCol: '#7a4a4a', r0: 0.004, seed: 90 + s });
        const tip = pts[2], fl = []; for (let k = 0; k < 40; k++) { const a = k * 2.4, d = 0.03 * Math.sqrt(k / 40); fl.push([tip.clone().add(V3(Math.cos(a) * d, 0.01 + (1 - d / 0.03) * 0.02, Math.sin(a) * d)), V3(Math.cos(a), 1.5, Math.sin(a)), 1]); }
        instances(g, new THREE.SphereGeometry(0.006, 8, 6), M.std('#d89ac8', { roughness: 0.6, sheen: 0.8 }), fl);
      }
      const bowl = dish(0.24, '#f2ece2', false); bowl.position.set(0.4, 0, 0.3); g.add(bowl);
      const flake = new THREE.CircleGeometry(0.012, 6); const pp = pile(flake, M.std('#6a7a3a', { roughness: 0.9, side: THREE.DoubleSide }), 260, 0.18, 4, { height: 0.25, flat: true }); pp.position.set(0.4, 0.03, 0.3); g.add(pp);
      return g;
    }
    case 'sugarcane': {
      const sm = M.std('#7a2a4a', { roughness: 0.45, sheen: 1, sheenColor: new THREE.Color('#d8b8c8'), sheenRoughness: 0.5, map: gradTex('cane', [[0, '#6a3a2a'], [0.4, '#8a2a4a'], [1, '#a8784a']]) });
      for (let i = 0; i < 3; i++) g.add(place(mesh(segmented(1.0, 0.035, 5, { ridge: 0.07 }), sm), -0.1 + i * 0.03, 0.035 + (i === 2 ? 0.06 : 0), -0.1 + i * 0.08, Math.PI / 2, 0, Math.PI / 2 + (i - 1) * 0.12));
      const fib = canvasTex('canefib', 128, 128, (c, W) => { c.fillStyle = '#efe6c8'; c.fillRect(0, 0, W, W); for (let k = 0; k < 220; k++) { c.fillStyle = `rgba(190,170,110,${Math.random() * 0.6})`; c.fillRect(Math.random() * W, Math.random() * W, 2, 2); } });
      for (let i = 0; i < 3; i++) g.add(place(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 24), [sm, M.std(0xffffff, { map: fib, roughness: 0.8 }), M.std(0xffffff, { map: fib, roughness: 0.8 })]), 0.3 + i * 0.09, 0.04, 0.32 - i * 0.04, i * 0.5, 0, 0));
      const bowl = dish(0.2, '#f4efe6', false); bowl.position.set(-0.3, 0, 0.35); g.add(bowl);
      const xt = new THREE.BoxGeometry(0.012, 0.012, 0.012); const pp = pile(xt, M.std('#b8742a', { roughness: 0.25, clearcoat: 0.8, transmission: 0.3, thickness: 0.02 }), 300, 0.15, 6, { height: 0.35 }); pp.position.set(-0.3, 0.025, 0.35); g.add(pp);
      return g;
    }
    case 'calamus': {
      const sword = bendPlane(0.035, 0.75, { cup: 0.3, droop: 0.1 }), lm = M.leaf('#5a8a3a', '#a8c878', 'long');
      for (let i = 0; i < 9; i++) { const l = mesh(sword, lm); place(l, -0.1 + (i - 4) * 0.015, 0.02, -0.05, (r() - 0.5) * 0.25, i * 0.4, (i - 4) * 0.06); g.add(l); }
      const spad = new THREE.CapsuleGeometry(0.014, 0.08, 6, 10); g.add(place(mesh(spad, M.std('#b8b85a', { roughness: 0.7, bumpMap: noiseTex('spadix', 80, 2), bumpScale: 3 })), -0.06, 0.42, -0.04, 0, 0, -0.7));
      const root = M.std('#c89a7a', { roughness: 0.75, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 3, map: gradTex('calroot', [[0, '#b88a6a'], [1, '#d8a88a']]) });
      const rg = new THREE.Group(); rhizomes(rg, root, { n: 5, r0: 0.035, len: 0.2, seed: 12, spread: 0.18 }); rg.position.set(0.25, 0, 0.25); g.add(rg);
      return g;
    }
    case 'broom': case 'sweetpea': {
      const sweet = id === 'sweetpea', geo = peaGeo(sweet ? 1.5 : 0.65);
      const mats = sweet ? [M.petal('#e88ab0', '#fbd8e6', '#c04a7a'), M.petal('#b08ad8', '#eadcf8', '#7a4ab0'), M.petal('#fbf2f6', '#ffffff', '#e8c8d8')] : [M.petal('#f6c81a', '#fff0a0', '#d8941a')];
      const lists = mats.map(() => []);
      for (let s = 0; s < (sweet ? 4 : 9); s++) {
        const x0 = -0.3 + s * (sweet ? 0.18 : 0.07), top = (sweet ? 0.55 : 0.6) + r() * 0.2, lean = (r() - 0.5) * 0.35, pts = [V3(x0, 0.02, 0.15), V3(x0 + lean * 0.4, top * 0.5, 0.05), V3(x0 + lean, top, -0.05)];
        g.add(stem(pts, sweet ? 0.006 : 0.005, sweet ? '#6a9a4a' : '#4a7a32'));
        const curve = new THREE.CatmullRomCurve3(pts);
        for (let k = 0; k < (sweet ? 4 : 10); k++) { const p = curve.getPointAt(sweet ? 0.7 + k * 0.08 : 0.35 + k * 0.065), a = k * 2.1 + s; lists[(s + k) % mats.length].push([p.clone().add(V3(Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025)), V3(Math.cos(a) * 0.6, 0.6, Math.sin(a) * 0.6 + 0.5), 1, a]); }
        if (sweet) { const tp = []; for (let k = 0; k <= 30; k++) { const t = k / 30; tp.push(curve.getPointAt(0.45).add(V3(0.02 + t * 0.12 + Math.cos(t * 18) * 0.02 * t, t * 0.08, Math.sin(t * 18) * 0.02 * t))); } g.add(stem(tp, 0.0018, '#7aa85a')); leafAt(g, x0 + 0.05, 0.25, s, '#5a8a42', 0.6, 'ovate', top * 0.4, -0.8); }
      }
      mats.forEach((m, i) => lists[i].length && instances(g, geo, m, lists[i]));
      return g;
    }
    case 'persimmon': {
      const skin = M.std('#f07a1a', { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, map: gradTex('kaki', [[0, '#e8601a'], [0.6, '#f5841e'], [1, '#f2a03a']]) });
      const calyx = (p, s = 1) => { const c = new THREE.Group(); for (let k = 0; k < 4; k++) { const sp = mesh(bendPlane(0.07 * s, 0.07 * s, { cup: 0.6, curl: -0.4 }), M.std('#6a6a3a', { roughness: 0.7, side: THREE.DoubleSide })); const h = new THREE.Group(); h.rotation.y = k * TAU / 4; sp.rotation.x = 1.35; h.add(sp); c.add(h); } c.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.03, 8), M.std('#5a4a2a'), 0, 0.015, 0)); c.position.copy(p); g.add(c); };
      [[-0.25, 0.05], [0.08, -0.22]].forEach(([x, z]) => { const f = sphereFruit(0.17, skin, { sy: 0.72, sx: 1.03 }); f.position.set(x, 0.122, z); g.add(f); calyx(V3(x, 0.245, z)); });
      const face = cutFace('kakiface', (c, W) => { c.fillStyle = '#f5902a'; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,220,150,.75)'; c.lineWidth = 3; for (let k = 0; k < 8; k++) { const a = k * TAU / 8; c.beginPath(); c.moveTo(W / 2, W / 2); c.lineTo(W / 2 + Math.cos(a) * W * 0.3, W / 2 + Math.sin(a) * W * 0.3); c.stroke(); } c.fillStyle = 'rgba(255,230,170,.8)'; c.beginPath(); c.arc(W / 2, W / 2, 10, 0, TAU); c.fill(); });
      halfFruit(g, 0.16, skin, face, 0.3, 0.09, 0.2, 0.2, 0.4, 0.72);
      leafAt(g, -0.05, 0.35, 0.4, '#4a7a2e', 1.1, 'ovate');
      return g;
    }
    case 'papaya': {
      const skin = M.std('#f2a03a', { roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, map: canvasTex('papskin', 256, 64, (c, W, H) => { const gr = c.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#6a9a3a'); gr.addColorStop(0.35, '#e8a83a'); gr.addColorStop(1, '#f2902a'); c.fillStyle = gr; c.fillRect(0, 0, W, H); }) });
      const whole = sphereFruit(0.13, skin, { sz: 1.9 }); whole.position.set(-0.28, 0.13, -0.1); whole.rotation.y = 1.25; g.add(whole);
      const half = new THREE.Group(), R = 0.13;
      const dome = new THREE.SphereGeometry(R, 48, 24, 0, TAU, 0, Math.PI / 2); dome.rotateX(Math.PI); dome.scale(1, 0.9, 1.9); half.add(mesh(dome, skin));
      const face = cutFace('papface', (c, W) => { c.fillStyle = '#f26a2a'; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.fill(); c.fillStyle = '#ffd06a'; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.lineWidth = 10; c.strokeStyle = '#ffd06a'; c.stroke(); c.fillStyle = '#e04a1a'; c.beginPath(); c.ellipse(W / 2, W / 2, W * 0.2, W * 0.27, 0, 0, TAU); c.fill(); });
      const cap = new THREE.CircleGeometry(R, 48); cap.rotateX(-Math.PI / 2); cap.scale(1, 1, 1.9); half.add(mesh(cap, M.std(0xffffff, { map: face, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }), 0, 0.001, 0));
      const seeds = []; for (let i = 0; i < 70; i++) { const a = r() * TAU, d = Math.sqrt(r()); seeds.push([V3(Math.cos(a) * d * R * 0.36, 0.006, Math.sin(a) * d * R * 0.48 * 1.9 * 0.6), V3(0, 1, 0), 1]); }
      instances(half, new THREE.SphereGeometry(0.009, 10, 8), glossy('#1a1410'), seeds);
      half.position.set(0.2, 0.115, 0.15); half.rotation.set(0.12, -0.4, 0); g.add(half);
      return g;
    }
    case 'pomelo': {
      const peel = M.std('#d8de6a', { roughness: 0.4, bumpMap: noiseTex('peel', 60, 1.4), bumpScale: 1.6, clearcoat: 0.5, clearcoatRoughness: 0.35 });
      const f = sphereFruit(0.25, peel, { sy: 0.88 }); f.position.set(-0.22, 0.22, -0.08); g.add(f);
      const face = cutFace('pomface', (c, W) => { c.fillStyle = '#d8de6a'; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.fill(); c.fillStyle = '#fbf6ea'; c.beginPath(); c.arc(W / 2, W / 2, W * 0.48, 0, TAU); c.fill(); for (let k = 0; k < 14; k++) { const a0 = k * TAU / 14, a1 = a0 + TAU / 14 - 0.05; c.fillStyle = k % 2 ? '#f6a0a0' : '#f4b0a8'; c.beginPath(); c.moveTo(W / 2 + Math.cos(a0 + 0.02) * 10, W / 2 + Math.sin(a0 + 0.02) * 10); c.arc(W / 2, W / 2, W * 0.36, a0 + 0.02, a1); c.closePath(); c.fill(); } c.fillStyle = '#fbf2e8'; c.beginPath(); c.arc(W / 2, W / 2, 12, 0, TAU); c.fill(); });
      halfFruit(g, 0.22, peel, face, 0.3, 0.12, 0.25, 0.5, 0.5, 0.88);
      leafAt(g, 0.0, 0.42, 0.6, '#3f7a2e', 1.1, 'ovate');
      return g;
    }
    case 'kiwi': {
      const fuzz = M.std('#8a6a42', { roughness: 0.95, sheen: 1, sheenColor: new THREE.Color('#c8a87a'), sheenRoughness: 0.6, bumpMap: noiseTex('fuzz', 120, 2), bumpScale: 2 });
      [[-0.25, 0.05, 0.4], [0.0, -0.2, -0.6]].forEach(([x, z, a]) => { const k = sphereFruit(0.1, fuzz, { sx: 0.9, sz: 1.35 }); k.position.set(x, 0.088, z); k.rotation.y = a; g.add(k); });
      const face = cutFace('kiwiface', (c, W) => { c.fillStyle = '#5a9a2a'; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.fill(); const gr = c.createRadialGradient(W / 2, W / 2, 10, W / 2, W / 2, W / 2); gr.addColorStop(0, '#f2f2d0'); gr.addColorStop(0.25, '#c8e070'); gr.addColorStop(0.8, '#6ab02a'); gr.addColorStop(1, '#4a8a1a'); c.fillStyle = gr; c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 3, 0, TAU); c.fill(); c.strokeStyle = 'rgba(230,240,190,.45)'; c.lineWidth = 2; for (let k = 0; k < 48; k++) { const a = k * TAU / 48; c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * 30, W / 2 + Math.sin(a) * 30); c.lineTo(W / 2 + Math.cos(a) * 110, W / 2 + Math.sin(a) * 110); c.stroke(); } c.fillStyle = '#1a1a10'; for (let k = 0; k < 70; k++) { const a = k * TAU / 70 + Math.random() * 0.05, d = 34 + Math.random() * 10; c.beginPath(); c.ellipse(W / 2 + Math.cos(a) * d, W / 2 + Math.sin(a) * d, 2.2, 4, a, 0, TAU); c.fill(); } c.fillStyle = '#f6f4dc'; c.beginPath(); c.ellipse(W / 2, W / 2, 26, 22, 0, 0, TAU); c.fill(); });
      halfFruit(g, 0.09, fuzz, face, 0.28, 0.075, 0.2, 0.25, 0.3);
      halfFruit(g, 0.09, fuzz, face, 0.45, 0.075, -0.05, 0.1, 1.2);
      return g;
    }
    case 'sapodilla': {
      const sk = M.std('#8a6a4a', { roughness: 0.95, bumpMap: noiseTex('scurf', 80, 2), bumpScale: 2, sheen: 0.6, sheenColor: new THREE.Color('#b89a7a') });
      [[-0.25, 0.05], [0.0, -0.22]].forEach(([x, z], i) => { const f = sphereFruit(0.12, sk, { sy: 0.92, sz: 1.08 }); f.position.set(x, 0.11, z); f.rotation.y = i; g.add(f); g.add(mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.03, 8), M.std('#4a3a2a'), x, 0.225, z)); });
      const face = cutFace('sapoface', (c, W) => { c.fillStyle = '#8a6a4a'; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.fill(); const gr = c.createRadialGradient(W / 2, W / 2, 6, W / 2, W / 2, W / 2); gr.addColorStop(0, '#e2b07a'); gr.addColorStop(0.9, '#c8844a'); gr.addColorStop(1, '#a8703a'); c.fillStyle = gr; c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 4, 0, TAU); c.fill(); for (let k = 0; k < 5; k++) { const a = k * TAU / 5; c.fillStyle = '#1a120c'; c.beginPath(); c.ellipse(W / 2 + Math.cos(a) * 40, W / 2 + Math.sin(a) * 40, 8, 20, a, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(W / 2 + Math.cos(a) * 38, W / 2 + Math.sin(a) * 38 - 4, 2, 6, a, 0, TAU); c.fill(); } });
      halfFruit(g, 0.115, sk, face, 0.3, 0.1, 0.2, 0.2, 0.4, 0.92);
      return g;
    }
    case 'quince': {
      const prof = []; for (let i = 0; i <= 24; i++) { const t = i / 24; prof.push(new THREE.Vector2(Math.max(0.001, Math.pow(Math.sin(t * Math.PI), 0.55) * (0.17 - 0.075 * t)), t * 0.34)); }
      const qgeo = displace(new THREE.LatheGeometry(prof, 48), 0.012, 3, 2, 4);
      const qm = M.std('#e8c43a', { roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#fff2c0'), sheenRoughness: 0.5, map: gradTex('quince', [[0, '#d8b02a'], [0.6, '#ecc83a'], [1, '#c8b03a']]) });
      [[-0.2, 0.0, 0.2], [0.18, -0.15, -0.3]].forEach(([x, z, rz], i) => { g.add(place(mesh(qgeo, qm), x, i ? 0.0 : 0.0, z, 0, i * 1.4, rz)); g.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.04, 8), M.std('#5a4a2a'), x + Math.sin(-rz) * 0.34, 0.34 * Math.cos(rz) + 0.015, z)); });
      leafAt(g, 0.0, 0.32, 0.4, '#4a7a32', 1.0, 'ovate'); leafAt(g, -0.35, 0.25, -0.6, '#4a7a32', 0.85, 'ovate');
      return g;
    }
    case 'cherryblossom': {
      const twig = [V3(-0.55, 0.15, 0.1), V3(-0.2, 0.3, 0.0), V3(0.15, 0.36, -0.05), V3(0.5, 0.55, -0.1)];
      const bm = M.std('#3a2a26', { roughness: 0.6, clearcoat: 0.4, map: canvasTex('cherrybark', 256, 32, (c, W, H) => { c.fillStyle = '#4a302a'; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(200,170,150,.35)'; for (let x = 0; x < W; x += 9) c.fillRect(x, 0, 2, H); }) });
      g.add(mesh(tube(twig, 0.02, 30, 8, 0.6), bm)); const curve = new THREE.CatmullRomCurve3(twig);
      const side = [[0.3, V3(0.0, 0.2, 0.15)], [0.55, V3(0.05, 0.18, -0.18)], [0.15, V3(-0.05, 0.22, -0.1)]];
      side.forEach(([t, d]) => { const p = curve.getPointAt(t); g.add(mesh(tube([p, p.clone().add(d.clone().multiplyScalar(0.5)).add(V3(0.04, 0, 0)), p.clone().add(d)], 0.009, 12, 6, 0.6), bm)); });
      const geo = floretGeo({ petals: 5, len: 0.05, wid: 0.048, open: 1.35, cup: 0.4 }), pm = M.petal('#fbe0ea', '#fff6fa', '#f2a8c0'), fl = [], cen = [];
      const spots = [...[0.1, 0.22, 0.35, 0.48, 0.62, 0.75, 0.88, 1].map((t) => curve.getPointAt(t)), ...side.map(([t, d]) => curve.getPointAt(t).add(d))];
      spots.forEach((p, j) => { for (let k = 0; k < 4; k++) { const a = k * 1.7 + j, q = p.clone().add(V3(Math.cos(a) * 0.06, 0.03 + (k % 2) * 0.03, Math.sin(a) * 0.06)); const d = V3(Math.cos(a), 1.2, Math.sin(a)); fl.push([q, d, 1.6 + r() * 0.4, r() * TAU]); cen.push([q.clone().add(d.clone().normalize().multiplyScalar(0.01)), d, 1.5]); } });
      instances(g, geo, pm, fl); instances(g, new THREE.SphereGeometry(0.008, 8, 6), M.std('#e8507a', { roughness: 0.6 }), cen);
      for (let i = 0; i < 12; i++) { const pp = mesh(bendPlane(0.04, 0.045, { cup: 0.4 }), pm); place(pp, (r() - 0.5) * 0.9, 0.004, 0.2 + (r() - 0.5) * 0.3, -Math.PI / 2 + 0.1, r() * TAU, 0); g.add(pp); }
      return g;
    }
    case 'rice': {
      const bowl = new THREE.Group(); bowl.add(dish(0.34, '#2a2622', false)); const grain = new THREE.CapsuleGeometry(0.008, 0.016, 4, 8);
      const gp = pile(grain, M.std('#f6f2e6', { roughness: 0.3, transmission: 0.25, thickness: 0.02, clearcoat: 0.6 }), 700, 0.28, 3, { height: 0.35 }); gp.position.y = 0.025; bowl.add(gp); bowl.position.set(0.15, 0, 0.15); g.add(bowl);
      const hm = M.std('#d8b45a', { roughness: 0.6, sheen: 0.6 }), husk = new THREE.CapsuleGeometry(0.008, 0.02, 4, 8);
      for (let s = 0; s < 4; s++) {
        const x0 = -0.45 + s * 0.06, pts = [V3(x0, 0.02, -0.2), V3(x0 + 0.05, 0.45, -0.25), V3(x0 + 0.18, 0.62, -0.2), V3(x0 + 0.28, 0.5, -0.12)];
        g.add(stem(pts, 0.005, '#b8a050')); const curve = new THREE.CatmullRomCurve3(pts), list = [];
        for (let k = 0; k < 28; k++) { const t = 0.55 + (k / 28) * 0.45, p = curve.getPointAt(t), a = k * 2.4; list.push([p.clone().add(V3(Math.cos(a) * 0.016, -0.015, Math.sin(a) * 0.016)), V3(Math.cos(a) * 0.4, -1, Math.sin(a) * 0.4), 1, a]); }
        instances(g, husk, hm, list);
      }
      return g;
    }
    case 'celery': case 'celeryseed': {
      const cm = M.std('#b8d88a', { roughness: 0.35, clearcoat: 0.6, map: gradTex('celery', [[0, '#e8f0c8'], [0.6, '#a8d070'], [1, '#7ab84a']]) });
      for (let i = 0; i < 3; i++) { const geo = segmented(0.75, 0.032, 1, { ridge: 0, groove: 0.12 }); geo.scale(1, 1, 0.6); g.add(place(mesh(geo, cm), -0.2 + i * 0.07, 0.03 + (i === 1 ? 0.05 : 0), -0.05 + i * 0.05, Math.PI / 2, 0, Math.PI / 2 + 0.1 * (i - 1))); }
      leafAt(g, 0.25, -0.05, -1.4, '#5a9a3a', 0.9, 'lobed', 0.05, -1.3); leafAt(g, 0.28, 0.05, -1.9, '#5a9a3a', 0.8, 'lobed', 0.06, -1.3);
      const bowl = dish(0.18, '#f2ece2', false); bowl.position.set(-0.2, 0, 0.35); g.add(bowl);
      const seed = new THREE.CapsuleGeometry(0.004, 0.008, 3, 6); const sp = pile(seed, M.std('#6a5a3a', { roughness: 0.8 }), 500, 0.14, 2, { height: 0.3 }); sp.position.set(-0.2, 0.025, 0.35); g.add(sp);
      return g;
    }
    case 'hay': {
      const strand = new THREE.CylinderGeometry(0.0025, 0.0025, 0.7, 4); strand.rotateZ(Math.PI / 2);
      const mats = [M.std('#d8b862', { roughness: 0.7, sheen: 0.6, sheenColor: new THREE.Color('#fff0b0') }), M.std('#b8a050', { roughness: 0.75 }), M.std('#c8c070', { roughness: 0.7 })];
      mats.forEach((m, j) => { const list = []; for (let i = 0; i < 160; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.12; list.push([V3((r() - 0.5) * 0.08, 0.12 + Math.sin(a) * d, Math.cos(a) * d), V3(0, 1, 0).applyAxisAngle(V3(0, 0, 1), (r() - 0.5) * 0.15).applyAxisAngle(V3(0, 1, 0), (r() - 0.5) * 0.12), 0.85 + r() * 0.3]); } instances(g, strand, m, list); });
      for (const x of [-0.18, 0.18]) g.add(place(mesh(new THREE.TorusGeometry(0.125, 0.007, 8, 32), M.std('#8a6a3a', { roughness: 0.9 })), x, 0.12, 0, 0, Math.PI / 2, 0));
      const loose = []; for (let i = 0; i < 60; i++) loose.push([V3((r() - 0.5) * 0.9, 0.004, 0.25 + (r() - 0.5) * 0.3), V3(0, 1, 0).applyAxisAngle(V3(0, 0, 1), Math.PI / 2 - 0.02).applyAxisAngle(V3(0, 1, 0), r() * TAU), 0.25 + r() * 0.3]);
      instances(g, strand.clone().rotateZ(-Math.PI / 2), mats[0], loose);
      return g;
    }
    case 'hibiscus': {
      const head = flowerHead(ing, { petals: 5, len: 0.26, wid: 0.24, kind: 'round', open: 1.3, cup: 0.45, twist: 0.25, centerR: 0.02, center: '#7a0a1a', colors: ['#d8203a', '#f25a6a', '#7a0a1a'] });
      head.add(stem([V3(0, 0, 0), V3(0.01, 0.12, 0.02), V3(0.02, 0.24, 0.05)], 0.006, '#e8506a'));
      const an = []; for (let k = 0; k < 24; k++) { const t = 0.55 + (k / 24) * 0.4, a = k * 2.4; an.push([V3(0.01 + Math.cos(a) * 0.012 + t * 0.012, 0.24 * t, Math.sin(a) * 0.012 + t * 0.04), V3(Math.cos(a), 0.4, Math.sin(a)), 1]); }
      instances(head, new THREE.SphereGeometry(0.006, 8, 6), M.std('#f8d23a', { roughness: 0.6 }), an);
      place(head, -0.1, 0.32, 0, 0.5, 0, 0.1); g.add(head); g.add(stem([V3(-0.1, 0.3, 0), V3(-0.05, 0.15, 0.1), V3(0, 0.02, 0.25)], 0.01, '#4a6a32'));
      leafAt(g, 0.15, 0.3, 0.9, '#2f5a2a', 1.1, 'serrated'); leafAt(g, -0.4, 0.2, -0.8, '#2f5a2a', 1.0, 'serrated');
      const bowl = dish(0.2, '#f4efe6', false); bowl.position.set(0.38, 0, -0.15); g.add(bowl);
      const cal = blob(0.035, 0.012, 14, 5, 2); cal.scale(1, 0.7, 1); const cp = pile(cal, M.std('#7a0a1e', { roughness: 0.6, clearcoat: 0.4 }), 26, 0.15, 5, { height: 0.4 }); cp.position.set(0.38, 0.03, -0.15); g.add(cp);
      return g;
    }
    case 'cannabis': {
      const fan = new THREE.Group(), lm = M.leaf('#3f7a2e', '#8ab86a', 'serrated');
      for (let k = 0; k < 7; k++) { const a = (k - 3) * 0.38, s = 1 - Math.abs(k - 3) * 0.2; const l = mesh(bendPlane(0.05 * s, 0.32 * s, { cup: 0.4, droop: 0.1 }), lm); const h = new THREE.Group(); h.rotation.z = a; h.add(l); fan.add(h); }
      fan.add(stem([V3(0, 0, 0), V3(0, -0.1, 0.01), V3(0.02, -0.22, 0.03)], 0.005, '#5a7a3a'));
      place(fan, -0.2, 0.05, 0.05, -1.1, 0.2, 0.2, 1.9); g.add(fan);
      const bud = new THREE.Group(), bm = M.std('#7a9a4a', { roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#e8f0d8'), sheenRoughness: 0.3 });
      for (let i = 0; i < 9; i++) { const geo = blob(0.04, 0.012, 18, i + 1, 3); geo.scale(1, 1.3, 1); bud.add(mesh(geo, bm, (r() - 0.5) * 0.05, 0.04 + i * 0.022, (r() - 0.5) * 0.05)); }
      const tri = []; for (let i = 0; i < 300; i++) { const t = r(), a = r() * TAU; tri.push([V3(Math.cos(a) * 0.05 * (1 - t * 0.5), 0.03 + t * 0.21, Math.sin(a) * 0.05 * (1 - t * 0.5)), V3(Math.cos(a), 0.3, Math.sin(a)), 1]); }
      instances(bud, new THREE.SphereGeometry(0.003, 6, 4), M.std('#f4f2e6', { roughness: 0.2, clearcoat: 1 }), tri);
      for (let i = 0; i < 16; i++) { const a = i * 2.4, y = 0.05 + (i / 16) * 0.18, p = V3(Math.cos(a) * 0.045, y, Math.sin(a) * 0.045); bud.add(stem([p, p.clone().add(V3(Math.cos(a) * 0.02, 0.015, Math.sin(a) * 0.02)), p.clone().add(V3(Math.cos(a) * 0.035, 0.005, Math.sin(a) * 0.035))], 0.0015, '#d8782a')); }
      place(bud, 0.3, 0.0, 0.1, 0, 0, -0.15); g.add(bud);
      return g;
    }
    case 'waterlily': {
      g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.012, 64), M.std('#1e3a3a', { roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, transmission: 0.2 }), 0, 0.006, 0));
      const pad = new THREE.CircleGeometry(0.2, 48, 0.12, TAU - 0.24); pad.rotateX(-Math.PI / 2);
      const pm = M.std('#3f7a2e', { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
      [[-0.3, -0.15, 0.4, 1], [0.32, 0.2, 2.2, 0.85], [-0.2, 0.32, 4.1, 0.7], [0.3, -0.3, 1.2, 0.6]].forEach(([x, z, a, s]) => g.add(place(mesh(pad, pm), x, 0.014, z, 0, a, 0, s)));
      const head = flowerHead(ing, { petals: 7, layers: 3, len: 0.17, wid: 0.06, kind: 'long', open: 1.15, cup: 0.7, centerR: 0.035, center: '#f2c21a', colors: ['#fbe8ee', '#ffffff', '#e8a0b8'] });
      place(head, 0.02, 0.03, 0.02, 0, 0, 0, 2.1); g.add(head);
      return g;
    }
    case 'ivy': {
      const vine = []; for (let i = 0; i <= 12; i++) { const t = i / 12; vine.push(V3(-0.55 + t * 1.1, 0.02 + Math.sin(t * 5) * 0.03 + t * 0.15, Math.sin(t * 7) * 0.12)); }
      g.add(mesh(tube(vine, 0.008, 60, 6), M.std('#6a5a3a', { roughness: 0.8 }))); const curve = new THREE.CatmullRomCurve3(vine);
      for (let i = 0; i < 14; i++) { const t = 0.04 + i * 0.07, p = curve.getPointAt(t), side = i % 2 ? 1 : -1; const l = leafAt(g, p.x, p.z + side * 0.05, side * 1.2 + (r() - 0.5) * 0.5, i % 3 ? '#2a4a26' : '#35552c', 0.8 + r() * 0.2, 'lobed', p.y + 0.01, -1.4); l.material.clearcoat = 0.9; l.material.clearcoatRoughness = 0.1; }
      const berry = new THREE.SphereGeometry(0.018, 14, 10), bl = []; const bp = curve.getPointAt(0.95).add(V3(0, 0.08, 0)); g.add(stem([curve.getPointAt(0.92), bp], 0.004, '#6a5a3a'));
      for (let k = 0; k < 12; k++) { const a = k * 2.4, d = 0.035 * Math.sqrt(k / 12); bl.push([bp.clone().add(V3(Math.cos(a) * d, 0.02 - d * 0.4, Math.sin(a) * d)), V3(0, 1, 0), 1]); } instances(g, berry, glossy('#1e1a2a'), bl);
      return g;
    }
    case 'gingerlily': {
      sprig(g, [V3(-0.05, 0.02, 0.2), V3(-0.02, 0.35, 0.05), V3(0.0, 0.6, -0.02)], { col: '#3f7a2e', n: 6, size: 0.09, aspect: 5, stemCol: '#5a8a3a', r0: 0.012, spread: 1.0, seed: 41 });
      const top = V3(0.0, 0.62, -0.02), cols = ['#fffdf2', '#ffffff', '#f2eccf'];
      for (let k = 0; k < 7; k++) {
        const a = k * 0.9, f = new THREE.Group();
        f.add(flowerHead(ing, { petals: 3, len: 0.09, wid: 0.018, kind: 'long', open: 1.6, cup: 0.3, droop: 0.2, centerR: 0, colors: cols }));
        const lip = mesh(bendPlane(0.09, 0.08, { cup: 0.5, curl: -0.2 }), M.petal(cols[0], cols[1], '#f6d86a', 'round')); lip.rotation.x = 1.2; f.add(lip);
        const wing = mesh(bendPlane(0.04, 0.07, { cup: 0.4 }), M.petal(cols[0], cols[1], cols[2], 'round')); const wg = new THREE.Group(); wg.rotation.y = Math.PI * 0.8; wing.rotation.x = 1.3; wg.add(wing); f.add(wg);
        f.add(stem([V3(0, 0, 0), V3(0, 0.05, -0.02), V3(0, 0.1, -0.05)], 0.0025, '#e8a03a'));
        f.add(mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.08, 6), M.std('#f2eedc'), 0, -0.04, 0));
        place(f, top.x + Math.cos(a) * 0.1, top.y + 0.06 + (k % 3) * 0.04, top.z + Math.sin(a) * 0.1, Math.cos(a) * 0.5, -a, Math.sin(a) * 0.5, 1.7); g.add(f);
      }
      g.add(mesh(new THREE.SphereGeometry(0.04, 16, 12), M.std('#7a9a4a', { roughness: 0.6 }), top.x, top.y + 0.02, top.z));
      return g;
    }
    case 'datura': case 'tobaccoflower': case 'tobaccoblossom': {
      const dat = id === 'datura';
      const fm = M.std(0xffffff, { map: gradTex('trump' + id, dat ? [[0, '#a8c878'], [0.4, '#f6f4ea'], [1, '#ffffff']] : [[0, '#c8d898'], [0.45, '#f4e6ea'], [1, '#e898b8']]), roughness: 0.5, sheen: 0.8, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide, transmission: 0.15, thickness: 0.02 });
      const tg = dat ? trumpetGeo(0.4, 0.026, 0.17) : trumpetGeo(0.12, 0.008, 0.05, { tip: 0.35 });
      if (dat) {
        g.add(place(mesh(tg, fm), -0.15, 0.1, 0.05, -1.25, 0.5, 0)); g.add(place(mesh(tg, fm), 0.1, 0.16, -0.12, -0.9, -0.6, 0.3));
        g.add(stem([V3(-0.27, 0.06, 0.02), V3(-0.4, 0.04, 0.0), V3(-0.5, 0.02, -0.05)], 0.008, '#4a6a32'));
        spikyPod(g, 0.07, '#5a7a3a', '#7a9a52', 120, 0.38, 0.08, 0.25);
        leafAt(g, 0.3, -0.2, 1.4, '#2f5a2a', 1.2, 'lobed'); leafAt(g, -0.4, 0.3, -0.4, '#2f5a2a', 1.0, 'lobed');
      } else {
        const pts = [V3(0, 0.02, 0.15), V3(0.02, 0.35, 0.05), V3(0, 0.62, 0)]; g.add(stem(pts, 0.008, '#6a8a42')); const curve = new THREE.CatmullRomCurve3(pts);
        for (let k = 0; k < 7; k++) { const p = curve.getPointAt(0.65 + k * 0.05), a = k * 2.2; g.add(place(mesh(tg, fm), p.x + Math.cos(a) * 0.04, p.y, p.z + Math.sin(a) * 0.04, Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1)); }
        leafAt(g, 0.15, 0.2, 0.8, '#4a7a32', 1.3, 'ovate'); leafAt(g, -0.2, 0.15, -0.7, '#4a7a32', 1.2, 'ovate');
      }
      return g;
    }
    case 'pittosporum': {
      const lm = M.leaf('#2f5a2a', '#7aa85a', 'ovate'); lm.clearcoat = 0.9; lm.clearcoatRoughness = 0.15;
      const geo = floretGeo({ petals: 5, len: 0.03, wid: 0.016, open: 1.3, cup: 0.3, droop: 0.2 }), pm = M.petal('#fbf6e0', '#ffffff', '#efe2b0', 'long');
      for (let s = 0; s < 3; s++) {
        const x0 = -0.3 + s * 0.28, pts = [V3(x0, 0.02, 0.15), V3(x0 + 0.03, 0.25, 0.05), V3(x0 + 0.05, 0.45 + s * 0.04, 0)]; g.add(stem(pts, 0.008, '#6a5a4a'));
        const tip = pts[2];
        for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + s; const l = mesh(bendPlane(0.06, 0.16, { cup: 0.5, curl: 0.1 }), lm); const h = new THREE.Group(); h.rotation.y = a; l.rotation.x = 1.0 + (k % 2) * 0.3; h.add(l); h.position.copy(tip).add(V3(0, -0.04, 0)); g.add(h); }
        const fl = []; for (let k = 0; k < 16; k++) { const a = k * 2.4, d = 0.06 * Math.sqrt(k / 16); fl.push([tip.clone().add(V3(Math.cos(a) * d, 0.02 + (1 - d / 0.06) * 0.025, Math.sin(a) * d)), V3(Math.cos(a) * 0.7, 1, Math.sin(a) * 0.7), 2.2, r() * TAU]); }
        instances(g, geo, pm, fl);
      }
      return g;
    }
    case 'santolina': {
      const leaf = new THREE.CapsuleGeometry(0.004, 0.035, 2, 4); leaf.translate(0, 0.02, 0);
      const lm = M.std('#b8c0b0', { roughness: 0.75, sheen: 1, sheenColor: new THREE.Color('#f2f4ee'), sheenRoughness: 0.4 }), list = [];
      for (let i = 0; i < 1400; i++) { const t = Math.acos(r()), a = r() * TAU, rr = 0.32 * (0.85 + r() * 0.15), p = V3(Math.sin(t) * Math.cos(a) * rr, Math.cos(t) * rr * 0.7, Math.sin(t) * Math.sin(a) * rr); list.push([p, p.clone().normalize().add(V3((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)), 0.8 + r() * 0.5]); }
      instances(g, leaf, lm, list);
      const btn = displace(new THREE.SphereGeometry(0.03, 16, 12), 0.004, 40, 2, 3); btn.scale(1, 0.75, 1);
      for (let k = 0; k < 9; k++) { const a = k * 2.4, d = 0.22 * Math.sqrt((k + 0.5) / 9), b = V3(Math.cos(a) * d, 0.22 + 0.2 * (1 - d / 0.25), Math.sin(a) * d), top = b.clone().add(V3(0, 0.14, 0)); g.add(stem([b, b.clone().lerp(top, 0.5).add(V3(0.01, 0, 0)), top], 0.0025, '#a8b0a0')); g.add(mesh(btn, M.std('#f2c81a', { roughness: 0.7, bumpMap: noiseTex('button', 90, 2), bumpScale: 2 }), top.x, top.y + 0.015, top.z)); }
      return g;
    }
  }
  return fifthNotes(ing);
}

// ── specimens for notes from the emptier corners of the map ──────────
// a log, an end slice and a planed board in one timber's colours
function timber(g, ing, { gloss = 0.3, dark = 0.45 } = {}) {
  const [c0, c1] = ing.c, r = rng(hash(ing.id)), barkCol = shade(c1, -dark);
  const bark = M.std(barkCol, { roughness: 0.95, bumpMap: noiseTex('bark' + ing.id, 20, 2.2, [3, 1]), bumpScale: 6 });
  const end = M.std(0xffffff, { map: ringTex(c0, c1, ing.id), roughness: 0.7 });
  g.add(place(mesh(displace(new THREE.CylinderGeometry(0.2, 0.22, 0.7, 48, 6), 0.01, 5, 2, 3), [bark, end, end]), -0.15, 0.2, -0.05, Math.PI / 2, 0.5, 0));
  const grain = canvasTex('grain' + ing.id, 512, 128, (c, W, H) => { c.fillStyle = c0; c.fillRect(0, 0, W, H); for (let i = 0; i < 70; i++) { c.strokeStyle = `rgba(40,20,8,${0.08 + Math.random() * 0.2})`; c.lineWidth = 1 + Math.random() * 3; c.beginPath(); const y = Math.random() * H; c.moveTo(0, y); c.bezierCurveTo(W * 0.3, y + 12 * Math.sin(i), W * 0.7, y - 10, W, y + 6); c.stroke(); } });
  g.add(place(mesh(new THREE.BoxGeometry(0.55, 0.035, 0.16), M.std(0xffffff, { map: grain, roughness: 0.35, clearcoat: gloss, clearcoatRoughness: 0.1 })), -0.05, 0.018, 0.38, 0, 0.2, 0));
  const chip = displace(new THREE.BoxGeometry(0.1, 0.012, 0.04, 4, 1, 2), 0.004, 12, 2, 2);
  const cp = pile(chip, M.std(c0, { roughness: 0.7 }), 30, 0.2, 9, { height: 0.12, flat: true }); cp.position.set(0.38, 0, -0.15); g.add(cp);
}
// translucent resin tears heaped on a dish
function tears(g, col, { n = 26, R = 0.035, opaque = false, seed = 3, x = 0, z = 0 } = {}) {
  const geo = blob(R, R * 0.35, 9, seed, 3); geo.scale(1, 0.8, 1.2);
  const mat = opaque ? M.std(col, { roughness: 0.8, bumpMap: noiseTex('chalk', 60, 2), bumpScale: 2 }) : M.liquid(col, { transmission: 0.55, roughness: 0.3, thickness: 0.4, attenuationDistance: 0.12, clearcoat: 0.6 });
  const pp = pile(geo, mat, n, 0.22, seed, { height: 0.35 }); pp.position.set(x, 0.03, z); g.add(pp);
}
// a cluster of berries, each a little sphere with an optional crown
function berries(g, center, n, R, mat, spread, seed = 1) {
  const r = rng(seed), list = [];
  for (let i = 0; i < n; i++) { const a = r() * TAU, d = spread * Math.sqrt(r()); list.push([center.clone().add(V3(Math.cos(a) * d, (r() - 0.5) * spread * 0.6, Math.sin(a) * d)), V3(r() - 0.5, 1, r() - 0.5), (0.8 + r() * 0.4)]); }
  return instances(g, new THREE.SphereGeometry(R, 16, 12), mat, list);
}
// a stem densely set with tiny needle or scale leaves
function needles(g, pts, { n = 120, len = 0.035, col = '#3f6a32', w = 0.003, angle = 0.8, seed = 1, start = 0.15 } = {}) {
  const leaf = new THREE.CapsuleGeometry(w, len, 2, 4); leaf.scale(1, 1, 0.5); leaf.translate(0, len * 0.55, 0);
  const curve = new THREE.CatmullRomCurve3(pts), im = new THREE.InstancedMesh(leaf, M.std(col, { roughness: 0.6 }), n), m4 = new THREE.Matrix4(), r = rng(seed);
  for (let i = 0; i < n; i++) { const p = curve.getPointAt(start + (i / n) * (1 - start)), a = i * 2.4 + r() * 0.3; m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(angle * Math.cos(a), a, angle * Math.sin(a))), V3(1, 1, 1)); im.setMatrixAt(i, m4); }
  im.castShadow = true; g.add(im); return curve;
}

function fifthNotes(ing) {
  const id = ing.id, r = rng(hash(id)), g = new THREE.Group(), [c0, c1, c2] = ing.c;
  const glossy = (c, o = {}) => M.std(c, { roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.18, ...o });
  switch (id) {
    case 'orchid': {
      const lm = glossy('#3f6a2e', { side: THREE.DoubleSide });
      for (let i = 0; i < 4; i++) { const l = mesh(bendPlane(0.16, 0.42, { cup: 0.5, droop: 0.35 }), lm); const h = new THREE.Group(); h.rotation.y = i * 1.7; l.rotation.x = 1.42; h.add(l); h.position.set(-0.05, 0.03, 0.05); g.add(h); }
      const arc = [V3(-0.05, 0.03, 0.05), V3(-0.02, 0.4, 0.0), V3(0.12, 0.62, -0.05), V3(0.32, 0.6, -0.05), V3(0.45, 0.5, -0.03)];
      g.add(stem(arc, 0.006, '#4a5a32')); const curve = new THREE.CatmullRomCurve3(arc);
      const pm = M.petal('#fbf4fa', '#ffffff', c0, 'round'), lipM = M.petal(c0, c1, c2, 'round');
      for (let k = 0; k < 6; k++) {
        const p = curve.getPointAt(0.42 + k * 0.1), f = new THREE.Group(), s = 2.1 - k * 0.15;
        for (const [a, w, h, o] of [[0, 0.07, 0.11, 1.55], [TAU / 3, 0.07, 0.11, 1.55], [-TAU / 3, 0.07, 0.11, 1.55], [Math.PI / 3, 0.12, 0.11, 1.45], [-Math.PI / 3, 0.12, 0.11, 1.45]]) { const pe = mesh(bendPlane(w, h, { cup: 0.3 }), pm); const hd = new THREE.Group(); hd.rotation.z = a; pe.rotation.x = Math.PI / 2 - (o - 1.45) * 2; hd.add(pe); f.add(hd); }
        const lip = mesh(bendPlane(0.05, 0.07, { cup: 1.2, curl: 0.3 }), lipM); lip.rotation.set(0.6, 0, Math.PI); lip.position.z = 0.012; f.add(lip);
        f.add(mesh(new THREE.SphereGeometry(0.008, 10, 8), M.std('#f2d23a'), 0, 0.012, 0.012));
        place(f, p.x, p.y - 0.09, p.z + 0.05, 0.15, 0.3 - k * 0.05, 0, s); g.add(f); g.add(stem([p, p.clone().add(V3(0, -0.06, 0.04))], 0.003, '#4a5a32'));
      }
      for (let k = 0; k < 2; k++) { const p = curve.getPointAt(0.95 + k * 0.05); g.add(mesh(new THREE.SphereGeometry(0.018 - k * 0.005, 12, 10), M.std('#d8d8b8', { roughness: 0.5 }), p.x, p.y - 0.02, p.z)); }
      return g;
    }
    case 'rooibos': {
      for (let s = 0; s < 4; s++) { const x0 = -0.4 + s * 0.09, top = 0.42 + r() * 0.15, lean = (r() - 0.5) * 0.3; const pts = [V3(x0, 0.02, -0.15), V3(x0 + lean * 0.4, top * 0.5, -0.2), V3(x0 + lean, top, -0.25)]; g.add(stem(pts, 0.005, '#8a4a2a')); needles(g, pts, { n: 90, len: 0.04, col: '#5a8a3a', w: 0.0025, angle: 0.7, seed: s + 3 }); }
      const bowl = dish(0.22, '#f4efe6', false); bowl.position.set(0.25, 0, 0.2); g.add(bowl);
      const bit = new THREE.CapsuleGeometry(0.003, 0.018, 2, 4); const pp = pile(bit, M.std('#a8421e', { roughness: 0.8 }), 600, 0.17, 4, { height: 0.35 }); pp.position.set(0.25, 0.025, 0.2); g.add(pp);
      glassOf(g, [[0, 0], [0.06, 0], [0.07, 0.02], [0.075, 0.12], [0.078, 0.13]], '#b8401a', -0.15, 0.3, 0.8);
      return g;
    }
    case 'omumbiri': case 'breubranco': {
      const white = id === 'breubranco';
      g.add(dish(0.4, '#2a2420', false));
      tears(g, c0, { n: white ? 22 : 30, R: white ? 0.045 : 0.035, opaque: white, seed: 5 });
      const bark = M.std(white ? '#6a5a4a' : '#9a8a6a', { roughness: 0.85, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 3 });
      const br = [V3(0.35, 0.02, -0.3), V3(0.45, 0.2, -0.32), V3(0.4, 0.4, -0.3)]; g.add(mesh(tube(br, 0.03, 20, 10, 0.4), bark));
      if (white) for (let i = 0; i < 4; i++) g.add(mesh(blob(0.025, 0.008, 9, i, 2), M.std(c0, { roughness: 0.8 }), 0.42 + (r() - 0.5) * 0.04, 0.1 + i * 0.07, -0.29));
      else { sprig(g, [V3(0.4, 0.4, -0.3), V3(0.3, 0.5, -0.25), V3(0.2, 0.55, -0.2)], { col: '#7a9a4a', n: 7, size: 0.04, aspect: 1.4, pairs: true, stemCol: '#8a7a5a', r0: 0.006, seed: 9 }); g.add(mesh(new THREE.SphereGeometry(0.02, 12, 10), M.liquid(c0, { transmission: 0.5, clearcoat: 1, attenuationDistance: 0.05 }), 0.45, 0.24, -0.29)); }
      return g;
    }
    case 'okoume': case 'osyris': case 'vanuatusandal': {
      timber(g, ing, { gloss: id === 'okoume' ? 0.6 : 0.3 });
      return g;
    }
    case 'buddhawood': case 'bluecypress': {
      const bw = id === 'buddhawood';
      const bark = M.std(bw ? shade(c1, -0.4) : '#7a5a3e', { roughness: 0.9, bumpMap: noiseTex('bark' + id, 25, 2, [3, 1]), bumpScale: 5 });
      for (let i = 0; i < (bw ? 5 : 3); i++) { const pts = []; const x0 = -0.45 + i * 0.12, z0 = -0.15 + (i % 2) * 0.12; for (let k = 0; k <= 5; k++) pts.push(V3(x0 + k * 0.14, 0.035 + Math.sin(k * 1.7 + i) * 0.015, z0 + Math.sin(k * 2.3 + i) * (bw ? 0.05 : 0.02))); g.add(mesh(tube(pts, bw ? 0.03 : 0.045, 30, 10, 0.25), bark)); }
      if (!bw) for (let s = 0; s < 3; s++) { const pts = [V3(0.15 + s * 0.12, 0.02, 0.3 - s * 0.05), V3(0.18 + s * 0.12, 0.2, 0.25 - s * 0.05), V3(0.2 + s * 0.13, 0.4 + s * 0.04, 0.2)]; g.add(stem(pts, 0.004, '#6a4a3a')); needles(g, pts, { n: 220, len: 0.03, col: '#3a5a3a', w: 0.004, angle: 0.5, seed: 4 + s }); }
      return g;
    }
    case 'grainsofparadise': {
      g.add(dish(0.3, '#efe5d6', false));
      const pod = displace(new THREE.CapsuleGeometry(0.035, 0.09, 8, 16), 0.006, 18, 2, 3); pod.scale(1, 1, 0.85);
      const pm = M.std('#7a4a2a', { roughness: 0.75, bumpMap: noiseTex('podr', 25, 2, [1, 4]), bumpScale: 3 });
      [[-0.12, 0.05, 0.3], [0.02, -0.12, -0.5], [0.1, 0.12, 1.2]].forEach(([x, z, a]) => g.add(place(mesh(pod, pm), x, 0.065, z, Math.PI / 2, a, 0, 1.15)));
      const seed = new THREE.IcosahedronGeometry(0.009, 1); const sp = pile(seed, glossy('#6a2a1a', { roughness: 0.4 }), 220, 0.12, 6, { height: 0.35 }); sp.position.set(0.14, 0.025, 0.08); g.add(sp);
      return g;
    }
    case 'teatree': case 'lemonmyrtle': case 'manuka': {
      const fl = new THREE.Group(), list = [], nS = id === 'lemonmyrtle' ? 3 : 5;
      for (let s = 0; s < nS; s++) {
        const x0 = -0.35 + s * (0.6 / nS), top = 0.45 + r() * 0.2, lean = (r() - 0.5) * 0.35, pts = [V3(x0, 0.02, 0.1), V3(x0 + lean * 0.4, top * 0.5, 0.0), V3(x0 + lean, top, -0.05)];
        let curve;
        if (id === 'lemonmyrtle') curve = sprig(g, pts, { col: '#3f6a2e', n: 9, size: 0.09, aspect: 3, gloss: 0.9, stemCol: '#6a5a3a', r0: 0.006, seed: s + 60 });
        else { g.add(stem(pts, 0.005, '#6a4a3a')); curve = needles(g, pts, { n: id === 'manuka' ? 130 : 160, len: id === 'manuka' ? 0.02 : 0.035, col: id === 'manuka' ? '#4a5a32' : '#5a8a4a', w: 0.0028, angle: 0.75, seed: s + 7 }); }
        for (let k = 0; k < (id === 'manuka' ? 6 : 3); k++) { const p = curve.getPointAt(id === 'manuka' ? 0.3 + k * 0.12 : 0.75 + k * 0.1); list.push(p.add(V3(Math.cos(k * 2 + s) * 0.03, 0.02, Math.sin(k * 2 + s) * 0.03))); }
      }
      if (id === 'manuka') {
        const geo = floretGeo({ petals: 5, len: 0.026, wid: 0.026, open: 1.5, cup: 0.4 });
        instances(g, geo, M.petal('#fbf6f2', '#ffffff', '#f2d4d8'), list.map((p) => [p, V3(r() - 0.5, 1, r() - 0.5), 2, r() * TAU]));
        instances(g, new THREE.SphereGeometry(0.008, 8, 6), M.std('#7a2a3a'), list.map((p) => [p.clone().add(V3(0, 0.008, 0)), V3(0, 1, 0), 1.6]));
        glassOf(g, [[0, 0], [0.09, 0], [0.1, 0.02], [0.1, 0.16], [0.08, 0.18]], '#d89a2a', 0.38, 0.3, 0.8, { thickness: 0.08 });
      } else {
        const fil = []; list.forEach((p) => { for (let k = 0; k < 40; k++) { const a = r() * TAU, t = Math.acos(r() * 2 - 1); const d = V3(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)); fil.push([p.clone().addScaledVector(d, 0.006), d, 1]); } });
        const f = new THREE.CylinderGeometry(0.0012, 0.0012, 0.03, 4); f.translate(0, 0.015, 0);
        instances(g, f, M.std('#f6f2dc', { roughness: 0.6 }), fil);
      }
      return g;
    }
    case 'tiare': case 'stephanotis': {
      const tiare = id === 'tiare', lm = glossy('#2f5a2a', { side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) { const l = mesh(bendPlane(0.11, 0.26, { cup: 0.4, curl: 0.1 }), M.leaf('#2f5a2a', '#6a9a4a', 'ovate')); l.material.clearcoat = 0.9; place(l, (r() - 0.5) * 0.6, 0.02, (r() - 0.5) * 0.4, -1.4, r() * TAU, 0); g.add(l); }
      const cols = ['#fffdf6', '#ffffff', '#f4ecd0'];
      if (tiare) {
        for (let k = 0; k < 6; k++) { const h = new THREE.Group(); h.add(flowerHead(ing, { petals: 7, len: 0.13, wid: 0.055, kind: 'long', open: 1.5, cup: 0.4, twist: 0.6, centerR: 0.008, center: '#f2e2a0', colors: cols })); h.add(mesh(new THREE.CylinderGeometry(0.007, 0.005, 0.1, 10), M.std('#f8f2e0'), 0, -0.05, 0)); const a = k * TAU / 6; place(h, Math.cos(a) * 0.2, 0.09 + (k % 2) * 0.03, Math.sin(a) * 0.2, -0.3 * Math.cos(a), 0, 0.3 * Math.sin(a), 1.2); g.add(h); }
        g.add(place(mesh(new THREE.TorusGeometry(0.2, 0.006, 8, 48), M.std('#5a8a3a')), 0, 0.04, 0, Math.PI / 2, 0, 0));
      } else {
        const vine = []; for (let i = 0; i <= 10; i++) { const t = i / 10; vine.push(V3(-0.45 + t * 0.9, 0.05 + Math.sin(t * 6) * 0.04 + t * 0.2, Math.cos(t * 5) * 0.1)); }
        g.add(stem(vine, 0.007, '#5a7a3a')); const curve = new THREE.CatmullRomCurve3(vine);
        const fm = M.std('#fbfaf2', { roughness: 0.3, clearcoat: 0.7, side: THREE.DoubleSide }), tg = trumpetGeo(0.07, 0.008, 0.045, { tip: 0.6 });
        for (let c = 0; c < 3; c++) { const p = curve.getPointAt(0.3 + c * 0.3); for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + c; g.add(place(mesh(tg, fm), p.x + Math.cos(a) * 0.03, p.y + 0.02, p.z + Math.sin(a) * 0.03, Math.cos(a) * 0.8, 0, -Math.sin(a) * 0.8, 1.3)); } }
      }
      return g;
    }
    case 'priprioca': {
      const root = M.std('#3a2a20', { roughness: 0.8, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 3 });
      const rg = new THREE.Group(); for (let i = 0; i < 9; i++) { const tb = blob(0.035, 0.008, 8, i, 3); tb.scale(1, 0.8, 1.2); rg.add(mesh(tb, root, (r() - 0.5) * 0.3, 0.03, (r() - 0.5) * 0.2)); } rg.position.set(0.25, 0, 0.25); g.add(rg);
      const sm = M.std('#5a8a3a', { roughness: 0.5 });
      for (let s = 0; s < 5; s++) { const x0 = -0.3 + s * 0.06, top = V3(x0 + (r() - 0.5) * 0.2, 0.55 + r() * 0.15, -0.1 + (r() - 0.5) * 0.1); g.add(mesh(tube([V3(x0, 0.02, -0.05), V3(x0, top.y * 0.5, -0.07), top], 0.005, 16, 3), sm));
        for (let b = 0; b < 4; b++) { const l = mesh(bendPlane(0.012, 0.14, { droop: 0.4 }), M.leaf('#5a8a3a', '#a8c878', 'long')); const h = new THREE.Group(); h.rotation.y = b * 1.57 + s; l.rotation.x = 1.1; h.add(l); h.position.copy(top); g.add(h); }
        g.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), M.std('#6a5a3a', { roughness: 0.9 }), top.x, top.y + 0.01, top.z)); }
      return g;
    }
    case 'heather': {
      const fm = M.std(c0, { roughness: 0.55, sheen: 0.8, sheenColor: new THREE.Color(c1) }), bell = new THREE.SphereGeometry(0.008, 8, 6); bell.scale(1, 1.3, 1);
      for (let s = 0; s < 9; s++) {
        const a = s * 0.7, x0 = Math.cos(a) * 0.12, z0 = Math.sin(a) * 0.1, top = 0.32 + r() * 0.15, pts = [V3(x0, 0.02, z0), V3(x0 * 1.6, top * 0.5, z0 * 1.6), V3(x0 * 2.4, top, z0 * 2.4)];
        g.add(stem(pts, 0.004, '#5a3a2a')); const curve = needles(g, pts, { n: 80, len: 0.012, col: '#3a5a32', w: 0.002, angle: 0.9, seed: s + 30, start: 0.1 });
        const list = []; for (let k = 0; k < 30; k++) { const p = curve.getPointAt(0.5 + (k / 30) * 0.5), b = k * 2.4; list.push([p.clone().add(V3(Math.cos(b) * 0.012, 0, Math.sin(b) * 0.012)), V3(Math.cos(b), 0.6, Math.sin(b)), 1]); }
        instances(g, bell, fm, list);
      }
      return g;
    }
    case 'cloudberry': case 'lingonberry': case 'seabuckthorn': {
      if (id === 'cloudberry') {
        for (let i = 0; i < 3; i++) leafAt(g, -0.25 + i * 0.22, (i % 2) * 0.15, i * 2, '#4a7a32', 1.0, 'lobed');
        const dm = M.std('#f29a2a', { roughness: 0.25, transmission: 0.3, thickness: 0.05, clearcoat: 0.8, sheen: 0.4 });
        [[-0.1, 0.18, 0.15], [0.15, 0.05, 0.13], [0.3, 0.3, 0.11]].forEach(([x, z, h], j) => { const c = V3(x, h, z); g.add(stem([V3(x - 0.05, 0.02, z + 0.05), V3(x, h * 0.5, z), c], 0.004, '#6a7a42')); const list = []; for (let k = 0; k < 26; k++) { const t = Math.acos(1 - (k + 0.5) / 26 * 1.6), a = k * 2.4; list.push([c.clone().add(V3(Math.sin(t) * Math.cos(a) * 0.035, Math.cos(t) * 0.035 + 0.03, Math.sin(t) * Math.sin(a) * 0.035)), V3(0, 1, 0), 1]); } instances(g, new THREE.SphereGeometry(0.014, 12, 10), dm, list); });
        const fl = flowerHead(ing, { petals: 5, len: 0.05, wid: 0.045, open: 1.45, cup: 0.3, centerR: 0.01, center: '#e8d88a', colors: ['#fbfaf4', '#ffffff', '#efe8d8'] }); place(fl, -0.35, 0.12, -0.15, -0.2, 0, 0, 1.2); g.add(fl); g.add(stem([V3(-0.35, 0.11, -0.15), V3(-0.33, 0.05, -0.12), V3(-0.3, 0.02, -0.1)], 0.003, '#6a7a42'));
      } else if (id === 'lingonberry') {
        const bm = glossy('#c01a2a');
        for (let s = 0; s < 5; s++) { const x0 = -0.35 + s * 0.15, pts = [V3(x0, 0.02, 0.1), V3(x0 + 0.03, 0.12, 0.0), V3(x0 + 0.06, 0.22 + r() * 0.08, -0.05)]; const curve = sprig(g, pts, { col: '#2f5a2a', n: 10, size: 0.035, aspect: 1.5, gloss: 0.9, stemCol: '#6a4a3a', r0: 0.004, seed: s + 40 }); berries(g, curve.getPointAt(1).add(V3(0, 0.01, 0.03)), 7, 0.018, bm, 0.035, s + 2); }
        berries(g, V3(0.3, 0.02, 0.3), 14, 0.018, bm, 0.1, 9);
      } else {
        const br = [V3(-0.5, 0.05, 0.1), V3(-0.1, 0.25, 0.0), V3(0.35, 0.45, -0.1)]; g.add(mesh(tube(br, 0.014, 20, 8, 0.5), M.std('#5a4a3a', { roughness: 0.85 })));
        const curve = new THREE.CatmullRomCurve3(br), bm = glossy('#f2861a', { transmission: 0.2, thickness: 0.03 });
        for (let k = 0; k < 9; k++) berries(g, curve.getPointAt(0.12 + k * 0.1), 10, 0.016, bm, 0.03, k + 3);
        const leaf = mesh(bendPlane(0.016, 0.11, { cup: 0.3 }), M.std('#9aa89a', { roughness: 0.6, sheen: 1, sheenColor: new THREE.Color('#e8eee8'), side: THREE.DoubleSide }));
        for (let k = 0; k < 18; k++) { const p = curve.getPointAt(0.05 + k * 0.053), h = new THREE.Group(), l = leaf.clone(); h.position.copy(p); h.rotation.y = k * 2.4; l.rotation.x = 0.7; h.add(l); g.add(h); }
      }
      return g;
    }
    case 'tulip': {
      const heads = [[-0.15, 0.0, 0.62, 0.15], [0.12, -0.08, 0.55, -0.2], [0.0, 0.15, 0.48, 0.1]];
      heads.forEach(([x, z, h, lean], j) => {
        const top = V3(x + lean * 0.3, h, z); g.add(stem([V3(x, 0.02, z), V3(x + lean * 0.1, h * 0.5, z), top], 0.008, '#5a8a3a'));
        const head = new THREE.Group(), pm = M.petal(c0, c1, c2, 'round');
        for (let k = 0; k < 6; k++) { const p = mesh(bendPlane(0.09, 0.15, { cup: 1.1, curl: -0.1 }), pm); const hd = new THREE.Group(); hd.rotation.y = k * TAU / 6 + (k % 2) * 0.3; p.rotation.x = 0.28 + (k % 2) * 0.1; p.position.z = (k % 2) * 0.004; hd.add(p); head.add(hd); }
        head.position.copy(top); head.rotation.z = -lean * 0.4; g.add(head);
      });
      for (let i = 0; i < 4; i++) { const l = mesh(bendPlane(0.09, 0.4, { cup: 0.6, droop: 0.3, twist: 0.2 }), M.leaf('#5a8a5a', '#a8c8a8', 'long')); const h = new THREE.Group(); h.rotation.y = i * 1.6; l.rotation.x = 0.35; h.add(l); h.position.set(0, 0.02, 0.05); g.add(h); }
      return g;
    }
    case 'maple': {
      const cols = ['#d8401a', '#e8781a', '#b8201a', '#f0a02a'];
      for (let i = 0; i < 5; i++) leafAt(g, -0.35 + i * 0.13, (i % 2) * 0.2 - 0.1, i * 1.3, cols[i % 4], 1.15, 'lobed', 0.02 + i * 0.004, -1.5);
      glassOf(g, [[0, 0], [0.08, 0], [0.09, 0.02], [0.09, 0.2], [0.05, 0.25], [0.025, 0.27], [0.025, 0.31]], '#a8521a', 0.32, 0.25, 0.85, { thickness: 0.06 });
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 24), M.std('#c8a060', { roughness: 0.6 }), 0.32, 0.33, 0.25));
      return g;
    }
    case 'labradortea': {
      for (let s = 0; s < 4; s++) {
        const x0 = -0.3 + s * 0.18, top = 0.4 + r() * 0.12, pts = [V3(x0, 0.02, 0.1), V3(x0 + 0.03, top * 0.5, 0.02), V3(x0 + 0.05, top, -0.03)];
        sprig(g, pts, { col: '#3a5a2a', n: 10, size: 0.03, aspect: 4, stemCol: '#8a5a3a', r0: 0.005, spread: 1.4, seed: s + 70 });
        umbel(g, pts[2], { rays: 16, len: 0.09, col: '#fbf8f0', fr: 0.012, per: 6, seed: s + 3, stemCol: '#8a6a4a' });
      }
      const under = mesh(bendPlane(0.03, 0.12, { cup: 0.8 }), M.std('#a8621e', { roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#e8a86a'), side: THREE.DoubleSide }));
      for (let i = 0; i < 4; i++) g.add(place(under.clone(), 0.3 + i * 0.05, 0.012, 0.3 - i * 0.03, Math.PI / 2, i * 0.6, 0));
      return g;
    }
    case 'oolong': {
      g.add(place(dish(0.22, '#efe8dc', false), -0.2, 0, -0.05));
      const ball = new THREE.Group(); const pp = pile(blob(0.026, 0.008, 20, 2, 2), M.std('#3a4a26', { roughness: 0.7, bumpMap: noiseTex('rolled', 50, 2), bumpScale: 3 }), 70, 0.16, 4, { height: 0.5 }); pp.position.set(0, 0.025, 0); ball.add(pp); ball.position.set(-0.2, 0, -0.05); g.add(ball);
      const cup = [[0, 0], [0.05, 0], [0.06, 0.01], [0.09, 0.08], [0.095, 0.09]];
      const cg = new THREE.Group(); cg.add(mesh(new THREE.LatheGeometry(cup.map(([a, b]) => new THREE.Vector2(a, b)), 48), M.std('#f6f2ea', { roughness: 0.15, clearcoat: 1, side: THREE.DoubleSide })));
      cg.add(mesh(new THREE.CircleGeometry(0.085, 48).rotateX(-Math.PI / 2), M.juice('#c8862a'), 0, 0.07, 0)); cg.position.set(0.25, 0, 0.18); cg.scale.setScalar(1.6); g.add(cg);
      leafAt(g, 0.25, -0.2, 0.6, '#4a6a2e', 0.65, 'serrated', 0.02, -1.5); leafAt(g, 0.4, -0.05, 1.8, '#4a6a2e', 0.55, 'serrated', 0.025, -1.45);
      return g;
    }
    case 'massoia': {
      const outer = M.std('#8a6a4a', { roughness: 0.9, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 3 }), inner = M.std('#d8b88a', { roughness: 0.8 });
      for (let i = 0; i < 6; i++) { const geo = new THREE.CylinderGeometry(0.04, 0.04, 0.4 + r() * 0.15, 24, 1, true, 0, Math.PI * 1.6); const q = new THREE.Group(); q.add(mesh(geo, outer)); const ig = geo.clone(); ig.scale(0.92, 1, 0.92); q.add(mesh(ig, M.std('#d8b88a', { roughness: 0.8, side: THREE.BackSide }))); place(q, -0.25 + (i % 3) * 0.09, 0.04 + Math.floor(i / 3) * 0.075, -0.05 + (i % 2) * 0.05, Math.PI / 2, 0.3 + (r() - 0.5) * 0.2, i); g.add(q); }
      return g;
    }
    case 'taifrose': {
      g.add(place(roseHead(ing, { n: 38, open: 1.3, size: 0.26 }), -0.15, 0.36, 0, 0.5, 0, 0)); g.add(stem([V3(-0.15, 0.34, 0), V3(-0.1, 0.18, 0.1), V3(-0.05, 0.02, 0.25)], 0.011, '#4a6a32'));
      g.add(place(roseHead(ing, { n: 22, open: 0.6, size: 0.2 }), 0.22, 0.26, -0.12, 0.3, 0, 0)); g.add(stem([V3(0.22, 0.24, -0.12), V3(0.2, 0.12, 0.0), V3(0.18, 0.02, 0.15)], 0.009, '#4a6a32'));
      leafAt(g, 0.15, 0.3, 0.6, '#3f6e2e', 0.9, 'serrated');
      const bowl = dish(0.2, '#f4efe6', false); bowl.position.set(0.38, 0, 0.3); g.add(bowl);
      const pm = M.petal(c0, c1, c2, 'round'); for (let i = 0; i < 16; i++) { const p = mesh(bendPlane(0.05, 0.05, { cup: 0.8 }), pm); place(p, 0.38 + (r() - 0.5) * 0.22, 0.035 + r() * 0.03, 0.3 + (r() - 0.5) * 0.22, -Math.PI / 2 + (r() - 0.5), r() * TAU, (r() - 0.5)); g.add(p); }
      return g;
    }
  }
  return sixthNotes(ing);
}

// ── specimens for the newest batch of notes ──────────
// a cut citrus-like face: rind, pith and n juicy segments
function segFace(key, rind, pith, flesh, n) {
  return cutFace(key, (c, W) => {
    c.fillStyle = rind; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.fill();
    c.fillStyle = pith; c.beginPath(); c.arc(W / 2, W / 2, W * 0.45, 0, TAU); c.fill();
    for (let k = 0; k < n; k++) { const a0 = k * TAU / n + 0.05, a1 = (k + 1) * TAU / n - 0.05; c.fillStyle = flesh; c.beginPath(); c.moveTo(W / 2 + Math.cos((a0 + a1) / 2) * 8, W / 2 + Math.sin((a0 + a1) / 2) * 8); c.arc(W / 2, W / 2, W * 0.41, a0, a1); c.closePath(); c.fill(); }
    c.globalAlpha = 0.35; c.fillStyle = '#ffffff'; for (let i = 0; i < 60; i++) { const a = Math.random() * TAU, d = Math.random() * W * 0.38; c.fillRect(W / 2 + Math.cos(a) * d, W / 2 + Math.sin(a) * d, 3, 6); }
  });
}
// a seedy fruit face: skin ring, flesh and scattered seeds
function seedFace(key, skin, flesh, inner, seedCol, nSeeds, seedR = 4) {
  return cutFace(key, (c, W) => {
    c.fillStyle = skin; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.fill();
    const gr = c.createRadialGradient(W / 2, W / 2, 4, W / 2, W / 2, W * 0.47); gr.addColorStop(0, inner); gr.addColorStop(1, flesh);
    c.fillStyle = gr; c.beginPath(); c.arc(W / 2, W / 2, W * 0.46, 0, TAU); c.fill();
    c.fillStyle = seedCol; for (let i = 0; i < nSeeds; i++) { const a = i * 2.39996, d = Math.sqrt((i + 0.5) / nSeeds) * W * 0.3; c.beginPath(); c.ellipse(W / 2 + Math.cos(a) * d, W / 2 + Math.sin(a) * d, seedR, seedR * 1.6, a, 0, TAU); c.fill(); }
  });
}
// a bract-and-cone hop or pine-like cone: overlapping scales spiralling up an axis
function scaleCone(g, base, axis, L, R, n, mat, { w = 0.05, h = 0.06, cup = 0.8, open = 0.5 } = {}) {
  const a = axis.clone().normalize(), t1 = Math.abs(a.x) > 0.9 ? V3(0, 0, 1) : V3(1, 0, 0), u = t1.clone().cross(a).normalize(), v = a.clone().cross(u);
  const geo = bendPlane(w, h, { cup });
  for (let i = 0; i < n; i++) {
    const t = i / n, ang = i * 2.39996, rad = R * Math.sin(Math.PI * (0.1 + t * 0.85)), o = u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang));
    const p = base.clone().addScaledVector(a, L * t).addScaledVector(o, rad * 0.4), s = 0.5 + Math.sin(Math.PI * (0.1 + t * 0.85)) * 0.6;
    const sc = mesh(geo, mat); sc.position.copy(p); sc.up.copy(a); sc.lookAt(p.clone().add(o).addScaledVector(a, -open)); sc.rotateX(-Math.PI / 2 + 0.25); sc.scale.setScalar(s); g.add(sc);
  }
}

function sixthNotes(ing) {
  const id = ing.id, r = rng(hash(id)), g = new THREE.Group(), [c0, c1, c2] = ing.c;
  const glossy = (c, o = {}) => M.std(c, { roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.18, ...o });
  switch (id) {
    case 'calamansi': {
      const green = glossy('#8fb83a', { bumpMap: noiseTex('calam', 70, 1.2), bumpScale: 0.6 }), ripe = glossy('#f0a52a', { bumpMap: noiseTex('calam', 70, 1.2), bumpScale: 0.6 });
      sprig(g, [V3(-0.5, 0.04, -0.3), V3(-0.2, 0.2, -0.22), V3(0.15, 0.26, -0.18)], { col: '#2f6a2a', n: 9, size: 0.12, aspect: 2, gloss: 0.9, stemCol: '#5a6a3a', r0: 0.007, seed: 11 });
      [[-0.22, 0.15, green], [-0.06, 0.27, ripe], [0.06, 0.06, green], [-0.36, 0.05, ripe], [0.18, 0.3, green]].forEach(([x, z, m]) => { const f = sphereFruit(0.07, m, { sy: 0.9 }); f.position.set(x, 0.063, z); f.rotation.y = r() * TAU; g.add(f); f.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.01, 8), M.std('#5a6a3a'), 0, 0.064, 0)); });
      halfFruit(g, 0.07, ripe, segFace('calamface', '#9ab83a', '#f8e8b0', '#f6b228', 9), 0.32, 0.07, 0.12, 0.3, 0.4, 0.9);
      halfFruit(g, 0.07, ripe, segFace('calamface', '#9ab83a', '#f8e8b0', '#f6b228', 9), 0.4, 0.07, -0.08, 0.25, -0.6, 0.9);
      return g;
    }
    case 'linden': {
      for (let i = 0; i < 3; i++) leafAt(g, -0.3 + i * 0.22, 0.2 - (i % 2) * 0.12, i * 1.9, '#5a8a3a', 1.1, 'heart', 0.02 + i * 0.004, -1.45);
      const main = [V3(-0.45, 0.62, -0.2), V3(-0.1, 0.58, -0.15), V3(0.3, 0.5, -0.1)]; g.add(stem(main, 0.007, '#6a6a3a'));
      const bm = M.leaf('#cfe08a', '#eef6c0', 'long'), fm = { petals: 5, len: 0.035, wid: 0.028, open: 1.5, cup: 0.4, centerR: 0.008, center: '#e8d070', colors: ['#f6edb0', '#fffbe0', '#d8c870'] };
      [[-0.25, -0.15], [0.05, -0.12], [0.25, -0.1]].forEach(([x, z], j) => {
        const top = V3(x, 0.56 - j * 0.03, z), b = mesh(bendPlane(0.05, 0.26, { cup: 0.3, curl: 0.1 }), bm); b.position.copy(top); b.rotation.set(0.25, j, Math.PI + 0.35); g.add(b);
        const hang = top.clone().add(V3(0.05, -0.2, 0.06)); g.add(stem([top, top.clone().add(V3(0.03, -0.1, 0.03)), hang], 0.003, '#8a8a4a'));
        for (let k = 0; k < 6; k++) { const a = k * TAU / 6, p = hang.clone().add(V3(Math.cos(a) * 0.05, -0.04 - (k % 2) * 0.03, Math.sin(a) * 0.05)); g.add(stem([hang, p], 0.002, '#8a8a4a')); const f = flowerHead(ing, fm); place(f, p.x, p.y, p.z, Math.PI + Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, 1.7); g.add(f);
          const st = []; for (let q = 0; q < 14; q++) { const b2 = q * 0.45; st.push([p.clone().add(V3(0, -0.004, 0)), V3(Math.cos(b2) * 0.4, -1, Math.sin(b2) * 0.4), 1]); } const fil = new THREE.CylinderGeometry(0.0009, 0.0009, 0.022, 3); fil.translate(0, 0.011, 0); instances(g, fil, M.std('#efe0a0'), st); }
      });
      return g;
    }
    case 'edelweiss': {
      const felt = M.std('#f4f4ee', { roughness: 0.95, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.8, side: THREE.DoubleSide });
      const leafM = M.std('#b8c2ac', { roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#eef2e8'), side: THREE.DoubleSide });
      [[-0.15, 0.0, 0.42, 1.25], [0.2, -0.08, 0.34, 1], [0.05, 0.22, 0.26, 0.9]].forEach(([x, z, h, s], j) => {
        g.add(stem([V3(x, 0.02, z), V3(x + 0.02, h * 0.5, z), V3(x, h, z)], 0.007, '#a8b29a'));
        for (let k = 0; k < 4; k++) { const l = mesh(bendPlane(0.025, 0.12, { cup: 0.4, droop: 0.2 }), leafM); const hd = new THREE.Group(); hd.rotation.y = k * 1.6 + j; l.rotation.x = 1.0; hd.add(l); hd.position.set(x + 0.01, h * (0.3 + k * 0.12), z); g.add(hd); }
        const head = new THREE.Group(), n = 9;
        for (let k = 0; k < n; k++) { const len = 0.07 + (k % 3) * 0.015, pg = bendPlane(0.03, len, { cup: 0.5, droop: 0.15 }), p = pg.attributes.position; for (let q = 0; q < p.count; q++) { const t = Math.min(1, Math.max(0, p.getY(q) / len)); p.setX(q, p.getX(q) * (1 - Math.pow(t, 2.5))); } pg.computeVertexNormals(); const pe = mesh(pg, felt), hd = new THREE.Group(); hd.rotation.y = k * TAU / n; pe.rotation.x = 1.62; hd.add(pe); head.add(hd); }
        const bud = new THREE.SphereGeometry(0.011, 10, 8), list = []; for (let k = 0; k < 7; k++) { const a = k * TAU / 7; list.push([V3(Math.cos(a) * 0.022, 0.012, Math.sin(a) * 0.022), V3(0, 1, 0), 1]); } list.push([V3(0, 0.016, 0), V3(0, 1, 0), 1.1]);
        instances(head, bud, M.std('#efe8c8', { roughness: 0.9, bumpMap: noiseTex('fuzz', 80, 2), bumpScale: 2 }), list);
        place(head, x, h, z, -0.25, j, 0.1, s * 2.1); g.add(head);
      });
      const rock = blob(0.11, 0.03, 3, 7, 3); rock.scale(1.4, 0.5, 1); g.add(mesh(rock, M.std('#9a9a96', { roughness: 0.95, bumpMap: noiseTex('rock', 30, 2), bumpScale: 4 }), 0.32, 0.03, 0.25));
      return g;
    }
    case 'elderflower': {
      sprig(g, [V3(-0.5, 0.05, 0.3), V3(-0.3, 0.2, 0.25), V3(-0.1, 0.3, 0.2)], { col: '#4f7a2e', n: 7, size: 0.07, aspect: 2.4, pairs: true, stemCol: '#7a7a4a', r0: 0.006, seed: 31, kind: 'serrated' });
      [[V3(-0.15, 0.42, -0.1), 0.2], [V3(0.18, 0.36, 0.0), 0.17], [V3(0.02, 0.28, 0.25), 0.14]].forEach(([top, len], j) => {
        g.add(stem([V3(top.x - 0.05, 0.02, top.z + 0.1), V3(top.x - 0.02, top.y * 0.5, top.z + 0.05), top], 0.006, '#6a7a4a'));
        umbel(g, top, { rays: 30, len, col: '#fbf6dc', fr: 0.007, per: 14, seed: 5 + j, stemCol: '#8a9a5a' });
      });
      glassOf(g, [[0, 0], [0.05, 0], [0.055, 0.02], [0.055, 0.2], [0.03, 0.24], [0.018, 0.26], [0.018, 0.3]], '#e8de9a', 0.38, 0.28, 0.75, { thickness: 0.05 });
      return g;
    }
    case 'rhododendron': {
      const lm = M.leaf('#2f5a2a', '#6a9a4a', 'long'); lm.clearcoat = 0.9;
      for (let i = 0; i < 10; i++) { const l = mesh(bendPlane(0.08, 0.3, { cup: 0.4, curl: 0.15, droop: 0.2 }), lm), hd = new THREE.Group(); hd.rotation.y = i * TAU / 10; l.rotation.x = 1.25; hd.add(l); hd.position.set(0, 0.22, 0); g.add(hd); }
      g.add(stem([V3(0.05, 0.02, 0.15), V3(0.02, 0.12, 0.05), V3(0, 0.24, 0)], 0.012, '#6a4a3a'));
      const tg = trumpetGeo(0.09, 0.008, 0.06, { lobes: 5, tip: 0.5 }), fm = M.std(c0, { roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(c1), side: THREE.DoubleSide, map: gradTex('rhodo', [[0, '#f8c0d4'], [0.5, c0], [1, c0]]) });
      const list = []; for (let k = 0; k < 15; k++) { const t = Math.acos(1 - (k + 0.5) / 15 * 1.1), a = k * 2.39996, d = V3(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)); list.push([V3(0, 0.3, 0).addScaledVector(d, 0.05), d, 1.1, r() * TAU]); }
      instances(g, tg, fm, list);
      const spot = new THREE.SphereGeometry(0.004, 6, 4), st = list.map(([p, d]) => [p.clone().addScaledVector(d, 0.1), d, 1]); instances(g, spot, M.std('#f6e0a0'), st);
      return g;
    }
    case 'cotton': {
      const fluff = M.std('#fbfaf6', { roughness: 1, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.9, bumpMap: noiseTex('fluff', 90, 2), bumpScale: 4 });
      const husk = M.std('#5a3a24', { roughness: 0.8, side: THREE.DoubleSide });
      const boll = (x, y, z, s, sy) => {
        const b = new THREE.Group();
        for (let k = 0; k < 5; k++) { const hd = new THREE.Group(), p = mesh(bendPlane(0.07, 0.13, { cup: 1.2, curl: -0.4 }), husk); hd.rotation.y = k * TAU / 5; p.rotation.x = 1.0; hd.add(p); b.add(hd); }
        for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + 0.4, lobe = blob(0.07, 0.018, 7, k + 3, 4); lobe.scale(1, 0.9, 1); b.add(mesh(lobe, fluff, Math.cos(a) * 0.05, 0.07, Math.sin(a) * 0.05)); }
        place(b, x, y, z, 0, sy, 0, s); g.add(b); return b;
      };
      g.add(stem([V3(-0.4, 0.02, 0.2), V3(-0.2, 0.3, 0.05), V3(0.05, 0.5, -0.1)], 0.01, '#6a4a32'));
      g.add(stem([V3(-0.2, 0.3, 0.05), V3(-0.3, 0.42, -0.1), V3(-0.33, 0.55, -0.18)], 0.007, '#6a4a32'));
      boll(0.05, 0.5, -0.1, 1.2, 0.3); boll(-0.33, 0.55, -0.18, 1, 1.2); boll(0.28, 0.06, 0.2, 1.15, 2);
      leafAt(g, -0.15, 0.3, 0.8, '#5a7a3a', 0.9, 'lobed', 0.02, -1.4);
      return g;
    }
    case 'nasturtium': {
      const pad = cutFace('nastleaf', (c, W) => { c.fillStyle = '#5f9a3a'; c.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, d = W * 0.48 * (1 + 0.03 * Math.sin(a * 5)); c.lineTo(W / 2 + Math.cos(a) * d, W / 2 + Math.sin(a) * d); } c.fill(); c.strokeStyle = '#b8d88a'; c.lineWidth = 3; for (let k = 0; k < 9; k++) { const a = k * TAU / 9; c.beginPath(); c.moveTo(W * 0.52, W * 0.5); c.quadraticCurveTo(W / 2 + Math.cos(a + 0.2) * W * 0.25, W / 2 + Math.sin(a + 0.2) * W * 0.25, W / 2 + Math.cos(a) * W * 0.46, W / 2 + Math.sin(a) * W * 0.46); c.stroke(); } c.fillStyle = '#d8eab0'; c.beginPath(); c.arc(W * 0.52, W * 0.5, 5, 0, TAU); c.fill(); });
      const pm = M.std(0xffffff, { map: pad, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color('#d8f0b0') });
      [[-0.25, 0.1, 0.12, 0.15], [0.05, -0.15, 0.2, 0.17], [0.22, 0.18, 0.08, 0.13], [-0.05, 0.3, 0.05, 0.11]].forEach(([x, z, h, R], j) => { const d = new THREE.CircleGeometry(R, 40); d.rotateX(-Math.PI / 2); const p = d.attributes.position; for (let q = 0; q < p.count; q++) { const rr = Math.hypot(p.getX(q), p.getZ(q)) / R; p.setY(q, rr * rr * 0.03); } d.computeVertexNormals(); g.add(place(mesh(d, pm), x, h, z, (r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3)); g.add(stem([V3(x, 0.02, z), V3(x + 0.02, h * 0.5, z + 0.02), V3(x, h, z)], 0.004, '#7aa84a')); });
      [[-0.1, 0.05, 0.3, '#ff7a1a'], [0.25, -0.05, 0.24, '#f6c03a'], [0.0, 0.2, 0.22, '#e8401a']].forEach(([x, z, h, col], j) => {
        const f = flowerHead(ing, { petals: 5, len: 0.07, wid: 0.065, open: 1.4, cup: 0.35, centerR: 0.01, center: '#f6d040', colors: [col, shade(col, 0.3), shade(col, -0.35)] });
        const spur = new THREE.ConeGeometry(0.012, 0.08, 10); spur.translate(0, -0.05, 0); f.add(place(mesh(spur, M.std(col, { roughness: 0.5 })), 0, 0, -0.01, -0.5, 0, 0));
        place(f, x, h, z, -0.6, j * 1.3, 0, 1.15); g.add(f); g.add(stem([V3(x, h - 0.01, z), V3(x + 0.03, h * 0.5, z + 0.04), V3(x + 0.02, 0.02, z + 0.08)], 0.004, '#7aa84a'));
      });
      return g;
    }
    case 'creosote': {
      const yellow = M.petal('#f4d03a', '#fff2a0', '#c8a020', 'round'), fuzz = M.std('#f4f2ea', { roughness: 1, sheen: 1, sheenColor: new THREE.Color('#ffffff') });
      for (let s = 0; s < 5; s++) {
        const a = s * 1.3, x0 = Math.cos(a) * 0.08, z0 = Math.sin(a) * 0.06, h = 0.42 + r() * 0.2, pts = [V3(x0, 0.02, z0), V3(x0 * 2 + (r() - 0.5) * 0.1, h * 0.5, z0 * 2), V3(x0 * 3.5, h, z0 * 3.5)];
        const curve = sprig(g, pts, { col: '#5a6a2a', n: 16, size: 0.04, aspect: 1.5, pairs: true, gloss: 0.9, stemCol: '#4a4a3a', r0: 0.005, spread: 0.8, seed: s + 40 });
        for (let k = 0; k < 3; k++) { const p = curve.getPointAt(0.55 + k * 0.17); if (k % 2) { const f = flowerHead(ing, { petals: 5, len: 0.022, wid: 0.016, open: 1.4, cup: 0.3, centerR: 0.004, center: '#e8c020', colors: ['#f4d03a', '#fff2a0', '#c8a020'] }); place(f, p.x + 0.015, p.y + 0.01, p.z, 0, 0, 0, 1); g.add(f); } else g.add(mesh(new THREE.SphereGeometry(0.014, 12, 10), fuzz, p.x - 0.012, p.y + 0.01, p.z)); }
      }
      void yellow;
      const gr = new THREE.Group(); const sand = new THREE.CylinderGeometry(0.42, 0.45, 0.02, 48); gr.add(mesh(sand, M.std('#d8b884', { roughness: 1, bumpMap: noiseTex('sand', 90, 1.5), bumpScale: 2 }), 0, 0.01, 0)); g.add(gr);
      return g;
    }
    case 'gentian': {
      const lm = M.leaf('#5f8a3a', '#a8c878', 'ovate');
      for (let i = 0; i < 5; i++) { const l = mesh(bendPlane(0.14, 0.28, { cup: 0.6, curl: 0.1 }), lm), hd = new THREE.Group(); hd.rotation.y = i * TAU / 5; l.rotation.x = 1.35; hd.add(l); hd.position.set(-0.1, 0.02, -0.05); g.add(hd); }
      g.add(stem([V3(-0.1, 0.02, -0.05), V3(-0.1, 0.35, -0.06), V3(-0.09, 0.72, -0.05)], 0.011, '#7a9a4a'));
      const star = { petals: 6, len: 0.05, wid: 0.016, kind: 'long', open: 1.0, cup: 0.3, centerR: 0.006, center: '#c88a20', colors: ['#f6c83a', '#ffe890', '#c88a20'] };
      for (let w = 0; w < 4; w++) { const y = 0.3 + w * 0.12, cl = new THREE.Group(); for (let k = 0; k < 7; k++) { const a = k * TAU / 7 + w; const f = flowerHead(ing, star); place(f, Math.cos(a) * 0.05, (r() - 0.5) * 0.03, Math.sin(a) * 0.05, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6, 1); cl.add(f); } cl.position.set(-0.1, y, -0.05); g.add(cl);
        for (const side of [0, Math.PI]) { const l = mesh(bendPlane(0.07, 0.13, { cup: 0.8 }), lm), hd = new THREE.Group(); hd.rotation.y = side + w * 1.57; l.rotation.x = 0.9; hd.add(l); hd.position.set(-0.1, y - 0.02, -0.05); g.add(hd); } }
      g.add(place(dish(0.18, '#efe7da', false), 0.3, 0, 0.25));
      const chunk = displace(new THREE.BoxGeometry(0.05, 0.03, 0.04, 3, 2, 3), 0.008, 10, 2, 4); const pp = pile(chunk, M.std('#8a5a2a', { roughness: 0.85, bumpMap: noiseTex('bark', 30, 2, [2, 4]), bumpScale: 3 }), 22, 0.13, 6, { height: 0.4 }); pp.position.set(0.3, 0.025, 0.25); g.add(pp);
      return g;
    }
    case 'mulberry': {
      const dm = M.std('#3a0f2e', { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.3, sheenColor: new THREE.Color('#a64d79') }), unripe = M.std('#c8406a', { roughness: 0.25, clearcoat: 0.8 });
      const fruit = (x, y, z, rx, ry, mat) => { const f = new THREE.Group(), list = []; for (let k = 0; k < 46; k++) { const t = k / 46, a = k * 2.39996, rad = 0.028 * Math.sin(Math.PI * (0.1 + t * 0.85)); list.push([V3(Math.cos(a) * rad, t * 0.1, Math.sin(a) * rad), V3(Math.cos(a), 0.3, Math.sin(a)), 1]); } instances(f, new THREE.SphereGeometry(0.012, 10, 8), mat, list); f.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.04, 4), M.std('#6a7a3a'), 0, 0.12, 0)); place(f, x, y + 0.012, z, rx, ry, 0, 1.6); g.add(f); };
      [[-0.15, 0.03, 0.1, Math.PI / 2, 0.4, dm], [0.0, 0.03, 0.2, Math.PI / 2, 1.8, dm], [0.15, 0.03, 0.05, Math.PI / 2, -0.6, unripe], [-0.02, 0.03, -0.02, Math.PI / 2, 2.6, dm]].forEach((a) => fruit(...a));
      leafAt(g, -0.3, -0.15, 0.4, '#4a7a2e', 1.25, 'serrated'); leafAt(g, 0.25, -0.2, 2.2, '#4a7a2e', 1.1, 'heart', 0.025);
      return g;
    }
    case 'cherimoya': {
      const tex = canvasTex('cheriskin', 256, 256, (c, W) => { c.fillStyle = '#8fb84a'; c.fillRect(0, 0, W, W); c.strokeStyle = 'rgba(60,90,30,.7)'; c.lineWidth = 3; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const cx = (x + (y % 2) * 0.5) * W / 8, cy = y * W / 8 + 10; c.beginPath(); c.arc(cx, cy, W / 18, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); } });
      const skin = M.std(0xffffff, { map: tex, roughness: 0.55, bumpMap: noiseTex('cheri', 24, 1.5), bumpScale: 2 });
      const f = sphereFruit(0.17, skin, { sy: 1.1, sz: 0.95, bump: 0.008, seed: 4 }); const p = f.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 - Math.max(0, y / 0.19) * 0.35; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } f.geometry.computeVertexNormals(); f.position.set(-0.22, 0.17, -0.05); g.add(f);
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.05, 8), M.std('#6a4a2a'), -0.22, 0.36, -0.05));
      halfFruit(g, 0.15, skin, seedFace('cheriface', '#8fb84a', '#f6f1e2', '#fffdf4', '#1a1410', 11, 6), 0.25, 0.1, 0.15, 0.35, 0.3, 1.05);
      leafAt(g, 0.05, -0.3, 1.2, '#4a7a2e', 1.05, 'ovate');
      return g;
    }
    case 'rosehip': {
      const hm = glossy('#d8401a', { sheen: 0.3, sheenColor: new THREE.Color('#ffab91') });
      const hip = (x, y, z, rx, rz, s) => { const h = new THREE.Group(); const b = sphereFruit(0.045, hm, { sy: 1.45 }); h.add(b); for (let k = 0; k < 5; k++) { const sep = mesh(bendPlane(0.012, 0.05, { curl: 0.6 }), M.std('#4a3a24', { roughness: 0.8, side: THREE.DoubleSide })), hd = new THREE.Group(); hd.rotation.y = k * TAU / 5; sep.rotation.x = 0.6; sep.position.y = 0.062; hd.add(sep); h.add(hd); } place(h, x, y, z, rx, 0, rz, s); g.add(h); return h; };
      const br = [V3(-0.45, 0.1, -0.15), V3(-0.15, 0.35, -0.1), V3(0.2, 0.4, -0.15)]; g.add(stem(br, 0.009, '#6a3a2a')); const curve = new THREE.CatmullRomCurve3(br);
      for (let k = 0; k < 6; k++) { const p = curve.getPointAt(0.3 + k * 0.12); g.add(stem([p, p.clone().add(V3(0.02, -0.06, 0.04))], 0.003, '#6a3a2a')); hip(p.x + 0.02, p.y - 0.11, p.z + 0.04, Math.PI + (r() - 0.5) * 0.4, (r() - 0.5) * 0.4, 1); }
      for (let k = 0; k < 4; k++) hip(0.05 + k * 0.08, 0.045, 0.25 - (k % 2) * 0.06, Math.PI / 2, k * 0.8, 0.95);
      glassOf(g, [[0, 0], [0.05, 0], [0.055, 0.02], [0.055, 0.14], [0.03, 0.17], [0.015, 0.18], [0.015, 0.22]], '#e8762a', 0.4, 0.1, 0.7, { thickness: 0.05 });
      return g;
    }
    case 'guava': {
      const skin = M.std('#b8d05a', { roughness: 0.6, bumpMap: noiseTex('guava', 40, 1.5), bumpScale: 1.5, sheen: 0.4, sheenColor: new THREE.Color('#f0f0a0') });
      const f = sphereFruit(0.16, skin, { sy: 1.12, bump: 0.006, seed: 2 }); f.position.set(-0.22, 0.175, -0.05); g.add(f);
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.02, 8), M.std('#5a4a2a'), -0.22, 0.003, -0.05));
      const face = seedFace('guavaface', '#b8d05a', '#f48fb1', '#fde0ea', '#f6e6c0', 40, 3.5);
      halfFruit(g, 0.15, skin, face, 0.25, 0.1, 0.12, 0.3, 0.3, 1.1);
      halfFruit(g, 0.15, skin, face, 0.38, 0.09, -0.18, 0.5, -0.4, 1.1);
      leafAt(g, -0.05, 0.3, 0.9, '#4a7a2e', 1.1, 'ovate');
      return g;
    }
    case 'watermelon': {
      const rind = canvasTex('wmrind', 256, 256, (c, W) => { c.fillStyle = '#7ab65a'; c.fillRect(0, 0, W, W); c.fillStyle = '#2e6a2a'; for (let i = 0; i < 12; i++) { c.beginPath(); for (let y = 0; y <= W; y += 8) c.lineTo(i * W / 12 + Math.sin(y * 0.08 + i) * 5, y); for (let y = W; y >= 0; y -= 8) c.lineTo(i * W / 12 + 9 + Math.sin(y * 0.08 + i + 1) * 6, y); c.fill(); } });
      const skin = M.std(0xffffff, { map: rind, roughness: 0.35, clearcoat: 0.5 });
      const m = sphereFruit(0.26, skin, { sx: 1.25, sy: 0.92 }); m.position.set(-0.2, 0.24, -0.12); m.rotation.y = 0.5; g.add(m);
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.absarc(0, 0, 0.28, Math.PI * 0.25, Math.PI * 0.75, false); sh.lineTo(0, 0);
      const inner = new THREE.Shape(); inner.moveTo(0, 0); inner.absarc(0, 0, 0.245, Math.PI * 0.25, Math.PI * 0.75, false); inner.lineTo(0, 0);
      const ex = { depth: 0.06, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 32 };
      const slice = new THREE.Group(); slice.add(mesh(new THREE.ExtrudeGeometry(sh, ex), [M.std('#f3f5d8', { roughness: 0.5 }), M.std('#4f9a3a', { roughness: 0.4 })]));
      slice.add(mesh(new THREE.ExtrudeGeometry(inner, { ...ex, depth: 0.064 }), M.std('#ef4a4a', { roughness: 0.25, clearcoat: 1, sheen: 0.4, sheenColor: new THREE.Color('#ffb0b0') }), 0, 0, -0.002));
      const sd = new THREE.SphereGeometry(0.006, 8, 6); sd.scale(1, 1.7, 0.6); const list = []; for (let k = 0; k < 14; k++) { const a = Math.PI * (0.32 + (k % 7) * 0.06), d = 0.13 + Math.floor(k / 7) * 0.05; list.push([V3(Math.cos(a) * d, Math.sin(a) * d, 0.068), V3(Math.cos(a), Math.sin(a), 0), 1]); } instances(slice, sd, M.std('#1a1410', { roughness: 0.2, clearcoat: 1 }), list);
      place(slice, 0.28, 0.0, 0.32, -Math.PI / 2 + 0.05, 0.4, 0, 1); slice.position.y = -0.0; slice.translateZ(0); g.add(slice);
      return g;
    }
    case 'cork': {
      const corkTex = canvasTex('corkface', 128, 128, (c, W) => { c.fillStyle = '#c9a26a'; c.fillRect(0, 0, W, W); for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${90 + Math.random() * 60},${60 + Math.random() * 40},30,${0.3 + Math.random() * 0.5})`; c.beginPath(); c.arc(Math.random() * W, Math.random() * W, Math.random() * 2.2, 0, TAU); c.fill(); } });
      const cm = M.std(0xffffff, { map: corkTex, roughness: 0.95, bumpMap: noiseTex('cork', 80, 2), bumpScale: 3 });
      const bark = M.std('#6a4a30', { roughness: 1, bumpMap: noiseTex('corkbark', 14, 2.5, [2, 1]), bumpScale: 10 });
      [[-0.2, 0.0, -0.1, 0.2], [-0.15, 0.09, -0.08, -0.15]].forEach(([x, y, z, a], k) => { const slab = displace(new THREE.BoxGeometry(0.55, 0.09, 0.26, 12, 3, 8), 0.012, 7, 3, k + 2); g.add(place(mesh(slab, [cm, cm, bark, cm, cm, cm]), x, y + 0.045, z, 0, a, 0)); });
      const stopper = new THREE.CylinderGeometry(0.03, 0.03, 0.085, 24);
      [[0.22, 0.25, 0.3], [0.32, 0.12, 1.2], [0.16, 0.38, 2.1]].forEach(([x, z, a]) => g.add(place(mesh(stopper, cm), x, 0.03, z, Math.PI / 2, a, 0)));
      g.add(place(mesh(stopper, cm), 0.36, 0.0425, 0.3, 0, 0, 0)); g.add(place(mesh(stopper, cm), 0.42, 0.0425, 0.22, 0, 0, 0));
      return g;
    }
    case 'ebony': {
      timber(g, { ...ing, c: ['#2a221c', '#14100c', c2] }, { gloss: 1, dark: 0.1 });
      const pol = M.std('#0c0a09', { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
      [[0.32, 0.05, 0.28], [0.4, 0.05, 0.18]].forEach(([x, y, z], k) => { const pc = new THREE.Group(); pc.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.07, 24), pol)); pc.add(mesh(new THREE.SphereGeometry(0.024, 20, 14), pol, 0, 0.05, 0)); place(pc, x, 0.035 + (k ? 0 : 0), z, 0, k, 0, 1.3); g.add(pc); });
      return g;
    }
    case 'araucaria': {
      const scale = new THREE.ConeGeometry(0.012, 0.045, 4); scale.scale(1, 1, 0.35); scale.translate(0, 0.02, 0);
      const sm = M.std('#3e5a3a', { roughness: 0.4, clearcoat: 0.6 });
      const arm = (pts, n) => { const c = new THREE.CatmullRomCurve3(pts); g.add(mesh(tube(pts, 0.022, 20, 8, 0.4), M.std('#3a4a32'))); const list = []; for (let i = 0; i < n; i++) { const t = i / n, p = c.getPointAt(t), tg = c.getTangentAt(t), a = i * 2.39996, side = V3(Math.cos(a), Math.sin(a), 0).cross(tg).normalize(); list.push([p.clone().addScaledVector(side, 0.02 * (1 - t * 0.4)), side.clone().multiplyScalar(0.7).add(tg), 1 - t * 0.35]); } instances(g, scale, sm, list); };
      arm([V3(-0.5, 0.06, 0.1), V3(-0.2, 0.15, 0.05), V3(0.15, 0.28, -0.05)], 260);
      arm([V3(-0.2, 0.15, 0.05), V3(-0.1, 0.3, -0.12), V3(0.0, 0.45, -0.25)], 140);
      const cone = new THREE.Group(); cone.add(mesh(new THREE.SphereGeometry(0.11, 32, 24), M.std('#8a7a4a', { roughness: 0.7 }))); const sp = new THREE.ConeGeometry(0.008, 0.05, 5); sp.translate(0, 0.02, 0); const list = []; for (let i = 0; i < 160; i++) { const t = Math.acos(1 - 2 * (i + 0.5) / 160), a = i * 2.39996, d = V3(Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)); list.push([d.clone().multiplyScalar(0.1), d, 1]); } instances(cone, sp, M.std('#a8925a', { roughness: 0.7 }), list); cone.position.set(0.25, 0.12, 0.2); g.add(cone);
      const nut = new THREE.CapsuleGeometry(0.012, 0.05, 6, 10); const pp = pile(nut, M.std('#b86a3a', { roughness: 0.5, clearcoat: 0.4 }), 12, 0.1, 4, { height: 0.2, flat: true }); pp.position.set(0.0, 0.0, 0.35); g.add(pp);
      return g;
    }
    case 'kola': {
      g.add(dish(0.28, '#efe7da', false));
      const nutM = [glossy('#c84a4a', { roughness: 0.4 }), glossy('#e8b88a', { roughness: 0.4 }), glossy('#a8302e', { roughness: 0.45 })];
      for (let i = 0; i < 9; i++) { const n = blob(0.04, 0.012, 6, i, 3); n.scale(1.2, 0.75, 1); const a = i * 2.4, d = 0.03 + (i % 3) * 0.06; g.add(place(mesh(n, nutM[i % 3]), Math.cos(a) * d, 0.05 + (i < 3 ? 0.04 : 0), Math.sin(a) * d, r(), r() * TAU, r())); }
      const pod = blob(0.12, 0.03, 4, 9, 4); pod.scale(1.7, 0.6, 0.9); g.add(place(mesh(pod, M.std('#6a6a3a', { roughness: 0.8, bumpMap: noiseTex('kolapod', 20, 2), bumpScale: 5 })), -0.3, 0.07, 0.3, 0, 0.6, 0));
      glassOf(g, [[0, 0], [0.06, 0], [0.065, 0.02], [0.07, 0.2], [0.072, 0.22]], '#3a1a0e', 0.33, 0.25, 0.85);
      for (let k = 0; k < 9; k++) g.add(mesh(new THREE.SphereGeometry(0.004 + r() * 0.004, 8, 6), M.std('#f8e8d8', { roughness: 0.2, transparent: true, opacity: 0.8 }), 0.33 + (r() - 0.5) * 0.08, 0.04 + r() * 0.14, 0.25 + (r() - 0.5) * 0.08));
      return g;
    }
    case 'macadamia': {
      const shell = M.std('#7a5232', { roughness: 0.45, clearcoat: 0.6, bumpMap: noiseTex('maca', 50, 1), bumpScale: 0.6 }), nut = M.std('#f2e2c0', { roughness: 0.6, sheen: 0.4 });
      for (let i = 0; i < 6; i++) { const s = sphereFruit(0.045, shell); const a = i * 1.1; s.position.set(-0.3 + Math.cos(a) * 0.1, 0.045, 0.05 + Math.sin(a) * 0.1); g.add(s); g.add(mesh(new THREE.TorusGeometry(0.045, 0.0018, 6, 32), M.std('#a87a52'), s.position.x, 0.045, s.position.z)); }
      for (let i = 0; i < 3; i++) { const half = new THREE.Group(); half.add(mesh(new THREE.SphereGeometry(0.045, 32, 16, 0, TAU, 0, Math.PI / 2), shell)); half.add(mesh(new THREE.SphereGeometry(0.035, 24, 16), nut)); place(half, 0.1 + i * 0.1, 0.03, 0.2 - (i % 2) * 0.1, Math.PI + 0.3, i, 0.2); g.add(half); }
      for (let i = 0; i < 5; i++) g.add(place(mesh(new THREE.SphereGeometry(0.035, 24, 16), nut), 0.15 + (r() - 0.5) * 0.25, 0.035, -0.2 + (r() - 0.5) * 0.15));
      const husk = sphereFruit(0.055, M.std('#5a7a3a', { roughness: 0.6 }), { crease: 0.2 }); husk.position.set(-0.05, 0.055, -0.3); g.add(husk);
      leafAt(g, -0.3, -0.25, 0.4, '#3f6a2e', 1, 'serrated');
      return g;
    }
    case 'shea': {
      const bowl = [[0, 0], [0.16, 0], [0.2, 0.03], [0.22, 0.1], [0.215, 0.11]];
      g.add(mesh(new THREE.LatheGeometry(bowl.map(([a, b]) => new THREE.Vector2(a, b)), 48), M.std('#8a5a32', { roughness: 0.6, side: THREE.DoubleSide, bumpMap: noiseTex('woodbowl', 20, 1, [1, 3]), bumpScale: 1 }), -0.12, 0, 0));
      const butter = new THREE.SphereGeometry(0.19, 48, 24, 0, TAU, 0, Math.PI / 2); butter.scale(1, 0.45, 1); const bp = butter.attributes.position; for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z); bp.setY(i, bp.getY(i) + Math.sin(a * 2 + rr * 40) * 0.008 * (1 - rr / 0.19)); } butter.computeVertexNormals();
      g.add(mesh(butter, M.std('#f6ead0', { roughness: 0.45, sheen: 0.5, sheenColor: new THREE.Color('#fffaf0') }), -0.12, 0.07, 0));
      const nut = new THREE.SphereGeometry(0.035, 24, 16); nut.scale(1, 0.8, 1.3); const pp = pile(nut, M.std('#6a4a2e', { roughness: 0.4, clearcoat: 0.6 }), 12, 0.12, 3, { height: 0.25 }); pp.position.set(0.3, 0, 0.2); g.add(pp);
      return g;
    }
    case 'hops': {
      const bract = M.std('#a8c256', { roughness: 0.55, side: THREE.DoubleSide, sheen: 0.6, sheenColor: new THREE.Color('#e3eda0') });
      const bine = [V3(-0.45, 0.6, -0.2), V3(-0.1, 0.62, -0.15), V3(0.35, 0.58, -0.1)]; g.add(stem(bine, 0.007, '#6a8a3a')); const curve = new THREE.CatmullRomCurve3(bine);
      for (let k = 0; k < 4; k++) { const p = curve.getPointAt(0.15 + k * 0.23), tip = p.clone().add(V3((r() - 0.5) * 0.06, -0.26 + (k % 2) * 0.05, 0.04)); g.add(stem([p, p.clone().lerp(tip, 0.5).add(V3(0.02, 0, 0)), tip], 0.003, '#6a8a3a')); scaleCone(g, tip.clone().add(V3(0, 0.005, 0)), V3(0, -1, 0), 0.13, 0.11, 34, bract, { w: 0.045, h: 0.045, cup: 1.0, open: 0.25 }); }
      for (let k = 0; k < 3; k++) { const p = curve.getPointAt(0.25 + k * 0.3); const l = mesh(bendPlane(0.2, 0.24, { cup: 0.4 }), M.leaf('#4f7a2e', '#8ab85a', 'lobed')); place(l, p.x, p.y + 0.02, p.z + 0.04, 0.9, k, 0, 0.7); g.add(l); }
      const loose = new THREE.Group(); scaleCone(loose, V3(0, 0.0, 0), V3(1, 0, 0), 0.12, 0.1, 30, bract, { w: 0.045, h: 0.045, cup: 1.0, open: 0.25 }); place(loose, 0.15, 0.05, 0.25, 0, 0.6, 0.1); g.add(loose);
      return g;
    }
    case 'paramela': {
      for (let s = 0; s < 4; s++) {
        const x0 = -0.3 + s * 0.17, h = 0.45 + r() * 0.12, pts = [V3(x0, 0.02, 0.1), V3(x0 + 0.04, h * 0.5, 0.0), V3(x0 + 0.08, h, -0.06)];
        const curve = sprig(g, pts, { col: '#7a8a3a', n: 18, size: 0.045, aspect: 1.6, gloss: 1, stemCol: '#6a4a2a', r0: 0.005, spread: 0.9, seed: s + 81 });
        for (let k = 0; k < 4; k++) { const p = curve.getPointAt(0.6 + k * 0.12), f = flowerHead(ing, { petals: 5, len: 0.02, wid: 0.016, open: 1.5, cup: 0.3, centerR: 0.004, center: '#e8a020', colors: ['#f2d860', '#fff4b0', '#c8a020'] }); place(f, p.x + 0.012, p.y + 0.008, p.z + 0.01, 0, 0, 0, 1); g.add(f); }
      }
      const resin = new THREE.SphereGeometry(0.006, 8, 6), list = []; for (let k = 0; k < 30; k++) list.push([V3(-0.3 + r() * 0.6, 0.15 + r() * 0.3, (r() - 0.5) * 0.15), V3(0, 1, 0), 1]); void list;
      return g;
    }
    case 'mace': {
      const seedM = M.std('#5a3220', { roughness: 0.4, clearcoat: 0.5 }), aril = M.std('#d8301a', { roughness: 0.3, clearcoat: 0.8, sheen: 0.3 });
      const wrapped = (x, y, z, ry, s) => { const w = new THREE.Group(); const sd = new THREE.SphereGeometry(0.06, 32, 24); sd.scale(1, 1.25, 1); w.add(mesh(sd, seedM)); for (let k = 0; k < 7; k++) { const a = k * TAU / 7, pts = []; for (let q = 0; q <= 10; q++) { const t = q / 10, aa = a + Math.sin(t * 6 + k) * 0.25, rad = 0.0615 * Math.sin(Math.PI * (0.05 + t * 0.9)) + 0.002; pts.push(V3(Math.cos(aa) * rad / Math.max(0.3, Math.sin(Math.PI * (0.05 + t * 0.9))) * Math.sin(Math.PI * (0.05 + t * 0.9)), (t - 0.5) * 0.15, Math.sin(aa) * rad)); } w.add(mesh(tube(pts, 0.007, 20, 6), aril)); } place(w, x, y, z, 0.3, ry, 0, s); g.add(w); };
      wrapped(-0.15, 0.08, 0.0, 0.3, 1.1);
      const fruit = M.std('#e8c86a', { roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color('#fff0b0') });
      const half = new THREE.Group(); half.add(mesh(new THREE.SphereGeometry(0.11, 40, 20, 0, TAU, Math.PI / 2, Math.PI / 2), fruit)); half.add(mesh(new THREE.CircleGeometry(0.11, 40).rotateX(-Math.PI / 2), M.std('#f6ead0', { roughness: 0.5 }))); place(half, -0.2, 0.11, -0.22, 0.4, 0.5, 0); g.add(half);
      g.add(place(dish(0.18, '#efe7da', false), 0.25, 0, 0.18));
      const blade = new THREE.PlaneGeometry(0.02, 0.07, 2, 6); const bp = blade.attributes.position; for (let i = 0; i < bp.count; i++) bp.setZ(i, Math.sin(bp.getY(i) * 30) * 0.006); blade.computeVertexNormals();
      const pp = pile(blade, M.std('#e8822a', { roughness: 0.6, side: THREE.DoubleSide }), 40, 0.13, 5, { height: 0.35 }); pp.position.set(0.25, 0.03, 0.18); g.add(pp);
      return g;
    }
    case 'molle': {
      const br = [V3(-0.45, 0.62, -0.15), V3(-0.05, 0.6, -0.1), V3(0.35, 0.52, -0.05)]; g.add(stem(br, 0.007, '#6a5a3a')); const curve = new THREE.CatmullRomCurve3(br);
      for (let k = 0; k < 4; k++) { const p = curve.getPointAt(0.1 + k * 0.27), pts = [p, p.clone().add(V3(0.05, -0.15, 0.06)), p.clone().add(V3(0.08, -0.38, 0.1))]; sprig(g, pts, { col: '#6a8a3a', n: 12, size: 0.012, aspect: 9, pairs: true, stemCol: '#6a6a3a', r0: 0.003, spread: 1.2, seed: k + 90 }); }
      const bm = glossy('#e86a7a', { sheen: 0.5, sheenColor: new THREE.Color('#f8bbd0') });
      for (let k = 0; k < 3; k++) { const p = curve.getPointAt(0.25 + k * 0.27), tip = p.clone().add(V3(-0.02, -0.25, 0.02)); g.add(stem([p, tip], 0.002, '#8a6a4a')); const list = []; for (let q = 0; q < 40; q++) { const t = q / 40, a = q * 2.39996, rr = 0.035 * Math.sin(Math.PI * t) + 0.005; list.push([p.clone().lerp(tip, t).add(V3(Math.cos(a) * rr, 0, Math.sin(a) * rr)), V3(0, 1, 0), 1]); } instances(g, new THREE.SphereGeometry(0.009, 10, 8), bm, list); }
      g.add(place(dish(0.16, '#efe7da', false), 0.25, 0, 0.25)); const pp = pile(new THREE.SphereGeometry(0.009, 10, 8), bm, 120, 0.12, 6, { height: 0.3 }); pp.position.set(0.25, 0.025, 0.25); g.add(pp);
      return g;
    }
    case 'siberianfir': {
      for (let s = 0; s < 3; s++) { const pts = [V3(-0.45 + s * 0.05, 0.05 + s * 0.05, 0.2 - s * 0.15), V3(-0.1, 0.2 + s * 0.08, 0.1 - s * 0.15), V3(0.3, 0.3 + s * 0.06, 0.05 - s * 0.12)]; g.add(stem(pts, 0.008, '#6a5a3a')); needles(g, pts, { n: 380, len: 0.05, col: s % 2 ? '#2e5e3e' : '#3a6e48', w: 0.004, angle: 1.2, seed: s + 12, start: 0.05 }); }
      const cone = new THREE.Group(); scaleCone(cone, V3(0, 0, 0), V3(0, 1, 0), 0.2, 0.09, 60, M.std('#5a4a7a', { roughness: 0.6, side: THREE.DoubleSide }), { w: 0.05, h: 0.04, cup: 0.6, open: 0.1 }); cone.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 16), M.std('#4a3a5a'), 0, 0.1, 0)); cone.position.set(0.1, 0.3, -0.1); g.add(cone);
      const res = new THREE.SphereGeometry(0.008, 10, 8); for (let k = 0; k < 4; k++) g.add(mesh(res, M.liquid('#e8d08a', { transmission: 0.6, clearcoat: 1, attenuationDistance: 0.05 }), 0.1 + (r() - 0.5) * 0.05, 0.35 + k * 0.03, -0.06));
      return g;
    }
    case 'carob': {
      const podM = M.std('#4a2a14', { roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 });
      const pod = (x, z, ry, len, bend) => { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(V3((t - 0.5) * len, 0.025 + Math.sin(t * Math.PI) * 0.01, Math.sin(t * Math.PI) * bend)); } const tb = tube(pts, 0.05, 40, 12, 0.15); tb.scale(1, 0.4, 1.3); const m = mesh(tb, podM); place(m, x, 0.0, z, 0, ry, 0); g.add(m); };
      pod(-0.15, -0.2, 0.3, 0.62, 0.08); pod(-0.08, 0.0, -0.2, 0.58, -0.06); pod(-0.22, 0.2, 0.1, 0.5, 0.07);
      g.add(place(dish(0.17, '#efe7da', false), 0.3, 0, 0.18));
      const powder = new THREE.ConeGeometry(0.13, 0.08, 40, 4); const pp = powder.attributes.position; for (let i = 0; i < pp.count; i++) pp.setY(i, pp.getY(i) + Math.sin(pp.getX(i) * 40) * 0.003); powder.computeVertexNormals();
      g.add(mesh(powder, M.std('#7a4a26', { roughness: 1, bumpMap: noiseTex('powder', 80, 1.5), bumpScale: 1 }), 0.3, 0.06, 0.18));
      const seed = new THREE.SphereGeometry(0.012, 12, 10); seed.scale(1, 0.55, 1.3); const sp = pile(seed, glossy('#6a3a1a'), 9, 0.07, 4, { height: 0.1 }); sp.position.set(0.15, 0, -0.3); g.add(sp);
      return g;
    }
  }
  return seventhNotes(ing);
}

// a stemmed glass whose liquid fills only the bowl, between heights y0 and y1
function stemGlass(g, prof, y0, y1, liquidCol, x, z) {
  g.add(mesh(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 64), M.glass({ thickness: 0.04 }), x, 0, z));
  const at = (y) => { for (let i = 1; i < prof.length; i++) { const [a0, b0] = prof[i - 1], [a1, b1] = prof[i]; if (y >= b0 && y <= b1) return a0 + (a1 - a0) * (y - b0) / (b1 - b0 || 1); } return prof[prof.length - 1][0]; };
  const pts = [new THREE.Vector2(0, y0)]; for (let k = 0; k <= 12; k++) { const y = y0 + (y1 - y0) * k / 12; pts.push(new THREE.Vector2(Math.max(0.002, at(y) - 0.01), y)); } pts.push(new THREE.Vector2(0, y1));
  g.add(mesh(new THREE.LatheGeometry(pts, 48), M.juice(liquidCol, { emissive: new THREE.Color(liquidCol).multiplyScalar(0.25) }), x, 0, z));
}

// ── specimens for notes from newly mapped places (Africa, the Pacific, Iceland, the Andes...) ──
function seventhNotes(ing) {
  const id = ing.id, r = rng(hash(id)), g = new THREE.Group(), [c0, c1, c2] = ing.c;
  const glossy = (c, o = {}) => M.std(c, { roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.18, ...o });
  switch (id) {
    case 'hyraceum': {
      const band = canvasTex('hyrax', 256, 256, (c, W) => { for (let y = 0; y < W; y += 4) { const k = 0.5 + 0.5 * Math.sin(y * 0.11 + Math.sin(y * 0.03) * 3); c.fillStyle = `rgb(${40 + k * 50},${26 + k * 30},${14 + k * 14})`; c.fillRect(0, y, W, 4); } });
      const stone = M.std(0xffffff, { map: band, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.25, bumpMap: noiseTex('hyrbump', 30, 2), bumpScale: 3 });
      const rock = blob(0.22, 0.06, 3, 5, 4); rock.scale(1.35, 0.7, 1); g.add(mesh(rock, stone, -0.15, 0.13, -0.05));
      g.add(place(dish(0.2, '#efe7da', false), 0.3, 0, 0.25));
      const chip = blob(0.04, 0.015, 7, 2, 2); const pp = pile(chip, stone, 14, 0.13, 5, { height: 0.35 }); pp.position.set(0.3, 0.03, 0.25); g.add(pp);
      const crag = displace(new THREE.BoxGeometry(0.3, 0.1, 0.2, 8, 3, 6), 0.025, 5, 3, 6); g.add(place(mesh(crag, M.std('#a89a86', { roughness: 0.95, bumpMap: noiseTex('rock', 30, 2), bumpScale: 4 })), 0.25, 0.05, -0.3, 0, 0.5, 0));
      return g;
    }
    case 'castoreum': {
      const hide = M.std('#5a3a22', { roughness: 0.55, clearcoat: 0.4, bumpMap: noiseTex('castor', 40, 2.2), bumpScale: 4 });
      const sac = (x, z, ry) => { const p = new THREE.Group(); [-1, 1].forEach((s) => { const f = sphereFruit(0.075, hide, { sy: 1.7, bump: 0.01, seed: s + 3 }); f.position.set(s * 0.06, 0, 0); f.rotation.z = -s * 0.18; p.add(f); }); p.add(mesh(tube([V3(-0.06, 0.12, 0), V3(0, 0.17, 0), V3(0.06, 0.12, 0)], 0.012, 12, 6), hide)); place(p, x, 0.07, z, Math.PI / 2 - 0.1, ry, 0); g.add(p); };
      sac(-0.18, 0.05, 0.4); sac(0.02, -0.2, -0.8);
      glassOf(g, [[0, 0], [0.06, 0], [0.065, 0.02], [0.065, 0.2], [0.04, 0.24], [0.02, 0.26], [0.02, 0.3]], '#5a2e12', 0.33, 0.22, 0.7, { thickness: 0.05 });
      leafAt(g, 0.15, 0.32, 0.4, '#6a8a4a', 0.7, 'serrated');
      return g;
    }
    case 'baobab': {
      const velvet = M.std('#8a8a6a', { roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#d8d4b8'), sheenRoughness: 0.7 });
      const pod = sphereFruit(0.1, velvet, { sy: 1.9, bump: 0.008, seed: 3 }); place(pod, 0.2, 0.1, 0.18, Math.PI / 2 - 0.1, 0.7, 0); g.add(pod);
      const half = new THREE.Group(); const shellG = new THREE.SphereGeometry(0.1, 40, 20, 0, TAU, 0, Math.PI / 2); shellG.scale(1, 1.9, 1); half.add(mesh(shellG, velvet));
      const chunk = blob(0.03, 0.01, 6, 4, 2); instances(half, chunk, M.std('#f4eedc', { roughness: 1 }), Array.from({ length: 14 }, (_, k) => [V3(Math.cos(k * 2.4) * 0.05 * Math.sqrt(k / 14), 0.02 + (k % 4) * 0.035, Math.sin(k * 2.4) * 0.05 * Math.sqrt(k / 14)), V3(r() - 0.5, 1, r() - 0.5), 1]));
      place(half, -0.05, 0.1, 0.35, -Math.PI / 2 - 0.25, 0.3, 0); g.add(half);
      const top = V3(-0.22, 0.55, -0.15); g.add(stem([V3(-0.3, 0.02, -0.25), V3(-0.28, 0.3, -0.2), top], 0.012, '#6a5a3a'));
      const fl = flowerHead(ing, { petals: 5, len: 0.15, wid: 0.12, open: 2.3, cup: 0.6, droop: 0.4, centerR: 0, colors: ['#fbf8ee', '#ffffff', '#e8dcc0'] });
      const fil = new THREE.CylinderGeometry(0.0015, 0.0015, 0.09, 3); fil.translate(0, 0.045, 0);
      const st = []; for (let k = 0; k < 110; k++) { const t = Math.acos(1 - (k + 0.5) / 110), a = k * 2.39996; st.push([V3(0, 0.02, 0), V3(Math.sin(t) * Math.cos(a), Math.cos(t) + 0.3, Math.sin(t) * Math.sin(a)), 1]); } instances(fl, fil, M.std('#f6f0dc'), st);
      instances(fl, new THREE.SphereGeometry(0.006, 6, 4), M.std('#d8b850'), st.map(([p, d]) => [p.clone().addScaledVector(d.clone().normalize(), 0.09), d, 1]));
      place(fl, top.x, top.y - 0.03, top.z, Math.PI, 0, 0.2, 1.3); g.add(fl);
      leafAt(g, 0.3, -0.25, 1.6, '#4f7a2e', 0.9, 'ovate');
      return g;
    }
    case 'cashew': {
      const apple = new THREE.LatheGeometry([[0, 0], [0.06, 0.01], [0.085, 0.08], [0.1, 0.2], [0.09, 0.3], [0.05, 0.35], [0, 0.36]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
      const am = M.std('#e8402a', { roughness: 0.25, clearcoat: 0.9, map: gradTex('cashewapple', [[0, '#f4c43a'], [0.45, '#f08a2a'], [1, '#d8301e']]) });
      const nut = new THREE.TorusGeometry(0.045, 0.026, 16, 32, Math.PI * 1.15); nut.scale(1, 1, 0.75);
      const fruit = (x, z, ry, s) => { const f = new THREE.Group(); f.add(mesh(apple, am)); f.add(place(mesh(nut, M.std('#9a946a', { roughness: 0.45, clearcoat: 0.3 })), 0.0, -0.045, 0, 0, 0, Math.PI * 0.92)); place(f, x, 0.1, z, -Math.PI / 2 + 0.15, ry, 0, s); g.add(f); };
      fruit(-0.22, -0.3, 0.5, 1.05); fruit(0.02, -0.4, -0.4, 0.95);
      g.add(place(dish(0.22, '#efe7da', false), 0.28, 0, 0.22));
      const kernel = new THREE.TorusGeometry(0.03, 0.017, 12, 24, Math.PI * 1.2); kernel.scale(1, 1, 0.8);
      const kp = pile(kernel, M.std('#f2dfb8', { roughness: 0.55, sheen: 0.4 }), 26, 0.15, 7, { height: 0.35 }); kp.position.set(0.28, 0.03, 0.22); g.add(kp);
      leafAt(g, -0.35, 0.25, 0.6, '#4f7a2e', 1.05, 'ovate');
      return g;
    }
    case 'clementine': {
      const peel = glossy('#f58a1a', { bumpMap: noiseTex('clem', 90, 1.4), bumpScale: 0.7 });
      [[-0.2, -0.05, 0.11], [0.05, -0.22, 0.1], [-0.02, 0.1, 0.095]].forEach(([x, z, R], k) => { const f = sphereFruit(R, peel, { sy: 0.86 }); f.position.set(x, R * 0.86, z); f.rotation.y = k; g.add(f); f.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.012, 8), M.std('#5a6a3a'), 0, R * 0.88, 0)); });
      leafAt(g, -0.12, -0.08, 0.6, '#2f6a2a', 0.75, 'ovate', 0.21, -1.0);
      halfFruit(g, 0.09, peel, segFace('clemface', '#f58a1a', '#fbe8c8', '#f7962a', 10), 0.3, 0.07, -0.05, 0.3, -0.5, 0.86);
      halfFruit(g, 0.085, peel, segFace('clemface', '#f58a1a', '#fbe8c8', '#f7962a', 10), 0.25, 0.065, 0.25, 0.5, 0.6, 0.86);
      return g;
    }
    case 'marula': {
      const spot = canvasTex('marulaskin', 128, 128, (c, W) => { c.fillStyle = '#e8c23a'; c.fillRect(0, 0, W, W); for (let i = 0; i < 120; i++) { c.fillStyle = `rgba(150,110,40,${Math.random() * 0.5})`; c.beginPath(); c.arc(Math.random() * W, Math.random() * W, Math.random() * 2, 0, TAU); c.fill(); } });
      const skin = M.std(0xffffff, { map: spot, roughness: 0.4, clearcoat: 0.5 });
      [[-0.22, -0.05], [-0.05, -0.2], [0.05, 0.02], [-0.2, 0.18]].forEach(([x, z], k) => { const f = sphereFruit(0.075, skin, { sy: 0.92, bump: 0.004, seed: k }); f.position.set(x, 0.07, z); g.add(f); });
      const face = cutFace('marulaface', (c, W) => { c.fillStyle = '#e8c23a'; c.beginPath(); c.arc(W / 2, W / 2, W / 2, 0, TAU); c.fill(); c.fillStyle = '#f8f2d8'; c.beginPath(); c.arc(W / 2, W / 2, W * 0.46, 0, TAU); c.fill(); c.fillStyle = '#c8a878'; c.beginPath(); c.ellipse(W / 2, W / 2, W * 0.24, W * 0.2, 0, 0, TAU); c.fill(); });
      halfFruit(g, 0.075, skin, face, 0.28, 0.06, 0.18, 0.4, 0.4, 0.92);
      sprig(g, [V3(0.45, 0.02, -0.3), V3(0.25, 0.12, -0.25), V3(0.0, 0.18, -0.35)], { col: '#3f6a2a', n: 9, size: 0.06, aspect: 2.2, pairs: true, stemCol: '#6a5a3a', r0: 0.006, seed: 21 });
      return g;
    }
    case 'kaffirlime': {
      const knobbly = displace(new THREE.SphereGeometry(0.1, 64, 48), 0.012, 9, 3, 4);
      const fm = glossy('#4f8a2a', { bumpMap: noiseTex('combava', 70, 1.6), bumpScale: 1.2 });
      [[-0.18, -0.08], [0.06, -0.2]].forEach(([x, z], k) => { const f = mesh(knobbly, fm, x, 0.1, z); f.rotation.set(r(), r(), r()); g.add(f); });
      const dbl = (x, z, ry, s) => { const p = new THREE.Group(); [0, 1].forEach((k) => { const l = mesh(bendPlane(0.12 * s, 0.2 * s, { cup: 0.35, curl: 0.1 }), M.leaf('#2f6a2a', '#7ab04a', 'ovate')); l.position.set(0, k * 0.2 * s, 0); l.material.clearcoat = 0.9; p.add(l); }); place(p, x, 0.02, z, -1.35, ry, 0); g.add(p); };
      dbl(0.22, 0.12, 0.5, 1.4); dbl(-0.1, 0.25, -0.9, 1.25); dbl(0.35, -0.15, 2.1, 1.2);
      halfFruit(g, 0.1, fm, segFace('combface', '#4f8a2a', '#e8f0c0', '#c8d870', 9), -0.32, 0.08, 0.22, 0.35, 0.2, 1);
      return g;
    }
    case 'matcha': {
      const bowl = new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.1, 0.02], [0.18, 0.06], [0.2, 0.16], [0.195, 0.165], [0.17, 0.07], [0.09, 0.03], [0, 0.03]].map(([a, b]) => new THREE.Vector2(a, b)), 64);
      g.add(mesh(bowl, M.std('#3a3430', { roughness: 0.35, clearcoat: 0.8, bumpMap: noiseTex('raku', 20, 1.5), bumpScale: 1.5 }), -0.12, 0, -0.05));
      const froth = new THREE.CircleGeometry(0.188, 48); froth.rotateX(-Math.PI / 2); g.add(mesh(froth, M.std('#9ccc3a', { roughness: 0.75, bumpMap: noiseTex('froth', 120, 2), bumpScale: 2 }), -0.12, 0.135, -0.05));
      const whisk = new THREE.Group(); whisk.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 20), M.std('#d8c08a', { roughness: 0.6 }), 0, 0.06, 0));
      const tines = []; for (let k = 0; k < 60; k++) { const a = k * TAU / 60; tines.push(tube([V3(Math.cos(a) * 0.028, 0.0, Math.sin(a) * 0.028), V3(Math.cos(a) * 0.06, -0.06, Math.sin(a) * 0.06), V3(Math.cos(a) * 0.035, -0.13, Math.sin(a) * 0.035)], 0.0018, 8, 3).toNonIndexed()); }
      whisk.add(mesh(mergeGeometries(tines), M.std('#e8d8a8', { roughness: 0.5 }))); place(whisk, 0.28, 0.13, 0.15, 0.25, 0, 0.15); g.add(whisk);
      const powder = new THREE.ConeGeometry(0.08, 0.05, 40, 4); g.add(mesh(powder, M.std('#7aaa2a', { roughness: 1, bumpMap: noiseTex('powder', 80, 1.5), bumpScale: 1 }), 0.25, 0.025, -0.25));
      g.add(place(mesh(new THREE.BoxGeometry(0.02, 0.006, 0.3), M.std('#d8c08a', { roughness: 0.6 })), 0.08, 0.003, 0.3, 0, 0.6, 0));
      return g;
    }
    case 'kewra': {
      const lm = M.std('#4a7a32', { roughness: 0.45, clearcoat: 0.6, side: THREE.DoubleSide });
      for (let k = 0; k < 7; k++) { const l = mesh(bendPlane(0.045, 0.7, { cup: 0.6, droop: 0.35 }), lm), hd = new THREE.Group(); hd.rotation.y = k * TAU / 7 + 0.3; l.rotation.x = 0.9; hd.add(l); hd.position.set(-0.3, 0.03, -0.25); g.add(hd); }
      const spathe = M.std('#f4e8b0', { roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#fffbe0'), side: THREE.DoubleSide });
      const fl = new THREE.Group(); for (let k = 0; k < 6; k++) { const s = mesh(bendPlane(0.08, 0.32 - k * 0.025, { cup: 1.1, curl: 0.15 }), spathe), hd = new THREE.Group(); hd.rotation.y = k * 1.1; s.rotation.x = 0.15 + k * 0.05; hd.add(s); fl.add(hd); }
      fl.add(place(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.2, 16), M.std('#efe0a0', { roughness: 0.9, bumpMap: noiseTex('pollen', 80, 2), bumpScale: 3 })), 0, 0.1, 0));
      place(fl, 0.05, 0.02, 0.15, -1.2, 0.4, 0); g.add(fl);
      glassOf(g, [[0, 0], [0.05, 0], [0.055, 0.02], [0.055, 0.16], [0.035, 0.2], [0.015, 0.22], [0.015, 0.26]], '#f4f0d8', 0.35, -0.05, 0.75, { thickness: 0.05 });
      return g;
    }
    case 'dragonfruit': {
      const skin = M.std('#e8306a', { roughness: 0.3, clearcoat: 0.7 }), bract = M.std('#e8306a', { roughness: 0.4, side: THREE.DoubleSide, map: gradTex('pitbract', [[0, '#e8306a'], [0.6, '#e8306a'], [1, '#9ad040']]) });
      const fruit = (x, z, ry, s) => { const f = new THREE.Group(); f.add(sphereFruit(0.12, skin, { sy: 1.25 })); const list = []; for (let k = 0; k < 16; k++) { const t = 0.25 + (k % 4) * 0.18, a = k * 2.39996, d = V3(Math.sin(Math.PI * t) * Math.cos(a), -Math.cos(Math.PI * t), Math.sin(Math.PI * t) * Math.sin(a)); list.push([V3(d.x * 0.115, d.y * 0.145, d.z * 0.115), d.clone().add(V3(0, 1.2, 0)), 1, 0]); }
        const bg = bendPlane(0.05, 0.08, { cup: 0.6, curl: 0.3 }); instances(f, bg, bract, list); place(f, x, 0.15 * s, z, 0.15, ry, 0.1, s); g.add(f); };
      fruit(-0.22, -0.08, 0.3, 1);
      const face = seedFace('pitface', '#e8306a', '#fbf8f2', '#ffffff', '#141010', 160, 2.2);
      halfFruit(g, 0.12, skin, face, 0.15, 0.1, 0.1, 0.35, -0.3, 1.25);
      halfFruit(g, 0.1, skin, seedFace('pitredface', '#e8306a', '#c81e5a', '#e0306a', '#141010', 120, 2), 0.32, 0.08, -0.2, 0.5, 0.5, 1.2);
      return g;
    }
    case 'ginseng': {
      const rootM = M.std('#e8d2a8', { roughness: 0.7, bumpMap: noiseTex('ginseng', 50, 2, [1, 4]), bumpScale: 4 });
      const body = [V3(-0.3, 0.05, 0.0), V3(-0.12, 0.06, 0.02), V3(0.02, 0.05, 0.05)]; g.add(mesh(tube(body, 0.05, 24, 16, 0.5), rootM));
      g.add(mesh(new THREE.SphereGeometry(0.05, 20, 14), rootM, -0.3, 0.05, 0));
      [[V3(0.0, 0.05, 0.05), V3(0.15, 0.03, 0.15), V3(0.3, 0.02, 0.2)], [V3(0.0, 0.05, 0.04), V3(0.16, 0.03, -0.05), V3(0.32, 0.02, -0.1)], [V3(-0.1, 0.05, 0.03), V3(-0.02, 0.03, 0.18), V3(0.05, 0.02, 0.3)]].forEach((p) => g.add(mesh(tube(p, 0.022, 20, 10, 0.85), rootM)));
      for (let k = 0; k < 14; k++) { const a = r() * TAU, o = V3(0.1 + r() * 0.2, 0.02, (r() - 0.5) * 0.3); g.add(mesh(tube([o, o.clone().add(V3(Math.cos(a) * 0.06, -0.005, Math.sin(a) * 0.06)), o.clone().add(V3(Math.cos(a) * 0.12, -0.01, Math.sin(a) * 0.12))], 0.0025, 8, 3), rootM)); }
      const top = V3(-0.3, 0.55, -0.25); g.add(stem([V3(-0.32, 0.08, -0.02), V3(-0.31, 0.3, -0.12), top], 0.008, '#6a7a3a'));
      for (let k = 0; k < 5; k++) { const l = mesh(bendPlane(0.06, 0.15, { cup: 0.4, curl: 0.15 }), M.leaf('#4f8a2e', '#9ac860', 'serrated')), hd = new THREE.Group(); hd.rotation.y = k * TAU / 5; l.rotation.x = 1.3; hd.add(l); hd.position.copy(top); g.add(hd); }
      berries(g, top.clone().add(V3(0, 0.07, 0)), 14, 0.016, glossy('#d82a1a'), 0.035, 4);
      return g;
    }
    case 'thanaka': {
      timber(g, ing, { gloss: 0.1, dark: 0.35 });
      const slab = new THREE.CylinderGeometry(0.17, 0.18, 0.04, 48); g.add(mesh(slab, M.std('#9a9690', { roughness: 0.9, bumpMap: noiseTex('slate', 40, 1.5), bumpScale: 2 }), 0.25, 0.02, 0.2));
      const paste = new THREE.CircleGeometry(0.11, 40); paste.rotateX(-Math.PI / 2); const pp = paste.attributes.position; for (let i = 0; i < pp.count; i++) pp.setY(i, 0.004 * (1 - Math.hypot(pp.getX(i), pp.getZ(i)) / 0.11)); paste.computeVertexNormals();
      g.add(mesh(paste, M.std('#f0dca0', { roughness: 0.85, bumpMap: noiseTex('paste', 60, 1.5), bumpScale: 1.5 }), 0.24, 0.041, 0.2));
      return g;
    }
    case 'iliahi': {
      timber(g, ing, { gloss: 0.4, dark: 0.55 });
      sprig(g, [V3(0.45, 0.02, 0.2), V3(0.3, 0.14, 0.1), V3(0.1, 0.2, 0.0)], { col: '#5a7a5a', n: 8, size: 0.06, aspect: 2, pairs: true, stemCol: '#5a3a2a', r0: 0.006, seed: 17, gloss: 0.5 });
      berries(g, V3(0.18, 0.2, 0.02), 7, 0.018, glossy('#2a1a2a'), 0.04, 6);
      return g;
    }
    case 'niaouli': {
      const paper = (k) => M.std(['#f2ece0', '#e8ddc8', '#d8c8a8'][k % 3], { roughness: 0.95, side: THREE.DoubleSide, bumpMap: noiseTex('paperbark' + k, 30, 2, [1, 3]), bumpScale: 3 });
      for (let k = 0; k < 4; k++) { const rad = 0.13 + k * 0.012, cyl = new THREE.CylinderGeometry(rad, rad * 1.03, 0.7 - k * 0.08, 40, 6, true, k * 0.6, TAU - k * 0.7); g.add(place(mesh(displace(cyl, 0.006, 6, 2, k), paper(k)), -0.15, 0.15, -0.1 + k * 0.004, Math.PI / 2, 0.45, 0)); }
      const top = V3(0.25, 0.45, 0.1); g.add(stem([V3(0.4, 0.02, 0.3), V3(0.32, 0.2, 0.22), top], 0.007, '#6a5a3a'));
      const fil = new THREE.CylinderGeometry(0.0012, 0.0012, 0.05, 3); fil.translate(0, 0.025, 0); const list = [];
      for (let k = 0; k < 180; k++) { const t = k / 180, a = k * 2.39996; list.push([top.clone().add(V3(0, 0.02 + t * 0.14, 0)), V3(Math.cos(a), 0.2, Math.sin(a)), 1]); } instances(g, fil, M.std('#f4eec8'), list);
      for (let k = 0; k < 8; k++) { const l = mesh(bendPlane(0.03, 0.2, { cup: 0.3, curl: 0.15 }), M.leaf('#5a7a4a', '#a0b890', 'long')), hd = new THREE.Group(); hd.rotation.y = k * 0.8; l.rotation.x = 0.6 + (k % 3) * 0.2; hd.add(l); hd.position.copy(top.clone().add(V3(0, 0.18 + (k % 3) * 0.03, 0))); g.add(hd); }
      return g;
    }
    case 'agave': {
      const lg = new THREE.ConeGeometry(0.045, 0.5, 12, 6); lg.translate(0, 0.25, 0); lg.scale(1, 1, 0.35);
      const lm = M.std('#7aa0a0', { roughness: 0.45, clearcoat: 0.4, sheen: 0.6, sheenColor: new THREE.Color('#c8e0d8') });
      const list = []; for (let k = 0; k < 22; k++) { const ring = Math.floor(k / 8), a = k * 2.39996, tilt = 1.25 - ring * 0.38; list.push([V3(-0.18, 0.04, -0.12), V3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)), 1 - ring * 0.12, a]); }
      instances(g, lg, lm, list);
      const spine = new THREE.ConeGeometry(0.006, 0.03, 6); spine.translate(0, 0.015, 0); instances(g, spine, M.std('#4a2a1a'), list.map(([p, d, s]) => [p.clone().addScaledVector(d.clone().normalize(), 0.5 * s), d, 1]));
      glassOf(g, [[0, 0], [0.035, 0], [0.04, 0.012], [0.05, 0.13], [0.052, 0.135]], '#e8c060', 0.3, 0.22, 0.8);
      const wedge = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20, 1, false, 0, Math.PI / 2.5); g.add(place(mesh(wedge, [glossy('#6aa02a'), M.std('#d8e890', { roughness: 0.3 }), M.std('#d8e890')]), 0.42, 0.02, 0.1, 0, 0.6, 0));
      return g;
    }
    case 'banana': {
      const peel = M.std('#f2cc2a', { roughness: 0.4, clearcoat: 0.4, bumpMap: noiseTex('bananapeel', 30, 1.2, [1, 4]), bumpScale: 0.5 });
      const finger = (k) => { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V3(t * 0.42, Math.sin(t * Math.PI * 0.9) * 0.1, 0)); } const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.04, 5, false); const p = geo.attributes.position, curve = new THREE.CatmullRomCurve3(pts);
        for (let i = 0; i < p.count; i++) { const t = Math.floor(i / 6) / 30, c = curve.getPointAt(Math.min(1, t)), k2 = 0.35 + 0.65 * Math.sin(Math.PI * Math.min(0.98, 0.08 + t * 0.92)); p.setXYZ(i, c.x + (p.getX(i) - c.x) * k2, c.y + (p.getY(i) - c.y) * k2, c.z + (p.getZ(i) - c.z) * k2); } geo.computeVertexNormals();
        const f = new THREE.Group(); f.add(mesh(geo, peel)); f.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), M.std('#3a2a1a'), 0.42, 0.03, 0)); f.position.set(0, k * 0.012, (k - 2) * 0.065); f.rotation.set((k - 2) * 0.12, (k - 2) * -0.08, 0.05); return f; };
      const bunch = new THREE.Group(); for (let k = 0; k < 5; k++) bunch.add(finger(k)); bunch.add(place(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.1, 10), M.std('#6a7a3a')), -0.02, 0.02, 0, 0, 0, 1.4));
      place(bunch, -0.2, 0.04, 0.05, 0, 0.2, 0); g.add(bunch);
      const leaf = mesh(bendPlane(0.32, 0.85, { cup: 0.4, curl: -0.05, wave: 1 }), M.leaf('#3f8a2e', '#8ac860', 'long')); leaf.rotation.set(-1.45, 0.9, 0); leaf.position.set(0.0, 0.01, -0.35); g.add(leaf);
      return g;
    }
    case 'blueberry': {
      const bm = M.std('#3a4a8a', { roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#a8b8e0'), sheenRoughness: 0.6 });
      const berry = new THREE.SphereGeometry(0.035, 24, 16); berry.scale(1, 0.85, 1);
      const pp = pile(berry, bm, 70, 0.2, 4, { height: 0.55, size: [0.8, 1.15] }); pp.position.set(-0.05, 0, 0.05); g.add(pp);
      sprig(g, [V3(0.45, 0.02, -0.3), V3(0.25, 0.1, -0.25), V3(0.05, 0.14, -0.3)], { col: '#4f7a3a', n: 10, size: 0.05, aspect: 2, stemCol: '#8a3a2a', r0: 0.005, seed: 8, gloss: 0.4 });
      berries(g, V3(0.08, 0.14, -0.3), 6, 0.03, bm, 0.05, 2);
      return g;
    }
    case 'acai': {
      const bm = M.std('#2a1428', { roughness: 0.3, clearcoat: 0.8, sheen: 0.4, sheenColor: new THREE.Color('#7a4a8a') });
      for (let s = 0; s < 6; s++) { const a = -0.6 + s * 0.24, end = V3(-0.1 + Math.cos(a) * 0.45, 0.04, -0.1 + Math.sin(a) * 0.35); const pts = [V3(-0.35, 0.16, -0.25), V3(-0.2 + Math.cos(a) * 0.15, 0.12, -0.2 + Math.sin(a) * 0.1), end]; g.add(stem(pts, 0.004, '#8a6a3a')); const c = new THREE.CatmullRomCurve3(pts); berries(g, c.getPointAt(0.75), 9, 0.018, bm, 0.05, s); }
      g.add(stem([V3(-0.5, 0.02, -0.4), V3(-0.42, 0.1, -0.32), V3(-0.35, 0.16, -0.25)], 0.012, '#8a6a3a'));
      const bowl = new THREE.LatheGeometry([[0, 0], [0.08, 0], [0.13, 0.03], [0.16, 0.1], [0.155, 0.105], [0.12, 0.04], [0, 0.035]].map(([a, b]) => new THREE.Vector2(a, b)), 48);
      g.add(mesh(bowl, M.std('#a8784a', { roughness: 0.6 }), 0.3, 0, 0.25));
      const pulp = new THREE.CircleGeometry(0.15, 40); pulp.rotateX(-Math.PI / 2); g.add(mesh(pulp, M.std('#4a1a4a', { roughness: 0.35, clearcoat: 0.6 }), 0.3, 0.085, 0.25));
      return g;
    }
    case 'feijoa': {
      const skin = M.std('#5a8a32', { roughness: 0.55, bumpMap: noiseTex('feijoa', 60, 1.5), bumpScale: 1.5 });
      [[-0.22, -0.08, 0.5], [-0.02, -0.25, -0.4]].forEach(([x, z, ry]) => { const f = sphereFruit(0.07, skin, { sy: 1.5 }); const grp = new THREE.Group(); grp.add(f); for (let k = 0; k < 4; k++) { const s = mesh(bendPlane(0.02, 0.035, { cup: 0.6 }), M.std('#4a5a2a', { side: THREE.DoubleSide })), hd = new THREE.Group(); hd.rotation.y = k * TAU / 4; s.rotation.x = 0.3; s.position.y = 0.1; hd.add(s); grp.add(hd); } place(grp, x, 0.07, z, Math.PI / 2, ry, 0); g.add(grp); });
      const face = seedFace('feijoaface', '#5a8a32', '#f4f0d8', '#e0dca0', '#c8b888', 18, 2.5);
      halfFruit(g, 0.07, skin, face, 0.2, 0.06, 0.15, 0.4, 0.3, 1.4);
      const fl = flowerHead(ing, { petals: 4, len: 0.06, wid: 0.05, open: 1.5, cup: 1.0, centerR: 0, colors: ['#f4d8d8', '#ffffff', '#c86a7a'] });
      const fil = new THREE.CylinderGeometry(0.002, 0.002, 0.08, 4); fil.translate(0, 0.04, 0); const st = []; for (let k = 0; k < 40; k++) { const a = k * 2.4, t = (k % 7) * 0.08; st.push([V3(0, 0.01, 0), V3(Math.cos(a) * t, 1, Math.sin(a) * t), 1]); } instances(fl, fil, M.std('#c8203a'), st);
      instances(fl, new THREE.SphereGeometry(0.006, 6, 4), M.std('#f4d040'), st.map(([p, d]) => [p.clone().addScaledVector(d.clone().normalize(), 0.08), d, 1]));
      place(fl, 0.3, 0.06, -0.2, -0.4, 0, 0.1, 1.4); g.add(fl);
      leafAt(g, -0.35, 0.25, 0.6, '#4a6a3a', 0.8, 'ovate');
      return g;
    }
    case 'lichen': {
      const rock = blob(0.24, 0.05, 2.5, 3, 4); rock.scale(1.4, 0.6, 1.1); g.add(mesh(rock, M.std('#5a5650', { roughness: 0.95, bumpMap: noiseTex('basalt', 40, 2), bumpScale: 5 }), -0.05, 0.1, 0));
      const lobe = bendPlane(0.03, 0.06, { cup: 1.4, curl: 0.6, wave: 1 });
      const cols = [M.std('#a8b088', { roughness: 0.9, side: THREE.DoubleSide, sheen: 0.6 }), M.std('#8a7a4a', { roughness: 0.85, side: THREE.DoubleSide }), M.std('#c8c8a0', { roughness: 0.9, side: THREE.DoubleSide })];
      cols.forEach((m, j) => { const list = []; for (let k = 0; k < 110; k++) { const a = r() * TAU, tt = Math.acos(r() * 0.85), d = V3(Math.sin(tt) * Math.cos(a) * 1.4 * 0.24, Math.cos(tt) * 0.6 * 0.24, Math.sin(tt) * Math.sin(a) * 1.1 * 0.24); list.push([V3(-0.05 + d.x, 0.1 + d.y, d.z), V3(d.x, d.y + 0.15, d.z), 0.8 + r() * 0.6, r() * TAU]); } instances(g, lobe, m, list); });
      const tuft = (x, z) => { const list = []; for (let k = 0; k < 40; k++) list.push([V3(x + (r() - 0.5) * 0.12, 0.01, z + (r() - 0.5) * 0.12), V3(r() - 0.5, 1, r() - 0.5), 0.9 + r() * 0.5, r() * TAU]); instances(g, lobe, cols[0], list); };
      tuft(0.35, 0.28); tuft(0.42, -0.1);
      return g;
    }
    case 'paprika': {
      const pepper = (len, bend) => { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V3(0, -t * len, Math.sin(t * 1.6) * bend)); } const geo = tube(pts, 0.035, 30, 14, 0.85); return displace(geo, 0.004, 22, 2, Math.round(len * 100)); };
      const red = M.std('#a81a12', { roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.3 });
      const string = [V3(-0.45, 0.62, -0.25), V3(-0.1, 0.56, -0.22), V3(0.25, 0.6, -0.2)]; g.add(mesh(tube(string, 0.004, 20, 4), M.std('#d8c8a0')));
      const sc = new THREE.CatmullRomCurve3(string); for (let k = 0; k < 7; k++) { const p = sc.getPointAt(0.08 + k * 0.14), m = mesh(pepper(0.24 + r() * 0.08, 0.04), red); m.position.copy(p); m.rotation.set((r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.25); g.add(m); g.add(mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.03, 10), M.std('#6a6a2a'), p.x, p.y - 0.01, p.z)); }
      g.add(place(dish(0.2, '#efe7da', false), 0.25, 0, 0.25));
      const powder = new THREE.ConeGeometry(0.16, 0.09, 40, 4); g.add(mesh(powder, M.std('#c8301a', { roughness: 1, bumpMap: noiseTex('powder', 80, 1.5), bumpScale: 1 }), 0.25, 0.065, 0.25));
      const lying = mesh(pepper(0.3, 0.05), red); place(lying, -0.15, 0.04, 0.3, Math.PI / 2, 0.9, 0); g.add(lying);
      return g;
    }
    case 'absinthe': {
      stemGlass(g, [[0, 0], [0.06, 0], [0.065, 0.015], [0.015, 0.03], [0.012, 0.11], [0.045, 0.13], [0.06, 0.17], [0.07, 0.26], [0.075, 0.34]], 0.12, 0.24, '#c8e0a8', -0.1, 0);
      const spoon = new THREE.Group(); const blade = new THREE.BoxGeometry(0.36, 0.004, 0.05); spoon.add(mesh(blade, M.metal('#c8c8cc', 0.25)));
      for (let k = 0; k < 5; k++) spoon.add(mesh(new THREE.BoxGeometry(0.012, 0.006, 0.03), M.std('#2a2a2a'), -0.05 + k * 0.025, 0.001, 0));
      spoon.add(mesh(new RoundedBoxGeometry(0.04, 0.035, 0.04, 2, 0.004), M.std('#fbfaf6', { roughness: 0.8, bumpMap: noiseTex('sugar', 90, 2), bumpScale: 2 }), 0, 0.02, 0));
      place(spoon, -0.1, 0.345, 0, 0, 0.4, 0); g.add(spoon);
      sprig(g, [V3(0.45, 0.02, 0.25), V3(0.3, 0.12, 0.2), V3(0.12, 0.2, 0.25)], { col: '#9aa89a', n: 10, size: 0.05, aspect: 1.6, pairs: true, stemCol: '#8a9a8a', r0: 0.005, seed: 14, kind: 'serrated' });
      return g;
    }
    case 'wine': {
      stemGlass(g, [[0, 0], [0.08, 0], [0.085, 0.01], [0.012, 0.02], [0.01, 0.16], [0.05, 0.19], [0.1, 0.27], [0.11, 0.36], [0.085, 0.46]], 0.17, 0.3, '#6a0e1e', -0.12, -0.05);
      const grape = new THREE.SphereGeometry(0.03, 20, 14); const gm = M.std('#3a1a3a', { roughness: 0.35, clearcoat: 0.6, sheen: 1, sheenColor: new THREE.Color('#8a7aa8'), sheenRoughness: 0.5 });
      const list = []; for (let k = 0; k < 26; k++) { const row = Math.floor(Math.sqrt(k * 2)), y = (6 - row) * 0.04; list.push([V3(0.3 + (r() - 0.5) * 0.05 * (7 - row), 0.03 + y * 0.6, 0.2 + (r() - 0.5) * 0.06), V3(0, 1, 0), 1]); } instances(g, grape, gm, list);
      leafAt(g, 0.3, -0.25, -0.5, '#5a7a32', 1.3, 'lobed');
      return g;
    }
    case 'marzipan': {
      const mz = M.std('#f4e2b8', { roughness: 0.7, sheen: 0.4, bumpMap: noiseTex('marz', 70, 1.2), bumpScale: 0.8 });
      const loaf = new RoundedBoxGeometry(0.42, 0.11, 0.16, 4, 0.04); g.add(place(mesh(loaf, mz), -0.15, 0.055, -0.1, 0, 0.3, 0));
      const coat = new RoundedBoxGeometry(0.22, 0.12, 0.17, 4, 0.045); g.add(place(mesh(coat, M.std('#3a2214', { roughness: 0.3, clearcoat: 0.8 })), -0.27, 0.06, -0.14, 0, 0.3, 0));
      g.add(place(dish(0.2, '#efe7da', false), 0.25, 0, 0.25));
      const ball = displace(new THREE.SphereGeometry(0.035, 20, 14), 0.004, 10, 2, 2); const pp = pile(ball, M.std('#8a5a3a', { roughness: 1, bumpMap: noiseTex('cocoa', 80, 2), bumpScale: 2 }), 11, 0.13, 3, { height: 0.25 }); pp.position.set(0.25, 0.03, 0.25); g.add(pp);
      const almond = new THREE.LatheGeometry([[0, 0], [0.02, 0.016], [0.028, 0.04], [0.024, 0.065], [0.01, 0.085], [0, 0.09]].map(([a, b]) => new THREE.Vector2(a, b)), 20); almond.scale(1, 1, 0.55);
      [[0.0, 0.3, 0.3], [0.08, 0.38, 1.2], [-0.05, 0.42, 2]].forEach(([x, z, a]) => g.add(place(mesh(almond, M.std('#b47a48', { roughness: 0.7 })), x, 0.015, z, Math.PI / 2, a, 0)));
      return g;
    }
  }
  return eighthNotes(ing);
}

// ── specimens for the notes added in v28 ─────────────────
// close botanical cousins borrow an existing build (and its family's builder) with their own colours
const LIKE = {
  citronella: ['lemongrass', 'green'], palmarosa: ['lemongrass', 'green'], grass: ['tarragon', 'green'], wheat: ['rice', 'gourmand'],
  fennel: ['caraway', 'spice'], khella: ['angelica', 'green'], shiso: ['basil', 'green'], cranberry: ['lingonberry', 'fruit'],
  tamarind: ['carob', 'gourmand'], galangal: ['ginger', 'spice'], kanuka: ['manuka', 'green'], spruce: ['siberianfir', 'wood'],
  litsea: ['pimento', 'spice'], cassie: ['mimosa', 'floral'], zdravetz: ['geranium', 'floral'], mignonette: ['heather', 'floral'],
  pittosporum: ['stephanotis', 'floral'], camellia: ['peony', 'floral'],
  cubeb: ['pepper', 'spice'], bluetansy: ['chamomile', 'floral'], marjoram: ['oregano', 'green'], hyssop: ['lavender', 'floral'], melissa: ['mint', 'green'],
  wintergreen: ['lingonberry', 'fruit'], sweetgrass: ['hay', 'green'], lovage: ['angelica', 'green'], cajeput: ['niaouli', 'green'], ravintsara: ['bay', 'spice'],
  pandan: ['kewra', 'floral'], yarrow: ['elderflower', 'floral'], plumblossom: ['cherryblossom', 'floral'], laurel: ['bay', 'spice'], camphor: ['hinoki', 'wood'],
  cassia: ['cinnamon', 'spice'], samphire: ['rosemary', 'green'],
  opoponax: ['myrrh', 'resin'], copal: ['frankincense', 'resin'], deodar: ['cedar', 'wood'], asafoetida: ['benzoin', 'resin'], wasabi: ['ginseng', 'green'],
  daphne: ['lilac', 'floral'], amaryllis: ['lily', 'floral'], rangooncreeper: ['honeysuckle', 'floral'], tobaccoflower: ['datura', 'floral'],
};
function eighthNotes(ing) {
  const id = ing.id, r = rng(hash(id)), g = new THREE.Group(), [c0, c1, c2] = ing.c;
  if (LIKE[id]) { const [like, family] = LIKE[id]; return buildSpecimen({ ...ing, id: like, family }); }
  switch (id) {
    case 'cucumber': {
      const skin = M.std('#2f5a24', { roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3, bumpMap: noiseTex('cuke', 40, 2, [1, 3]), bumpScale: 3 });
      const prof = [[0, -0.24], [0.04, -0.235], [0.065, -0.2], [0.075, -0.1], [0.078, 0.05], [0.072, 0.17], [0.05, 0.225], [0.015, 0.24], [0, 0.24]].map(([a, b]) => new THREE.Vector2(a, b));
      const body = new THREE.LatheGeometry(prof, 48); body.rotateZ(Math.PI / 2);
      g.add(place(mesh(body, skin), -0.18, 0.075, -0.08, 0, 0.35, 0.04));
      const face = seedFace('cukeface', '#2f5a24', '#cfe3a8', '#eef5d8', '#f4f1dc', 26, 3.2);
      for (const [x, z, a, tilt] of [[0.18, 0.18, 0.2, 0], [0.32, 0.02, 1.1, 0], [0.28, 0.24, 2.3, 0.35]]) {
        const sl = new THREE.Group(), cyl = new THREE.CylinderGeometry(0.07, 0.07, 0.022, 40);
        sl.add(mesh(cyl, [M.std('#2f5a24', { roughness: 0.5 }), M.std(0xffffff, { map: face, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }), M.std(0xffffff, { map: face, roughness: 0.25 })]));
        g.add(place(sl, x, 0.012 + tilt * 0.06, z, tilt, a, 0));
      }
      leafAt(g, -0.35, 0.22, 0.6, '#3f7a32', 1.1, 'lobed');
      return g;
    }
    case 'cactus': {
      const padM = M.std('#5f8f3a', { roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color('#b8d090'), bumpMap: noiseTex('nopal', 30, 1.5), bumpScale: 1.5 });
      const spineM = M.std('#f3ecd2', { roughness: 0.4 }), spine = new THREE.ConeGeometry(0.003, 0.03, 4);
      const pad = (x, y, z, rz, s) => {
        const h = new THREE.Group(); h.add(sphereFruit(0.16, padM, { sx: 0.72, sz: 0.2 }));
        const list = []; for (let k = 0; k < 26; k++) { const a = k * 2.39996, d = Math.sqrt((k + 0.5) / 26) * 0.12, px = Math.cos(a) * d * 0.72, py = Math.sin(a) * d, side = k % 2 ? 1 : -1;
          list.push([V3(px, py, side * 0.03 * Math.sqrt(Math.max(0, 1 - (d / 0.16) ** 2))), V3(px * 0.6, py * 0.6, side), 1, a]); }
        instances(h, spine, spineM, list); place(h, x, y, z, 0, 0, rz, s); g.add(h); return h;
      };
      pad(-0.05, 0.16, 0, 0, 1); pad(-0.16, 0.39, 0.01, 0.45, 0.8); pad(0.09, 0.4, -0.01, -0.35, 0.75);
      const tuna = M.std('#c2185b', { roughness: 0.45, clearcoat: 0.4 });
      for (const [x, y, z] of [[-0.24, 0.53, 0.02], [-0.15, 0.55, 0.03], [0.15, 0.54, 0.0]]) g.add(place(sphereFruit(0.032, tuna, { sy: 1.3 }), x, y, z, 0, 0, 0));
      g.add(place(dish(0.16, '#efe7da', false), 0.33, 0, 0.22));
      for (const [x, z, a] of [[0.3, 0.2, 0.3], [0.37, 0.26, 1.6]]) g.add(place(sphereFruit(0.038, M.std('#d81b60', { roughness: 0.4, clearcoat: 0.5 }), { sy: 1.35 }), x, 0.045, z, Math.PI / 2, a, 0));
      return g;
    }
    case 'tomatoleaf': {
      sprig(g, [V3(-0.42, 0.02, 0.2), V3(-0.2, 0.2, 0.05), V3(0.05, 0.36, -0.05)], { col: '#3d7a2e', n: 9, size: 0.12, aspect: 1.5, pairs: true, stemCol: '#5a8a3a', r0: 0.008, seed: 21, kind: 'serrated' });
      sprig(g, [V3(-0.1, 0.02, 0.32), V3(0.05, 0.16, 0.2), V3(0.22, 0.26, 0.1)], { col: '#467f34', n: 7, size: 0.1, aspect: 1.5, pairs: true, stemCol: '#5a8a3a', r0: 0.007, seed: 22, kind: 'serrated' });
      const tom = M.std('#d6301e', { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }), calyx = M.std('#4a7a2a', { side: THREE.DoubleSide, roughness: 0.6 });
      const vine = [V3(0.12, 0.2, -0.1), V3(0.25, 0.16, 0.0), V3(0.36, 0.1, 0.1)]; g.add(stem(vine, 0.006, '#5a8a3a'));
      [[0.2, 0.11, -0.05, 0.05], [0.3, 0.06, 0.05, 0.055], [0.4, 0.05, 0.16, 0.045], [0.33, 0.05, 0.25, 0.05]].forEach(([x, y, z, rr]) => {
        g.add(place(sphereFruit(rr, tom, { sy: 0.88 }), x, y, z)); const cx = mesh(bendPlane(rr * 0.9, rr * 0.9, { cup: 0.4 }), calyx); g.add(place(cx, x, y + rr * 0.88, z, -Math.PI / 2, 0, 0)); });
      return g;
    }
    case 'driftwood': {
      const wood = M.std('#b9b0a2', { roughness: 0.9, bumpMap: noiseTex('drift', 30, 2.4, [1, 6]), bumpScale: 5, sheen: 0.4, sheenColor: new THREE.Color('#e8e2d6') });
      g.add(mesh(tube([V3(-0.5, 0.06, 0.1), V3(-0.2, 0.08, 0.0), V3(0.1, 0.07, -0.05), V3(0.42, 0.1, -0.15)], 0.06, 40, 14, 0.5), wood));
      g.add(mesh(tube([V3(-0.1, 0.08, -0.02), V3(-0.05, 0.18, -0.12), V3(0.05, 0.3, -0.2)], 0.025, 20, 10, 0.7), wood));
      g.add(mesh(tube([V3(0.2, 0.08, -0.08), V3(0.3, 0.13, 0.05), V3(0.4, 0.15, 0.14)], 0.02, 20, 10, 0.8), wood));
      g.add(mesh(tube([V3(-0.45, 0.03, 0.3), V3(-0.2, 0.035, 0.34), V3(0.0, 0.03, 0.28)], 0.028, 24, 10, 0.4), wood));
      const peb = blob(0.04, 0.008, 3, 9, 3);
      [['#8a8f94', 0.2, 0.3, 1], ['#c8c2b6', 0.32, 0.22, 0.8], ['#5f666c', 0.12, 0.38, 0.7], ['#a8a296', 0.42, 0.33, 0.6]].forEach(([c, x, z, sc]) => { const m = mesh(peb, M.std(c, { roughness: 0.35, clearcoat: 0.5 })); m.scale.set(sc * 1.2, sc * 0.6, sc); m.position.set(x, 0.02 * sc, z); g.add(m); });
      return g;
    }
    case 'mitti': {
      const clay = M.std('#b5643a', { roughness: 0.85, bumpMap: noiseTex('clay', 50, 1.6), bumpScale: 2 });
      const pts = [[0, 0], [0.12, 0], [0.16, 0.03], [0.2, 0.1], [0.21, 0.14], [0.19, 0.145], [0.17, 0.11], [0.12, 0.03], [0, 0.03]].map(([a, b]) => new THREE.Vector2(a, b));
      const bowl = mesh(new THREE.LatheGeometry(pts, 48), clay); bowl.position.set(-0.1, 0, 0.05); g.add(bowl);
      const earth = blob(0.025, 0.008, 6, 4, 2), em = M.std('#5a3a24', { roughness: 1, bumpMap: noiseTex('soil', 90, 2), bumpScale: 3 });
      const pp = pile(earth, em, 30, 0.15, 7, { height: 0.5 }); pp.position.set(-0.1, 0.06, 0.05); g.add(pp);
      const shard = (x, z, a, s) => { const sh = new THREE.CylinderGeometry(0.07, 0.07, 0.012, 7, 1, false, 0, 2.2); g.add(place(mesh(sh, M.std('#c97a4a', { roughness: 0.9, bumpMap: noiseTex('clay', 50, 1.6), bumpScale: 2 })), x, 0.008, z, 0, a, 0, s)); };
      shard(0.25, 0.2, 0.4, 1); shard(0.33, 0.0, 2.1, 0.8); shard(0.15, 0.32, 3.6, 0.7);
      const drops = M.std('#d7e6f0', { roughness: 0.05, transmission: 0.6, clearcoat: 1 });
      [[0.3, 0.12], [0.22, 0.05], [0.38, 0.3]].forEach(([x, z]) => g.add(place(sphereFruit(0.012, drops, { sy: 0.6 }), x, 0.008, z)));
      return g;
    }
    case 'gooseberry': {
      const skin = M.std('#9cc45a', { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, transmission: 0.25, thickness: 0.3, sheen: 0.5, sheenColor: new THREE.Color('#e8f5c0'), map: canvasTex('goosevein', 256, 128, (c, W, H) => { c.fillStyle = '#a8cc62'; c.fillRect(0, 0, W, H); c.strokeStyle = '#e4f2b8'; c.lineWidth = 3; for (let k = 0; k < 12; k++) { c.beginPath(); c.moveTo(k * W / 12, 0); c.lineTo(k * W / 12, H); c.stroke(); } }) });
      g.add(place(dish(0.2, '#efe7da', false), 0.18, 0, 0.12));
      [[0.12, 0.08, 0.06], [0.22, 0.14, 0.055], [0.2, 0.02, 0.058], [0.3, 0.09, 0.05], [0.12, 0.2, 0.05]].forEach(([x, z, rr], i) => { g.add(place(sphereFruit(rr, skin, { sy: 1.1 }), x, 0.025 + rr, z, 0.3, i, 0.2)); });
      [[-0.22, -0.05, 0.065], [-0.3, 0.1, 0.06]].forEach(([x, z, rr]) => { g.add(place(sphereFruit(rr, skin, { sy: 1.1 }), x, rr, z)); g.add(stem([V3(x, rr * 2, z), V3(x - 0.04, rr * 2 + 0.06, z - 0.05), V3(x - 0.1, rr * 2 + 0.1, z - 0.12)], 0.004, '#6a5a3a')); });
      leafAt(g, -0.35, -0.2, 0.4, '#4a7a32', 1, 'lobed');
      return g;
    }
    case 'blacklime': {
      const dried = M.std('#3a2a1e', { roughness: 0.75, bumpMap: noiseTex('loomi', 40, 2.5), bumpScale: 5, sheen: 0.4, sheenColor: new THREE.Color('#8a6a4a') });
      g.add(place(dish(0.22, '#efe7da', false), -0.05, 0, 0.05));
      [[-0.1, 0.0, 0.07], [0.04, 0.08, 0.065], [-0.02, -0.08, 0.06], [0.09, -0.04, 0.062]].forEach(([x, z, rr], i) => g.add(place(sphereFruit(rr, dried, { bump: 0.006, seed: i, sy: 0.92 }), x, 0.025 + rr * 0.92, z + 0.05, 0, i, 0)));
      const half = new THREE.Group(); const dome = new THREE.SphereGeometry(0.065, 40, 20, 0, TAU, 0, Math.PI / 2); dome.rotateX(Math.PI); half.add(mesh(dome, dried));
      const cap = new THREE.CircleGeometry(0.065, 40); cap.rotateX(-Math.PI / 2); half.add(mesh(cap, M.std(0xffffff, { map: segFace('loomiface', '#2a1c12', '#6a4a2a', '#4a3020', 9), roughness: 0.6 }), 0, 0.001, 0));
      g.add(place(half, 0.32, 0.05, 0.22, 0.5, 0.3, 0));
      const lime = M.std('#5aa02a', { roughness: 0.4, clearcoat: 0.6, bumpMap: noiseTex('peel', 60, 1.4), bumpScale: 1.5 }); g.add(place(sphereFruit(0.07, lime, { sy: 0.95 }), 0.36, 0.067, -0.12));
      return g;
    }
    case 'redcurrant': {
      const berry = M.std('#d4142a', { roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, transmission: 0.35, thickness: 0.2, attenuationColor: new THREE.Color('#a00818'), attenuationDistance: 0.3 });
      const bg = new THREE.SphereGeometry(0.028, 24, 16);
      for (let s2 = 0; s2 < 3; s2++) {
        const x0 = -0.3 + s2 * 0.26, z0 = -0.05 + s2 * 0.08, pts = [V3(x0, 0.42, z0), V3(x0 + 0.05, 0.3, z0 + 0.03), V3(x0 + 0.08, 0.12, z0 + 0.06)];
        g.add(stem(pts, 0.004, '#6a7a3a')); const cv = new THREE.CatmullRomCurve3(pts);
        for (let i = 0; i < 9; i++) { const q = cv.getPointAt(0.12 + i * 0.1); g.add(mesh(bg, berry, q.x + (i % 2 ? 0.03 : -0.03), q.y - 0.02, q.z + 0.015)); }
      }
      leafAt(g, -0.4, 0.15, 0.3, '#4a7a32', 1.1, 'lobed'); leafAt(g, 0.35, 0.25, -0.8, '#4a7a32', 0.9, 'lobed');
      return g;
    }
    case 'champagne': {
      stemGlass(g, [[0, 0], [0.07, 0], [0.075, 0.01], [0.01, 0.02], [0.008, 0.2], [0.03, 0.23], [0.045, 0.32], [0.05, 0.45], [0.048, 0.5]], 0.235, 0.44, '#f2d27a', -0.12, 0.05);
      stemGlass(g, [[0, 0], [0.07, 0], [0.075, 0.01], [0.01, 0.02], [0.008, 0.2], [0.03, 0.23], [0.045, 0.32], [0.05, 0.45], [0.048, 0.5]], 0.235, 0.4, '#f2d27a', 0.08, -0.12);
      const bub = M.std('#fff8e0', { roughness: 0.05, transmission: 0.7, clearcoat: 1 }), bgeo = new THREE.SphereGeometry(0.004, 8, 6);
      for (let i = 0; i < 26; i++) g.add(mesh(bgeo, bub, -0.12 + (r() - 0.5) * 0.05, 0.25 + r() * 0.17, 0.05 + (r() - 0.5) * 0.05));
      const glassB = M.std('#1f3a24', { roughness: 0.15, clearcoat: 1 });
      const prof = [[0, 0], [0.09, 0], [0.095, 0.02], [0.095, 0.32], [0.08, 0.38], [0.04, 0.46], [0.032, 0.56], [0.034, 0.6], [0, 0.6]].map(([a, b]) => new THREE.Vector2(a, b));
      g.add(place(mesh(new THREE.LatheGeometry(prof, 48), glassB), 0.35, 0, 0.1, 0, 0, -1.35)); g.children[g.children.length - 1].position.y = 0.095;
      g.add(place(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 24), M.std('#d9b45a', { metalness: 0.6, roughness: 0.35 })), 0.35 - 0.62, 0.11, 0.1, 0, 0, -1.35));
      return g;
    }
    case 'sake': {
      const cer = M.std('#efe9dc', { roughness: 0.25, clearcoat: 0.8 }), blue = M.std('#2a4a7a', { roughness: 0.3, clearcoat: 0.8 });
      const bottle = [[0, 0], [0.08, 0], [0.11, 0.06], [0.12, 0.16], [0.09, 0.26], [0.04, 0.32], [0.03, 0.38], [0.04, 0.41], [0, 0.41]].map(([a, b]) => new THREE.Vector2(a, b));
      g.add(mesh(new THREE.LatheGeometry(bottle, 48), cer, -0.15, 0, -0.05));
      const cup = [[0, 0], [0.04, 0], [0.045, 0.01], [0.06, 0.05], [0.065, 0.055], [0.058, 0.055], [0.05, 0.02], [0, 0.02]].map(([a, b]) => new THREE.Vector2(a, b));
      for (const [x, z] of [[0.15, 0.12], [0.3, -0.05]]) { g.add(mesh(new THREE.LatheGeometry(cup, 40), cer, x, 0, z)); const ring = new THREE.TorusGeometry(0.025, 0.004, 8, 32); ring.rotateX(Math.PI / 2); g.add(mesh(ring, blue, x, 0.021, z)); const liq = new THREE.CircleGeometry(0.052, 32); liq.rotateX(-Math.PI / 2); g.add(mesh(liq, M.juice('#f4efd8'), x, 0.042, z)); }
      const grain = pile(new THREE.SphereGeometry(0.008, 8, 6).scale(1, 0.6, 1.6), M.std('#f8f5ec', { roughness: 0.6 }), 60, 0.1, 3, { height: 0.25 }); grain.position.set(0.1, 0.0, 0.32); g.add(grain);
      return g;
    }
    case 'cottoncandy': {
      const floss = M.std('#f7a8cf', { roughness: 1, sheen: 1, sheenColor: new THREE.Color('#ffe4f2'), transmission: 0.1, bumpMap: noiseTex('floss', 120, 2), bumpScale: 3 });
      const cloud = blob(0.18, 0.05, 4, 11, 4); cloud.scale(1, 1.15, 1);
      g.add(place(mesh(cloud, floss), -0.05, 0.42, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.38, 10), M.std('#f2e6d0', { roughness: 0.7 }), -0.05, 0.2, 0));
      const cloud2 = blob(0.11, 0.035, 5, 12, 4); g.add(place(mesh(cloud2, M.std('#a8d8f2', { roughness: 1, sheen: 1, sheenColor: new THREE.Color('#eaf6ff'), bumpMap: noiseTex('floss', 120, 2), bumpScale: 3 })), 0.3, 0.09, 0.15));
      return g;
    }
    case 'sunflower': {
      const head = new THREE.Group(), disc = new THREE.CylinderGeometry(0.12, 0.12, 0.03, 48); disc.rotateX(Math.PI / 2);
      head.add(mesh(disc, M.std(0xffffff, { map: seedFace('sunface', '#3a2414', '#5a3a1e', '#2a180c', '#c89a3a', 320, 2.2), roughness: 0.8 })));
      const pg = bendPlane(0.075, 0.12, { cup: 0.25 }), pm = M.petal('#f6c21c', '#ffe36a', '#d98a0a', 'long'), list = [];
      for (let k = 0; k < 30; k++) { const a = k / 30 * TAU + (k % 2) * 0.1, d = V3(Math.cos(a), Math.sin(a), 0.05); list.push([V3(Math.cos(a) * (0.12 + (k % 2) * 0.012), Math.sin(a) * (0.12 + (k % 2) * 0.012), -0.01 - (k % 2) * 0.006), d, 1, 0]); }
      instances(head, pg, pm, list);
      place(head, 0.0, 0.52, 0, -0.35, 0.2, 0); g.add(head);
      g.add(stem([V3(0.0, 0.5, -0.02), V3(0.03, 0.25, 0.0), V3(0.02, 0.02, 0.02)], 0.016, '#5a7a32'));
      leafAt(g, 0.14, 0.1, -0.9, '#4f7a2e', 1.1, 'ovate', 0.12, -0.9); leafAt(g, -0.14, 0.06, 2.4, '#4f7a2e', 1.0, 'ovate', 0.08, -1.0);
      const seeds = pile(new THREE.SphereGeometry(0.012, 8, 6).scale(0.6, 0.35, 1.3), M.std('#2a2420', { roughness: 0.5 }), 40, 0.09, 5, { height: 0.25, flat: true }); seeds.position.set(0.32, 0.0, 0.22); g.add(seeds);
      return g;
    }
    case 'marshmallow': {
      const soft = (col) => M.std(col, { roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.8, bumpMap: noiseTex('mallow', 80, 0.6), bumpScale: 0.6 });
      const puff = new RoundedBoxGeometry(0.1, 0.09, 0.1, 5, 0.035); const cyl = new THREE.CylinderGeometry(0.05, 0.05, 0.085, 32); cyl.translate(0, 0.0425, 0);
      g.add(place(dish(0.22, '#efe7da', false), 0.0, 0, 0.05));
      const spots = [[-0.08, 0.06, 0.0, 'w'], [0.06, 0.08, 0.3, 'p'], [0.0, -0.06, 1.1, 'w'], [0.12, -0.04, 2.0, 'w'], [-0.1, -0.08, 0.6, 'p'], [0.02, 0.0, 1.7, 'w']];
      spots.forEach(([x, z, a, k], i) => g.add(place(mesh(i % 2 ? puff : cyl, soft(k === 'p' ? '#f6c6d6' : '#fbf8f2')), x, 0.026 + (i === 5 ? 0.085 : 0), z + 0.05, 0, a, 0)));
      const stick = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.62, 8), M.std('#c8a070', { roughness: 0.8 })); g.add(place(stick, 0.2, 0.12, -0.2, 0, 0, 1.25));
      const toast = M.std('#b0703a', { roughness: 0.6, clearcoat: 0.4, bumpMap: noiseTex('toast', 60, 2), bumpScale: 2 });
      const tm = mesh(cyl, toast); place(tm, 0.39, 0.135, -0.2, 0, 0, 1.25 + Math.PI / 2); tm.position.x -= 0.04; g.add(tm);
      return g;
    }
  }
  return null;
}
