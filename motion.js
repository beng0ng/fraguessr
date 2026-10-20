// Shared panel motion: staggered entrances, letter-by-letter titles, count-ups and small particle effects
// drawn in a fixed layer above the page. Everything steps aside when the viewer asks for reduced motion.
export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// a heading whose letters rise in one after another; screen readers still read the whole name
export function letters(el, { step = 22, delay = 0 } = {}) {
  if (!el || calm() || el.dataset.split) return;
  const text = el.textContent; el.dataset.split = '1'; el.setAttribute('aria-label', text);
  let i = 0;
  el.innerHTML = text.split(/(\s+)/).map((w) => (/^\s+$/.test(w) || !w ? w
    : `<span class="mv-w" aria-hidden="true">${[...w].map((ch) => `<span class="mv-ch" style="--d:${delay + i++ * step}ms">${esc(ch)}</span>`).join('')}</span>`)).join('');
}

// give each element a delay and an entrance class: mv-in (fade up), mv-pop (spring scale), mv-deal (flip in like a card)
export function cascade(els, { cls = 'mv-in', step = 40, delay = 0, max = 24 } = {}) {
  if (calm()) return;
  [...els].forEach((el, k) => {
    el.style.setProperty('--d', `${delay + Math.min(k, max) * step}ms`); el.classList.add(cls);
    // drop the class once it has played, so finished entrances don't linger as composited layers
    const end = (e) => { if (e.target !== el) return; el.classList.remove(cls); el.removeEventListener('animationend', end); };
    el.addEventListener('animationend', end);
  });
}

// count a number up from zero, keeping its thousands separators
export function countUp(el, { ms = 1100, delay = 0 } = {}) {
  if (!el || calm()) return;
  const txt = el.textContent, to = parseFloat(txt.replace(/,/g, '')); if (!isFinite(to) || to === 0) return;
  const fmt = (v) => Math.round(v).toLocaleString('en-US'), t0 = performance.now() + delay;
  el.textContent = fmt(0);
  const tick = (now) => {
    const p = Math.min(1, Math.max(0, (now - t0) / ms));
    el.textContent = p < 1 ? fmt(to * (1 - Math.pow(1 - p, 4))) : txt;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// replay a one-shot class on an element
export function replay(el, cls) { if (!el || calm()) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

// type a line out a few letters at a time
export function typeOut(el, { ms = 700, delay = 0 } = {}) {
  if (!el || calm()) return;
  const full = el.textContent, t0 = performance.now() + delay;
  el.textContent = ''; el.setAttribute('aria-label', full);
  const tick = (now) => { const p = Math.min(1, Math.max(0, (now - t0) / ms)); el.textContent = full.slice(0, Math.round(full.length * p)); if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

let layer = null;
const fxLayer = () => { if (!layer || !layer.isConnected) { layer = document.createElement('div'); layer.className = 'mv-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); } return layer; };
const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r]; };
const visible = (el) => { if (!el?.isConnected) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
function spawn(cls, x, y, css = '') { const d = document.createElement('i'); d.className = cls; d.style.cssText = `left:${x}px;top:${y}px;${css}`; fxLayer().appendChild(d); return d; }
const done = (a, d) => { a.onfinish = () => d.remove(); a.oncancel = () => d.remove(); };

// sparks and four-point stars thrown out from an element
export function burst(el, color, { n = 16, spread = 54, size = 6, stars = 5 } = {}) {
  if (calm() || !visible(el)) return;
  const [cx, cy] = centre(el);
  for (let k = 0; k < n; k++) {
    const star = k < stars, s = (star ? size * 2.2 : size) * (0.55 + Math.random() * 0.8), a = (k / n) * Math.PI * 2 + Math.random() * 0.6, dist = spread * (0.55 + Math.random() * 0.75);
    const d = spawn(star ? 'mv-star' : 'mv-dot', cx, cy, `width:${s}px;height:${s}px;background:${color}`);
    done(d.animate([
      { transform: 'translate(-50%,-50%) scale(.2) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * dist * 0.75}px), calc(-50% + ${Math.sin(a) * dist * 0.75}px)) scale(1) rotate(${star ? 90 : 0}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist + 10}px)) scale(.3) rotate(${star ? 180 : 0}deg)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.3,1)' }), d);
  }
}

// a ring that swells out from an element and fades
export function ring(el, color, { size = 90, ms = 900, delay = 0 } = {}) {
  if (calm() || !visible(el)) return;
  const [cx, cy, r] = centre(el), s = Math.max(r.width, r.height);
  const d = spawn('mv-ring', cx, cy, `width:${s}px;height:${s}px;border-color:${color}`);
  done(d.animate([{ transform: 'translate(-50%,-50%) scale(.6)', opacity: 0.9 }, { transform: `translate(-50%,-50%) scale(${size / s + 1})`, opacity: 0 }], { duration: ms, delay, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }), d);
}

// soft coloured puffs rising off an element, like scent leaving a bottle
export function mist(el, color, { n = 9, rise = 120, size = 34, at = 0.35 } = {}) {
  if (calm() || !visible(el)) return;
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * at;
  for (let k = 0; k < n; k++) {
    const s = size * (0.5 + Math.random() * 0.9), dx = (Math.random() - 0.5) * r.width * 0.5, sway = (Math.random() - 0.5) * 60;
    const d = spawn('mv-puff', cx + dx * 0.3, cy, `width:${s}px;height:${s}px;background:${color}`);
    done(d.animate([
      { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% - ${rise * 0.35}px)) scale(1)`, opacity: 0.55, offset: 0.3 },
      { transform: `translate(calc(-50% + ${dx + sway}px), calc(-50% - ${rise}px)) scale(1.8)`, opacity: 0 },
    ], { duration: 1500 + Math.random() * 900, delay: k * 70, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' }), d);
  }
}

// a droplet that arcs from one element to another; resolves when it lands
export function flyDrop(from, to, color, { ms = 520, lift = 80 } = {}) {
  if (calm() || !visible(from) || !visible(to)) return Promise.resolve();
  const [x0, y0] = centre(from), [x1, y1] = centre(to);
  const d = spawn('mv-drop', 0, 0, `background:${color}`), frames = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * lift;
    const dx = (x1 - x0) / 16, dy = (y1 - y0) / 16 - Math.cos(Math.PI * t) * lift * Math.PI / 16;
    frames.push({ transform: `translate(${x}px, ${y}px) translate(-50%,-50%) rotate(${Math.atan2(dy, dx) * 180 / Math.PI + 45}deg) scale(${0.6 + Math.sin(Math.PI * t) * 0.6})`, opacity: k === 16 ? 0.4 : 1 });
  }
  const a = d.animate(frames, { duration: ms, easing: 'cubic-bezier(.45,0,.25,1)' }); done(a, d);
  return a.finished.catch(() => {});
}
