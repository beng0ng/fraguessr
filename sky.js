// The sky behind the globe: a starfield with a faint Milky Way at night (dark theme), soft drifting clouds and a
// sunlit haze by day (light theme). The still parts are painted once per size and theme onto an offscreen canvas,
// one stage wide so it can wrap as the globe turns; only the bright stars, clouds and the odd shooting star move.
export function createSky(canvas, { view, getSize, isDark, getDpr }) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, dpr = 1, theme = null, back = null, bright = [], clouds = [], meteor = null, nextMeteor = 0;
  let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const TINTS = ['255,255,255', '255,240,222', '214,226,255', '255,222,190', '235,240,255'];

  function resize() {
    const s = getSize(); W = s.W; H = s.H; dpr = Math.min(getDpr(), 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    theme = null;
  }

  // night: thousands of faint points, denser and hazier along a band that wraps around the stage
  function paintNight() {
    seed = 11;
    const c = back.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const band = (x) => H * (0.42 + 0.2 * Math.sin((x / W) * Math.PI * 2 + 0.6));
    c.globalCompositeOperation = 'lighter';
    for (let k = -1; k <= 1; k++) for (let x = -60; x < W + 60; x += 26) {
      const y = band(x), g = c.createRadialGradient(x + k * W, y, 0, x + k * W, y, H * 0.16);
      g.addColorStop(0, 'rgba(170,150,215,0.05)'); g.addColorStop(0.5, 'rgba(214,168,118,0.025)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x + k * W - H * 0.16, y - H * 0.16, H * 0.32, H * 0.32);
    }
    const n = Math.round((W * H) / 520);
    for (let i = 0; i < n; i++) {
      const inBand = r() < 0.45, x = r() * W;
      const y = inBand ? band(x) + (r() + r() + r() - 1.5) * H * 0.13 : r() * H;
      const s = inBand ? 0.2 + r() * 0.45 : 0.25 + r() ** 3 * 0.9, a = inBand ? 0.12 + r() * 0.35 : 0.18 + r() * 0.5;
      c.fillStyle = `rgba(${TINTS[(r() * TINTS.length) | 0]},${a.toFixed(2)})`;
      for (const xx of x < 3 ? [x, x + W] : x > W - 3 ? [x, x - W] : [x]) { c.beginPath(); c.arc(xx, y, s, 0, Math.PI * 2); c.fill(); }
    }
    c.globalCompositeOperation = 'source-over';
    bright = Array.from({ length: Math.max(14, Math.round((W * H) / 16000)) }, (_, i) => ({
      x: r() * W, y: r() * H, s: 0.7 + r() ** 2 * 1.3, p: r() * 40, tint: TINTS[(r() * 4) | 0], spike: i < 5,
    }));
  }

  // day: sky blue that settles into the warm paper colour, a sunlit corner, and clouds built from soft puffs
  function paintDay() {
    seed = 23;
    const c = back.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(140,184,228,0.4)'); g.addColorStop(0.5, 'rgba(176,206,234,0.14)'); g.addColorStop(1, 'rgba(240,204,166,0.16)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const sun = c.createRadialGradient(W * 0.1, -H * 0.04, 0, W * 0.1, -H * 0.04, Math.max(W, H) * 0.55);
    sun.addColorStop(0, 'rgba(255,236,196,0.42)'); sun.addColorStop(0.4, 'rgba(255,236,196,0.12)'); sun.addColorStop(1, 'rgba(255,236,196,0)');
    c.fillStyle = sun; c.fillRect(0, 0, W, H);
    clouds = Array.from({ length: Math.max(6, Math.round(W / 130)) }, (_, i) => {
      const depth = 0.35 + r() * 0.65, w = (110 + r() * 170) * (0.6 + depth * 0.6), h = w * (0.3 + r() * 0.12);
      return { x: r() * (W + w), y: (i % 3 ? 0.05 + r() * 0.28 : 0.64 + r() * 0.26) * H, depth, sprite: cloudSprite(w, h), w, h };
    }).sort((a, b) => a.depth - b.depth);
  }
  function cloudSprite(w, h) {
    const cv = document.createElement('canvas'), pad = h * 0.6, k = Math.min(dpr, 1.5);
    cv.width = Math.ceil((w + pad * 2) * k); cv.height = Math.ceil((h + pad * 2) * k);
    const c = cv.getContext('2d'); c.scale(k, k);
    // cumulus: puffs rising from a flat base, biggest in the middle
    const puffs = Array.from({ length: 14 + ((r() * 9) | 0) }, () => {
      const t = r(), px = pad + w * (0.08 + t * 0.84), hump = Math.sin(t * Math.PI), pr = h * (0.22 + hump * 0.4) * (0.75 + r() * 0.45);
      return [px, pad + h - pr * (0.55 + r() * 0.5), pr];
    });
    // a warm shade underneath, then the lit body, then a brighter crown
    for (const [layer, dy, col, a] of [[0, h * 0.14, '150,160,185', 0.14], [1, 0, '255,255,255', 0.85], [2, -h * 0.08, '255,253,248', 0.6]]) {
      for (const [px, py, pr] of puffs) {
        const rr = layer === 2 ? pr * 0.7 : pr, g = c.createRadialGradient(px, py + dy, 0, px, py + dy, rr);
        g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.55, `rgba(${col},${a * 0.6})`); g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g; c.fillRect(px - rr, py + dy - rr, rr * 2, rr * 2);
      }
    }
    return { cv, pad };
  }

  function glowSprite() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.7)'); g.addColorStop(0.35, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64); return cv;
  }
  const GLOW = glowSprite();

  function draw(t) {
    if (!W) return;
    const dark = isDark();
    if (theme !== dark) {
      theme = dark;
      back = back || document.createElement('canvas'); back.width = canvas.width; back.height = canvas.height;
      back.getContext('2d').clearRect(0, 0, back.width, back.height);
      dark ? paintNight() : paintDay();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    // the far layer turns slowest; theta lifts it a little so dragging up and down has depth too
    const turn = reduce ? 0 : view.phi, lift = reduce ? 0 : view.theta;
    const off = (((turn * 26) % W) + W) % W, dy = lift * 14;
    if (dark) {
      ctx.drawImage(back, Math.round(off * dpr), Math.round(dy * dpr)); ctx.drawImage(back, Math.round((off - W) * dpr), Math.round(dy * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const off2 = (((turn * 40) % W) + W) % W;
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bright) {
        const x = (b.x + off2) % W, y = b.y + dy * 1.4, tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t / 1100 + b.p) ** 2, R = b.s * 7;
        ctx.globalAlpha = 0.55 * tw; ctx.drawImage(GLOW, x - R, y - R, R * 2, R * 2);
        ctx.globalAlpha = 0.9 * tw; ctx.fillStyle = `rgb(${b.tint})`; ctx.beginPath(); ctx.arc(x, y, b.s * 0.75, 0, Math.PI * 2); ctx.fill();
        if (b.spike) {
          const L = b.s * 9 * tw; ctx.globalAlpha = 0.35 * tw; ctx.strokeStyle = `rgb(${b.tint})`; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
        }
      }
      // now and then a shooting star
      if (!reduce) {
        if (!meteor && t > nextMeteor) {
          if (nextMeteor) { const a = 0.35 + Math.random() * 0.5; meteor = { x: Math.random() * W, y: Math.random() * H * 0.5, a, len: 120 + Math.random() * 120, t0: t }; }
          nextMeteor = t + 9000 + Math.random() * 14000;
        }
        if (meteor) {
          const k = (t - meteor.t0) / 900; if (k > 1) meteor = null;
          else {
            const d = k * 260, hx = meteor.x + Math.cos(meteor.a) * d, hy = meteor.y + Math.sin(meteor.a) * d;
            const tx = hx - Math.cos(meteor.a) * meteor.len * Math.min(1, k * 3), ty = hy - Math.sin(meteor.a) * meteor.len * Math.min(1, k * 3);
            const g = ctx.createLinearGradient(tx, ty, hx, hy); g.addColorStop(0, 'rgba(255,240,220,0)'); g.addColorStop(1, 'rgba(255,244,230,0.85)');
            ctx.globalAlpha = Math.sin(k * Math.PI); ctx.strokeStyle = g; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.drawImage(back, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // clouds drift on their own and slide with the turn, nearer ones faster
      for (const c of clouds) {
        const span = W + c.w + c.sprite.pad * 2, sx = reduce ? c.x : c.x + t * 0.004 * c.depth + turn * 34 * c.depth;
        const x = (((sx % span) + span) % span) - c.w - c.sprite.pad, y = c.y + dy * c.depth - c.h / 2 - c.sprite.pad;
        ctx.globalAlpha = 0.6 + c.depth * 0.4;
        ctx.drawImage(c.sprite.cv, x, y, c.w + c.sprite.pad * 2, c.h + c.sprite.pad * 2);
      }
      ctx.globalAlpha = 1;
    }
  }
  return { resize, draw };
}
