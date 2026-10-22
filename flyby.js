// Things that pass by the globe now and then: satellites, comets and meteors against the night sky, paper planes,
// balloons and butterflies against the day one. Each is a button; catching one opens a challenge (challenge.js)
// whose difficulty follows the thing caught. They only turn up in the atlas, rarely: a small chance at the end of
// each zoom or spin, and a small chance every few seconds while the globe is left to turn on its own.
import { burst } from './motion.js';

// art is drawn facing right; `move` picks the path and how the thing turns along it
const NIGHT = [
  { id: 'satellite', name: 'Satellite', level: 'easy', w: 21, move: 'drift', secs: 15, size: [78, 52], art: `<svg viewBox="0 0 72 48"><defs><linearGradient id="fb-sp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c9ef0"/><stop offset="1" stop-color="#1f4290"/></linearGradient><linearGradient id="fb-foil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a0"/><stop offset=".5" stop-color="#dba746"/><stop offset="1" stop-color="#8d6220"/></linearGradient></defs><path d="M20 24h6M46 24h6" stroke="#b9c3d2" stroke-width="1.6"/><g stroke="#a9c3ef" stroke-width=".8"><rect x="2" y="14" width="18" height="20" rx="1.5" fill="url(#fb-sp)"/><rect x="52" y="14" width="18" height="20" rx="1.5" fill="url(#fb-sp)"/></g><path d="M8 14v20M14 14v20M2 20.7h18M2 27.3h18M58 14v20M64 14v20M52 20.7h18M52 27.3h18" stroke="#b9d2ff" stroke-opacity=".45" stroke-width=".6"/><rect x="26" y="16" width="20" height="17" rx="3" fill="url(#fb-foil)"/><path d="M30 16v17M36 16v17M42 16v17" stroke="#8d6220" stroke-opacity=".35" stroke-width=".7"/><path d="M36 16V10" stroke="#d6dce6" stroke-width="1.2"/><path d="M29 9.5a7 3 0 0 0 14 0z" fill="#eef2f7"/><circle class="fb-blink" cx="43" cy="30" r="1.7" fill="#ff5b4f"/></svg>` },
  { id: 'asteroid', name: 'Asteroid', level: 'easy', w: 21, move: 'tumble', secs: 14, size: [56, 56], art: `<svg viewBox="0 0 64 64"><defs><radialGradient id="fb-rock" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#c8b39a"/><stop offset=".55" stop-color="#806b57"/><stop offset="1" stop-color="#3a3029"/></radialGradient></defs><path d="M13 22C16 12 28 7 37 10c10 0 17 7 18 16 3 9-1 20-11 26-10 6-22 4-29-4-7-7-6-18-2-26z" fill="url(#fb-rock)" stroke="#f2dcc0" stroke-opacity=".35" stroke-width="1.2"/><g fill="#3d3128" opacity=".55"><circle cx="25" cy="24" r="5.5"/><circle cx="41" cy="37" r="7"/><circle cx="28" cy="45" r="3.2"/><circle cx="44" cy="19" r="2.4"/></g><g fill="none" stroke="#f3dfc6" stroke-opacity=".3" stroke-width="1"><path d="M20 22a5.5 5.5 0 0 1 9-3"/><path d="M35 33a7 7 0 0 1 11-2"/></g></svg>` },
  { id: 'comet', name: 'Comet', level: 'medium', w: 15, move: 'streak', secs: 9, hx: 0.88, size: [170, 46], art: `<svg viewBox="0 0 150 40"><defs><linearGradient id="fb-tail" x1="0" x2="1"><stop offset="0" stop-color="#7fd8ff" stop-opacity="0"/><stop offset=".65" stop-color="#a6e7ff" stop-opacity=".45"/><stop offset="1" stop-color="#f0fcff" stop-opacity=".95"/></linearGradient><radialGradient id="fb-coma"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#dcf7ff" stop-opacity=".95"/><stop offset="1" stop-color="#7fd8ff" stop-opacity="0"/></radialGradient></defs><path d="M132 17 4 3q-6 17 0 34l128-14z" fill="url(#fb-tail)" opacity=".7"/><path d="M132 18.5 22 12v16l110-5.5z" fill="url(#fb-tail)"/><circle cx="132" cy="20" r="15" fill="url(#fb-coma)"/><circle cx="132" cy="20" r="4.2" fill="#fff"/></svg>` },
  { id: 'rocket', name: 'Rocket', level: 'medium', w: 15, move: 'arc', secs: 9, hx: 0.62, size: [106, 46], art: `<svg viewBox="-16 0 92 40"><defs><linearGradient id="fb-hull" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#dfe4ec"/><stop offset="1" stop-color="#9aa5b5"/></linearGradient><linearGradient id="fb-fire" x1="1" x2="0"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".4" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ff4d2e" stop-opacity="0"/></linearGradient></defs><g class="fb-flame"><path d="M14 14.5C4 15-8 19-15 20c7 1 19 5 29 5.5z" fill="url(#fb-fire)"/><path d="M14 17.2c-5 .4-10 1.8-13 2.8 3 1 8 2.4 13 2.8z" fill="#fff6cf"/></g><path d="M20 13 11 3h8l11 10zM20 27l-9 10h8l11-10z" fill="#e2453c"/><path d="M14 13h38c9 0 17 4 22 7-5 3-13 7-22 7H14z" fill="url(#fb-hull)"/><path d="M62 14.4c5 1.2 9 3.3 12 5.6-3 2.3-7 4.4-12 5.6z" fill="#e2453c"/><circle cx="48" cy="20" r="4.6" fill="#59b4ff" stroke="#8d99ab" stroke-width="2"/><circle cx="46.6" cy="18.6" r="1.4" fill="#fff" opacity=".8"/><path d="M14 13v14" stroke="#8d99ab" stroke-width="2"/></svg>` },
  { id: 'meteor', name: 'Meteor', level: 'hard', w: 9, move: 'streak', secs: 5, steep: 1.6, hx: 0.9, size: [150, 30], art: `<svg viewBox="0 0 130 26"><defs><linearGradient id="fb-burn" x1="0" x2="1"><stop offset="0" stop-color="#ff7a2e" stop-opacity="0"/><stop offset=".6" stop-color="#ffab4f" stop-opacity=".6"/><stop offset="1" stop-color="#fff2d4"/></linearGradient><radialGradient id="fb-head"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ffd38a"/><stop offset="1" stop-color="#ff7a2e" stop-opacity="0"/></radialGradient></defs><path d="M117 10 2 12.4v1.2L117 16z" fill="url(#fb-burn)"/><path d="M117 11.4 40 12.6v.8l77 1.2z" fill="#fff" opacity=".7"/><circle cx="117" cy="13" r="10" fill="url(#fb-head)"/><circle cx="117" cy="13" r="3" fill="#fff"/></svg>` },
  { id: 'gold-comet', name: 'Golden comet', level: 'legendary', w: 4, move: 'streak', secs: 6, gold: true, hx: 0.88, size: [176, 47], art: `<svg viewBox="0 0 150 40"><defs><linearGradient id="fb-gtail" x1="0" x2="1"><stop offset="0" stop-color="#ffb81c" stop-opacity="0"/><stop offset=".65" stop-color="#ffd257" stop-opacity=".55"/><stop offset="1" stop-color="#fff6d6"/></linearGradient><radialGradient id="fb-gcoma"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#ffe9a3"/><stop offset="1" stop-color="#ffb81c" stop-opacity="0"/></radialGradient></defs><path d="M132 17 4 3q-6 17 0 34l128-14z" fill="url(#fb-gtail)" opacity=".75"/><path d="M132 18.5 22 12v16l110-5.5z" fill="url(#fb-gtail)"/><circle cx="132" cy="20" r="16" fill="url(#fb-gcoma)"/><circle cx="132" cy="20" r="4.5" fill="#fff"/><g fill="#fff3c4" class="fb-twinkle"><path d="m96 9 1.2 3.3L100.5 13.5l-3.3 1.2L96 18l-1.2-3.3-3.3-1.2 3.3-1.2z"/><path d="m70 26 .9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/><path d="m48 10 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></g></svg>` },
];
const DAY = [
  { id: 'plane', name: 'Paper plane', level: 'easy', w: 21, move: 'glide', secs: 14, size: [74, 46], art: `<svg viewBox="0 0 64 40"><path d="M2 17 62 7 22 24z" fill="#fff" stroke="#aab4c2" stroke-width=".8" stroke-linejoin="round"/><path d="M22 24 62 7 28 34z" fill="#e3e8ef" stroke="#aab4c2" stroke-width=".8" stroke-linejoin="round"/><path d="m22 24 6 10-2.5-8.6z" fill="#c4ccd8"/></svg>` },
  { id: 'balloon', name: 'Hot-air balloon', level: 'easy', w: 21, move: 'rise', secs: 17, hy: 0.38, size: [60, 84], art: `<svg viewBox="0 0 56 78"><defs><radialGradient id="fb-env" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#ff8a6a"/><stop offset=".6" stop-color="#e2493a"/><stop offset="1" stop-color="#a72d24"/></radialGradient></defs><path d="M28 3C12 3 4 15 4 27c0 12 10 20 16 27h16c6-7 16-15 16-27C52 15 44 3 28 3z" fill="url(#fb-env)"/><path d="M28 3c-12 6-16 32-8 51h4c-5-17-2-41 4-51zm0 0c12 6 16 32 8 51h-4c5-17 2-41-4-51z" fill="#ffe6bd" opacity=".95"/><ellipse cx="18" cy="18" rx="5" ry="8" fill="#fff" opacity=".22" transform="rotate(20 18 18)"/><path d="m21 54 3 10m11-10-3 10" stroke="#7a5a3a" stroke-width="1"/><rect x="21.5" y="63" width="13" height="10" rx="2" fill="#a8743f"/><path d="M21.5 67h13M26 63v10M30 63v10" stroke="#7d5229" stroke-width=".7"/></svg>` },
  { id: 'kite', name: 'Kite', level: 'medium', w: 15, move: 'sway', secs: 11, hy: 0.32, size: [57, 103], art: `<svg viewBox="0 0 60 108"><g class="fb-tail"><path d="M30 64c-6 8 6 14 0 22s4 12 0 20" fill="none" stroke="#6b4a2a" stroke-width="1"/><path d="m30 76-6-3 1 6zm0 0 6-3-1 6zm0 15-6-3 1 6zm0 0 6-3-1 6z" fill="#e2453c"/></g><path d="M30 4 8 28l22 0z" fill="#3fa7d6"/><path d="M30 4l22 24H30z" fill="#f6c945"/><path d="M8 28l22 36V28z" fill="#59b36a"/><path d="M52 28 30 64V28z" fill="#e2553f"/><path d="M30 4v60M8 28h44" stroke="#6b4a2a" stroke-width="1" stroke-opacity=".8"/><path d="M30 4 52 28 30 64 8 28z" fill="none" stroke="#6b4a2a" stroke-opacity=".5" stroke-width=".8"/></svg>` },
  { id: 'butterfly', name: 'Butterfly', level: 'medium', w: 15, move: 'flutter', secs: 10, size: [64, 52], art: butterfly('#f28a1e', '#ffb347', '#2a1a10') },
  { id: 'bee', name: 'Bumblebee', level: 'hard', w: 9, move: 'zigzag', secs: 6.5, size: [56, 44], art: `<svg viewBox="0 0 56 44"><defs><clipPath id="fb-bclip"><ellipse cx="26" cy="27" rx="15" ry="11"/></clipPath></defs><g class="fb-buzz"><ellipse cx="22" cy="12" rx="8" ry="5" transform="rotate(-25 22 12)" fill="#e6f6ff" fill-opacity=".8" stroke="#8fbfd6" stroke-width=".7"/><ellipse cx="31" cy="11" rx="7" ry="4.4" transform="rotate(20 31 11)" fill="#e6f6ff" fill-opacity=".7" stroke="#8fbfd6" stroke-width=".7"/></g><path d="m11 27-6 1.2 6 2z" fill="#2b2118"/><ellipse cx="26" cy="27" rx="15" ry="11" fill="#f7c531" stroke="#c99212" stroke-width="1"/><g clip-path="url(#fb-bclip)" fill="#2b2118"><rect x="17" y="10" width="4.5" height="30"/><rect x="26" y="10" width="4.5" height="30"/></g><circle cx="41" cy="25" r="7" fill="#2b2118"/><circle cx="43.5" cy="23.5" r="1.6" fill="#fff"/><path d="M42 18.5c1-3 3-5 6-6M44 19.5c2-2 4-3 7-3" fill="none" stroke="#2b2118" stroke-width="1" stroke-linecap="round"/></svg>` },
  { id: 'gold-butterfly', name: 'Golden butterfly', level: 'legendary', w: 4, move: 'flutter', secs: 6.5, gold: true, size: [68, 56], art: butterfly('#e7a41f', '#ffe68a', '#7a4a00', true) },
];
// front view, wings spread; the two halves fold toward the body to flap
function butterfly(wing, light, ink, sparkle) {
  const half = `<path d="M32 25C27 9 12 1 6 7c-6 7 1 18 26 20z" fill="url(#fb-w-${wing.slice(1)})" stroke="${ink}" stroke-width="1.6"/><path d="M32 27c-12 1-21 7-19 15 2 8 14 4 19-12z" fill="url(#fb-w-${wing.slice(1)})" stroke="${ink}" stroke-width="1.6"/><path d="M31 25C24 15 15 9 9 9m22 18c-6 3-11 7-13 12" fill="none" stroke="${ink}" stroke-width=".9" opacity=".7"/><g fill="#fff" opacity=".85"><circle cx="8" cy="10" r="1.1"/><circle cx="11" cy="6.5" r=".9"/><circle cx="6.5" cy="14" r=".8"/><circle cx="15" cy="42" r=".9"/></g>`;
  return `<svg viewBox="0 0 64 52"><defs><radialGradient id="fb-w-${wing.slice(1)}" cx=".75" cy=".55" r=".9"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${wing}"/></radialGradient></defs><g class="fb-wing l">${half}</g><g transform="matrix(-1 0 0 1 64 0)"><g class="fb-wing r">${half}</g></g><ellipse cx="32" cy="27" rx="2.1" ry="10" fill="${ink}"/><path d="M31 18c-2-5-4-8-7-9m9 9c2-5 4-8 7-9" fill="none" stroke="${ink}" stroke-width=".9" stroke-linecap="round"/>${sparkle ? '<g fill="#fff6cf" class="fb-twinkle"><path d="m54 6 .9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/><path d="m8 40 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></g>' : ''}</svg>`;
}
// how each difficulty looks and behaves: its colour (halo, sparks, label), how far past the art a tap still counts,
// and how many times it slips aside when a mouse closes in; the rarer, the a little harder to catch
const RANK = {
  easy: { col: '#3fcf7f', hit: 16, dodge: 0, label: 'Easy' },
  medium: { col: '#4ea6ff', hit: 10, dodge: 0, label: 'Medium' },
  hard: { col: '#b57bff', hit: 5, dodge: 1, label: 'Hard' },
  legendary: { col: '#ffc12e', hit: 2, dodge: 2, label: 'Legendary' },
};
const GROW = 1.45;
export const FLYERS = Object.fromEntries([...NIGHT, ...DAY].map((x) => [x.id, { ...x, sky: NIGHT.includes(x) ? 'night' : 'day' }]));

const KEY = 'noteguessr:sky';
export const skyStats = {
  get() { try { return { seen: 0, caught: 0, won: 0, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { seen: 0, caught: 0, won: 0 }; } },
  bump(k) { const s = this.get(); s[k] = (s[k] || 0) + 1; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} return s; },
};

export function createFlybys({ stage, isDark, reduce, allowed, onCatch }) {
  const layer = document.createElement('div'); layer.className = 'flybys';
  (stage.querySelector('#labels') ? stage.insertBefore(layer, stage.querySelector('#labels')) : stage.append(layer));
  const born = performance.now();
  let cur = null, quietUntil = born + 10000, lastInput = born, nextIdle = 0, wheelT = 0, downAt = null;

  // the more someone engages, the more often things pass: every zoom, spin and tap in the last five minutes adds a
  // little (up to +35%), and so does a history of catching them (up to +25%, wins counting more than catches)
  let acts = [];
  const act = () => { const now = performance.now(); acts.push(now); if (acts.length > 60) acts = acts.slice(-60); };
  const boost = () => {
    const now = performance.now(), s = skyStats.get();
    acts = acts.filter((t) => now - t < 300000);
    return 1 + Math.min(0.35, acts.length * 0.015) + Math.min(0.25, (s.caught || 0) * 0.01 + (s.won || 0) * 0.015);
  };
  addEventListener('click', (e) => { if (!e.target.closest?.('.flyby, dialog')) act(); }, { capture: true, passive: true });
  // a gesture ends: a small chance something is passing just then
  const roll = (p) => { if (Math.random() < p * boost()) spawn(); };
  stage.addEventListener('wheel', () => { lastInput = performance.now(); clearTimeout(wheelT); wheelT = setTimeout(() => { act(); roll(0.1); }, 350); }, { passive: true });
  stage.addEventListener('pointerdown', (e) => { lastInput = performance.now(); downAt = [e.clientX, e.clientY]; }, { passive: true });
  stage.addEventListener('pointermove', () => { lastInput = performance.now(); }, { passive: true });
  addEventListener('pointerup', (e) => {
    if (!downAt) return; const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
    if (moved > 24) { act(); roll(0.06); }
  }, { passive: true });
  // the harder ones slip aside when a mouse closes in (touch is quick enough as it is)
  stage.addEventListener('pointermove', (e) => {
    const me = cur; if (!me || me.caught || !me.dodges || reduce || e.pointerType !== 'mouse') return;
    const now = performance.now(); if (now < me.nextDodge) return;
    const r = stage.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const ddx = me.pos[0] - mx, ddy = me.pos[1] - my, d = Math.hypot(ddx, ddy) || 1;
    if (d > Math.min(me.w, me.h) / 2 + 46) return;
    me.dodges--; me.nextDodge = now + 700;
    const push = 70 + Math.random() * 30;
    me.ox += ddx / d * push; me.oy += ddy / d * push * 0.8;
    me.el.classList.remove('fb-dodge'); void me.el.offsetWidth; me.el.classList.add('fb-dodge');
  }, { passive: true });
  // left alone, the globe turns by itself; every few seconds there is a small chance of company
  setInterval(() => {
    const now = performance.now();
    if (now - lastInput < 9000 || now < nextIdle) return;
    nextIdle = now + 6000; roll(0.14);
  }, 1000);

  function pick(sky) {
    const list = sky === 'night' ? NIGHT : DAY;
    let x = Math.random() * list.reduce((n, f) => n + f.w, 0);
    for (const f of list) { x -= f.w; if (x < 0) return f; }
    return list[0];
  }

  function spawn(id) {
    const now = performance.now();
    if (cur || !id && now < quietUntil || document.hidden || !allowed()) return false;
    const sky = isDark() ? 'night' : 'day', f = id ? FLYERS[id] : FLYERS[pick(sky).id];
    if (!f) return false;
    const W = stage.clientWidth, H = stage.clientHeight; if (W < 200 || H < 200) return false;
    const st = skyStats.bump('seen');
    const el = document.createElement('button');
    const rk = RANK[f.level];
    el.type = 'button'; el.className = `flyby fb-${f.move} fb-${f.level}${f.gold ? ' fb-gold' : ''}`; el.dataset.sky = f.sky;
    el.setAttribute('aria-label', `${/^[aeiou]/i.test(f.name) ? 'An' : 'A'} ${f.name.toLowerCase()} is passing by. Catch it for ${f.level === 'easy' ? 'an' : 'a'} ${f.level} challenge.`);
    const w = Math.round(f.size[0] * GROW), h = Math.round(f.size[1] * GROW), hx = f.hx ?? 0.5;
    // a pulsing halo with a ping ring sits on the thing's head (the bright end of a comet, the middle of anything else)
    el.style.cssText = `width:${w}px;height:${h}px;--rk:${rk.col};--hit:${rk.hit}px;--hx:${hx * 100}%;--hy:${(f.hy ?? 0.5) * 100}%;--hs:${Math.round(Math.min(w, h) * 2)}px`;
    el.innerHTML = `<span class="fb-halo" aria-hidden="true"></span><span class="fb-art">${f.art}</span>`;
    layer.append(el);
    // the flat art shows at once; a detailed 3D model of the same thing takes its place when it has loaded
    import('./flyers3d.js').then((m) => { if (cur === me && !me.caught) me.gl = m.mountFlyer(el.querySelector('.fb-art'), f, { w, h, night: f.sky === 'night', reduce }); }).catch(() => {});
    // the first few times, a label says it can be caught; it rides along below without turning
    let tip = null;
    if (st.seen <= 3) { tip = document.createElement('span'); tip.className = 'fb-tip'; tip.innerHTML = `<i></i>Catch it`; tip.setAttribute('aria-hidden', 'true'); layer.append(tip); }
    if (tip) tip.style.setProperty('--rk', rk.col);
    const tipAt = (x, y) => { if (tip) tip.style.transform = `translate(${x}px, ${y + h / 2 + 10}px) translateX(-50%)`; };

    // the path: in from one side, out of the other, a little higher or lower; streaks fall from above
    const ltr = Math.random() < 0.5, m = Math.max(w, h) / 2 + 12;
    let x0 = ltr ? -m : W + m, x1 = ltr ? W + m : -m, y0, y1;
    if (f.move === 'streak') { y0 = H * (0.04 + Math.random() * 0.3); y1 = y0 + (W + 2 * m) * (0.18 + Math.random() * 0.2) * (f.steep || 1); }
    else if (f.move === 'rise') { y0 = H * (0.6 + Math.random() * 0.25); y1 = H * (0.08 + Math.random() * 0.2); }
    else { y0 = H * (0.12 + Math.random() * 0.6); y1 = Math.min(H * 0.85, Math.max(H * 0.1, y0 + (Math.random() - 0.5) * H * 0.4)); }
    // a phone's narrow stage gets a slower crossing, so the thing stays catchable
    const dur = f.secs * 1000 * Math.min(1.25, 0.72 + W / 2400);
    const amp = Math.min(H, 700), seed = Math.random() * 10;
    const off = {
      drift: (u) => Math.sin(u * 5 + seed) * amp * 0.012,
      tumble: (u) => Math.sin(u * 3 + seed) * amp * 0.02,
      streak: () => 0,
      arc: (u) => -Math.sin(u * Math.PI) * amp * 0.16,
      glide: (u) => Math.sin(u * Math.PI * 3 + seed) * amp * 0.06,
      rise: (u) => Math.sin(u * 7 + seed) * amp * 0.015,
      sway: (u) => Math.sin(u * Math.PI * 4 + seed) * amp * 0.04,
      flutter: (u) => Math.sin(u * Math.PI * 6 + seed) * amp * 0.05 + Math.sin(u * 23 + seed) * amp * 0.012,
      zigzag: (u) => Math.sin(u * Math.PI * 10 + seed) * amp * 0.045 + Math.sin(u * 41 + seed) * amp * 0.015,
    }[f.move];
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    const at = (u) => { const o = off(u); return [x0 + dx * u + nx * o, y0 + dy * u + ny * o]; };
    const face = ['streak', 'arc', 'glide', 'zigzag'].includes(f.move);
    const me = { el, tip, f, t0: now, dur, caught: false, raf: 0, pos: [x0, y0], w, h, dodges: rk.dodge, nextDodge: 0, ox: 0, oy: 0, cx: 0, cy: 0, spark: 0 };
    cur = me;

    if (reduce) {
      // no crossing for reduced motion: it fades in somewhere in the sky, waits a while, and fades away
      const sx = W * (0.15 + Math.random() * 0.7), sy = H * (0.15 + Math.random() * 0.45);
      el.style.left = `${sx}px`; el.style.top = `${sy}px`; tipAt(sx, sy); me.pos = [sx, sy];
      el.classList.add('fb-still');
      me.timer = setTimeout(() => end(me), 14000);
    } else {
      const step = (t) => {
        if (cur !== me || me.caught) return;
        const u = (t - me.t0) / dur;
        if (u >= 1) return end(me);
        const [px, py] = at(u), [ax, ay] = at(Math.min(1, u + 0.01)), back = !ltr;
        // a dodge pushes it aside and it eases over, then carries on along its path from there
        me.cx += (me.ox - me.cx) * 0.16; me.cy += (me.oy - me.cy) * 0.16;
        const x = px + me.cx, y = py + me.cy; me.pos = [x, y];
        let rot = 0;
        if (face) {
          rot = Math.atan2(ay - y, ax - x) * 180 / Math.PI;
          // a bee keeps its heading through the zigzag, only tilting into each swerve
          if (f.move === 'zigzag') { const base = Math.atan2(dy, dx) * 180 / Math.PI; let d = ((rot - base + 540) % 360) - 180; rot = base + Math.max(-22, Math.min(22, d)); }
        }
        else if (f.move === 'tumble') rot = (t - me.t0) * 0.04 * (ltr ? 1 : -1);
        else if (f.move === 'drift') rot = Math.sin(u * 4 + seed) * 6;
        else if (f.move === 'sway' || f.move === 'rise') rot = Math.sin(u * 9 + seed) * (f.move === 'sway' ? 12 : 4);
        const flip = face && back ? ` rotate(${rot - 180}deg) scaleX(-1)` : ` rotate(${rot}deg)`;
        // the 3D model banks into turns and sheds its trail at the speed it is going
        if (me.gl) { const dt = Math.max(1, t - (me.lt || t - 16)) / 1000, turn = me.lr == null ? 0 : (((rot - me.lr + 540) % 360) - 180) / dt; me.lr = rot; me.lt = t;
          me.turnS = (me.turnS || 0) * 0.85 + (face ? (back ? -turn : turn) : 0) * 0.15; me.gl.motion = { turn: me.turnS, speed: len / dur * 1000, dir: face ? 1 : ltr ? 1 : -1 }; }
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)${flip}`; tipAt(x, y);
        // a trail of sparks in its colour, shed from the head
        if (t - me.spark > 55 && layer.childElementCount < 40) {
          me.spark = t;
          const dl = Math.hypot(ax - px, ay - py) || 1, k = (hx - 0.5) * w, hxp = x + (face ? (ax - px) / dl * k : 0), hyp = y + (face ? (ay - py) / dl * k : 0);
          const sp = document.createElement('i'); sp.className = 'fb-spark';
          const sz = (f.gold ? 4 : 3) + Math.random() * 4;
          sp.style.cssText = `--rk:${rk.col};width:${sz}px;height:${sz}px;transform:translate(${hxp + (Math.random() - 0.5) * 10}px, ${hyp + (Math.random() - 0.5) * 10}px)`;
          layer.append(sp); setTimeout(() => sp.remove(), 950);
        }
        me.raf = requestAnimationFrame(step);
      };
      me.raf = requestAnimationFrame(step);
    }
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (me.caught) return;
      me.caught = true; cancelAnimationFrame(me.raf); clearTimeout(me.timer);
      skyStats.bump('caught'); tip?.remove();
      burst(el.querySelector('.fb-halo') || el, rk.col, { n: f.gold ? 26 : 16, spread: f.gold ? 90 : 64, stars: f.gold ? 9 : 5 });
      el.classList.add('fb-caught');
      setTimeout(() => end(me, true), 520);
      onCatch(f, el);
    });
    return true;
  }

  function end(me, caught) {
    if (cur !== me) return;
    cancelAnimationFrame(me.raf); clearTimeout(me.timer);
    me.tip?.remove(); cur = null; quietUntil = performance.now() + (caught ? 60000 : 30000);
    if (caught || reduce) { me.el.classList.add('fb-gone'); setTimeout(() => { me.gl?.stop(); me.el.remove(); }, 600); } else { me.gl?.stop(); me.el.remove(); }
  }
  // the daily game, a sheet or the opening page takes over: whatever is passing leaves at once
  function clear() { if (cur && !cur.caught) end(cur); }

  // the 3D models load in the background once the page has settled, so the first one shows in full straight away
  setTimeout(() => (window.requestIdleCallback || setTimeout)(() => import('./flyers3d.js').catch(() => {})), 6000);
  // ?flyby=<id> sends one by as soon as the atlas is showing (used to check each one)
  const want = new URLSearchParams(location.search).get('flyby');
  if (want && FLYERS[want]) { const t = setInterval(() => { if (spawn(want)) clearInterval(t); }, 500); }
  return { spawn, clear, boost, get current() { return cur; } };
}
