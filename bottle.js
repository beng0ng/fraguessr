// Glass bottle and essential-oil vial models rendered with three.js.
// One renderer is reused for every detail view so only one extra WebGL context exists.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Bottle silhouettes: profiles for LatheGeometry as [radius, y] pairs, or a box.
const LATHE = {
  round: [[0, 0], [0.55, 0.02], [0.78, 0.25], [0.82, 0.55], [0.7, 0.88], [0.32, 1.02], [0.2, 1.06]],
  flask: [[0, 0], [0.5, 0.01], [0.62, 0.15], [0.62, 0.95], [0.5, 1.12], [0.22, 1.2], [0.2, 1.26]],
  bell:  [[0, 0], [0.75, 0.01], [0.8, 0.12], [0.62, 0.6], [0.4, 0.95], [0.22, 1.08], [0.2, 1.12]],
  tall:  [[0, 0], [0.42, 0.01], [0.46, 0.08], [0.46, 1.35], [0.3, 1.45], [0.18, 1.5]],
  vial:  [[0, 0], [0.3, 0.01], [0.34, 0.06], [0.34, 0.9], [0.24, 1.0], [0.14, 1.04], [0.14, 1.1]],
};
const SHAPES = ['box', 'slab', 'round', 'flask', 'bell', 'tall', 'cube'];
const HOUSE_SHAPE = { 'Chanel': 'box', 'Dior': 'round', 'Guerlain': 'bell', 'Hermès': 'cube', 'Tom Ford': 'slab', 'Creed': 'flask', 'Le Labo': 'flask', 'Byredo': 'tall', 'Jo Malone London': 'cube', 'Diptyque': 'tall', 'Maison Francis Kurkdjian': 'slab', 'Giorgio Armani': 'round', 'Prada': 'tall', 'Mugler': 'bell' };

function latheGeom(profile, scaleXZ = 1, inset = 0, cut = 1) {
  const prof = [];
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    if (y <= cut + 1e-6) { prof.push([r, y]); continue; }
    const [r0, y0] = profile[i - 1];
    prof.push([r0 + (r - r0) * ((cut - y0) / (y - y0)), cut]); break;
  }
  prof.push([0, prof[prof.length - 1][1]]); // close the top so the liquid reads as a solid volume
  const pts = prof.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r * scaleXZ - inset), y + (y === 0 ? inset : 0)));
  return new THREE.LatheGeometry(pts, 64);
}

function labelTexture(title, sub, tint) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(250,250,248,0.94)'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = tint; g.lineWidth = 6; g.strokeRect(14, 14, 484, 228);
  g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 64; g.font = `600 ${size}px Geist, ui-sans-serif, system-ui, sans-serif`;
  while (g.measureText(title).width > 440 && size > 26) { size -= 4; g.font = `600 ${size}px Geist, ui-sans-serif, system-ui, sans-serif`; }
  g.fillText(title, 256, 112);
  g.font = '500 26px "Geist Mono", ui-monospace, monospace'; g.fillStyle = '#555';
  g.fillText(sub.toUpperCase(), 256, 182);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createBottleStage() {
  const canvas = document.createElement('canvas');
  canvas.className = 'bottle-canvas';
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.9, 5.2);
  camera.lookAt(0, 0.62, 0);
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 4, 3); scene.add(key);

  // soft contact shadow
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg = sc.getContext('2d'), grd = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = grd; sg.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.005; scene.add(shadow);

  const group = new THREE.Group(); scene.add(group);
  let host = null, raf = 0, rotY = 0.5, velY = 0.25, dragging = false, lastX = 0, visible = true;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clear() {
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    group.clear();
  }

  function build({ shape, liquid, glassTint, cap, capColor, title, sub, fill = 0.72, oil = false }) {
    clear();
    const glass = new THREE.MeshPhysicalMaterial({ color: glassTint || 0xffffff, metalness: 0, roughness: 0.04, transmission: 1, thickness: 0.6, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3, transparent: true, side: THREE.DoubleSide });
    const juice = new THREE.MeshPhysicalMaterial({ color: liquid, roughness: 0.08, transmission: oil ? 0.2 : 0.7, thickness: 1.2, ior: 1.4, attenuationColor: liquid, attenuationDistance: oil ? 0.2 : 0.6, transparent: true, clearcoat: oil ? 1 : 0 });
    let topY, neckR, labelW = 0.9, labelH = 0.45, labelZ, labelY;
    if (shape === 'box' || shape === 'slab' || shape === 'cube') {
      const [w, h, d] = shape === 'box' ? [1.15, 1.1, 0.5] : shape === 'slab' ? [1.0, 1.25, 0.42] : [0.95, 0.95, 0.95];
      const outer = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.06), glass); outer.position.y = h / 2;
      const ih = (h - 0.16) * fill;
      const inner = new THREE.Mesh(new RoundedBoxGeometry(w - 0.14, ih, d - 0.14, 3, 0.04), juice); inner.position.y = 0.08 + ih / 2;
      group.add(inner, outer);
      topY = h; neckR = 0.16; labelW = Math.min(0.78, w * 0.7); labelZ = d / 2 + 0.002; labelY = h * 0.48;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(labelW, labelW / 2), new THREE.MeshPhysicalMaterial({ map: labelTexture(title, sub, '#' + new THREE.Color(liquid).getHexString()), roughness: 0.5, transparent: true }));
      label.position.set(0, labelY, labelZ); group.add(label);
    } else {
      const prof = LATHE[shape] || LATHE.round;
      const outer = new THREE.Mesh(latheGeom(prof, 1, 0, 99), glass);
      const maxY = prof[prof.length - 1][1];
      const inner = new THREE.Mesh(latheGeom(prof, 0.9, 0.03, maxY * fill * 0.86), juice);
      inner.position.y = 0.03;
      // close the liquid surface
      group.add(inner, outer);
      topY = maxY; neckR = prof[prof.length - 1][0];
      const maxR = Math.max(...prof.map(([r]) => r));
      labelW = maxR * 1.2; labelH = labelW / 2;
      const arc = Math.min(1.6, labelW / maxR);
      const midR = prof.reduce((best, [r, y]) => (y > maxY * 0.2 && y < maxY * 0.7 && r > best[0] ? [r, y] : best), [0, 0]);
      const lg = new THREE.CylinderGeometry(midR[0] + 0.004, midR[0] + 0.004, labelH, 48, 1, true, -arc / 2, arc);
      const label = new THREE.Mesh(lg, new THREE.MeshPhysicalMaterial({ map: labelTexture(title, sub, '#' + new THREE.Color(liquid).getHexString()), roughness: 0.5, transparent: true, side: THREE.FrontSide }));
      label.position.y = Math.max(labelH / 2 + 0.06, midR[1]); group.add(label);
    }
    // neck + cap
    const metal = new THREE.MeshPhysicalMaterial({ color: capColor, metalness: cap === 'wood' ? 0 : 1, roughness: cap === 'wood' ? 0.6 : 0.22, clearcoat: cap === 'black' ? 1 : 0.3 });
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(neckR * 1.05, neckR * 1.05, 0.06, 32), metal); collar.position.y = topY + 0.03; group.add(collar);
    let capMesh;
    if (cap === 'ball') capMesh = new THREE.Mesh(new THREE.SphereGeometry(neckR * 1.9, 48, 32), metal), capMesh.position.y = topY + 0.06 + neckR * 1.7;
    else if (cap === 'cube') capMesh = new THREE.Mesh(new RoundedBoxGeometry(neckR * 3.2, neckR * 2.6, neckR * 3.2, 3, 0.03), metal), capMesh.position.y = topY + 0.06 + neckR * 1.3;
    else if (cap === 'wood') capMesh = new THREE.Mesh(new THREE.CylinderGeometry(neckR * 1.6, neckR * 1.6, 0.42, 48), metal), capMesh.position.y = topY + 0.27;
    else if (cap === 'dropper') { capMesh = new THREE.Group(); const bulb = new THREE.Mesh(new THREE.CapsuleGeometry(neckR * 0.7, 0.18, 8, 24), new THREE.MeshPhysicalMaterial({ color: 0x1b1b1b, roughness: 0.6 })); bulb.position.y = 0.3; const ring = new THREE.Mesh(new THREE.CylinderGeometry(neckR * 1.2, neckR * 1.2, 0.16, 32), metal); ring.position.y = 0.08; capMesh.add(bulb, ring); capMesh.position.y = topY; }
    else capMesh = new THREE.Mesh(new THREE.CylinderGeometry(neckR * 1.5, neckR * 1.5, 0.34, 48), metal), capMesh.position.y = topY + 0.23;
    group.add(capMesh);
    // frame vertically
    const box = new THREE.Box3().setFromObject(group), size = box.getSize(new THREE.Vector3());
    const s = 1.5 / Math.max(size.y, size.x * 0.9);
    group.scale.setScalar(s);
    shadow.scale.set(size.x * s * 0.9, 1, 1);
    camera.lookAt(0, size.y * s * 0.45, 0);
    camera.position.y = size.y * s * 0.55;
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!visible || !host) return;
    if (!dragging) { velY += (0.35 - velY) * 0.02; rotY += velY * (reduce ? 0 : 1) / 60; }
    group.rotation.y = rotY;
    group.position.y = reduce ? 0 : Math.sin(performance.now() / 1400) * 0.02;
    renderer.render(scene, camera);
  }

  function resize() {
    if (!host) return;
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);

  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; rotY += dx * 0.01; velY = dx * 0.6; });
  const up = () => { dragging = false; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  return {
    mount(el) {
      host = el; el.appendChild(canvas); ro.disconnect(); ro.observe(el); resize();
      if (!raf) loop();
    },
    showFragrance(f, liquidHex) {
      const h = hash(f.id);
      const shape = HOUSE_SHAPE[f.house] || SHAPES[h % SHAPES.length];
      const caps = ['cyl', 'ball', 'cube', 'wood', 'cyl'];
      const cap = f.house === 'Chanel' ? 'cube' : f.house === 'Guerlain' ? 'ball' : f.house === 'Le Labo' ? 'cyl' : caps[(h >> 3) % caps.length];
      const capColors = [0xd4af37, 0xc0c0c0, 0x1a1a1a, 0xb87333, 0xe8e2d6];
      const capColor = cap === 'wood' ? 0x8b6b4a : capColors[(h >> 5) % capColors.length];
      build({ shape, liquid: liquidHex, cap, capColor, title: f.name, sub: f.house, fill: 0.7 + ((h >> 7) % 20) / 100 });
      rotY = 0.6; velY = 2.2;
    },
    showIngredient(ing) {
      build({ shape: 'vial', liquid: ing.c[0] === '#ffffff' || ing.c[0] === '#fffbe8' || ing.c[0] === '#fdfcf7' || ing.c[0] === '#f5f5f5' || ing.c[0] === '#eceff1' || ing.c[0] === '#f3e5f5' || ing.c[0] === '#f5e6c4' ? '#f0d68a' : ing.c[0], glassTint: 0xffffff, oil: true, cap: 'dropper', capColor: 0xc8a86b, title: ing.name, sub: ing.country, fill: 0.62 });
      rotY = 0.6; velY = 2.2;
    },
    setVisible(v) { visible = v; },
  };
}
