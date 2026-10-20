// Fraguessr: a GeoGuessr-style game on the atlas globe. You're shown an ingredient (or a perfume and one
// of its notes) and drop a pin where you think it is grown. Five rounds, up to 5,000 points each.
import { INGREDIENTS, FRAGRANCES, FAMILIES, HOUSES, ALIASES, noteId } from './data.js';
import { RARITY } from './rarity.js';
import * as Stats from './stats.js';
import { letters, cascade, countUp as countTo, replay, typeOut, burst, ring, mist, flyDrop } from './motion.js';

const ROUNDS = 5, MAX = 5000, TIME = 60, SPEED = 500;
const MODES = {
  notes: { label: 'Notes', blurb: 'See an ingredient, find where it grows.', icon: '<path d="M12 3c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0C7 9.5 9 7 12 3z"/>' },
  perfumes: { label: 'Perfumes', blurb: 'A famous perfume and one of its notes. Where does that note come from?', icon: '<rect x="7" y="9" width="10" height="12" rx="2"/><path d="M10 9V6h4v3M9 3h6"/>' },
  blind: { label: 'Blind nose', blurb: 'No name. Just the material, its clues and your instinct.', icon: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><path d="M4 4l16 16"/>' },
};
const CLUE_COST = 0.15;

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const today = () => new Date().toISOString().slice(0, 10);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('noteguessr:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('noteguessr:' + k, JSON.stringify(v)); } catch {} },
};
// distance points: a full 5,000 within 50 km, then a smooth falloff (about 3,100 at 1,000 km, 1,200 at 3,000 km)
export const scoreFor = (km) => (km == null ? 0 : km <= 50 ? MAX : Math.round(MAX * Math.exp(-(km - 50) / 2000)));
// the whole round: distance points, minus 15% of them per paid hint, plus a speed bonus on the clock
// (only for guesses that were at least in the right part of the world, so a fast random tap earns nothing extra)
function scoreRound({ km, clues, free, timed, left, time }) {
  const distance = scoreFor(km), paid = Math.max(0, clues - free);
  const hints = Math.round(distance * CLUE_COST * paid);
  const speed = timed && km != null && distance >= 1000 ? Math.round(SPEED * Math.max(0, left) / time) : 0;
  return { distance, paid, hints, speed, points: distance - hints + speed };
}
const TIERS = [[50, 'Bullseye', '#4f8f63'], [300, 'Right on the doorstep', '#4f8f63'], [1000, 'Very close', '#46a758'], [2500, 'Right region', '#e2a336'], [5000, 'Same side of the world', '#f76b15'], [Infinity, 'A long way off', '#c4513f']];
const tierOf = (km) => (km == null ? ['', 'Out of time', '#c4513f'] : TIERS.find(([d]) => km < d));
const kmText = (km) => (km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`);

const REGION = {
  'Europe': ['Bulgaria', 'France', 'Italy', 'Switzerland', 'Ukraine', 'Russia', 'Spain', 'Bosnia and Herzegovina', 'Greece', 'North Macedonia', 'Croatia', 'Serbia', 'Netherlands', 'Ireland', 'United Kingdom', 'Finland', 'Hungary', 'Romania', 'Poland', 'Norway', 'Sweden', 'Germany', 'Austria', 'Czechia', 'Portugal'],
  'Southern Europe or Anatolia': ['Turkey'],
  'the Caucasus': ['Georgia'],
  'North Africa': ['Morocco', 'Tunisia', 'Egypt'],
  'West Africa': ['Ghana', 'Nigeria', 'Guinea', 'Senegal', 'Ivory Coast'],
  'the Sahel': ['Sudan', 'Burkina Faso'],
  'Central Africa': ['Gabon', 'Cameroon'],
  'the Horn of Africa': ['Ethiopia', 'Somaliland'],
  'East or Southern Africa': ['Tanzania', 'South Africa', 'Namibia'],
  'an island in the Indian Ocean, off Africa': ['Madagascar', 'Comoros', 'Réunion'],
  'the Middle East': ['Yemen', 'Iran', 'Oman', 'Saudi Arabia', 'Israel', 'Lebanon'],
  'Central Asia': ['Kazakhstan', 'Kyrgyzstan', 'Uzbekistan', 'Tajikistan'],
  'South Asia': ['India', 'Sri Lanka', 'Nepal', 'Bangladesh', 'Bhutan'],
  'East Asia': ['China', 'Japan', 'South Korea', 'Taiwan', 'Mongolia'],
  'Southeast Asia': ['Philippines', 'Indonesia', 'Laos', 'Vietnam', 'Malaysia', 'Thailand', 'Myanmar'],
  'North America': ['United States', 'Canada'],
  'Central America or the Caribbean': ['Mexico', 'Cuba', 'Haiti', 'El Salvador', 'Guatemala', 'Costa Rica', 'Jamaica', 'Martinique', 'Dominica', 'Bahamas', 'Belize', 'Honduras', 'Grenada'],
  'South America': ['Brazil', 'Venezuela', 'Paraguay', 'Peru', 'Colombia', 'Ecuador', 'Argentina', 'Bolivia', 'Chile'],
  'Oceania': ['New Zealand', 'Australia', 'French Polynesia', 'Papua New Guinea', 'Vanuatu'],
};
export function region(loc, country) {
  if (country === 'United States' && loc[1] < -150 && loc[0] < 30) return 'Oceania'; // Hawaii
  for (const [r, list] of Object.entries(REGION)) if (list.includes(country)) return r;
  return loc[1] < -30 ? 'the Americas' : loc[0] > 35 ? 'the northern hemisphere' : 'the tropics';
}
// place names and their adjectives, so the field notes don't give the answer away
const GEO = ['Ceylon', 'Bourbon', 'Persia', 'Arabia', 'Levant', 'Balkan', 'Himalaya', 'Amazon', 'Andes', 'Andean', 'Caribbean', 'Sahara', 'Africa', 'Asia', 'Europe', 'America', 'Mediterranean', 'Orient',
  'French', 'Dutch', 'Spanish', 'Greek', 'Turkish', 'Swiss', 'Chinese', 'Japanese', 'Javanese', 'Malagasy', 'Thai', 'Lao', 'Somali', 'Yemeni', 'Omani', 'Peruvian', 'Haitian', 'Grasse', 'Provence', 'Calabria', 'Sicily', 'Tuscany', 'Florence', 'Kazanlak', 'Isparta', 'Mysore', 'Tamil', 'Kerala', 'Zanzibar', 'Java', 'Sumatra', 'Bali', 'Ghana', 'Tahiti', 'Polynesia', 'Polynesian', 'Hawaii', 'Chios', 'Martinique', 'Jamaica', 'Jamaican', 'Irish', 'Connemara', 'Quebec', 'Canadian', 'Australian', 'Colombian', 'Ecuadorian', 'Vietnamese', 'Mekong', 'Iranian', 'Sichuan', 'Szechuan', 'Kiso', 'Agen', 'Giresun', 'Bogotá', 'Ratnagiri', 'Alphonso', 'Bahia', 'Michoacán', 'Mexico', 'Mexican', 'Brazil', 'Comoros', 'Mayotte', 'Nosy', 'Réunion', 'Morocc', 'Egypt', 'Tunisia', 'India', 'Italian', 'Bulgaria', 'Russia', 'Siberia', 'Iran', 'Iraq', 'Oman', 'Dhofar', 'Somaliland', 'Ethiopia', 'Sri Lanka', 'Lankan', 'Vietnam', 'Indonesia', 'Philippin', 'Madagascar', 'Venezuel', 'Paraguay', 'Guatemala', 'Salvador', 'Haiti', 'Serbia', 'Bosnia', 'Croatia', 'Macedonia', 'Ukrain', 'Kazakh', 'Texas', 'Virginia', 'California', 'Florida', 'Nigeria', 'Cuba', 'Costa Rica', 'Spain', 'Portug', 'Atlas', 'Rif',
  'Corsica', 'Corsican', 'Scotland', 'Scottish', 'Islay', 'Yorkshire', 'Tasmania', 'Tasmanian', 'Nepal', 'Nepalese', 'Dominica', 'Guinea', 'Fouta', 'Bahamas', 'Eleuthera', 'Cognac', 'Alba', 'Piedmont', 'Périgord', 'Cavaillon', 'Malatya', 'Niort', 'Poitevin', 'Ardèche', 'Misiones', 'Argentin', 'Finland', 'Finnish', 'Saudi', 'Ahsa', 'Kashmir', 'Limousin', 'Crete', 'Cretan', 'Andalusia', 'Erode', 'Cederberg', 'Cape', 'Hungar', 'Henan', 'Jimma', 'Madhya', 'Loire',
  'English', 'England', 'Britain', 'British', 'Galilee', 'Polish', 'Burm', 'Bengal', 'Malay', 'Ipoh', 'Maya', 'Honshu', 'Aegean', 'Korean',
  'Bangkok', 'Ottoman', 'Kyrgyz', 'Hejaz', 'Mecca', 'Scandinavia', 'Nordic', 'Lapland', 'Liberia', 'Gabon', 'Namib', 'Himba', 'Kaokoveld', 'Angola', 'Bundjalung', 'Queensland', 'Top End', 'Kakadu', 'Arnhem', 'Māori', 'Maori', 'Aotearoa', 'Vanuatu', 'Caledonia', 'Melanesia', 'Formosa', 'Taiwan', 'Mongolia', 'Amazonia', 'Belém', 'Ver-o-Peso',
  'Czech', 'Bohemia', 'Saaz', 'German', 'Berlin', 'Bavaria', 'Austria', 'Tyrol', 'Styria', 'Alps', 'Alpine', 'Bhutan', 'Himalayan', 'Tajik', 'Uzbek', 'Fergana', 'Silk Road', 'Bolivia', 'Honduras', 'Mesoamerica', 'Guatemala', 'Chile', 'Patagonia', 'Pehuenche', 'Mapuche', 'Sudan', 'Kordofan', 'Grenada', 'Lebanon', 'Lebanese', 'Cameroon', 'Gaboon', 'Ivoire', 'Ivorian', 'Burkina', 'Sahel', 'Hawaiʻi', 'Arizona', 'Sonora', 'Mojave', 'American Southwest', 'Inca', 'Wari', 'Quechua', 'Filipino', 'Tagalog', 'Manila', 'Alentejo', 'Calvillo', 'Aguascalientes', 'Žatec', 'Colombia', 'Buenos Aires', 'Priesbergalm', 'Kapulena', 'Côte'];
function redact(text, ing, blind) {
  const words = new Set(GEO);
  for (const w of `${ing.place} ${ing.country}`.split(/[\s,()–-]+/)) if (w.length >= 4 && /^[A-ZÀ-Ý]/.test(w)) words.add(w.slice(0, Math.max(4, w.length - 2)));
  if (blind) for (const w of ing.name.split(/[\s&()]+/)) if (w.length >= 3) words.add(w.slice(0, Math.max(3, w.length - 1)));
  let out = text;
  for (const w of words) out = out.replace(new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\p{L}'’]*`, blind && ing.name.includes(w) ? 'giu' : 'gu'), '▇▇▇');
  return out;
}

function buildRounds(mode, seed, USES) {
  const r = rng(seed), pick = (arr) => arr[Math.floor(r() * arr.length)];
  const pool = INGREDIENTS.filter((i) => USES[i.id].length >= (mode === 'blind' ? 4 : 2) && i.id !== 'seasalt').sort((a, b) => USES[b.id].length - USES[a.id].length);
  const rounds = [], used = new Set(), countries = new Set();
  let guard = 0;
  while (rounds.length < ROUNDS && guard++ < 500) {
    if (mode === 'perfumes') {
      const f = pick(FRAGRANCES);
      const opts = [];
      for (const t of ['top', 'heart', 'base']) for (const n of f.tiers[t]) { const id = noteId(n); if (id && !used.has(id) && pool.some((i) => i.id === id)) opts.push({ id, t, n }); }
      if (!opts.length) continue;
      const o = pick(opts), ing = INGREDIENTS.find((i) => i.id === o.id);
      if (countries.has(ing.country) && guard < 300) continue;
      used.add(ing.id); countries.add(ing.country); rounds.push({ ing, frag: f, tier: o.t, note: o.n });
    } else {
      // weight toward well-used ingredients so the classics come up more often
      const ing = pool[Math.floor(Math.pow(r(), 0.8) * pool.length)];
      if (used.has(ing.id) || (countries.has(ing.country) && guard < 300)) continue;
      used.add(ing.id); countries.add(ing.country); rounds.push({ ing });
    }
  }
  return rounds;
}

let A = null; // app api
let S = null; // game state
let gameEl, hud, fab, splash, fx, fctx, mouse = null, fxItems = [], accent = '#a85d32', pins = [], timer = 0, vignette = null, pinSeq = 0;

export function openGame(api, mode) {
  A = api;
  gameEl = document.getElementById('view-game');
  A.play.active = true; A.play.ver++; A.refresh();
  A.els.app.classList.add('playing'); A.els.panel.classList.add('playing');
  A.els.list.classList.add('off-left'); A.els.detail.classList.add('off-right'); A.els.list.inert = true; A.els.detail.inert = true;
  gameEl.classList.remove('off-right'); gameEl.inert = false;
  if (!hud) {
    hud = document.createElement('div'); hud.className = 'game-hud glass'; A.els.stage.appendChild(hud);
    fab = document.createElement('button'); fab.className = 'btn primary game-fab'; fab.hidden = true; A.els.stage.appendChild(fab);
    fab.addEventListener('click', fabAction);
    gameEl.addEventListener('click', onPanelClick);
    gameEl.addEventListener('input', onPanelInput);
    splash = document.createElement('div'); splash.className = 'g-splash'; A.els.stage.appendChild(splash);
    fx = document.createElement('canvas'); fx.className = 'g-fx'; A.els.labels.before(fx); fctx = fx.getContext('2d');
    A.els.stage.addEventListener('pointermove', (e) => { const r = A.els.stage.getBoundingClientRect(); mouse = [e.clientX - r.left, e.clientY - r.top]; });
    A.els.stage.addEventListener('pointerleave', () => { mouse = null; });
  }
  A.play.onPick = onPick; A.play.draw = frame; A.play.onKey = onKey;
  // a milestone's "See it" plays its bonus fact in the daily scent's card slot
  A.play.showFact = (id, r) => { const slot = gameEl.querySelector('[data-sc-fact]'); if (!slot) return false; scentFact(slot, { id, r, isNew: true }); slot.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return true; };
  A.play.markers = markers; A.play.arcs = arcs;
  // Play is the daily scent, one per day; a finished day reopens on its end screen
  scentOpen(true);
  // keyboard players can start typing notes straight away; on touch screens the keyboard waits for a tap
  const first = matchMedia('(hover: none)').matches ? gameEl.querySelector('[data-act="exit"]') : gameEl.querySelector('[data-sc-in]') || gameEl.querySelector('[data-act="exit"]');
  first?.focus({ preventScroll: true });
}

export function closeGame() { if (A?.play.active && hud) leave(); }
function leave() {
  leaveRoom();
  clearInterval(timer); vignette?.stop(); vignette = null; clearPins(); fxItems = []; fctx?.clearRect(0, 0, fx.width, fx.height);
  hud.classList.remove('show'); fab.classList.remove('show'); fab.hidden = true;
  gameEl.classList.add('off-right'); gameEl.inert = true; gameEl.innerHTML = '';
  S = null; A.exit();
}

// ── screens ───────────────────────────────────────────────
const ICONS = ['chanel-no-5', 'guerlain-shalimar', 'dior-sauvage-edt', 'tom-ford-lost-cherry', 'creed-aventus', 'yves-saint-laurent-black-opium', 'le-labo-santal-33', 'dior-j-adore'];
function lobby(preset, whoPreset) {
  if (NET) leaveRoom();
  if (S?.kind === 'scent') S = null;
  clearInterval(timer); clearPins(); vignette?.stop(); vignette = null; fxItems = [];
  hud.classList.remove('show'); fab.classList.remove('show'); fab.hidden = true;
  A.setTint(null); A.flyTo([24, 20], 1); A.setHash('play');
  const sel = preset || store.get('mode') || 'notes', timed = store.get('timed') ?? false;
  const who = whoPreset || store.get('who') || 'solo', me = myProfile();
  const best = (m) => store.get(`best:${m}`);
  const d = today();
  gameEl.innerHTML = `
    <div class="game">
      <div class="detail-top"><button class="btn icon ghost" data-act="exit" aria-label="Back to the atlas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <div class="crumbs"><span>Atlas</span><span>/</span><b>Fraguessr</b></div></div>
      <div class="hero frag g-lobby" id="g-hero"><div class="model"></div>
        <div class="g-drift" aria-hidden="true">${drift()}</div>
        <div class="g-lh"><div class="g-logo"><span class="g-ping"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/></svg></div>
          <div><span class="mono g-kicker">A fragrance geography game</span><h2 class="title">Fraguessr</h2></div></div>
      </div>
      <div class="g-intro">
        <p class="prose">Every note in a perfume started somewhere: a valley of roses, a grove of bergamot, a forest of resin trees. Drop a pin where you think it grows. The closer you land, the more points you score, up to <b>5,000</b> a round.</p>
      </div>
      ${scentCard()}
      <div class="section-h"><span>Mode</span></div>
      <div class="g-modes" role="radiogroup">${Object.entries(MODES).map(([k, m]) => `
        <button class="g-mode" role="radio" data-mode="${k}" aria-checked="${k === sel}">
          <span class="g-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${m.icon}</svg></span>
          <span class="g-mt">${m.label}<span>${m.blurb}</span></span>
          <span class="g-best mono">${best(k) ? `best ${best(k).toLocaleString()}` : ''}</span>
        </button>`).join('')}</div>
      <div class="section-h"><span>Players</span></div>
      <div class="g-who" role="tablist" aria-label="Who is playing">${Object.entries(WHO).map(([k, w]) => `<button role="tab" data-who="${k}" aria-selected="${k === who}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${w.icon}</svg>${w.label}</button>`).join('')}</div>
      <div class="g-whop" data-whop="solo" ${who === 'solo' ? '' : 'hidden'}>
        <div class="g-opts">
          <label class="g-switch"><input type="checkbox" data-opt="timed" ${timed ? 'checked' : ''}><span></span><b>Timer</b><em>${TIME} seconds a round, with a speed bonus of up to ${SPEED}</em></label>
        </div>
      </div>
      <div class="g-whop" data-whop="online" ${who === 'online' ? '' : 'hidden'}>
        <p class="g-note muted">Play live with friends who have this page open. Everyone gets the same five rounds and ${TIME} seconds a guess, and the host moves the room on.</p>
        <label class="g-field"><span>Your name</span><input data-nick maxlength="18" autocomplete="off" value="${A.esc(me.nm)}"></label>
        <div class="g-colors" role="group" aria-label="Your colour">${colorDots(me.col)}</div>
        <div class="g-join"><input data-code maxlength="4" autocomplete="off" spellcheck="false" placeholder="CODE" aria-label="Room code"><button class="btn" data-act="join">Join room</button></div>
        <div class="g-open" data-open></div>
        <p class="g-note muted" data-netnote>Connecting…</p>
      </div>
      <div class="g-whop" data-whop="local" ${who === 'local' ? '' : 'hidden'}>
        <p class="g-note muted">Take turns on this device. Each player guesses the same round in private, then everyone's pins land together.</p>
        <div class="g-local" data-local>${localRows()}</div>
        <div class="g-opts"><label class="g-switch"><input type="checkbox" data-opt="ltimed" ${timed ? 'checked' : ''}><span></span><b>Timer</b><em>${TIME} seconds a turn, with a speed bonus of up to ${SPEED}</em></label></div>
      </div>
      <button class="btn primary g-start" data-act="start"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg><span data-startlabel>${WHO[who].start}</span></button>
      <div class="g-how">
        <div><b>1</b><span>Study the material and its clues. Each extra hint costs 15% of the round's distance points.</span></div>
        <div><b>2</b><span>Spin and zoom the globe, then tap to drop your pin. Country names appear as you zoom in.</span></div>
        <div><b>3</b><span>Lock in your guess. A pin within 50 km scores the full 5,000, then points ease off with distance (about 3,100 at 1,000 km). On the clock, a fast guess in the right part of the world earns up to ${SPEED} extra.</span></div>
      </div>
      <p class="g-foot mono muted">${d} · ${INGREDIENTS.length} ingredients · ${FRAGRANCES.length} perfumes</p>
    </div>`;
  gameEl.scrollTop = 0;
  enter(gameEl.querySelector('.game'));
  lightOnline();
  // a slowly turning signature bottle
  const hero = gameEl.querySelector('#g-hero'), host = hero.querySelector('.model');
  const f = FRAGRANCES.find((x) => x.id === ICONS[Math.floor(Math.random() * ICONS.length)]) || FRAGRANCES[0];
  A.getStage().then((st) => {
    if (!st || !host.isConnected) return;
    st.mount(host);
    const sig = A.fragHex(f), dark = A.isDark();
    st.showFragrance(f, A.liquidFor(f), f.ingredients.slice(0, 3).map((id) => A.ING[id]), dark ? A.mix(sig, '#332c27', 0.8) : A.mix(sig, '#ffffff', 0.88), sig,
      dark ? [A.mix(sig, '#141110', 0.82), A.mix(sig, '#1d1916', 0.72)] : [A.mix(sig, '#fffdfa', 0.84), A.mix(sig, '#f3ede4', 0.7)]);
    requestAnimationFrame(() => hero.classList.add('loaded'));
  });
}
function drift() {
  const picks = INGREDIENTS.filter((i) => A.USES[i.id].length > 15).sort(() => Math.random() - 0.5).slice(0, 7);
  return picks.map((i, k) => `<span style="--c:${A.ingHex(i)};--x:${8 + ((k * 37) % 84)}%;--d:${(k * 1.3) % 7}s;--t:${9 + (k % 3) * 2}s"><i></i>${A.esc(i.name)}</span>`).join('');
}
// stagger children of the screen in, top to bottom
function enter(root) { if (!root) return; [...root.children].forEach((el, k) => { el.classList.add('g-in'); el.style.setProperty('--i', k); }); }

function start() {
  const mode = gameEl.querySelector('.g-mode[aria-checked="true"]')?.dataset.mode || 'notes';
  const who = gameEl.querySelector('[data-who][aria-selected="true"]')?.dataset.who || 'solo';
  store.set('mode', mode); store.set('who', who);
  if (who === 'online') return createRoom(mode);
  if (who === 'local') return startLocal(mode, gameEl.querySelector('[data-opt="ltimed"]').checked);
  const timed = gameEl.querySelector('[data-opt="timed"]').checked;
  store.set('timed', timed);
  const seed = (Math.random() * 2 ** 32) >>> 0;
  S = rules({ mode, timed, seed, rounds: buildRounds(mode, seed, A.USES), i: -1, results: [], total: 0 });
  A.setHash('play-' + mode);
  next();
}

// online rooms always run the clock
function rules(st) { return Object.assign(st, st.mp?.kind === 'online' ? { timed: true, time: TIME, free: 0 } : { time: TIME, free: 0 }); }
function next() {
  if (!S) return;
  S.i++;
  if (S.i >= S.rounds.length) return summary();
  const R = S.rounds[S.i];
  S.phase = 'guess'; S.guess = null; S.clues = S.free; S.left = S.time;
  if (S.mp) { S.mp.turn = 0; S.mp.pinKey = ''; }
  clearPins(); fxItems = [];
  A.play.ver++; A.refresh();
  A.setTint(A.ingHex(R.ing), R.ing.c);
  A.view.tScale = 1; A.flyTo([20 + (Math.random() - 0.5) * 30, R.ing.loc[1] + 70 + Math.random() * 140], 1);
  renderRound();
  renderHud();
  showSplash(S.mp?.kind === 'local' ? turnSplash() : `<span class="mono">Round ${S.i + 1} of ${S.rounds.length}</span><b>${prompt(R)}</b>`);
  accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent;
  startClock();
}
function startClock() {
  clearInterval(timer);
  if (S.timed) timer = setInterval(() => {
    if (S?.phase !== 'guess') return clearInterval(timer);
    S.left--; renderHud();
    if (S.left <= 0) { clearInterval(timer); submit(true); }
  }, 1000);
}

function showSplash(html) {
  splash.innerHTML = `<div>${html}</div>`;
  splash.classList.remove('show'); void splash.offsetWidth; splash.classList.add('show');
}
function prompt(R) {
  if (S.mode === 'perfumes') return `${A.esc(R.frag.name)} lists <b>${A.esc(R.note)}</b> in its ${R.tier === 'heart' ? 'heart' : R.tier} notes. Where does it come from?`;
  if (S.mode === 'blind') return 'Where in the world does this come from?';
  return `Where does <b>${A.esc(R.ing.name)}</b> come from?`;
}
function clueList(R) {
  const ing = R.ing, blind = S.mode === 'blind';
  return [
    { k: 'How it is made', v: `${A.esc(ing.method)}. Harvest: ${A.esc(ing.season.charAt(0).toLowerCase() + ing.season.slice(1))}.` },
    { k: 'Field notes', v: A.esc(redact(ing.about, ing, blind)) },
    { k: 'Region', v: `Somewhere in ${region(ing.loc, ing.country)}.` },
  ];
}

const worth = () => Math.round(MAX * (1 - CLUE_COST * Math.max(0, S.clues - S.free))).toLocaleString();
function renderRound() {
  const R = S.rounds[S.i], ing = R.ing, blind = S.mode === 'blind';
  const fam = FAMILIES[ing.family];
  const clues = clueList(R);
  gameEl.innerHTML = `
    <div class="game">
      <div class="detail-top"><button class="btn icon ghost" data-act="lobby" aria-label="Quit to game menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        <div class="crumbs"><span>Fraguessr</span><span>/</span><b>Round ${S.i + 1} of ${S.rounds.length}</b></div>
        <span class="g-total mono">${S.mp?.kind === 'local' ? `${A.esc(turnPlayer().nm)} · ${turnPlayer().total.toLocaleString()}` : S.total.toLocaleString()} pts</span></div>
      <div class="g-steps">${S.rounds.map((_, k) => `<i class="${k < S.i ? 'done' : k === S.i ? 'cur' : ''}" style="${k < S.i ? `--q:${Math.min(1, S.results[k].points / MAX)}` : ''}"></i>`).join('')}</div>
      ${turnBanner()}
      <div class="hero${R.frag ? ' frag' : ''}" id="g-hero">${R.frag ? '' : '<canvas class="vignette"></canvas><div class="fade"></div>'}<div class="model"></div>
        <span class="badge glass tag mono">${R.frag ? `${A.esc(R.frag.house)} · ${R.frag.year}` : blind ? 'Mystery material' : A.esc(fam.label)}</span><span class="badge glass tag2 mono">Drag to turn</span></div>
      <div class="body">
        <h2 class="title g-q">${prompt(R)}</h2>
        <div class="badges"><span class="badge"><span class="dot" style="background:${A.ingHex(ing)}"></span>${fam.label}</span><span class="badge soft">${A.esc(ing.part)}</span>${!blind ? `<span class="badge soft mono" style="font-style:italic">${A.esc(ing.latin)}</span>` : ''}${R.frag ? `<span class="badge soft">${A.esc(R.frag.name)}</span>` : ''}</div>
        <div class="g-clues">${clues.map((c, k) => `
          <div class="g-clue${k < S.clues ? ' open' : ''}" data-k="${k}">
            <button class="g-clue-h" data-act="clue" data-k="${k}" ${k !== S.clues ? 'disabled' : ''}><span>${c.k}${k < S.free ? '<em class="g-free">Free hint</em>' : ''}</span><span class="mono">${k < S.clues ? 'revealed' : `−${Math.round(CLUE_COST * 100)}%`}</span></button>
            <div class="g-clue-b"><p>${c.v}</p></div>
          </div>`).join('')}</div>
        <div class="g-cta">
          <div class="g-max mono">Worth up to <b>${worth()}</b> pts${S.timed ? `<span class="g-bonus">+${SPEED} speed</span>` : ''}</div>
          <button class="btn primary" data-act="guess" ${S.guess ? '' : 'disabled'}>${S.guess ? 'Lock in guess' : 'Tap the globe to drop a pin'}</button>
        </div>
      </div>
    </div>`;
  gameEl.scrollTop = 0;
  enter(gameEl.querySelector('.game')); enter(gameEl.querySelector('.body'));
  // 3D model
  const hero = gameEl.querySelector('#g-hero'), host = hero.querySelector('.model');
  vignette?.stop(); vignette = null;
  const cv = hero.querySelector('canvas.vignette'); if (cv) vignette = A.createVignette(cv, ing);
  A.getStage().then((st) => {
    if (!st || !host.isConnected) { hero.classList.add('no-3d'); return; }
    st.mount(host);
    const dark = A.isDark();
    if (R.frag) {
      const sig = A.fragHex(R.frag), notes = [ing, ...R.frag.ingredients.filter((id) => id !== ing.id).slice(0, 2).map((id) => A.ING[id])];
      st.showFragrance(R.frag, A.liquidFor(R.frag), notes, dark ? A.mix(sig, '#332c27', 0.8) : A.mix(sig, '#ffffff', 0.88), sig,
        dark ? [A.mix(sig, '#141110', 0.82), A.mix(sig, '#1d1916', 0.72)] : [A.mix(sig, '#fffdfa', 0.84), A.mix(sig, '#f3ede4', 0.7)]);
    } else {
      st.showIngredient(ing, A.ingHex(ing), dark ? A.mix(A.ingHex(ing), '#2a2a2e', 0.78) : A.mix(A.ingHex(ing), '#ffffff', 0.82),
        blind ? { title: `Specimen ${String.fromCharCode(65 + S.i)}`, sub: 'origin unknown' } : undefined);
    }
    requestAnimationFrame(() => hero.classList.add('loaded'));
  });
}

function renderHud() {
  if (!S) return;
  const R = S.rounds[S.i];
  if (S.phase === 'guess') {
    hud.innerHTML = `${dots()}${S.mp ? `<span class="g-chips">${chipsHtml()}</span>` : ''}<span class="g-hq">${prompt(R)}</span>${S.timed ? `<span class="g-ring${S.left <= Math.min(10, S.time / 3) ? ' low' : ''}" style="--p:${S.left / S.time}"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/><circle cx="18" cy="18" r="15"/></svg><b class="mono">${S.left}</b></span>` : ''}`;
    fab.textContent = S.guess ? 'Lock in guess' : 'Tap the globe to drop a pin';
    fab.disabled = !S.guess; fab.classList.toggle('ready', !!S.guess);
  } else if (S.phase === 'reveal') {
    const res = S.results[S.i];
    hud.innerHTML = `${dots()}<span class="g-hq"><b>${A.esc(R.ing.name)}</b> · ${A.esc(R.ing.place)}, ${A.esc(R.ing.country)}</span><span class="g-pts mono">+${res.points.toLocaleString()}</span>`;
    const nb = nextState();
    fab.textContent = nb.label; fab.disabled = !nb.ok; fab.classList.toggle('ready', nb.ok);
  } else if (S.phase === 'pass') {
    const P = S.mp.players[S.mp.turn + 1];
    hud.innerHTML = `${dots()}<span class="g-hq">Pass the device to <b>${A.esc(P.nm)}</b></span>`;
    fab.textContent = `I'm ${P.nm}, show my round`; fab.disabled = false; fab.classList.add('ready');
  }
  hud.classList.add('show'); fab.classList.add('show'); fab.hidden = false;
}

function dots() {
  return `<span class="g-dots">${S.rounds.map((_, k) => { const r = S.results[k]; return `<i class="${k === S.i && S.phase !== 'done' ? 'cur' : ''}" style="${r ? `--c:${r.points >= 4000 ? '#4f8f63' : r.points >= 2500 ? '#e2a336' : r.points >= 1000 ? '#f76b15' : '#c4513f'}` : ''}"></i>`; }).join('')}</span>`;
}
function onPick(ll) {
  if (S?.phase !== 'guess') return;
  S.guess = ll;
  A.play.ver++; A.refresh();
  setPins([{ loc: ll, kind: 'guess' }]);
  fxItems.push({ type: 'ripple', loc: ll, t0: performance.now(), color: accent });
  const b = gameEl.querySelector('[data-act="guess"]'); if (b) { b.disabled = false; b.textContent = 'Lock in guess'; }
  renderHud();
}

// score the current guess (or the lack of one) for whoever is guessing
function record() {
  const R = S.rounds[S.i], ing = R.ing;
  const km = S.guess ? A.haversine(S.guess, ing.loc) : null;
  const sc = scoreRound({ km, clues: S.clues, free: S.free, timed: S.timed, left: S.left, time: S.time });
  return { ing, frag: R.frag, guess: S.guess, km, points: sc.points, clues: S.clues, sc, left: S.left };
}
function submit(timeout) {
  if (S?.phase !== 'guess') return;
  if (!S.guess && !timeout) return;
  clearInterval(timer);
  if (S.mp?.kind === 'local') return submitLocal();
  const R = S.rounds[S.i], ing = R.ing;
  const rec = record(), km = rec.km, points = rec.points;
  S.results.push(rec);
  S.total += points; S.phase = 'reveal';
  if (S.mp) publishMine();
  A.play.ver++; A.refresh();
  const res = S.results[S.i], now = performance.now(), color = A.ingHex(ing);
  setPins(S.guess ? [{ loc: S.guess, kind: 'guess' }] : []);
  const arrive = () => {
    if (S?.results[S.i] !== res) return;
    const t = performance.now();
    res.arrived = true; A.play.ver++; A.refresh();
    setPins(revealPins(true)); if (S.mp) S.mp.pinKey = othersKey();
    if (S.guess) fxItems.push({ type: 'label', from: S.guess, to: ing.loc, t0: t, text: kmText(km), color: tierOf(km)[2] });
    fxItems.push({ type: 'burst', loc: ing.loc, t0: t, color, parts: sparks(points >= 4000 ? 34 : 20) });
    fxItems.push({ type: 'float', loc: ing.loc, t0: t, text: `+${points.toLocaleString()}`, color });
    if (points >= 4500) fxItems.push({ type: 'confetti', t0: t, parts: confetti(), colors: [color, ...ing.c, accent] });
  };
  if (S.guess) fxItems.push({ type: 'arc', from: S.guess, to: ing.loc, t0: now + 450, dur: Math.min(1700, 700 + km / 12), color, done: arrive, keep: true });
  else setTimeout(arrive, 600);
  if (S.guess) {
    const z = km < 400 ? 2.8 : km < 1200 ? 2.1 : km < 3000 ? 1.5 : km < 7000 ? 1.1 : 0.9;
    A.flyTo(A.midpoint([S.guess, ing.loc]), z);
  } else A.flyTo(ing.loc, 1.8);
  renderReveal(km, res);
  renderHud();
}

function ingInfo(ing) {
  const uses = A.USES[ing.id], top = uses.slice().sort((a, b) => a.f.name.localeCompare(b.f.name)).slice(0, 6);
  return `<div><h2 class="title">${A.esc(ing.name)}</h2><div class="latin">${A.esc(ing.latin)}</div></div>
    <div class="badges"><span class="badge"><span class="dot" style="background:${A.ingHex(ing)}"></span>${FAMILIES[ing.family].label}</span><span class="badge soft">${A.esc(ing.place)}</span><span class="badge soft">${A.esc(ing.country)}</span></div>
    <p class="prose">${A.esc(ing.about)}</p>
    <div class="section-h"><span>Goes into ${uses.length} perfume${uses.length === 1 ? '' : 's'} in the atlas</span></div>
    <div class="notes">${top.map((u) => `<span class="badge note">${A.esc(u.f.name)} <span class="mono muted">${A.esc(u.f.house)}</span></span>`).join('')}${uses.length > top.length ? `<span class="badge soft mono">+${uses.length - top.length} more</span>` : ''}</div>`;
}
function renderReveal(km, res) {
  const points = res.points;
  const R = S.rounds[S.i], ing = R.ing;
  const body = gameEl.querySelector('.body');
  body.innerHTML = `
    ${resultCard(km, res, ing)}
    ${S.mp ? `<div class="g-board" data-board>${boardHtml()}</div>` : ''}
    ${ingInfo(ing)}
    <div class="g-cta"><div class="g-max mono">Total <b>${S.total.toLocaleString()}</b> / ${(S.rounds.length * MAX).toLocaleString()}</div>${nextBtn()}</div>`;
  gameEl.querySelector('.g-q')?.remove();
  gameEl.querySelectorAll('.g-steps i')[S.i]?.classList.add('done');
  gameEl.querySelectorAll('.g-steps i')[S.i]?.style.setProperty("--q", Math.min(1, points / MAX));
  gameEl.querySelector('.g-total').textContent = `${S.total.toLocaleString()} pts`;
  const tag = gameEl.querySelector('#g-hero .tag'); if (tag) tag.textContent = `${ing.place}, ${ing.country}`;
  countUp(gameEl.querySelector('.g-num'));
  gameEl.querySelectorAll('.g-line b[data-count]').forEach((el, k) => setTimeout(() => countUp(el), 250 + k * 260));
  gameEl.scrollTop = 0;
}
// distance ruler: log scale from 10 km to 20,000 km, with the score tiers marked
const rulerX = (km) => Math.max(0, Math.min(1, Math.log10(Math.max(10, km) / 10) / Math.log10(2000)));
function resultCard(km, res, ing) {
  const [, label, col] = tierOf(km), sc = res.sc;
  const ticks = [50, 300, 1000, 2500, 5000];
  const lines = [
    ['Distance', km == null ? 'no pin' : kmText(km), sc.distance, ''],
    ...(S.free ? [['Free hint', 'first clue', 0, 'free']] : []),
    ...(sc.paid ? [[`${sc.paid} hint${sc.paid > 1 ? 's' : ''}`, `−${Math.round(CLUE_COST * 100 * sc.paid)}%`, -sc.hints, 'neg']] : []),
    ...(S.timed ? [['Speed bonus', km == null ? 'out of time' : sc.speed ? `${res.left}s left` : 'too far for a bonus', sc.speed, sc.speed ? 'pos' : '']] : []),
  ];
  return `<div class="g-result" style="--c:${col}">
      <div class="g-score"><div><span class="g-v">${label}</span><span class="mono muted">${km == null ? 'No pin dropped' : `${kmText(km)} from ${A.esc(ing.place.split(',')[0])}`}</span></div>
        <div class="g-num mono" data-count="${res.points}">0</div></div>
      ${km == null ? '' : `<div class="g-ruler" style="--x:${rulerX(km)}"><div class="g-track">${ticks.map((d) => `<i style="left:${rulerX(d) * 100}%"></i>`).join('')}<b class="g-mark"><span>${kmText(km)}</span></b></div>
        <div class="g-ticks mono">${['50', '300', '1k', '2.5k', '5k km'].map((t, k) => `<span style="left:${rulerX(ticks[k]) * 100}%">${t}</span>`).join('')}</div></div>`}
      <div class="g-lines">${lines.map(([k, v, n, cls]) => `<div class="g-line ${cls}"><span>${k}</span><span class="mono muted">${v}</span><b class="mono" ${n ? `data-count="${n}" data-sign="${n > 0 && cls === 'pos' ? '+' : ''}"` : ''}>${n ? '0' : cls === 'free' ? '0' : '—'}</b></div>`).join('')}
        <div class="g-line total"><span>Round score</span><span></span><b class="mono">${res.points.toLocaleString()}</b></div></div>
    </div>`;
}
function countUp(el) {
  if (!el) return;
  const to = +el.dataset.count, t0 = performance.now(), dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 900;
  const sign = el.dataset.sign || '', step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = Math.round(to * e); el.textContent = (v < 0 ? '−' : sign) + Math.abs(v).toLocaleString(); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

const RANKS = [[23000, 'Master perfumer', 'You could source a whole collection from memory.'], [18000, 'Nose', 'Trained, confident and rarely more than a country off.'],
  [12500, 'Perfumery student', 'You know your regions. A few notes pulled you off course.'], [7000, 'Fragrance lover', 'Good instincts, with room to wander the atlas.'], [0, 'Curious traveller', 'Every expert started somewhere. Explore the atlas and try again.']];
const square = (p) => (p >= 4000 ? '🟩' : p >= 2500 ? '🟨' : p >= 1000 ? '🟧' : '🟥');

function summary() {
  if (S.mp) return standings();
  S.phase = 'done'; clearInterval(timer);
  const max = S.rounds.length * MAX, [, rank, line] = RANKS.find(([n]) => S.total >= n * (max / 25000));
  const key = `best:${S.mode}`, prev = store.get(key) || 0, isBest = S.total > prev;
  if (isBest) store.set(key, S.total);
  vignette?.stop(); vignette = null;
  A.setTint(null);
  setPins(S.results.flatMap((r, k) => [...(r.guess ? [{ loc: r.guess, kind: 'guess', small: true, text: String(k + 1) }] : []), { loc: r.ing.loc, kind: 'answer', ing: r.ing, text: r.ing.name }]));
  fxItems = []; const t0 = performance.now() + 700;
  S.results.forEach((r, k) => { if (r.guess) fxItems.push({ type: 'arc', from: r.guess, to: r.ing.loc, t0: t0 + k * 380, dur: 900, color: A.ingHex(r.ing), keep: true }); });
  if (S.total >= S.rounds.length * MAX * 0.7) fxItems.push({ type: 'confetti', t0: t0 + 600, parts: confetti(), colors: [accent, '#4f8f63', '#e2a336', '#8e4ec6', '#0090ff'] });
  showSplash(`<span class="mono">Final score</span><b>${S.total.toLocaleString()}</b>`);
  A.play.ver++; A.refresh();
  A.flyTo(A.midpoint(S.results.map((r) => r.ing.loc)), 0.95);
  hud.innerHTML = `<span class="mono muted">${MODES[S.mode].label}</span><span class="g-hq"><b>${S.total.toLocaleString()}</b> / ${max.toLocaleString()} · ${rank}</span>`;
  fab.textContent = 'Play again'; fab.classList.add('ready'); fab.disabled = false;
  gameEl.innerHTML = `
    <div class="game">
      <div class="detail-top"><button class="btn icon ghost" data-act="lobby" aria-label="Back to game menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <div class="crumbs"><span>Fraguessr</span><span>/</span><b>Results</b></div></div>
      <div class="g-final">
        <span class="mono muted">${MODES[S.mode].label} · ${today()}</span>
        <div class="g-big mono" data-count="${S.total}">0</div>
        <div class="g-meter"><i style="--p:${Math.min(1, S.total / max)}"></i></div>
        <h2 class="title">${rank}</h2><p class="prose">${line}${isBest && prev ? ` New personal best, up from ${prev.toLocaleString()}.` : ''}</p>
      </div>
      <div class="body">
        <div class="g-table">${S.results.map((r, k) => `
          <div class="g-row" style="--c:${A.ingHex(r.ing)};--i:${k}"><span class="g-n mono">${k + 1}</span><span class="dot" style="background:${A.ingHex(r.ing)}"></span>
            <span class="g-nm">${A.esc(r.ing.name)}<span>${r.frag ? `${A.esc(r.frag.name)} · ` : ''}${A.esc(r.ing.country)}</span></span>
            <span class="g-km mono">${r.km == null ? '—' : `${Math.round(r.km).toLocaleString()} km`}</span><span class="g-p mono">${r.points.toLocaleString()}</span>
            <i class="g-rb" style="--p:${Math.min(1, r.points / MAX)}"></i></div>`).join('')}</div>
        <div class="g-share"><code id="g-sharetext">${shareText(rank)}</code></div>
        <div class="g-actions">
          <button class="btn" data-act="share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Copy result</button>
          <button class="btn primary" data-act="again"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Play a new game</button>
        </div>
        <button class="btn ghost" data-act="exit">Back to the atlas</button>
      </div>
    </div>`;
  countUp(gameEl.querySelector('.g-big'));
  gameEl.scrollTop = 0;
  enter(gameEl.querySelector('.game')); enter(gameEl.querySelector('.g-table')); enter(gameEl.querySelector('.body'));
}
function shareText(rank) {
  return `Fraguessr · ${MODES[S.mode].label}${S.timed ? ` · ${S.time}s` : ''}\n${S.results.map((r) => square(r.points)).join('')} ${S.total.toLocaleString()}/${(S.rounds.length * MAX).toLocaleString()}\n${rank}`;
}

function again() {
  const mode = S?.mode || 'notes', timed = S?.timed;
  const seed = (Math.random() * 2 ** 32) >>> 0;
  S = rules({ mode, timed, seed, rounds: buildRounds(mode, seed, A.USES), i: -1, results: [], total: 0 });
  next();
}

// ── daily scent: one famous perfume a day, name its notes ─────
// Five chances. A wrong note costs one and buys a hint about a note still hidden; a right one reveals the note,
// flies the globe to where it grows and deals one of its fun facts, drawn by the same rarity odds as a blend.
const SCENT_LIVES = 5, SCENT_MIN = 5, SCENT_MAX = 19;
const SCENT_POOL = ['chanel-no-5', 'chanel-coco-mademoiselle', 'chanel-bleu-de-chanel-edp', 'chanel-chance', 'chanel-allure-homme-sport', 'chanel-egoiste', 'chanel-no-19', 'chanel-coco-noir', 'chanel-coco', 'chanel-allure',
  'dior-sauvage-edt', 'dior-sauvage-elixir', 'dior-miss-dior-blooming-bouquet', 'dior-poison', 'dior-hypnotic-poison', 'dior-eau-sauvage', 'dior-diorissimo', 'dior-dune', 'dior-dolce-vita',
  'yves-saint-laurent-black-opium', 'yves-saint-laurent-libre', 'yves-saint-laurent-y-eau-de-parfum', 'yves-saint-laurent-mon-paris', 'yves-saint-laurent-paris', 'guerlain-shalimar', 'guerlain-mitsouko', 'guerlain-la-petite-robe-noire',
  'guerlain-samsara', 'guerlain-jicky', 'guerlain-l-homme-ideal', 'guerlain-apres-l-ondee', 'hermes-terre-d-hermes', 'hermes-un-jardin-sur-le-nil', 'hermes-eau-d-orange-verte', 'tom-ford-oud-wood', 'tom-ford-lost-cherry', 'tom-ford-neroli-portofino',
  'tom-ford-tuscan-leather', 'tom-ford-noir-extreme', 'tom-ford-grey-vetiver', 'tom-ford-ombre-leather', 'creed-aventus', 'creed-green-irish-tweed', 'creed-silver-mountain-water', 'maison-francis-kurkdjian-baccarat-rouge-540',
  'maison-francis-kurkdjian-oud-satin-mood', 'le-labo-santal-33', 'le-labo-another-13', 'le-labo-rose-31', 'le-labo-the-noir-29', 'byredo-gypsy-water', 'byredo-bal-d-afrique', 'byredo-mojave-ghost', 'jo-malone-london-wood-sage-sea-salt',
  'jo-malone-london-english-pear-freesia', 'jo-malone-london-lime-basil-mandarin', 'giorgio-armani-acqua-di-gio-profumo', 'giorgio-armani-si', 'giorgio-armani-armani-code', 'giorgio-armani-stronger-with-you', 'rabanne-1-million', 'rabanne-invictus',
  'rabanne-lady-million', 'jean-paul-gaultier-le-male', 'jean-paul-gaultier-classique', 'jean-paul-gaultier-scandal', 'jean-paul-gaultier-ultra-male', 'viktor-rolf-flowerbomb', 'viktor-rolf-spicebomb', 'mugler-a-men', 'lancome-la-vie-est-belle',
  'lancome-tresor', 'lancome-idole', 'prada-infusion-d-iris', 'prada-paradoxe', 'gucci-rush', 'gucci-guilty', 'gucci-flora-by-gucci', 'gucci-bamboo', 'calvin-klein-ck-one', 'calvin-klein-eternity', 'calvin-klein-euphoria', 'davidoff-cool-water',
  'davidoff-cool-water-woman', 'hugo-boss-boss-bottled', 'versace-eros', 'versace-bright-crystal', 'versace-dylan-blue', 'dolce-gabbana-light-blue', 'dolce-gabbana-the-one-for-men', 'narciso-rodriguez-for-her', 'marc-jacobs-daisy',
  'kenzo-flower-by-kenzo', 'issey-miyake-l-eau-d-issey', 'estee-lauder-beautiful', 'estee-lauder-white-linen', 'estee-lauder-pleasures', 'clinique-happy', 'diptyque-do-son', 'diptyque-tam-dao', 'serge-lutens-ambre-sultan', 'serge-lutens-chergui',
  'frederic-malle-portrait-of-a-lady', 'frederic-malle-carnal-flower', 'maison-margiela-replica-jazz-club', 'maison-margiela-replica-by-the-fireplace', 'parfums-de-marly-layton', 'parfums-de-marly-delina', 'kilian-paris-love-don-t-be-shy',
  'amouage-interlude-man', 'acqua-di-parma-colonia', 'ralph-lauren-polo', 'givenchy-l-interdit', 'givenchy-gentleman-eau-de-parfum', 'givenchy-pi', 'chloe-chloe-eau-de-parfum', 'burberry-her', 'montblanc-explorer', 'montblanc-legend',
  'nina-ricci-l-air-du-temps', 'ariana-grande-cloud', 'kayali-vanilla-28', 'valentino-born-in-roma-donna', 'azzaro-wanted', 'azzaro-pour-homme', 'dkny-be-delicious', 'lanvin-arpege', 'jean-patou-joy', 'robert-piguet-fracas',
  'cacharel-anais-anais', 'lolita-lempicka-lolita-lempicka', 'guy-laroche-drakkar-noir', 'lattafa-khamrah', 'armaf-club-de-nuit-intense-man', 'carolina-herrera-bad-boy', 'elizabeth-arden-green-tea', 'britney-spears-fantasy', 'nautica-nautica-voyage'];
const TIER_NAME = { top: 'Top', heart: 'Heart', base: 'Base' };
const SMELL = {
  top: { citrus: 'a bright, zesty burst', floral: 'a soft floral lift', green: 'a crisp green snap', fruit: 'a juicy, fruity splash', spice: 'a warm, peppery spark', wood: 'a dry woody hush', resin: 'a glowing balsamic warmth', gourmand: 'a sweet, edible hello', animalic: 'a skin-warm musky hum', marine: 'a breezy, salty splash' },
  heart: { citrus: 'a sparkling citrus heart', floral: 'a heart of blooming flowers', green: 'a leafy, herbal heart', fruit: 'a ripe, fruity heart', spice: 'a heart of warm spices', wood: 'a heart of polished woods', resin: 'a smoky, resinous heart', gourmand: 'a creamy, sweet heart', animalic: 'a sensual animalic heart', marine: 'a cool, watery heart' },
  base: { citrus: 'a clean, bright drydown', floral: 'a powdery floral drydown', green: 'a mossy, earthy drydown', fruit: 'a jammy drydown', spice: 'a spiced drydown', wood: 'a smooth woody drydown', resin: 'a warm amber drydown', gourmand: 'a sweet, cosy drydown', animalic: 'a soft musky drydown', marine: 'a mineral, salty drydown' },
};
const VERDICT = [[1, 'Perfect nose', 'Every note named. You could have written the formula.'], [0.75, 'Nose', 'Only a note or two got past you.'], [0.5, 'Perfumery student', 'You caught the heart of it.'],
  [0.25, 'Fragrance lover', 'A good sniff. The rest is now in your collection.'], [0, 'Curious traveller', 'A tricky one. Every note you found today is yours to keep.']];
// lower-case the first letter unless the word is an acronym or a proper name in caps ("CO2", "Rose de Mai" stays readable)
const lc = (w) => (/^\p{Lu}\p{Ll}/u.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w);
const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const listText = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const famHex = (fm) => '#' + FAMILIES[fm].color.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const prevDay = (d) => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
const dayLabel = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// the perfume's notes in pyramid order; one with no single place of origin (aldehydes, ambroxan...) is shown from the start
function scentNotes(f) {
  const out = [], seen = new Set();
  for (const t of ['top', 'heart', 'base']) for (const n of f.tiers[t]) {
    const id = noteId(n);
    if (!id || !ING_BY[id]) out.push({ t, n, given: true });
    else if (!seen.has(id)) { seen.add(id); out.push({ t, n, id }); }
  }
  return out;
}
const scentSize = (f) => scentNotes(f).filter((x) => x.id).length;
let scentOrder = null;
const ING_BY = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
// today's perfume, for the welcome card (works before the game has opened)
export const todayScent = () => scentOf(today());
function scentPool() {
  if (scentOrder) return scentOrder;
  const pool = SCENT_POOL.map((id) => FRAGRANCES.find((f) => f.id === id)).filter((f) => f && scentSize(f) >= SCENT_MIN && scentSize(f) <= SCENT_MAX), r = rng(hash('fraguessr:scent'));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return (scentOrder = pool);
}
// the same perfume for everyone on a given (UTC) day, working through the shuffled pool before any repeats
function scentOf(d) { const p = scentPool(), n = Math.floor(Date.parse(d) / 864e5); return p[((n % p.length) + p.length) % p.length]; }

// how it smells without naming a note: the leading family of each tier, plus the family balance overall
function scentProfile(f, notes) {
  const w = { top: 1, heart: 1.5, base: 2 }, all = {}, lead = {};
  for (const t of ['top', 'heart', 'base']) {
    const tally = {};
    for (const x of notes) if (x.id && x.t === t) { const fm = A.ING[x.id].family; tally[fm] = (tally[fm] || 0) + 1; all[fm] = (all[fm] || 0) + w[t]; }
    lead[t] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  const fams = Object.entries(all).sort((a, b) => b[1] - a[1]), sum = fams.reduce((n, [, v]) => n + v, 0);
  const steps = [['opens with', 'top'], ['moves into', 'heart'], ['settles into', 'base']].filter(([, t]) => lead[t]).map(([v, t]) => `${v} ${SMELL[t][lead[t]]}`);
  const who = { Women: 'for women', Men: 'for men', Unisex: 'for everyone' }[f.audience] || '';
  const { genre } = A.describe(f);
  return { genre, fams: fams.map(([fm, v]) => ({ fm, p: v / sum })),
    text: `${an(genre).replace(/^./, (c) => c.toUpperCase())} fragrance ${who}, created by ${f.house} in ${f.year}.${steps.length ? ` It ${listText(steps)}.` : ''}` };
}

// every name a note goes by (ingredient names and the aliases perfume lists use), for guessing and suggestions
let noteIdx = null;
function noteIndex() {
  if (noteIdx) return noteIdx;
  const m = new Map(), add = (k, v) => { const q = norm(k); if (q && !m.has(q)) m.set(q, v); };
  for (const i of INGREDIENTS) { add(i.name, { label: i.name, id: i.id }); for (const part of i.name.split(/\s*[&(),]\s*/)) if (part.length > 2) add(part, { label: i.name, id: i.id }); }
  for (const [k, id] of Object.entries(ALIASES)) if (A.ING[id]) add(k, { label: k.charAt(0).toUpperCase() + k.slice(1), id, alias: true });
  return (noteIdx = m);
}
const words = (x) => [...norm(x.n).split(' '), ...norm(A.ING[x.id].name).split(' ')];
function scentResolve(raw, id) {
  const q = norm(raw || ''), notes = S.notes.filter((x) => x.id), hidden = notes.filter((x) => !S.found.has(x.id));
  if (!q && !id) return null;
  const known = id || noteIndex().get(q)?.id;
  let hit = hidden.find((x) => x.id === known || norm(x.n) === q);
  // a bare word like "rose" or "pepper" counts for a listed note it names ("rose de mai", "pink pepper")
  if (!hit && !id && q.length >= 3 && !q.includes(' ')) hit = hidden.find((x) => words(x).includes(q));
  if (hit) return { hit };
  const had = notes.find((x) => S.found.has(x.id) && (x.id === known || norm(x.n) === q || (!id && words(x).includes(q))));
  if (had) return { already: had };
  if (!known) return { unknown: q };
  if (S.tried.includes(known)) return { repeat: known };
  return { miss: known };
}

function scentOpen(daily, fid) {
  clearInterval(timer); clearPins(); vignette?.stop(); vignette = null; fxItems = [];
  const d = today(), pool = scentPool();
  const f = daily ? scentOf(d) : FRAGRANCES.find((x) => x.id === fid) || (() => { const others = pool.filter((x) => x !== scentOf(d) && x.id !== S?.f?.id); return others[Math.floor(Math.random() * others.length)]; })();
  S = { kind: 'scent', phase: 'scent', daily, date: d, f, notes: scentNotes(f), found: new Set(), tried: [], hints: [], level: {}, target: null, lives: SCENT_LIVES, log: [], last: null, intro: true };
  const saved = daily && store.get(`scent:${d}`);
  if (saved?.id === f.id) for (const e of saved.log) scentApply(e, true);
  if (saved?.over) S.phase = 'done';
  A.setHash(daily ? 'play-daily' : 'play');
  A.setTint(A.fragHex(f));
  A.play.ver++; A.refresh();
  if (S.phase === 'done') scentFinish(true);
  else { scentRender(); scentPins(null); scentLinks(null); A.flyTo([24, 20], 1); showSplash(`<span class="mono">${daily ? `Daily scent · ${dayLabel(d)}` : 'Practice scent'}</span><b>${A.esc(f.name)} <span class="g-sp-h">${A.esc(f.house)}</span></b>`); }
}
// one guess, live or replayed from today's saved log
function scentApply(e, quiet) {
  const x = S.notes.find((n) => n.id === e.id);
  if (e.hit) { S.found.add(e.id); S.last = { id: e.id, r: e.r, isNew: !!e.isNew }; if (S.target === e.id) S.target = null; }
  else { S.tried.push(e.id); S.lives--; if (S.lives > 0) scentHint(quiet); }
  S.log.push(e);
  if (S.lives <= 0 || S.notes.every((n) => !n.id || S.found.has(n.id))) S.phase = 'done';
  return x;
}
function scentHint(quiet) {
  const hidden = S.notes.filter((x) => x.id && !S.found.has(x.id));
  if (!hidden.length) return;
  // keep hinting at the same note until it is found, starting with the most widely used one left
  let t = hidden.find((x) => x.id === S.target);
  if (!t) { t = hidden.slice().sort((a, b) => A.USES[b.id].length - A.USES[a.id].length)[0]; S.target = t.id; }
  const lv = (S.level[t.id] = (S.level[t.id] || 0) + 1), ing = A.ING[t.id], fam = FAMILIES[ing.family].label.toLowerCase();
  const text = lv === 1 ? `One of the hidden ${t.t} notes is ${an(fam)} note.`
    : lv === 2 ? `That ${fam} note grows in ${region(ing.loc, ing.country)}. The globe has turned to show you where.`
    : lv === 3 ? redact(`Part used: ${ing.part}. How it is made: ${ing.method}.`, ing, true)
    : `It is listed as ${pattern(t.n)}, ${t.n.replace(/[^\p{L}]/gu, '').length} letters starting with ${t.n.charAt(0).toUpperCase()}.`;
  S.hints.push({ id: t.id, lv, text });
  if (!quiet && lv === 2) { A.flyTo(ing.loc, 1.05); const t0 = performance.now() + 900; for (const k of [0, 1, 2]) fxItems.push({ type: 'ripple', loc: ing.loc, t0: t0 + k * 500, color: famHex(ing.family) }); }
}
const pattern = (n) => n.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + '·'.repeat(Math.max(0, [...w].length - 1))).join(' ');

function scentGuess(raw, id) {
  if (S?.kind !== 'scent' || S.phase !== 'scent') return;
  const res = scentResolve(raw, id), say = gameEl.querySelector('[data-sc-say]'), input = gameEl.querySelector('[data-sc-in]');
  scentSug(null);
  if (!res) return;
  const nm = (k) => A.esc(lc(A.ING[k].name));
  if (res.unknown != null) { say.innerHTML = `“${A.esc(raw.trim())}” isn’t a note in the atlas. Pick one from the list as you type.`; say.className = 'g-sc-say'; return; }
  if (res.already) { say.innerHTML = `You already found <b>${A.esc(res.already.n)}</b>.`; say.className = 'g-sc-say'; input.value = ''; return; }
  if (res.repeat) { say.innerHTML = `You already tried <b>${nm(res.repeat)}</b>. That one’s not in it.`; say.className = 'g-sc-say'; input.value = ''; return; }
  input.value = '';
  if (res.hit) {
    const x = res.hit, r = A.facts.draw(x.id), isNew = A.facts.discover(x.id, r), drops = A.facts.earn?.(x.id, r) || 0; A.notes?.collect(x.id);
    scentApply({ id: x.id, hit: 1, r, isNew: isNew ? 1 : 0 });
    const ing = A.ING[x.id], col = A.ingHex(ing), t = performance.now() + 700;
    A.flyTo(ing.loc, 1.5);
    fxItems.push({ type: 'burst', loc: ing.loc, t0: t, color: col, parts: sparks(26) }, { type: 'float', loc: ing.loc, t0: t, text: ing.name, color: col });
    scentPins(x.id); scentLinks(x.id);
    say.innerHTML = `<b>${A.esc(x.n.charAt(0).toUpperCase() + x.n.slice(1))}</b> is in it, ${an(x.t)} note from ${A.esc(ing.country)}. You found ${an(RARITY[r].label.toLowerCase())} fact${isNew ? '' : ' you already had'}${drops ? ` and <b class="g-drops-won">${drops} drops</b> of ${A.esc(x.n)} essence` : ''}.`;
    say.className = 'g-sc-say hit';
  } else {
    scentApply({ id: res.miss, hit: 0 });
    say.innerHTML = S.lives ? `No <b>${nm(res.miss)}</b> in this one. ${S.lives} chance${S.lives === 1 ? '' : 's'} left, and a new hint below.` : `No <b>${nm(res.miss)}</b> in this one, and that was your last chance.`;
    say.className = 'g-sc-say miss';
    const box = gameEl.querySelector('.g-sc-field'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
  }
  if (S.daily) store.set(`scent:${S.date}`, { id: S.f.id, log: S.log, over: S.phase === 'done' }); A.saved?.();
  if (S.phase === 'done') { S.fresh = res.hit?.id; return scentFinish(); }
  if (res.hit) A.milestones?.({ avoid: S.notes.filter((n) => n.id && !S.found.has(n.id)).map((n) => n.id) });
  S.fresh = res.hit?.id; S.justLost = !res.hit; S.freshHint = res.hit ? null : S.hints[S.hints.length - 1]?.id;
  scentUpdate();
  S.fresh = S.justLost = S.freshHint = null;
  if (res.hit) { scentFact(gameEl.querySelector('[data-sc-fact]'), S.last); scentCheer(res.hit.id); } else scentSigh();
  if (!matchMedia('(hover: none)').matches) input.focus();
}
// a found note: a drop of it arcs from the box into its slot, which flips over in a burst of its colour,
// and a puff of the same colour rises off the bottle
function scentCheer(id) {
  const col = A.ingHex(A.ING[id]), chip = gameEl.querySelector(`[data-sc-notes] [data-id="${id}"]`);
  flyDrop(gameEl.querySelector('.g-sc-field input'), chip, col).then(() => { burst(chip, col, { n: 18, spread: 60 }); ring(chip, col, { size: 130 }); });
  mist(gameEl.querySelector('#g-hero'), col, { n: 10, rise: 150, size: 40 });
  replay(gameEl.querySelector('[data-sc-count]'), 'mv-bump');
  replay(gameEl.querySelector('[data-sc-say]'), 'mv-in');
}
// a miss: the lost drop evaporates, the new hint types itself out and its note glows in its family colour
function scentSigh() {
  for (const el of document.querySelectorAll('.g-drops svg.lost')) mist(el, 'rgba(150, 138, 126, .7)', { n: 5, rise: 46, size: 12, at: 0.2 });
  const hint = gameEl.querySelector('.g-sc-hint.new span'); typeOut(hint, { ms: Math.min(1100, hint ? hint.textContent.length * 14 : 0), delay: 250 });
  const chip = gameEl.querySelector('[data-sc-notes] .fresh'); if (chip) setTimeout(() => ring(chip, getComputedStyle(chip).getPropertyValue('--c') || '#888', { size: 70, ms: 1100 }), 350);
  cascade([...gameEl.querySelectorAll('[data-sc-tried] .badge')].slice(-1), { cls: 'mv-pop' });
  replay(gameEl.querySelector('.g-sc-field input'), 'flash');
  replay(gameEl.querySelector('[data-sc-say]'), 'mv-in');
}
function scentGiveUp() {
  if (S?.kind !== 'scent' || S.phase !== 'scent') return;
  S.phase = 'done'; S.gaveUp = true;
  if (S.daily) store.set(`scent:${S.date}`, { id: S.f.id, log: S.log, over: true }); A.saved?.();
  scentFinish();
}
function scentFinish(quiet) {
  S.phase = 'done';
  const total = S.notes.filter((x) => x.id).length, got = S.found.size;
  S.celebrate = !quiet;
  if (S.daily && !quiet) { const s = store.get('scent:streak'); store.set('scent:streak', { last: S.date, n: s?.last === S.date ? s.n : s?.last === prevDay(S.date) ? s.n + 1 : 1 }); A.saved?.(); }
  scentRender();
  if (S.daily && Stats.enabled()) scentWorld();
  if (!quiet) A.milestones?.({ perfect: got === total });
  // every note's origin, with a line from each one you found back to the perfume house
  const home = HOUSES[S.f.house], ings = S.notes.filter((x) => x.id).map((x) => A.ING[x.id]);
  setPins([...(home ? [{ loc: home, kind: 'guess', text: S.f.house, col: A.fragHex(S.f) }] : []),
    ...ings.map((ing) => { const k = ings.filter((x) => S.found.has(x.id) === S.found.has(ing.id)).indexOf(ing), got = S.found.has(ing.id);
      return { loc: ing.loc, kind: 'answer', ing, small: true, missed: !got, pop: !quiet, delay: got ? 400 + k * 220 : 700 + S.found.size * 220 + k * 90 }; })]);
  fxItems = []; const t0 = performance.now() + (quiet ? 0 : 500);
  if (home) {
    const got = ings.filter((ing) => S.found.has(ing.id));
    got.forEach((ing, k) => fxItems.push({ type: 'arc', from: ing.loc, to: home, t0: quiet ? t0 - 2000 : t0 + k * 220, dur: 1000, color: A.ingHex(ing), keep: true, flow: true, phase: k / Math.max(1, got.length) }));
  }
  if (!quiet && got === total) fxItems.push({ type: 'confetti', t0: t0 + 400, parts: confetti(), colors: [A.fragHex(S.f), accent, '#cfae6e', '#d9a3b5', '#8fae8b'] });
  A.flyTo(A.midpoint(ings.map((i) => i.loc).concat(home ? [home] : [])), 0.95);
  if (!quiet) showSplash(`<span class="mono">${got === total ? 'Every note found' : 'Notes found'}</span><b>${got} / ${total}</b>`);
  A.play.ver++; A.refresh();
  // on a small screen the score sits below the bottle, so bring it into view
  if (!quiet) setTimeout(() => { const el = document.querySelector('.g-sc-end'); if (el && el.getBoundingClientRect().top > innerHeight * 0.7) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, 900);
}

function scentChip(x) {
  if (x.given) return `<span class="badge note lab" title="Made from aroma molecules, with no single place of origin, so it is given">${A.esc(x.n)}</span>`;
  const ing = A.ING[x.id];
  const pct = S.phase === 'done' && S.world?.n ? Math.round(100 * (S.world.notes[x.id] || 0) / S.world.n) : null;
  const share = pct == null ? '' : `<em class="g-pct" title="Found by ${pct}% of today’s players">${pct}%</em>`;
  if (S.found.has(x.id)) return `<span class="badge note tinted g-sc-n${S.fresh === x.id ? ' pop' : ''}" data-id="${x.id}" style="--c:${A.ingHex(ing)}"><span class="dot" style="background:${A.ingHex(ing)}"></span>${A.esc(x.n)}${share}</span>`;
  if (S.phase === 'done') return `<span class="badge note g-sc-n missed" data-id="${x.id}" title="Not found"><span class="dot" style="background:${A.ingHex(ing)}"></span>${A.esc(x.n)}${share}</span>`;
  const lv = S.level[x.id] || 0, col = lv ? famHex(ing.family) : '';
  return `<span class="badge note g-sc-n hidden${lv ? ' hinted' : ''}${S.freshHint === x.id ? ' fresh' : ''}" data-id="${x.id}" ${lv ? `style="--c:${col}" title="Hinted: ${FAMILIES[ing.family].label.toLowerCase()}"` : 'title="Hidden note"'}>${lv ? `<span class="dot" style="background:${col}"></span>` : ''}<span class="mono">${lv >= 4 ? A.esc(pattern(x.n)) : '?'}</span></span>`;
}
function scentPyramid() {
  return ['top', 'heart', 'base'].map((t) => { const xs = S.notes.filter((x) => x.t === t); return xs.length ? `<div class="tier"><span class="k">${TIER_NAME[t]}</span><div class="notes">${xs.map(scentChip).join('')}</div></div>` : ''; }).join('');
}
const drop = (on, k, lost) => `<svg viewBox="0 0 24 24" class="${on ? 'on' : lost ? 'lost' : ''}" style="--i:${k}"><path d="M12 2.6c3.4 4.4 6.4 8.1 6.4 11.6a6.4 6.4 0 0 1-12.8 0c0-3.5 3-7.2 6.4-11.6z"/></svg>`;
const scentDrops = () => Array.from({ length: SCENT_LIVES }, (_, k) => drop(k < S.lives, k, S.justLost && k === S.lives)).join('');
const HINT_IC = ['<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>', '<path d="M12 21s6-5.4 6-10.3A6 6 0 0 0 6 10.7C6 15.6 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>', '<path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14zM5 19l7-7"/>', '<path d="M4 7h16M4 12h10M4 17h7"/>'];
function scentHints() {
  return S.hints.length ? S.hints.slice().reverse().map((h, k) => `<div class="g-sc-hint${k === 0 && S.phase === 'scent' ? ' new' : ''}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${HINT_IC[h.lv - 1]}</svg><span>${A.esc(h.text)}</span></div>`).join('')
    : '<p class="g-note muted">Each wrong guess unlocks a hint about a note that is still hidden.</p>';
}
const hintCount = () => (S.hints.length ? `${S.hints.length} of ${SCENT_LIVES - 1}` : 'none yet');
function scentHud() {
  const total = S.notes.filter((x) => x.id).length;
  hud.innerHTML = `<span class="mono muted">${S.daily ? 'Daily scent' : 'Practice scent'}</span><span class="g-hq"><b>${A.esc(S.f.name)}</b> · ${S.found.size} / ${total} notes</span><span class="g-drops" role="img" aria-label="${S.lives} chances left">${scentDrops()}</span>`;
  hud.classList.add('show'); fab.classList.remove('show'); fab.hidden = true;
}
function scentUpdate() {
  const total = S.notes.filter((x) => x.id).length;
  gameEl.querySelector('[data-sc-notes]').innerHTML = scentPyramid();
  gameEl.querySelector('[data-sc-count]').textContent = `${S.found.size} of ${total} found`;
  gameEl.querySelector('[data-sc-lives]').innerHTML = scentDrops();
  gameEl.querySelector('[data-sc-lives]').setAttribute('aria-label', `${S.lives} chances left`);
  gameEl.querySelector('[data-sc-hints]').innerHTML = scentHints();
  gameEl.querySelector('[data-sc-hcount]').textContent = hintCount();
  gameEl.querySelector('[data-sc-tried]').innerHTML = scentTried();
  scentHud(); scentHero();
}
const scentTried = () => (S.tried.length ? `<span class="mono muted">Not in it</span>${S.tried.map((id) => `<span class="badge note g-sc-n no">${A.esc(A.ING[id].name)}</span>`).join('')}` : '');
function scentFact(slot, c) { if (slot && c) A.facts.mount(slot, c.id, c.r, { isNew: c.isNew }); }
// the bottle, with the last few notes you found floating around it
function scentHero() {
  const hero = gameEl.querySelector('#g-hero'), host = hero?.querySelector('.model'); if (!host) return;
  const f = S.f, found = S.log.filter((e) => e.hit).map((e) => A.ING[e.id]).slice(-3).reverse();
  A.getStage().then((st) => {
    if (!st || !host.isConnected) { hero.classList.add('no-3d'); return; }
    st.mount(host);
    const sig = A.fragHex(f), dark = A.isDark();
    st.showFragrance(f, A.liquidFor(f), found, dark ? A.mix(sig, '#332c27', 0.8) : A.mix(sig, '#ffffff', 0.88), sig,
      dark ? [A.mix(sig, '#141110', 0.82), A.mix(sig, '#1d1916', 0.72)] : [A.mix(sig, '#fffdfa', 0.84), A.mix(sig, '#f3ede4', 0.7)]);
    requestAnimationFrame(() => hero.classList.add('loaded'));
  });
}
// the opening: the name writes itself in, the categories pop, the profile bar fills family by family
// and the hidden notes are dealt out tier by tier; the end: the score counts up and the missed notes turn over
function scentChoreo() {
  const q = (sel) => gameEl.querySelectorAll(sel), intro = S.intro, end = S.celebrate;
  S.intro = S.celebrate = false; S.fresh = null;
  if (intro) {
    letters(gameEl.querySelector('.g-scent .body .title'), { delay: 120, step: 34 });
    cascade(q('.g-scent .detail-top .g-drops svg'), { cls: 'mv-drip', step: 90, delay: 250 });
    cascade(q('.g-scent .body > .badges .badge'), { cls: 'mv-pop', step: 60, delay: 380 });
    cascade(q('.g-sc-prof i'), { cls: 'mv-grow', step: 110, delay: 560 });
    cascade(q('.g-scent .body > .prose, .g-scent .body > .section-h'), { step: 90, delay: 640 });
    cascade(q('[data-sc-notes] .badge'), { cls: 'mv-deal', step: 45, delay: 820, max: 30 });
    cascade(q('.g-sc-guess, .g-sc-hints, .g-sc-tried, .g-sc-quit'), { step: 90, delay: 1150 });
  }
  if (end) {
    countTo(gameEl.querySelector('.g-big [data-n]'), { ms: 900, delay: 250 });
    letters(gameEl.querySelector('.g-sc-end .title'), { delay: 300, step: 30 });
    cascade(q('.g-sc-end .prose, .g-sc-end .g-meter, .g-sc-end .g-note'), { step: 120, delay: 500 });
    cascade(q('[data-sc-notes] .missed'), { cls: 'mv-deal', step: 70, delay: 700, max: 20 });
    cascade(q('.g-sc-cards .badge'), { cls: 'mv-pop', step: 60, delay: 900 });
    const all = S.found.size === S.notes.filter((x) => x.id).length, col = A.fragHex(S.f);
    if (all) setTimeout(() => { for (const el of q('[data-sc-notes] .badge')) { const ing = A.ING[el.dataset.id]; burst(el, ing ? A.ingHex(ing) : col, { n: 8, spread: 36, stars: 3 }); } }, 700);
    setTimeout(() => mist(gameEl.querySelector('#g-hero'), col, { n: all ? 16 : 8, rise: 170, size: 46 }), 200);
  }
}
function scentShare() {
  const total = S.notes.filter((x) => x.id).length;
  return `Fraguessr ${S.daily ? `daily scent · ${dayLabel(S.date)}` : 'practice scent'}\n${S.f.name}, ${S.f.house}: ${S.found.size}/${total} notes\n${S.log.map((e) => (e.hit ? '🟩' : '🟥')).join('')}\n${'💧'.repeat(S.lives)}${'▫️'.repeat(SCENT_LIVES - S.lives)}`;
}
// ── everyone today: shared counts from other players, once Firebase is set up (stats.js) ──
async function scentWorld() {
  const s0 = S, date = S.date;
  if (store.get('scent:sent') !== date && await Stats.submit(date, [...S.found])) store.set('scent:sent', date);
  const w = await Stats.load(date);
  if (S !== s0) return;
  S.world = w && w.n ? w : null;
  const el = gameEl.querySelector('[data-sc-world]'); if (!el) return;
  el.outerHTML = worldHtml();
  gameEl.querySelector('[data-sc-notes]').innerHTML = scentPyramid();
  if (S.world) { cascade(gameEl.querySelectorAll('.g-hist i'), { cls: 'mv-pop', step: 40, delay: 100 }); cascade(gameEl.querySelectorAll('.g-pct'), { cls: 'mv-pop', step: 50, delay: 300 }); }
}
function worldHtml() {
  const w = S.world;
  if (w === undefined) return '<div class="g-sc-world wait" data-sc-world><span class="mono">Everyone today</span><p>Counting today’s players…</p></div>';
  if (!w) return '';
  const ids = S.notes.filter((x) => x.id).map((x) => x.id), total = ids.length, mine = S.found.size, n = w.n;
  const at = (k) => w.score[k] || 0, below = ids.reduce((a, _, k) => a + (k < mine ? at(k) : 0), 0), top = Math.max(1, ...Array.from({ length: total + 1 }, (_, k) => at(k)));
  const share = (id) => (w.notes[id] || 0) / n, name = (id) => A.esc(S.notes.find((x) => x.id === id).n);
  const rarest = [...S.found].sort((a, b) => share(a) - share(b))[0], hardest = ids.slice().sort((a, b) => share(a) - share(b))[0];
  const lines = [n === 1 ? 'You are the first to finish today’s scent.' : `<b>${n.toLocaleString()}</b> players have finished today’s scent. You found more notes than <b>${Math.round(100 * below / n)}%</b> of them.`];
  if (n > 1 && rarest) lines.push(`Your rarest find was <b>${name(rarest)}</b>, found by ${Math.round(100 * share(rarest))}% of players.`);
  if (n > 1 && hardest && hardest !== rarest) lines.push(`The hardest note today is <b>${name(hardest)}</b>, found by ${Math.round(100 * share(hardest))}%.`);
  return `<div class="g-sc-world" data-sc-world><span class="mono">Everyone today</span>
    <div class="g-hist" role="img" aria-label="How many notes players found">${Array.from({ length: total + 1 }, (_, k) => `<i class="${k === mine ? 'me' : ''}" style="--h:${at(k) / top}" title="${at(k)} player${at(k) === 1 ? '' : 's'} found ${k}"><b></b><span>${k}</span></i>`).join('')}</div>
    ${lines.map((l) => `<p>${l}</p>`).join('')}</div>`;
}
function scentRender() {
  const f = S.f, prof = scentProfile(f, S.notes), total = S.notes.filter((x) => x.id).length, done = S.phase === 'done';
  const got = S.found.size, [, verdict, line] = VERDICT.find(([p]) => got / total >= p - 1e-9), streak = store.get('scent:streak');
  const until = Math.max(1, Math.ceil((Date.parse(S.date) + 864e5 - Date.now()) / 6e4)), cards = S.log.filter((e) => e.hit);
  gameEl.innerHTML = `
    <div class="game g-scent">
      <div class="detail-top"><button class="btn icon ghost" data-act="exit" aria-label="Back to the atlas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        <div class="crumbs"><span>Fraguessr</span><span>/</span><b>${S.daily ? `Daily scent · ${dayLabel(S.date)}` : 'Practice scent'}</b></div>
        <span class="g-drops g-total" data-sc-lives role="img" aria-label="${S.lives} chances left">${scentDrops()}</span></div>
      <div class="hero frag" id="g-hero"><div class="model"></div><span class="badge glass tag mono">${A.esc(f.house)} · ${f.year}</span><span class="badge glass tag2 mono">Drag to turn</span></div>
      <div class="body">
        <div><span class="mono g-kicker">${S.daily ? 'Today’s scent' : 'Practice scent'}</span><h2 class="title">${A.esc(f.name)}</h2><div class="latin" style="font-style:normal">${A.esc(f.house)} · ${f.year} · ${A.esc(f.perfumer)}</div></div>
        <div class="badges"><span class="badge accent" style="text-transform:capitalize">${A.esc(prof.genre)}</span>${prof.fams.slice(0, 3).map(({ fm }) => `<span class="badge"><span class="dot" style="background:${famHex(fm)}"></span>${FAMILIES[fm].label}</span>`).join('')}<span class="badge soft">${A.esc(f.audience === 'Unisex' ? 'Unisex' : f.audience === 'Men' ? 'Masculine' : 'Feminine')}</span><span class="badge soft">${Math.floor(f.year / 10) * 10}s</span></div>
        <div class="g-sc-prof" role="img" aria-label="Scent profile: ${prof.fams.map(({ fm, p }) => `${FAMILIES[fm].label} ${Math.round(p * 100)}%`).join(', ')}">${prof.fams.map(({ fm, p }) => `<i style="--c:${famHex(fm)};--p:${p}" title="${FAMILIES[fm].label} ${Math.round(p * 100)}%"></i>`).join('')}</div>
        <p class="prose">${A.esc(prof.text)}</p>
        ${done ? `<div class="g-sc-end">
          <div class="g-sc-score"><div class="g-big mono"><b data-n>${got}</b><span>/${total}</span></div><div><h2 class="title">${verdict}</h2><p class="prose">${line}</p></div></div>
          <div class="g-meter"><i style="--p:${got / total}"></i></div>
          ${S.daily && Stats.enabled() ? worldHtml() : ''}
          <p class="g-note muted">${S.daily ? `${streak?.last === S.date && streak.n > 1 ? `${streak.n}-day streak. ` : ''}Today’s scent is played. The next one arrives in ${until >= 60 ? `${Math.floor(until / 60)} h ` : ''}${until % 60} min.` : 'Practice scents don’t count toward the daily streak.'}</p>
          ${(() => { const n = A.nextMilestone?.(); return n ? `<div class="g-sc-next"><span class="mono">Next milestone</span><b>${A.esc(n.name)}</b><span>${A.esc(n.goal)} · ${n.have.toLocaleString()} of ${n.need.toLocaleString()} · pays a bonus ${n.reward} fact</span><i style="--p:${Math.round(100 * n.have / n.need)}%"></i></div>` : ''; })()}
        </div>` : ''}
        <div class="section-h"><span>Notes</span><span class="mono muted" data-sc-count>${got} of ${total} found</span></div>
        <div class="pyramid" data-sc-notes>${scentPyramid()}</div>
        ${done ? '' : `<div class="g-sc-guess">
          <div class="g-sc-field"><input data-sc-in placeholder="Name a note, like bergamot" autocomplete="off" spellcheck="false" enterkeyhint="go" role="combobox" aria-expanded="false" aria-controls="g-sc-sug" aria-label="Guess a note"><button class="btn primary" data-act="scent-guess">Guess</button>
            <div class="g-sc-sug" id="g-sc-sug" role="listbox" hidden></div></div>
          <p class="g-sc-say" data-sc-say aria-live="polite">${S.log.length ? '' : `${total} notes to find and ${SCENT_LIVES} chances. Each one you name deals one of its fun facts.`}</p>
        </div>`}
        <div class="g-sc-fact" data-sc-fact></div>
        ${done ? `${cards.length ? `<div class="section-h"><span>Facts from today</span><span class="mono muted">${A.facts.count().toLocaleString()} / ${A.facts.total.toLocaleString()} collected</span></div>
          <div class="notes g-sc-cards">${cards.map((c) => `<button class="badge note g-sc-card${c.id === S.last?.id ? ' on' : ''}" data-act="scent-fact" data-id="${c.id}" data-r="${c.r}" style="--r:${RARITY[c.r].col}"><span class="fc-pips">${'<i></i>'.repeat(RARITY[c.r].pips)}</span>${A.esc(A.ING[c.id].name)}</button>`).join('')}</div>` : ''}
          <div class="section-h"><span>About ${A.esc(f.name)}</span></div><p class="prose">${A.esc(A.describe(f).text)}</p>
          <div class="g-share"><code id="g-sharetext">${A.esc(scentShare())}</code></div>
          <div class="g-actions"><button class="btn" data-act="scent-share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Copy result</button>
            <button class="btn primary" data-act="collection">See your collection</button></div>
          <button class="btn ghost" data-act="exit">Back to the atlas</button>`
        : `<div class="section-h"><span>Hints</span><span class="mono muted" data-sc-hcount>${hintCount()}</span></div>
          <div class="g-sc-hints" data-sc-hints>${scentHints()}</div>
          <div class="g-sc-tried notes" data-sc-tried>${scentTried()}</div>
          <button class="btn ghost g-sc-quit" data-act="scent-giveup">Give up and reveal the notes</button>`}
      </div>
    </div>`;
  gameEl.scrollTop = 0;
  enter(gameEl.querySelector('.game')); enter(gameEl.querySelector('.body'));
  scentChoreo();
  scentHud(); scentHero();
  scentFact(gameEl.querySelector('[data-sc-fact]'), S.last);
  const input = gameEl.querySelector('[data-sc-in]');
  if (input) {
    input.addEventListener('input', () => scentSug(input.value));
    input.addEventListener('click', () => scentSug(input.value));
    input.addEventListener('keydown', scentKeys);
    gameEl.querySelector('.g-sc-sug').addEventListener('pointerdown', (e) => e.preventDefault());
    input.addEventListener('blur', () => setTimeout(() => { if (!gameEl.contains(document.activeElement) || document.activeElement !== input) scentSug(null); }, 150));
  }
}
// suggestions: tapping the empty box lists every note A to Z; typing narrows it to every note with a name or word that starts with it, still A to Z
function scentSug(q) {
  const box = gameEl.querySelector('.g-sc-sug'), input = gameEl.querySelector('[data-sc-in]'); if (!box) return;
  const close = () => { box.hidden = true; box.innerHTML = ''; input?.setAttribute('aria-expanded', 'false'); };
  if (q == null) return close();
  const n = norm(q), byId = new Map();
  if (!n) for (const i of INGREDIENTS) byId.set(i.id, { label: i.name, id: i.id });
  else for (const [k, v] of noteIndex()) {
    if (!(k.startsWith(n) || k.split(' ').some((w) => w.startsWith(n)))) continue;
    // one row per note: its own name when that matches, otherwise the first matching other name
    const had = byId.get(v.id);
    if (!had || (had.alias && (!v.alias || v.label.localeCompare(had.label) < 0))) byId.set(v.id, v);
  }
  const out = [...byId.values()].sort((x, y) => x.label.localeCompare(y.label, 'en', { sensitivity: 'base' }));
  if (!out.length) return close();
  // highlight the exact name, else the first name that starts with what was typed, so Enter takes the likeliest note
  const ex = out.findIndex((v) => norm(v.label) === n), pre = out.findIndex((v) => norm(v.label).startsWith(n)), on = !n ? -1 : ex >= 0 ? ex : Math.max(pre, 0);
  let letter = '';
  box.innerHTML = `<div class="g-sc-sh">${n ? `${out.length} ${out.length === 1 ? 'note matches' : 'notes match'}` : `All ${out.length} notes, A to Z`}</div>` + out.map((v, k) => {
    const ing = A.ING[v.id], used = S.tried.includes(v.id) || S.found.has(v.id), l = v.label.charAt(0).toUpperCase();
    const head = !n && l !== letter ? `<div class="g-sc-l" aria-hidden="true">${A.esc((letter = l))}</div>` : '';
    return `${head}<button type="button" role="option" class="${k === on ? 'on' : ''}" data-act="scent-pick" data-id="${v.id}" data-label="${A.esc(v.label)}" ${used ? 'aria-disabled="true"' : ''}><span class="dot" style="background:${A.ingHex(ing)}"></span><span>${A.esc(v.label)}</span>${v.alias && norm(v.label) !== norm(ing.name) ? `<em>${A.esc(ing.name)}</em>` : ''}${used ? `<em>${S.found.has(v.id) ? 'found' : 'tried'}</em>` : ''}</button>`;
  }).join('');
  const opening = box.hidden;
  box.scrollTop = 0; box.hidden = false; input.setAttribute('aria-expanded', 'true');
  box.querySelector('button.on')?.scrollIntoView({ block: 'nearest' });
  // when the list opens past the bottom of the screen, move the box up so the list has room
  if (opening && box.getBoundingClientRect().bottom > innerHeight) box.parentElement.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function scentKeys(e) {
  const box = gameEl.querySelector('.g-sc-sug'), opts = box && !box.hidden ? [...box.querySelectorAll('button')] : [];
  const at = opts.findIndex((o) => o.classList.contains('on'));
  if (e.key === 'ArrowDown' && !opts.length) { e.preventDefault(); scentSug(e.target.value); return; }
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && opts.length) {
    e.preventDefault(); const k = (at + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
    opts.forEach((o, i) => o.classList.toggle('on', i === k)); opts[k].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    // what was typed wins when it names a note exactly ("rose"); otherwise take the highlighted suggestion
    const typed = e.target.value, exact = noteIndex().has(norm(typed)) || scentResolve(typed)?.hit;
    if (!exact && opts[at]) scentGuess(opts[at].dataset.label, opts[at].dataset.id); else scentGuess(typed);
  } else if (e.key === 'Escape' && opts.length) { e.preventDefault(); e.stopPropagation(); scentSug(null); }
}
function scentCard() {
  const d = today(), f = scentOf(d), st = store.get(`scent:${d}`), total = scentSize(f), streak = store.get('scent:streak');
  const done = st?.id === f.id && st.over, started = st?.id === f.id && st.log.length, got = started ? st.log.filter((e) => e.hit).length : 0;
  const live = streak && (streak.last === d || streak.last === prevDay(d)) ? streak.n : 0;
  return `<button class="g-scent-card${done ? ' done' : ''}" data-act="scent" style="--c:${A.fragHex(f)}">
      <span class="g-sc-bottle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="9" width="12" height="12" rx="2.5"/><path d="M10 9V6h4v3M9 3h6"/><path d="M9 15h6" opacity=".6"/></svg></span>
      <span class="g-sc-txt"><span class="mono"><span class="g-live"></span>Daily scent · ${dayLabel(d)}${live > 1 ? ` · ${live}-day streak` : ''}</span>
        <b>${A.esc(f.name)} <em>${A.esc(f.house)}</em></b>
        <span>${done ? `You named ${got} of ${total} notes. See your result.` : started ? `${got} of ${total} notes found so far. Pick up where you left off.` : `Name its ${total} notes with five chances. Every one you find deals a fun fact.`}</span></span>
      <span class="g-sc-go" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg></span>
    </button>`;
}

// ── panel + keys ─────────────────────────────────────────
function onPanelClick(e) {
  const m = e.target.closest('.g-mode');
  if (m) {
    gameEl.querySelectorAll('.g-mode').forEach((x) => x.setAttribute('aria-checked', String(x === m)));
    if (NET?.host && gameEl.querySelector('[data-roomscreen]')) { NET.gm = { ...NET.gm, mode: m.dataset.mode }; store.set('mode', m.dataset.mode); pub({ gm: NET.gm }); }
    return;
  }
  const w = e.target.closest('[data-who]');
  if (w) {
    gameEl.querySelectorAll('[data-who]').forEach((x) => x.setAttribute('aria-selected', String(x === w)));
    gameEl.querySelectorAll('[data-whop]').forEach((x) => { x.hidden = x.dataset.whop !== w.dataset.who; });
    gameEl.querySelector('[data-startlabel]').textContent = WHO[w.dataset.who].start;
    store.set('who', w.dataset.who);
    return;
  }
  const col = e.target.closest('[data-col]');
  if (col) { setMe({ col: col.dataset.col }); gameEl.querySelectorAll('[data-col]').forEach((x) => x.setAttribute('aria-pressed', String(x === col))); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'exit') leave();
  else if (act === 'collection') { leave(); A.collection?.(); }
  else if (act === 'lobby') lobby(S?.mode, S?.mp ? (S.mp.kind === 'local' ? 'local' : 'online') : null);
  else if (act === 'start') start();
  else if (act === 'scent') scentOpen(true);
  else if (act === 'scent-guess') scentGuess(gameEl.querySelector('[data-sc-in]')?.value || '');
  else if (act === 'scent-pick') scentGuess(b.dataset.label, b.dataset.id);
  else if (act === 'scent-giveup') { if (b.dataset.sure) scentGiveUp(); else { b.dataset.sure = '1'; b.textContent = 'Tap again to reveal every note'; } }
  else if (act === 'scent-share') copyText(scentShare(), b, 'Copied', selectShare);
  else if (act === 'scent-fact') { gameEl.querySelectorAll('.g-sc-card').forEach((x) => x.classList.toggle('on', x === b)); S.last = S.log.find((e) => e.hit && e.id === b.dataset.id); scentFact(gameEl.querySelector('[data-sc-fact]'), S.last); }
  else if (act === 'guess') submit();
  else if (act === 'next') advance();
  else if (act === 'again') playAgain();
  else if (act === 'turn') beginTurn();
  else if (act === 'join') { const code = (gameEl.querySelector('[data-code]')?.value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (code.length !== 4) return netNote('Room codes are four letters or numbers.'); enterRoom(code, false); }
  else if (act === 'join-open') enterRoom(b.dataset.code, false);
  else if (act === 'leave-room') { leaveRoom(); lobby(null, 'online'); }
  else if (act === 'start-room') startOnline();
  else if (act === 'to-room') backToRoom();
  else if (act === 'copy-code') copyText(NET?.code || '', b, 'Copied');
  else if (act === 'lp-add') { const ps = localPlayers(); if (ps.length < MAX_LOCAL) { const used = new Set(ps.map((p) => p.col)); ps.push({ nm: `Player ${ps.length + 1}`, col: PLAYER_COLORS.find((c) => !used.has(c)) }); store.set('local', ps); gameEl.querySelector('[data-local]').innerHTML = localRows(); gameEl.querySelector(`[data-lp="${ps.length - 1}"]`)?.focus(); } }
  else if (act === 'lp-del') { const ps = localPlayers(); ps.splice(+b.dataset.k, 1); store.set('local', ps); gameEl.querySelector('[data-local]').innerHTML = localRows(); }
  else if (act === 'clue') { if (S.phase !== 'guess' || +b.dataset.k !== S.clues) return; S.clues++; const c = gameEl.querySelectorAll('.g-clue'); c[S.clues - 1].classList.add('open'); c[S.clues - 1].querySelector('.mono').textContent = 'revealed'; c[S.clues]?.querySelector('button').removeAttribute('disabled'); const w = gameEl.querySelector('.g-max b'); w.textContent = worth(); w.classList.remove('dip'); void w.offsetWidth; w.classList.add('dip'); }
  else if (act === 'share') {
    const t = S.mp ? mpShareText() : shareText(RANKS.find(([n]) => S.total >= n * (S.rounds.length * MAX / 25000))[1]);
    copyText(t, b, 'Copied', selectShare);
  }
}
function copyText(t, b, done, fail) {
  const label = b.lastChild, was = label.textContent;
  const ok = () => { label.textContent = done; setTimeout(() => { if (b.isConnected) label.textContent = was; }, 1600); };
  const p = navigator.clipboard?.writeText(t);
  if (p) p.then(ok, () => fail?.()); else fail?.();
}
function selectShare() { const el = gameEl.querySelector('#g-sharetext'); if (!el) return; const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
function onKey(e) {
  if (e.key === 'Escape') { if (S && S.kind !== 'scent' && S.phase !== 'done') lobby(S.mode); else leave(); return; }
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.closest?.('button, input')) return;
  if (S?.phase === 'guess' && S.guess) { e.preventDefault(); submit(); }
  else if (S?.phase === 'reveal') { e.preventDefault(); advance(); }
  else if (S?.phase === 'pass') { e.preventDefault(); beginTurn(); }
}
// the floating button doubles as "play again" on the results screen
function fabAction() { if (S?.phase === 'guess') submit(); else if (S?.phase === 'reveal') advance(); else if (S?.phase === 'pass') beginTurn(); else if (S?.phase === 'done') playAgain(); }

// ── globe: markers, arcs, pins ───────────────────────────
const RGB = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
function markers() {
  if (!S) return [];
  if (S.kind === 'scent') return S.notes.filter((x) => x.id && (S.found.has(x.id) || S.phase === 'done')).map((x) => { const ing = A.ING[x.id], got = S.found.has(x.id); return { location: ing.loc, size: got ? 0.026 : 0.014, color: got ? RGB(A.ingHex(ing)) : A.isDark() ? [0.45, 0.45, 0.5] : [0.6, 0.6, 0.64] }; });
  const ink = A.isDark() ? [1, 1, 1] : [0.09, 0.09, 0.11];
  const out = [];
  const list = S.phase === 'done' ? S.results : S.phase === 'reveal' ? [S.results[S.i]] : [];
  for (const r of list) { if (r.arrived || S.phase === 'done') out.push({ location: r.ing.loc, size: 0.024, color: RGB(A.ingHex(r.ing)) }); if (r.guess) out.push({ location: r.guess, size: 0.016, color: ink }); }
  if (S.phase === 'guess' && S.guess) out.push({ location: S.guess, size: 0.016, color: ink });
  if (S.mp && S.phase === 'reveal' && S.results[S.i]?.arrived) for (const p of roster()) { const r = p.results[S.i]; if (!p.me && r?.guess) out.push({ location: r.guess, size: 0.014, color: RGB(p.col) }); }
  return out;
}
function arcs() { return []; }
// the daily scent's map: the perfume house, a bead for every note found so far (the newest one named),
// and from each a glowing thread back to the house with a drop of the note's colour travelling along it
function scentPins(fresh) {
  const home = HOUSES[S.f.house];
  setPins([...(home ? [{ loc: home, kind: 'guess', small: !fresh, text: S.f.house, col: A.fragHex(S.f) }] : []),
    ...S.log.filter((e) => e.hit).map((e) => { const ing = A.ING[e.id], now = e.id === fresh; return { loc: ing.loc, kind: 'answer', ing, small: !now, text: now ? ing.name : '', pop: now }; })]);
}
function scentLinks(fresh) {
  const home = HOUSES[S.f.house]; if (!home) return;
  const now = performance.now();
  fxItems = fxItems.filter((it) => !it.link);
  S.log.filter((e) => e.hit).forEach((e, k) => { const ing = A.ING[e.id];
    fxItems.push({ type: 'arc', link: true, flow: true, from: ing.loc, to: home, t0: e.id === fresh ? now + 1250 : now - 2000, dur: 1100, color: A.ingHex(ing), keep: true, phase: (k * 0.37) % 1 }); });
}
function clearPins() { for (const p of pins) p.el.remove(); pins = []; }
function setPins(list) {
  clearPins();
  for (const p of list) {
    const el = document.createElement('div');
    el.className = `g-pin ${p.kind}${p.small ? ' small' : ''}${p.missed ? ' missed' : ''}${p.pop ? ' pop' : ''}`;
    if (p.ing) el.style.setProperty('--pin', p.missed ? (A.isDark() ? '#6f6760' : '#b3aaa0') : A.ingHex(p.ing));
    if (p.delay) el.style.setProperty('--d', `${p.delay}ms`);
    if (p.col) { el.style.setProperty('--pin-lo', p.col); el.style.setProperty('--pin-hi', A.mix(p.col, '#ffffff', 0.3)); }
    const gid = `gpg${++pinSeq}`;
    el.innerHTML = p.kind === 'guess'
      ? `<i class="g-gs"></i><svg viewBox="0 0 24 32" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--pin-hi)"/><stop offset="1" stop-color="var(--pin-lo)"/></linearGradient></defs><path d="M12 31s10-11 10-19A10 10 0 0 0 2 12c0 8 10 19 10 19z" fill="url(#${gid})"/><circle cx="12" cy="12" r="4.2"/></svg>${p.text ? `<span>${A.esc(p.text)}</span>` : ''}`
      : `<i></i><i></i><b></b>${p.text ? `<span>${A.esc(p.text)}</span>` : ''}`;
    A.els.labels.appendChild(el); pins.push({ el, loc: p.loc });
  }
}
function drawPins() {
  for (const p of pins) { const q = A.project(p.loc); p.el.style.transform = `translate(${q.x}px, ${q.y}px)`; p.el.classList.toggle('hidden', !q.front || q.z < -0.05); }
}


// ── fx layer: arcs, ripples, bursts, confetti, cursor ─────
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const ease = (t) => 1 - Math.pow(1 - t, 3);
const toV = ([lat, lng]) => { const a = lat * Math.PI / 180, b = lng * Math.PI / 180; return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]; };
const toLL = ([x, y, z]) => [Math.asin(Math.max(-1, Math.min(1, z))) * 180 / Math.PI, Math.atan2(y, x) * 180 / Math.PI];
function slerp(a, b, t, w) {
  if (w < 1e-6) return a;
  const s = Math.sin(w), p = Math.sin((1 - t) * w) / s, q = Math.sin(t * w) / s;
  return [a[0] * p + b[0] * q, a[1] * p + b[1] * q, a[2] * p + b[2] * q];
}
function sparks(n) {
  return Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2 + Math.random() * 0.4, v = 60 + Math.random() * 110; return { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, r: 1.2 + Math.random() * 2 }; });
}
function confetti() {
  return Array.from({ length: 120 }, () => ({ x: Math.random(), y: -0.1 - Math.random() * 0.3, vy: 0.25 + Math.random() * 0.35, sway: Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, c: Math.floor(Math.random() * 8) }));
}
function frame() {
  drawPins();
  if (!fx) return;
  const st = A.els.stage, W = st.clientWidth, H = st.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (fx.width !== Math.round(W * dpr) || fx.height !== Math.round(H * dpr)) { fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr); }
  const c = fctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const now = performance.now(), still = calm.matches;
  // callbacks (an arc landing) can add items mid-pass; collect those separately so none are lost
  const items = fxItems; fxItems = [];
  const kept = items.filter((it) => {
    const e = now - it.t0;
    if (e < 0) return true;
    switch (it.type) {
      case 'arc': {
        const t = still ? 1 : Math.min(1, e / it.dur), k = ease(t);
        const a = toV(it.from), b = toV(it.to), w = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
        const lift = Math.min(0.1, w * 0.07), N = 48, at = (s) => A.project(toLL(slerp(a, b, s, w)), 0.01 + Math.sin(Math.PI * s) * lift);
        c.lineWidth = it.faint ? 1.2 : it.flow ? 1.8 : 2; c.lineCap = 'round'; c.strokeStyle = it.color; c.setLineDash(it.faint ? [2, 5] : []);
        c.shadowColor = it.color; c.shadowBlur = it.faint ? 0 : 8; c.globalAlpha = it.flow && t >= 1 ? 0.7 : 1;
        c.beginPath(); let pen = false, head = null;
        for (let i = 0; i <= N; i++) {
          const s = (i / N) * k, q = at(s);
          if (!q.front) { pen = false; continue; }
          pen ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); pen = true; head = q;
        }
        c.stroke(); c.shadowBlur = 0; c.globalAlpha = 1; c.setLineDash([]);
        // once drawn, a drop of the note keeps travelling down the thread to the house, fading in and out at the ends
        if (it.flow && t >= 1 && !still) {
          const u = ((now / 2600 + (it.phase || 0)) % 1), q = at(u);
          if (q.front) {
            c.globalAlpha = Math.min(1, Math.sin(Math.PI * u) * 1.6);
            c.fillStyle = it.color; c.shadowColor = it.color; c.shadowBlur = 12;
            c.beginPath(); c.arc(q.x, q.y, 3.2, 0, 7); c.fill(); c.shadowBlur = 0;
            c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(q.x, q.y, 1.3, 0, 7); c.fill(); c.globalAlpha = 1;
          }
        }
        if (head && t < 1) { c.fillStyle = it.color; c.beginPath(); c.arc(head.x, head.y, 4, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(head.x, head.y, 1.6, 0, 7); c.fill(); }
        if (t >= 1 && it.done) { const d = it.done; it.done = null; d(); }
        return t < 1 || it.keep;
      }
      case 'ripple': {
        const t = e / 900; if (t >= 1 || still) return false;
        const q = A.project(it.loc); if (!q.front) return true;
        for (const off of [0, 0.25]) { const u = t - off; if (u <= 0) continue; c.globalAlpha = (1 - u) * 0.8; c.strokeStyle = it.color; c.lineWidth = 2 * (1 - u) + 0.5; c.beginPath(); c.arc(q.x, q.y, 6 + ease(u) * 34, 0, 7); c.stroke(); }
        c.globalAlpha = 1; return true;
      }
      case 'burst': {
        const t = e / 1100; if (t >= 1 || still) return false;
        const q = A.project(it.loc); if (!q.front) return true;
        const s = e / 1000; c.fillStyle = it.color;
        for (const p of it.parts) { c.globalAlpha = 1 - t; c.beginPath(); c.arc(q.x + p.vx * s * (1 - s * 0.4), q.y + p.vy * s + 160 * s * s, p.r * (1 - t * 0.5), 0, 7); c.fill(); }
        c.globalAlpha = 1 - t; c.strokeStyle = it.color; c.lineWidth = 2; c.beginPath(); c.arc(q.x, q.y, 10 + ease(Math.min(1, t * 1.6)) * 46, 0, 7); c.stroke();
        c.globalAlpha = 1; return true;
      }
      case 'float': {
        const t = e / 1500; if (t >= 1) return false;
        const q = A.project(it.loc); if (!q.front) return true;
        const y = q.y - 26 - ease(t) * 34;
        c.globalAlpha = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
        c.font = '600 15px Inter, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 4; c.strokeStyle = A.isDark() ? 'rgba(9,9,11,.85)' : 'rgba(255,255,255,.92)'; c.strokeText(it.text, q.x, y);
        c.fillStyle = it.color; c.fillText(it.text, q.x, y); c.globalAlpha = 1; return true;
      }
      case 'label': {
        const t = Math.min(1, e / 450); if (S?.phase !== 'reveal' && S?.phase !== 'done') return false;
        const a = toV(it.from), b = toV(it.to), w = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
        const q = A.project(toLL(slerp(a, b, 0.5, w)), 0.01 + Math.min(0.1, w * 0.07)); if (!q.front) return true;
        c.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        const tw = c.measureText(it.text).width + 18, y = q.y - 4 - (1 - ease(t)) * 8;
        c.globalAlpha = ease(t); c.fillStyle = it.color; c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 8; c.shadowOffsetY = 2;
        c.beginPath(); c.roundRect(q.x - tw / 2, y - 11, tw, 22, 11); c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0;
        c.fillStyle = '#fff'; c.fillText(it.text, q.x, y + 0.5); c.globalAlpha = 1; return true;
      }
      case 'confetti': {
        const t = e / 2600; if (t >= 1 || still) return false;
        const s = e / 1000; c.globalAlpha = t > 0.75 ? (1 - t) / 0.25 : 1;
        for (const p of it.parts) {
          const x = (p.x + Math.sin(s * 2 + p.sway) * 0.02) * W, y = (p.y + p.vy * s + 0.12 * s * s) * H;
          c.save(); c.translate(x, y); c.rotate(p.rot + p.vr * s); c.scale(1, Math.cos(s * 6 + p.sway)); c.fillStyle = it.colors[p.c % it.colors.length]; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore();
        }
        c.globalAlpha = 1; return true;
      }
    }
    return false;
  });
  fxItems = kept.concat(fxItems);
  if (S?.phase === 'guess' && mouse && !(matchMedia('(hover: none)').matches)) {
    const ll = A.unproject(mouse[0], mouse[1]);
    if (ll) {
      const [x, y] = mouse, r = 14 + Math.sin(now / 260) * 1.5;
      c.strokeStyle = accent; c.lineWidth = 1.5; c.setLineDash([4, 4]); c.lineDashOffset = -now / 60;
      c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(x - r - 6, y); c.lineTo(x - r + 4, y); c.moveTo(x + r - 4, y); c.lineTo(x + r + 6, y); c.moveTo(x, y - r - 6); c.lineTo(x, y - r + 4); c.moveTo(x, y + r - 4); c.lineTo(x, y + r + 6); c.stroke();
      const txt = `${Math.abs(ll[0]).toFixed(1)}°${ll[0] >= 0 ? 'N' : 'S'}  ${Math.abs(ll[1]).toFixed(1)}°${ll[1] >= 0 ? 'E' : 'W'}`;
      c.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace'; c.textAlign = 'left'; c.textBaseline = 'middle';
      const tw = c.measureText(txt).width, bx = x + r + 10, by = y + r + 4;
      c.fillStyle = A.isDark() ? 'rgba(24,24,27,.86)' : 'rgba(255,255,255,.9)'; c.beginPath(); c.roundRect(bx - 6, by - 10, tw + 12, 20, 6); c.fill();
      c.fillStyle = A.isDark() ? '#e7e0d6' : '#4a413a'; c.fillText(txt, bx, by);
    }
  }
}

// ── multiplayer ──────────────────────────────────────────
// Two ways to play together. Same device: up to four players take turns on each round, passing the device,
// and every pin lands together at the end of the round. Online: a room with a four-letter code. Everything
// travels in presence, so anyone who can open the page can play: each player shares a name, a colour and
// their pins, the host also shares the game (seed, mode, round, phase), and every page scores everyone
// from the same seed. If the host leaves, the next player in the room picks the game up where it was.
const WHO = {
  solo: { label: 'Solo', start: `Start ${ROUNDS} rounds`, icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>' },
  online: { label: 'Online room', start: 'Create a room', icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>' },
  local: { label: 'Same device', start: 'Start pass and play', icon: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/>' },
};
const PLAYER_COLORS = ['#c4513f', '#0090ff', '#4f8f63', '#8e4ec6', '#f76b15', '#12a594', '#d6409f', '#e2a336'];
const NICK_A = ['Amber', 'Neroli', 'Vetiver', 'Iris', 'Oud', 'Musk', 'Cedar', 'Saffron', 'Jasmine', 'Tonka', 'Vanilla', 'Bergamot', 'Myrrh', 'Mimosa'];
const NICK_B = ['Fox', 'Otter', 'Heron', 'Lynx', 'Moth', 'Wren', 'Hare', 'Finch', 'Koi', 'Ibis', 'Gecko', 'Owl', 'Bee', 'Seal'];
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', MAX_LOCAL = 4, ROOM_RE = /^[A-Z0-9]{4}$/;
const MEDALS = ['🥇', '🥈', '🥉'];
const cleanName = (s, fb) => (String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '').trim().slice(0, 18) || fb);
const cleanColor = (c, k) => (/^#[0-9a-f]{6}$/i.test(c) ? c : PLAYER_COLORS[k % PLAYER_COLORS.length]);
const initial = (nm) => [...nm.trim()][0]?.toUpperCase() || '?';
const pick1 = (a) => a[Math.floor(Math.random() * a.length)];
const newId = () => Math.random().toString(36).slice(2, 10);
const newSeed = () => (Math.random() * 2 ** 32) >>> 0;
const colorDots = (cur) => PLAYER_COLORS.map((c) => `<button class="g-col" data-col="${c}" style="--c:${c}" aria-pressed="${c === cur}" aria-label="Colour ${c}"></button>`).join('');

function myProfile() {
  let p = store.get('me');
  if (!p?.nm) { p = { nm: `${pick1(NICK_A)} ${pick1(NICK_B)}`, col: pick1(PLAYER_COLORS) }; store.set('me', p); }
  return { nm: cleanName(p.nm, 'Player'), col: cleanColor(p.col, 0) };
}
function setMe(patch) {
  const me = { ...myProfile(), ...patch };
  store.set('me', me);
  if (NET) { pub({ nm: me.nm, col: me.col }); paintRoom(); }
}
function onPanelInput(e) {
  const t = e.target;
  if (t.matches('[data-nick]')) { const nm = cleanName(t.value, ''); if (nm) setMe({ nm }); }
  else if (t.matches('[data-code]')) t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  else if (t.matches('[data-lp]')) { const ps = localPlayers(); ps[+t.dataset.lp].nm = t.value.slice(0, 18); store.set('local', ps); }
}

// ── same device ──
function localPlayers() {
  const ps = store.get('local');
  if (Array.isArray(ps) && ps.length >= 2) return ps.slice(0, MAX_LOCAL).map((p, k) => ({ nm: String(p?.nm ?? '').slice(0, 18), col: cleanColor(p?.col, k) }));
  return [{ nm: 'Player 1', col: PLAYER_COLORS[0] }, { nm: 'Player 2', col: PLAYER_COLORS[1] }];
}
function localRows() {
  const ps = localPlayers();
  return ps.map((p, k) => `<div class="g-lp" style="--c:${p.col}"><span class="g-av">${k + 1}</span><input data-lp="${k}" maxlength="18" autocomplete="off" value="${A.esc(p.nm)}" aria-label="Player ${k + 1} name">${ps.length > 2 ? `<button class="btn icon ghost" data-act="lp-del" data-k="${k}" aria-label="Remove player ${k + 1}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` : '<span></span>'}</div>`).join('')
    + (ps.length < MAX_LOCAL ? `<button class="btn ghost g-lpadd" data-act="lp-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Add a player</button>` : '');
}
function startLocal(mode, timed) {
  const players = localPlayers().map((p, k) => ({ nm: cleanName(p.nm, `Player ${k + 1}`), col: p.col, results: [], total: 0 }));
  store.set('timed', timed);
  const seed = newSeed();
  S = rules({ mode, timed, seed, rounds: buildRounds(mode, seed, A.USES), i: -1, results: [], total: 0, mp: { kind: 'local', players, turn: 0 } });
  A.setHash('play-' + mode);
  next();
}
const turnPlayer = () => S.mp.players[S.mp.turn];
function turnSplash() {
  const P = turnPlayer();
  return `<span class="mono">Round ${S.i + 1} of ${S.rounds.length}</span><b><span class="g-sw" style="--c:${P.col}">${A.esc(P.nm)}</span>, your turn</b>`;
}
function turnBanner() {
  if (S.mp?.kind === 'local') {
    const P = turnPlayer();
    return `<div class="g-turn" style="--c:${P.col}"><span class="g-av">${A.esc(initial(P.nm))}</span><b>${A.esc(P.nm)}'s turn</b><span class="mono muted">Player ${S.mp.turn + 1} of ${S.mp.players.length}</span></div>`;
  }
  if (S.mp?.kind === 'online') return `<div class="g-turn room"><span class="g-chips" data-chips>${chipsHtml()}</span><b>Room ${A.esc(NET?.code || '')}</b><span class="mono muted" data-lockcount>${lockCount()}</span></div>`;
  return '';
}
function submitLocal() {
  const P = turnPlayer(), rec = record();
  P.results[S.i] = rec; P.total += rec.points;
  if (S.mp.turn + 1 < S.mp.players.length) return handoff();
  revealAll();
}
// between turns: hide the last pin and cover the round until the next player is holding the device
function handoff() {
  S.phase = 'pass'; clearInterval(timer); clearPins(); fxItems = [];
  vignette?.stop(); vignette = null;
  A.play.ver++; A.refresh();
  A.setTint(null); A.flyTo([20, Math.random() * 360 - 180], 0.9);
  const prev = turnPlayer(), P = S.mp.players[S.mp.turn + 1];
  gameEl.innerHTML = `
    <div class="game">
      <div class="detail-top"><button class="btn icon ghost" data-act="lobby" aria-label="Quit to game menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        <div class="crumbs"><span>Fraguessr</span><span>/</span><b>Round ${S.i + 1} of ${S.rounds.length}</b></div></div>
      <div class="g-pass" style="--c:${P.col}">
        <span class="g-av big">${A.esc(initial(P.nm))}</span>
        <span class="mono muted">Round ${S.i + 1} · player ${S.mp.turn + 2} of ${S.mp.players.length}</span>
        <h2 class="title">Pass to ${A.esc(P.nm)}</h2>
        <p class="prose">${A.esc(prev.nm)} has locked in a guess. No peeking: hand over the device, then start your turn.</p>
        <button class="btn" data-act="turn">I'm ${A.esc(P.nm)}, show my round</button>
        <div class="g-passlist">${S.mp.players.map((q, k) => `<span class="${k <= S.mp.turn ? 'on' : ''}" style="--c:${q.col}"><i>${A.esc(initial(q.nm))}</i>${A.esc(q.nm)}</span>`).join('')}</div>
      </div>
    </div>`;
  enter(gameEl.querySelector('.g-pass'));
  renderHud();
}
function beginTurn() {
  if (S?.phase !== 'pass') return;
  S.mp.turn++; S.phase = 'guess'; S.guess = null; S.clues = S.free; S.left = S.time;
  const R = S.rounds[S.i];
  A.play.ver++; A.refresh();
  A.setTint(A.ingHex(R.ing), R.ing.c);
  A.flyTo([20 + (Math.random() - 0.5) * 30, R.ing.loc[1] + 70 + Math.random() * 140], 1);
  renderRound(); renderHud(); showSplash(turnSplash()); startClock();
}
// everyone has guessed: fly every player's pin to the answer at once
function revealAll() {
  S.phase = 'reveal'; clearInterval(timer);
  const R = S.rounds[S.i], ing = R.ing, ps = S.mp.players, color = A.ingHex(ing);
  const best = ps.reduce((a, p) => (p.results[S.i].points > a.results[S.i].points ? p : a), ps[0]);
  const res = { ing, frag: R.frag, guess: null, km: null, points: best.results[S.i].points, arrived: false };
  S.results[S.i] = res;
  A.play.ver++; A.refresh();
  clearPins(); fxItems = [];
  const now = performance.now(), guessed = ps.filter((p) => p.results[S.i].guess);
  const arrive = () => {
    if (S?.results[S.i] !== res) return;
    const t = performance.now();
    res.arrived = true; A.play.ver++; A.refresh();
    setPins(revealPins(true));
    for (const p of guessed) fxItems.push({ type: 'label', from: p.results[S.i].guess, to: ing.loc, t0: t, text: kmText(p.results[S.i].km), color: p.col });
    fxItems.push({ type: 'burst', loc: ing.loc, t0: t, color, parts: sparks(28) });
    fxItems.push({ type: 'float', loc: ing.loc, t0: t, text: `${best.nm} +${res.points.toLocaleString()}`, color: best.col });
    if (res.points >= 4500) fxItems.push({ type: 'confetti', t0: t, parts: confetti(), colors: [best.col, color, ...ing.c, accent] });
  };
  setPins(guessed.map((p) => ({ loc: p.results[S.i].guess, kind: 'guess', small: true, col: p.col, text: p.nm })));
  let longest = 0;
  guessed.forEach((p, k) => {
    const km = p.results[S.i].km, dur = Math.min(1700, 700 + km / 12);
    longest = Math.max(longest, k * 220 + dur);
    fxItems.push({ type: 'arc', from: p.results[S.i].guess, to: ing.loc, t0: now + 450 + k * 220, dur, color: p.col, keep: true });
  });
  setTimeout(arrive, guessed.length ? 450 + longest : 600);
  const far = Math.max(0, ...guessed.map((p) => p.results[S.i].km));
  A.flyTo(guessed.length ? A.midpoint([...guessed.map((p) => p.results[S.i].guess), ing.loc]) : ing.loc, far < 1200 ? 2.1 : far < 3000 ? 1.5 : far < 7000 ? 1.1 : 0.9);
  const lead = ps.slice().sort((a, b) => b.total - a.total)[0];
  const body = gameEl.querySelector('.body');
  body.innerHTML = `
    <div class="g-board" data-board>${boardHtml()}</div>
    ${ingInfo(ing)}
    <div class="g-cta"><div class="g-max mono">Leading <b>${A.esc(lead.nm)}</b> ${lead.total.toLocaleString()}</div>${nextBtn()}</div>`;
  gameEl.querySelector('.g-q')?.remove();
  gameEl.querySelector('.g-turn')?.remove();
  gameEl.querySelector('.g-total').textContent = `${lead.nm} leads · ${lead.total.toLocaleString()}`;
  const st = gameEl.querySelectorAll('.g-steps i')[S.i]; st?.classList.add('done'); st?.style.setProperty('--q', Math.min(1, res.points / MAX));
  const tag = gameEl.querySelector('#g-hero .tag'); if (tag) tag.textContent = `${ing.place}, ${ing.country}`;
  gameEl.querySelectorAll('.g-brow').forEach((el, k) => el.style.setProperty('--i', k));
  gameEl.scrollTop = 0;
  renderHud();
}

// ── who's in the game, whichever way it is played ──
// { nm, col, me, peer, results: [per round], total }
function roster() {
  if (!S?.mp) return [];
  if (S.mp.kind === 'local') return S.mp.players.map((p) => ({ ...p, me: false, peer: p.nm }));
  return players().map((p) => {
    const results = p.me ? S.results : theirResults(p);
    return { nm: p.nm, col: p.col, me: p.me, peer: p.peer, h: p.h, results, total: results.reduce((a, r) => a + (r?.points || 0), 0) };
  });
}
const lockedNow = (p) => !!p.results[S.i];
function lockCount() { const r = roster(); return `${r.filter(lockedNow).length} of ${r.length} locked in`; }
function chipsHtml() {
  return roster().map((p) => `<i class="${lockedNow(p) ? 'on' : ''}" style="--c:${p.col}" title="${A.esc(p.nm)}">${A.esc(initial(p.nm))}</i>`).join('');
}
function boardHtml() {
  const local = S.mp.kind === 'local';
  const rows = roster().map((p) => ({ ...p, cur: p.results[S.i] })).sort((a, b) => (b.cur ? b.cur.points : -1) - (a.cur ? a.cur.points : -1) || b.total - a.total);
  return `<div class="section-h"><span>${local ? 'This round' : 'The room this round'}</span>${local ? '' : `<span class="mono">${lockCount()}</span>`}</div>
    <div class="g-brd">${rows.map((p, k) => `<div class="g-brow${p.cur ? '' : ' wait'}${p.me ? ' me' : ''}" style="--c:${p.col};--p:${p.cur ? Math.min(1, p.cur.points / MAX) : 0};--i:${k}">
      <span class="g-av">${p.cur && k < 3 && p.cur.points > 0 ? MEDALS[k] : A.esc(initial(p.nm))}</span>
      <span class="g-bn">${A.esc(p.nm)}${p.me ? ' <em>you</em>' : ''}<span class="mono muted">${p.cur ? (p.cur.km == null ? 'no pin' : `${kmText(p.cur.km)}${p.cur.clues ? ` · ${p.cur.clues} hint${p.cur.clues > 1 ? 's' : ''}` : ''}`) : 'still guessing'}</span></span>
      <span class="g-bp mono">${p.cur ? `+${p.cur.points.toLocaleString()}` : '<span class="g-wd"><i></i><i></i><i></i></span>'}</span>
      <span class="g-bt mono">${p.total.toLocaleString()}</span><i class="g-rb"></i></div>`).join('')}</div>`;
}
// who may move the game on, and what the button says
function nextState() {
  const last = S.i + 1 >= S.rounds.length, label = last ? 'See results' : 'Next round';
  if (S.mp?.kind !== 'online') return { ok: true, label };
  if (!NET?.host) return { ok: false, label: `Waiting for ${NET?.hostName || 'the host'}` };
  const r = roster(), n = r.filter(lockedNow).length;
  return { ok: true, label: n < r.length ? `${label} · ${n}/${r.length} in` : label };
}
function nextBtn() {
  const nb = nextState();
  return `<button class="btn primary" data-act="next" ${nb.ok ? '' : 'disabled'}><span>${A.esc(nb.label)}</span>${nb.ok ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>' : ''}</button>`;
}
function advance() {
  if (S?.mp?.kind !== 'online') return next();
  if (!NET?.host) return;
  const gm = NET.gm;
  NET.gm = S.i + 1 < S.rounds.length ? { ...gm, n: S.i + 1 } : { ...gm, ph: 'done' };
  pub({ gm: NET.gm }); onNet();
}
function playAgain() {
  if (S?.mp?.kind === 'online') { if (NET?.host) { NET.gm = { id: newId(), mode: NET.gm.mode, seed: newSeed(), n: 0, ph: 'play' }; pub({ gm: NET.gm }); onNet(); } return; }
  if (S?.mp?.kind === 'local') return startLocal(S.mode, S.timed);
  again();
}
function revealPins(pop) {
  const R = S.rounds[S.i], mine = S.results[S.i], list = [];
  if (!S.mp?.kind || S.mp.kind === 'online') if (mine?.guess) list.push({ loc: mine.guess, kind: 'guess', text: S.mp ? 'You' : 'Your guess' });
  if (S.mp) for (const p of roster()) { const r = p.results[S.i]; if (!p.me && r?.guess) list.push({ loc: r.guess, kind: 'guess', small: true, col: p.col, text: p.nm }); }
  list.push({ loc: R.ing.loc, kind: 'answer', ing: R.ing, text: R.ing.name, pop });
  return list;
}
const othersKey = () => roster().filter((p) => !p.me && p.results[S.i]?.guess).map((p) => p.peer).join(',');

function mpShareText() {
  const ranked = roster().sort((a, b) => b.total - a.total);
  return `Fraguessr · ${MODES[S.mode].label} · ${ranked.length} players\n${ranked.map((p, k) => `${MEDALS[k] || `${k + 1}.`} ${p.nm} ${p.total.toLocaleString()} ${S.rounds.map((_, i) => square(p.results[i]?.points || 0)).join('')}`).join('\n')}`;
}
function standings() {
  S.phase = 'done'; clearInterval(timer);
  vignette?.stop(); vignette = null;
  A.setTint(null);
  const online = S.mp.kind === 'online', max = S.rounds.length * MAX;
  const ranked = roster().sort((a, b) => b.total - a.total), win = ranked[0];
  const tie = ranked.length > 1 && ranked[1].total === win.total;
  setPins(S.rounds.map((R) => ({ loc: R.ing.loc, kind: 'answer', ing: R.ing, text: R.ing.name })));
  fxItems = []; const t0 = performance.now() + 500;
  fxItems.push({ type: 'confetti', t0, parts: confetti(), colors: [win.col, accent, '#4f8f63', '#e2a336', '#8e4ec6'] });
  showSplash(`<span class="mono">${tie ? 'Final scores' : 'Winner'}</span><b>${tie ? "It's a tie" : `<span class="g-sw" style="--c:${win.col}">${A.esc(win.nm)}</span>`}</b>`);
  A.play.ver++; A.refresh();
  A.flyTo(A.midpoint(S.rounds.map((R) => R.ing.loc)), 0.95);
  hud.innerHTML = `<span class="mono muted">${online ? `Room ${A.esc(NET?.code || '')}` : 'Pass and play'}</span><span class="g-hq">${tie ? 'A tie at' : `<b>${A.esc(win.nm)}</b> wins with`} ${win.total.toLocaleString()}</span>`;
  const host = !online || NET?.host;
  fab.textContent = host ? 'Play again' : `Waiting for ${NET?.hostName || 'the host'}`; fab.disabled = !host; fab.classList.toggle('ready', host);
  const pod = [ranked[1], ranked[0], ranked[2]];
  gameEl.innerHTML = `
    <div class="game">
      <div class="detail-top"><button class="btn icon ghost" data-act="lobby" aria-label="Back to game menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <div class="crumbs"><span>Fraguessr</span><span>/</span><b>Standings</b></div></div>
      <div class="g-final">
        <span class="mono muted">${MODES[S.mode].label} · ${ranked.length} players · ${online ? `Room ${A.esc(NET?.code || '')}` : 'Same device'}</span>
        <h2 class="title">${tie ? "It's a tie!" : `${A.esc(win.nm)} wins`}</h2>
        <div class="g-podium">${pod.map((p, k) => p ? `<div class="g-pod" style="--c:${p.col};--h:${[64, 92, 48][k]}px;--d:${[0.25, 0.05, 0.45][k]}s"><span class="g-av${k === 1 ? ' big' : ''}">${A.esc(initial(p.nm))}</span><b>${A.esc(p.nm)}</b><span class="mono g-pp" data-count="${p.total}">0</span><i class="g-step">${[2, 1, 3][k]}</i></div>` : '<div class="g-pod empty"></div>').join('')}</div>
      </div>
      <div class="body">
        <div class="g-table">${ranked.map((p, k) => `
          <div class="g-row" style="--c:${p.col};--i:${k}"><span class="g-n mono">${k + 1}</span><span class="dot" style="background:${p.col}"></span>
            <span class="g-nm">${A.esc(p.nm)}${p.me ? ' <em class="g-you">you</em>' : ''}<span class="g-sq">${S.rounds.map((_, i) => square(p.results[i]?.points || 0)).join('')}</span></span>
            <span class="g-km mono">${Math.round(p.total / S.rounds.length).toLocaleString()} avg</span><span class="g-p mono">${p.total.toLocaleString()}</span>
            <i class="g-rb" style="--p:${Math.min(1, p.total / max)}"></i></div>`).join('')}</div>
        <div class="section-h"><span>The answers</span></div>
        <div class="g-table">${S.rounds.map((R, i) => { const b = ranked.slice().sort((x, y) => (y.results[i]?.points || 0) - (x.results[i]?.points || 0))[0]; return `
          <div class="g-row" style="--c:${A.ingHex(R.ing)}"><span class="g-n mono">${i + 1}</span><span class="dot" style="background:${A.ingHex(R.ing)}"></span>
            <span class="g-nm">${A.esc(R.ing.name)}<span>${R.frag ? `${A.esc(R.frag.name)} · ` : ''}${A.esc(R.ing.place)}, ${A.esc(R.ing.country)}</span></span>
            <span class="g-km mono" style="color:${b.col}">${A.esc(b.nm)}</span><span class="g-p mono">${(b.results[i]?.points || 0).toLocaleString()}</span></div>`; }).join('')}</div>
        <div class="g-share"><code id="g-sharetext">${A.esc(mpShareText())}</code></div>
        <div class="g-actions">
          <button class="btn" data-act="share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg><span>Copy result</span></button>
          ${host ? `<button class="btn primary" data-act="again"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg><span>Play again</span></button>` : `<button class="btn" disabled><span>Waiting for ${A.esc(NET?.hostName || 'the host')}</span></button>`}
        </div>
        ${online ? (NET?.host ? '<button class="btn ghost" data-act="to-room">Back to the room</button>' : '<button class="btn ghost" data-act="leave-room">Leave the room</button>') : '<button class="btn ghost" data-act="lobby">Back to the game menu</button>'}
      </div>
    </div>`;
  gameEl.querySelectorAll('.g-pp').forEach(countUp);
  gameEl.scrollTop = 0;
  enter(gameEl.querySelector('.game')); enter(gameEl.querySelector('.g-table')); enter(gameEl.querySelector('.body'));
}

// ── online rooms ──
let roomP = null, NET = null, lobUnsub = null, adKey = '';
const getRoom = () => (roomP ||= Promise.resolve().then(() => window.claude?.use?.('room') ?? null).catch(() => null));
function netNote(msg) { const el = gameEl.querySelector('[data-netnote]'); if (el) { el.textContent = msg; el.hidden = !msg; } }
// the lobby lights up the online panel once the room answers, and lists rooms other people have open
function lightOnline() {
  getRoom().then((lob) => {
    if (!gameEl.querySelector('[data-whop="online"]')) return;
    if (!lob) {
      netNote('Online rooms aren’t available on this site yet. Same device play works anywhere.');
      gameEl.querySelectorAll('[data-whop="online"] input, [data-whop="online"] [data-act="join"]').forEach((x) => { x.disabled = true; });
      gameEl.querySelector('[data-whop="online"]').classList.add('off');
      return;
    }
    netNote('');
    lobUnsub ||= lob.onPeers(() => paintOpen(), () => {});
    paintOpen();
  });
}
function paintOpen() {
  const el = gameEl?.querySelector('[data-open]'); if (!el) return;
  getRoom().then((lob) => {
    if (!lob || !el.isConnected) return;
    const rooms = lob.peers().filter((p) => !p.sameTab && ROOM_RE.test(p.presence?.open || '')).slice(0, 6);
    el.innerHTML = rooms.length ? `<span class="g-oh mono">Open rooms</span>${rooms.map((p, k) => { const q = p.presence, nm = cleanName(q.nm, 'Someone'); return `<button class="g-oroom" data-act="join-open" data-code="${q.open}" style="--c:${cleanColor(q.col, k)}"><span class="g-av">${A.esc(initial(nm))}</span><span><b>${A.esc(nm)}'s room</b><span>${MODES[q.mode]?.label || 'Notes'} · ${Math.max(1, Math.min(99, q.n | 0))} in the room</span></span><span class="mono">${q.open}</span></button>`; }).join('')}` : '';
  });
}
function createRoom(mode) {
  const code = Array.from({ length: 4 }, () => pick1([...CODE_CH])).join('');
  enterRoom(code, true, mode);
}
async function enterRoom(code, host, mode) {
  if (!ROOM_RE.test(code)) return;
  const lob = await getRoom();
  if (!lob) return netNote('Online rooms aren’t available on this site yet.');
  netNote(host ? 'Opening a room…' : `Joining ${code}…`);
  await leaveRoom();
  let room;
  try { room = await lob.join('fg-' + code.toLowerCase()); } catch (e) {
    return netNote(e?.code === 'limit_reached' ? 'Too many rooms are open right now. Try again in a moment.' : e?.code === 'not_permitted' ? 'Rooms are not available to you on this page.' : 'Could not reach that room. Try again.');
  }
  const me = myProfile();
  NET = { code, room, lob, host, gm: host ? { id: newId(), mode: mode || 'notes', seed: 0, n: -1, ph: 'room' } : null, seen: null, peers: room.peers(), since: Date.now(), unsub: [], up: room.connected(), hostName: '' };
  const N = NET;
  N.claim = host ? Date.now() : 0;
  pub({ v: 1, nm: me.nm, col: me.col, h: host ? 1 : 0, hs: N.claim, gm: N.gm, gid: null, r: [] });
  N.unsub.push(room.onPeers((ch) => { if (NET === N) { N.peers = ch.peers; onNet(); } }, () => { if (NET === N) { N.up = false; paintConn(); } }));
  N.unsub.push(room.onConnection((c) => { if (NET === N) { N.up = c; paintConn(); } }));
  // give the room a moment to introduce everyone before deciding there is no host
  setTimeout(() => NET === N && onNet(), 3200);
  setTimeout(() => NET === N && onNet(), 10200);
  S = null; A.setHash('play');
  roomScreen();
  onNet();
}
async function leaveRoom() {
  const N = NET; NET = null; adKey = '';
  if (!N) return;
  N.unsub.forEach((u) => u());
  N.lob.presence({ open: null }).catch(() => {});
  await N.room.leave().catch(() => {});
}
function pub(patch) { NET?.room.presence(patch).catch(() => {}); }
function players() {
  if (!NET) return [];
  const list = NET.peers.filter((p) => p.kind === 'viewer' && p.presence?.v === 1).slice().sort((a, b) => (a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0))
    .map((p, k) => ({ peer: p.peer, me: p.isMe && p.sameTab, nm: cleanName(p.presence.nm, 'Player'), col: cleanColor(p.presence.col, k), h: p.presence.h === 1, hs: Number(p.presence.hs) || 0, gm: p.presence.gm, gid: p.presence.gid, r: Array.isArray(p.presence.r) ? p.presence.r : [] }));
  if (!list.some((p) => p.me)) { const me = myProfile(); list.push({ peer: '~', me: true, nm: me.nm, col: me.col, h: NET.host, hs: NET.claim, gm: NET.gm, gid: S?.mp?.gid, r: [] }); }
  return list;
}
function cleanGm(g) {
  if (!g || typeof g !== 'object' || typeof g.id !== 'string') return null;
  return { id: g.id.slice(0, 12), mode: MODES[g.mode] ? g.mode : 'notes', ph: ['room', 'play', 'done'].includes(g.ph) ? g.ph : 'room', n: Number.isInteger(g.n) ? Math.max(-1, Math.min(ROUNDS - 1, g.n)) : -1, seed: Number(g.seed) >>> 0 };
}
// everything that happens in the room comes through here: work out the host and follow their game
function onNet() {
  const N = NET; if (!N) return;
  const ps = players(), now = Date.now();
  // the earliest claim wins if two pages ever both think they host
  let host = ps.filter((p) => p.h).sort((a, b) => a.hs - b.hs || (a.peer < b.peer ? -1 : 1))[0];
  if (N.host && host && !host.me) { N.host = false; N.gm = null; pub({ h: 0, gm: null }); }
  // nobody hosting: the host left (pick up their game), or this room was empty, or no one has spoken up for a while
  if (host) N.lostAt = 0; else if (N.seen && !N.lostAt) N.lostAt = now;
  const vacant = !host && ((N.lostAt && now - N.lostAt > 2500) || (ps.length === 1 && now - N.since > 3000) || now - N.since > 10000);
  if (vacant && ps[0]?.me) {
    N.host = true; N.claim = now; N.gm = N.seen || { id: newId(), mode: store.get('mode') || 'notes', seed: 0, n: -1, ph: 'room' };
    pub({ h: 1, hs: N.claim, gm: N.gm }); host = ps[0];
  } else if (!host && !N.retry) N.retry = setTimeout(() => { N.retry = 0; if (NET === N) onNet(); }, 1500);
  const gm = N.host ? N.gm : cleanGm(host?.gm);
  if (gm) N.seen = gm;
  N.hostName = host?.nm || '';
  advertise(ps);
  if (!gm || gm.ph === 'room' || gm.n < 0) {
    if (S?.mp?.kind === 'online') { S = null; clearInterval(timer); clearPins(); fxItems = []; A.play.ver++; A.refresh(); roomScreen(); }
    else roomScreen(true);
    return;
  }
  follow(gm);
  live();
}
function follow(gm) {
  if (!S || S.mp?.gid !== gm.id) {
    S = rules({ mode: gm.mode, seed: gm.seed, rounds: buildRounds(gm.mode, gm.seed, A.USES), i: -1, results: [], total: 0, mp: { kind: 'online', gid: gm.id } });
    pub({ gid: gm.id, r: [] });
    A.setHash('play-' + gm.mode);
  }
  if (S.i < gm.n) {
    // the host moved on: lock in whatever this player had, and skip any rounds they missed by joining late
    if (S.phase === 'guess' && S.i >= 0) { clearInterval(timer); const r = record(); S.results.push(r); S.total += r.points; }
    while (S.results.length < gm.n) { const R = S.rounds[S.results.length]; S.results.push({ ing: R.ing, frag: R.frag, guess: null, km: null, points: 0, clues: 0, sc: scoreRound({ km: null, clues: 0, free: 0 }), left: 0 }); }
    publishMine();
    S.i = gm.n - 1; next();
  }
  if (gm.ph === 'done' && S.phase !== 'done') {
    if (S.phase === 'guess') { clearInterval(timer); const r = record(); S.results.push(r); S.total += r.points; publishMine(); }
    standings();
  }
}
// pins travel rounded to about a kilometre, with the hints used and seconds left so every page can score them
function publishMine() {
  pub({ gid: S.mp.gid, r: S.results.map((r) => (r.guess ? [Math.round(r.guess[0] * 100) / 100, Math.round(r.guess[1] * 100) / 100, r.clues, r.left] : 0)) });
}
function theirResults(p) {
  if (!S || p.gid !== S.mp.gid) return [];
  return p.r.slice(0, S.rounds.length).map((e, k) => {
    const R = S.rounds[k];
    if (e === 0) return { ing: R.ing, guess: null, km: null, points: 0, clues: 0 };
    if (!Array.isArray(e)) return null;
    const lat = Number(e[0]), lng = Number(e[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const guess = [lat, lng], km = A.haversine(guess, R.ing.loc);
    const clues = Math.max(0, Math.min(3, e[2] | 0)), left = Math.max(0, Math.min(TIME, e[3] | 0));
    const sc = scoreRound({ km, clues, free: 0, timed: true, left, time: TIME });
    return { ing: R.ing, guess, km, points: sc.points, clues, sc };
  });
}
// refresh the parts of the screen that show other players
function live() {
  if (S?.mp?.kind !== 'online' || S.phase === 'done') return;
  const b = gameEl.querySelector('[data-board]'); if (b) b.innerHTML = boardHtml();
  const c = gameEl.querySelector('[data-chips]'); if (c) c.innerHTML = chipsHtml();
  const lc = gameEl.querySelector('[data-lockcount]'); if (lc) lc.textContent = lockCount();
  const nb = gameEl.querySelector('.g-cta [data-act="next"]');
  if (nb) { const st = nextState(); nb.disabled = !st.ok; nb.firstChild.textContent = st.label; }
  renderHud();
  if (S.phase === 'reveal' && S.results[S.i]?.arrived && othersKey() !== S.mp.pinKey) { S.mp.pinKey = othersKey(); setPins(revealPins(false)); A.play.ver++; A.refresh(); }
}
function startOnline() {
  if (!NET?.host) return;
  NET.gm = { id: newId(), mode: NET.gm?.mode || 'notes', seed: newSeed(), n: 0, ph: 'play' };
  pub({ gm: NET.gm }); onNet();
}
function backToRoom() {
  if (!NET?.host) return;
  NET.gm = { ...NET.gm, ph: 'room', n: -1 };
  pub({ gm: NET.gm }); onNet();
}
// hosts with a room still in its waiting stage list it in the shared lobby so friends can tap in
function advertise(ps) {
  const N = NET; if (!N) return;
  const me = myProfile(), open = N.host && N.gm?.ph === 'room';
  const ad = open ? { open: N.code, nm: me.nm, col: me.col, mode: N.gm.mode, n: ps.length } : { open: null };
  const key = JSON.stringify(ad); if (key === adKey) return; adKey = key;
  N.lob.presence(ad).catch(() => {});
}
function paintConn() {
  const el = gameEl.querySelector('[data-conn]'); if (!el || !NET) return;
  el.textContent = NET.up ? 'Live' : 'Reconnecting'; el.classList.toggle('off', !NET.up);
}
function roomScreen(soft) {
  if (!NET) return;
  if (soft && gameEl.querySelector('[data-roomscreen]')) return paintRoom();
  clearInterval(timer); clearPins(); vignette?.stop(); vignette = null; fxItems = [];
  hud.classList.remove('show'); fab.classList.remove('show'); fab.hidden = true;
  A.setTint(null);
  const me = myProfile();
  gameEl.innerHTML = `
    <div class="game" data-roomscreen>
      <div class="detail-top"><button class="btn icon ghost" data-act="leave-room" aria-label="Leave the room"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <div class="crumbs"><span>Fraguessr</span><span>/</span><b>Online room</b></div><span class="g-conn mono" data-conn></span></div>
      <div class="g-roomhead">
        <span class="mono g-kicker">Room code</span>
        <div class="g-code" aria-label="Room code ${NET.code}">${[...NET.code].map((ch, k) => `<b style="--i:${k}">${ch}</b>`).join('')}</div>
        <p class="prose muted">Friends open Fraguessr, choose <b>Play</b> then <b>Online room</b>, and join with this code. While the room is waiting it also shows up in their list of open rooms.</p>
        <button class="btn" data-act="copy-code"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg><span>Copy code</span></button>
      </div>
      <div class="section-h"><span>In the room</span><span class="mono" data-pcount></span></div>
      <div class="g-players" data-players></div>
      <div class="g-roomme">
        <label class="g-field"><span>Your name</span><input data-nick maxlength="18" autocomplete="off" value="${A.esc(me.nm)}"></label>
        <div class="g-colors" role="group" aria-label="Your colour">${colorDots(me.col)}</div>
      </div>
      <div data-hostbits></div>
      <button class="btn ghost g-leave" data-act="leave-room">Leave the room</button>
    </div>`;
  gameEl.scrollTop = 0;
  enter(gameEl.querySelector('.game'));
  NET.hostKey = '';
  paintRoom();
}
function paintRoom() {
  const el = gameEl.querySelector('[data-roomscreen]'); if (!el || !NET) return;
  const ps = players();
  el.querySelector('[data-players]').innerHTML = ps.map((p) => `<div class="g-pl${p.me ? ' me' : ''}" style="--c:${p.col}"><span class="g-av">${A.esc(initial(p.nm))}</span><b>${A.esc(p.nm)}</b>${p.me ? '<em>you</em>' : ''}${p.h ? '<span class="badge soft mono">host</span>' : ''}</div>`).join('');
  el.querySelector('[data-pcount]').textContent = `${ps.length} player${ps.length === 1 ? '' : 's'}`;
  const mode = (NET.host ? NET.gm?.mode : NET.seen?.mode) || 'notes';
  const key = `${NET.host}|${mode}|${NET.hostName}|${NET.host ? ps.length : ''}`;
  if (key !== NET.hostKey) {
    NET.hostKey = key;
    el.querySelector('[data-hostbits]').innerHTML = NET.host
      ? `<div class="section-h"><span>Mode</span></div>
        <div class="g-modes compact" role="radiogroup">${Object.entries(MODES).map(([k, m]) => `
          <button class="g-mode" role="radio" data-mode="${k}" aria-checked="${k === mode}"><span class="g-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${m.icon}</svg></span><span class="g-mt">${m.label}<span>${m.blurb}</span></span><span></span></button>`).join('')}</div>
        <button class="btn primary g-start" data-act="start-room"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>${ps.length > 1 ? `Start with ${ps.length} players` : 'Start (you can play alone too)'}</button>`
      : `<div class="g-wait"><span class="g-wd"><i></i><i></i><i></i></span><span>Waiting for <b>${A.esc(NET.hostName || 'the host')}</b> to start a <b>${MODES[mode].label}</b> game</span></div>`;
  }
  paintConn();
}
