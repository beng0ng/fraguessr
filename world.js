// A cartographic layer drawn on top of the cobe globe: atmosphere, graticule,
// ocean / continent / country names and a starfield, all projected with the app's own projection.

// [name, lat, lng, tier]  tier 0 = ocean, 1 = continent, 2 = large country, 3 = medium, 4 = small
export const PLACES = [
  ['Pacific Ocean', 0, -150, 0], ['Pacific Ocean', 5, 165, 0], ['Atlantic Ocean', 25, -40, 0], ['Atlantic Ocean', -20, -15, 0],
  ['Indian Ocean', -20, 78, 0], ['Arctic Ocean', 82, 0, 0], ['Southern Ocean', -60, 60, 0], ['Mediterranean', 35, 18, 5], ['Caribbean Sea', 15, -73, 5], ['Arabian Sea', 14, 64, 5],
  ['Europe', 52, 18, 1], ['Africa', 4, 20, 1], ['Asia', 48, 92, 1], ['North America', 47, -103, 1], ['South America', -14, -58, 1], ['Oceania', -25, 140, 1], ['Antarctica', -82, 30, 1],
  ['Russia', 61, 96, 2], ['Canada', 58, -105, 2], ['United States', 39, -99, 2], ['Brazil', -10, -53, 2], ['China', 35, 103, 2], ['Australia', -25, 134, 2], ['India', 22, 79, 2],
  ['Argentina', -35, -65, 2], ['Kazakhstan', 48, 67, 2], ['Algeria', 28, 2, 2], ['DR Congo', -3, 23, 2], ['Saudi Arabia', 24, 45, 2], ['Mexico', 23, -102, 2], ['Indonesia', -2, 118, 2], ['Greenland', 72, -40, 2],
  ['Iran', 32, 53, 3], ['Libya', 27, 17, 3], ['Sudan', 15, 30, 3], ['Egypt', 26, 30, 3], ['Ethiopia', 9, 40, 3], ['Nigeria', 9, 8, 3], ['South Africa', -30, 24, 3], ['Madagascar', -19, 46.5, 3],
  ['Mongolia', 46, 104, 3], ['Peru', -9, -75, 3], ['Colombia', 4, -73, 3], ['Venezuela', 7, -66, 3], ['Bolivia', -17, -64, 3], ['Chile', -30, -71, 3], ['Turkey', 39, 35, 3], ['France', 46.5, 2.5, 3],
  ['Spain', 40, -3.7, 3], ['Ukraine', 49, 32, 3], ['Morocco', 31.5, -7, 3], ['Tanzania', -6.5, 35, 3], ['Kenya', 0.5, 38, 3], ['Japan', 37, 138.5, 3], ['Thailand', 15.5, 101, 3], ['Myanmar', 21, 96, 3],
  ['Pakistan', 30, 70, 3], ['Afghanistan', 34, 66, 3], ['Mali', 17, -4, 3], ['Niger', 17, 9, 3], ['Chad', 15, 19, 3], ['Angola', -12, 18, 3], ['Namibia', -22, 17, 3], ['Mozambique', -18, 35, 3],
  ['Zambia', -14, 27, 3], ['Somalia', 6, 46, 3], ['Yemen', 15.5, 47.5, 3], ['Oman', 21, 57, 3], ['Iraq', 33, 43.5, 3], ['Germany', 51, 10, 3], ['Italy', 42.8, 12.5, 3], ['United Kingdom', 54, -2, 3],
  ['Sweden', 62, 16, 3], ['Norway', 64, 12, 3], ['Finland', 64, 26, 3], ['Poland', 52, 19, 3], ['Vietnam', 16, 107, 3], ['Philippines', 12.5, 122, 3], ['Papua New Guinea', -6.5, 145, 3], ['New Zealand', -42, 173, 3],
  ['Paraguay', -23, -58, 3], ['Uzbekistan', 41.5, 64, 3], ['Kyrgyzstan', 41.4, 74.8, 3], ['Turkmenistan', 39, 59.5, 3], ['Cameroon', 5.5, 12.5, 3], ['Ghana', 7.8, -1.2, 3], ['Ivory Coast', 7.5, -5.5, 3], ['Senegal', 14.5, -14.5, 3], ['Guinea', 10.4, -10.9, 3], ['Malaysia', 4, 102, 3],
  ['Portugal', 39.6, -8, 4], ['Greece', 39.3, 22, 4], ['Bulgaria', 42.7, 25.3, 4], ['Romania', 45.9, 25, 4], ['Serbia', 44, 20.8, 4], ['Croatia', 45.3, 15.8, 4], ['Bosnia', 44.2, 17.8, 4], ['North Macedonia', 41.6, 21.7, 4],
  ['Switzerland', 46.8, 8.2, 4], ['Austria', 47.5, 14.5, 4], ['Netherlands', 52.2, 5.5, 4], ['Belgium', 50.6, 4.6, 4], ['Ireland', 53.2, -8, 4], ['Hungary', 47.1, 19.4, 4], ['Czechia', 49.8, 15.4, 4], ['Belarus', 53.5, 28, 4], ['Georgia', 42.2, 43.5, 4],
  ['Tunisia', 34, 9.5, 4], ['Israel', 31.2, 34.9, 4], ['Jordan', 31, 36.5, 4], ['Syria', 35, 38.5, 4], ['Lebanon', 33.9, 35.9, 4], ['UAE', 24, 54, 4], ['Qatar', 25.3, 51.2, 4], ['Kuwait', 29.3, 47.6, 4],
  ['Somaliland', 9.8, 45.5, 4], ['Eritrea', 15.5, 39, 4], ['Comoros', -11.8, 43.6, 4], ['Réunion', -21.1, 55.5, 4], ['Mauritius', -20.3, 57.6, 4], ['Sri Lanka', 7.8, 80.7, 4], ['Nepal', 28.3, 84, 4], ['Bangladesh', 23.8, 90.3, 4],
  ['Laos', 19.5, 102.5, 4], ['Cambodia', 12.6, 105, 4], ['South Korea', 36.4, 127.9, 4], ['North Korea', 40.2, 127.2, 4], ['Taiwan', 23.7, 121, 4], ['Singapore', 1.35, 103.8, 4],
  ['Cuba', 21.8, -79, 4], ['Haiti', 19, -72.7, 4], ['Dominican Rep.', 18.8, -70.3, 4], ['Jamaica', 18.1, -77.3, 4], ['Martinique', 14.64, -61.02, 4], ['Dominica', 15.42, -61.35, 4], ['Bahamas', 24.5, -77.6, 4], ['Tahiti', -17.65, -149.43, 4], ['Vanuatu', -16.2, 167.6, 4], ['New Caledonia', -21.3, 165.5, 4], ['Belize', 17.2, -88.7, 4], ['Guatemala', 15.6, -90.3, 4], ['El Salvador', 13.7, -88.9, 4], ['Honduras', 14.8, -86.6, 4], ['Nicaragua', 12.9, -85, 4],
  ['Costa Rica', 9.9, -84.1, 4], ['Panama', 8.5, -80.1, 4], ['Ecuador', -1.5, -78.4, 4], ['Uruguay', -32.8, -56, 4], ['Guyana', 5, -59, 4], ['Suriname', 4, -56, 4], ['Iceland', 64.9, -18.6, 4], ['Uganda', 1.3, 32.4, 4],
  ['Rwanda', -2, 29.9, 4], ['Malawi', -13.3, 34.3, 4], ['Zimbabwe', -19, 29.8, 4], ['Botswana', -22.3, 24.7, 4], ['Gabon', -0.8, 11.6, 4], ['Benin', 9.3, 2.3, 4], ['Togo', 8.6, 1, 4], ['Burkina Faso', 12.3, -1.6, 4],
  ['Tajikistan', 38.8, 71.0, 3], ['Bhutan', 27.4, 90.4, 4], ['Grenada', 12.12, -61.68, 4], ['Hawaii', 19.9, -155.6, 4], ['Lithuania', 55.3, 23.9, 4], ['Latvia', 56.9, 24.9, 4], ['Estonia', 58.7, 25.5, 4],
];

const TIER_ZOOM = [[0, 1.9], [0, 2.4], [1.25, 99], [1.75, 99], [2.6, 99], [1.5, 3.2]]; // [fade in from, fade out after]; tier 5 = seas

// each kind of place gets its own voice: water in blue serif italics, continents in wide warm capitals,
// countries in sans with a halo, fading from bold capitals for the largest to light text for the smallest
const SERIF = 'ui-serif, "Iowan Old Style", Georgia, "Times New Roman", serif';
const SANS = 'Geist, ui-sans-serif, system-ui, sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';
const spread = (s, gap) => s.split('').join(gap);
const LSTYLE = new Map();
function labelStyle(tier, dark) {
  const k = tier * 2 + (dark ? 1 : 0);
  if (!LSTYLE.has(k)) LSTYLE.set(k, makeStyle(tier, dark));
  return LSTYLE.get(k);
}
function makeStyle(tier, dark) {
  const same = (s) => s;
  switch (tier) {
    case 0: return { size: 13, font: `italic 400 13px ${SERIF}`, text: (s) => spread(s, '\u200a'), fill: dark ? '#8fb6d6' : '#45698a', alpha: 0.7, halo: 0 };
    case 5: return { size: 11.5, font: `italic 400 11.5px ${SERIF}`, text: same, fill: dark ? '#7fa7c6' : '#55799a', alpha: 0.62, halo: 0 };
    case 1: return { size: 12, font: `600 12px ${MONO}`, text: (s) => spread(s.toUpperCase(), ' '), fill: dark ? '#e9bd8f' : '#8a5530', alpha: 0.74, halo: 2.5 };
    case 2: return { size: 11, font: `650 11px ${SANS}`, text: (s) => spread(s.toUpperCase(), '\u200a'), fill: dark ? '#f1e9de' : '#2a221d', alpha: 0.9, halo: 3.2 };
    case 3: return { size: 11, font: `500 11px ${SANS}`, text: same, fill: dark ? '#d6cdc2' : '#40372f', alpha: 0.88, halo: 3 };
    default: return { size: 10, font: `400 10px ${SANS}`, text: same, fill: dark ? '#aba196' : '#675d54', alpha: 0.85, halo: 2.6 };
  }
}

export function createWorldLayer(canvas, { project, view, getSize, isDark, fit }) {
  const ctx = canvas.getContext('2d');
  let dpr = 1, stars = [];
  function resize() {
    const { W, H } = getSize(); dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    // a fixed starfield, only visible in dark mode outside the globe
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    stars = Array.from({ length: Math.round((W * H) / 2600) }, () => [r() * W, r() * H, r() * 1.1 + 0.2, r()]);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  function fade(z, [a, b]) { if (z < a - 0.25 || z > b + 0.35) return 0; return Math.min(1, (z - (a - 0.25)) / 0.25, (b + 0.35 - z) / 0.35); }

  function draw(t, { hideCountries = [], shades = null } = {}) {
    const { W, H } = getSize(); if (!W) return;
    const dark = isDark(), z = view.scale, S = view.scale * fit();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = 0.8 * S * H / 2;
    // stars (dark) twinkle slowly and drift with the spin
    if (dark) {
      const off = ((view.phi * 40) % W + W) % W;
      for (const [x, y, s, p] of stars) {
        const xx = (x + off) % W, d = Math.hypot(xx - cx, y - cy); if (d < R * 1.04) continue;
        ctx.globalAlpha = (0.25 + 0.35 * Math.sin(t / 900 + p * 40) ** 2) * Math.min(1, (d - R) / 60);
        ctx.fillStyle = '#fff'; ctx.fillRect(xx, y, s, s);
      }
      ctx.globalAlpha = 1;
    }
    // atmosphere: a thin lit rim that fades outward
    const g = ctx.createRadialGradient(cx, cy, R * 0.94, cx, cy, R * 1.16);
    const rim = dark ? '214,168,118' : '196,150,104';
    g.addColorStop(0, `rgba(${rim},0)`); g.addColorStop(0.28, `rgba(${rim},${dark ? 0.2 : 0.12})`); g.addColorStop(1, `rgba(${rim},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, Math.PI * 2); ctx.fill();

    // density shades: ellipses foreshortened toward the limb, blended so overlaps deepen
    if (shades) {
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.globalCompositeOperation = dark ? 'screen' : 'source-over';
      for (const sh of shades) {
        const p = project(sh.loc, 0); if (p.z < 0.02) continue;
        const ang = 0.05 + Math.sqrt(sh.w) * 0.016, k = Math.max(0.08, p.z / 0.8);
        const rr = ang * (0.8 * view.scale * fit() * H / 2) / 0.8;
        const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
        const [cr, cg, cb] = sh.rgb, al = (dark ? 0.07 : 0.05) * sh.a;
        g2.addColorStop(0, `rgba(${cr},${cg},${cb},${al})`); g2.addColorStop(0.45, `rgba(${cr},${cg},${cb},${al * 0.55})`); g2.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.y - cy, p.x - cx)); ctx.scale(k, 1);
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.restore();
    }

    // graticule
    const ink = dark ? '255,248,238' : '31,26,23';
    ctx.lineWidth = 1;
    const line = (pts, alpha, dash) => {
      ctx.strokeStyle = `rgba(${ink},${alpha})`; ctx.setLineDash(dash || []); ctx.beginPath();
      let pen = false;
      for (const ll of pts) { const p = project(ll, 0); if (!p.front || p.z < 0) { pen = false; continue; } pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; }
      ctx.stroke();
    };
    // a light graticule: wide spacing at full view, finer as you zoom; the tropics only once zoomed in
    const step = z > 2.5 ? 10 : z > 1.5 ? 20 : 30;
    for (let lat = -60; lat <= 60; lat += step) { const pts = []; for (let lng = -180; lng <= 180; lng += 3) pts.push([lat, lng]); line(pts, lat === 0 ? 0.09 : 0.04); }
    for (let lng = -180; lng < 180; lng += step) { const pts = []; for (let lat = -80; lat <= 80; lat += 3) pts.push([lat, lng]); line(pts, 0.04); }
    if (z > 1.5) for (const lat of [23.44, -23.44]) { const pts = []; for (let lng = -180; lng <= 180; lng += 3) pts.push([lat, lng]); line(pts, 0.07 * Math.min(1, (z - 1.5) / 0.4), [3, 5]); }
    ctx.setLineDash([]);

    // names
    const placed = [];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [name, lat, lng, tier] of PLACES) {
      const a = fade(z, TIER_ZOOM[tier]); if (a <= 0.02) continue;
      if (tier >= 2 && hideCountries.includes(name)) continue;
      const p = project([lat, lng], 0); if (!p.front || p.z < (tier <= 1 ? 0.3 : 0.15)) continue;
      const edge = Math.min(1, (p.z - (tier <= 1 ? 0.3 : 0.15)) * 3); // fade toward the limb
      const st = labelStyle(tier, dark), label = st.text(name);
      ctx.font = st.font;
      const w = ctx.measureText(label).width, hh = st.size * 0.7 + 2, box = [p.x - w / 2 - 4, p.y - hh, p.x + w / 2 + 4, p.y + hh];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      placed.push(box);
      ctx.globalAlpha = a * edge * st.alpha;
      if (st.halo) { ctx.lineWidth = st.halo; ctx.lineJoin = 'round'; ctx.strokeStyle = dark ? 'rgba(15,13,12,.86)' : 'rgba(255,253,250,.92)'; ctx.strokeText(label, p.x, p.y); }
      ctx.fillStyle = st.fill;
      ctx.fillText(label, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }
  return { resize, draw };
}
