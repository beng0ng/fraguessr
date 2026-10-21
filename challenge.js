// A challenge from something caught in the sky (flyby.js). The thing caught sets the difficulty: how many questions,
// how many choices, whether there is a clock, how famous the notes and perfumes are and how close the wrong answers
// sit to the right one. Each challenge draws one category of question. Answer every question right to win a fact,
// rarer the harder the challenge.
import { INGREDIENTS, FRAGRANCES, FAMILIES, HOUSES, noteId } from './data.js';
import { FACTS } from './facts.js';
import { RARITY } from './rarity.js';
import { burst, cascade, calm } from './motion.js';
import { skyStats } from './flyby.js';

const LEVELS = {
  easy: { k: 0, label: 'Easy', n: 1, opts: 3, secs: 0, prize: () => (Math.random() < 0.5 ? ['uncommon', 'common'] : ['common', 'uncommon']), says: 'a common or uncommon fact' },
  medium: { k: 1, label: 'Medium', n: 2, opts: 4, secs: 0, prize: () => ['rare', 'uncommon', 'common'], says: 'a rare fact' },
  hard: { k: 2, label: 'Hard', n: 3, opts: 4, secs: 20, prize: () => ['epic', 'rare', 'uncommon', 'common'], says: 'an epic fact' },
  legendary: { k: 3, label: 'Legendary', n: 3, opts: 4, secs: 15, prize: () => ['legendary', 'epic', 'rare', 'uncommon', 'common'], says: 'a legendary fact' },
};
// `from` is the easiest level a category turns up at
const CATS = {
  where: { label: 'Origins', title: 'Where does it come from?', from: 0 },
  note: { label: 'Notes', title: 'Spot the note', from: 0 },
  odd: { label: 'Families', title: 'Odd one out', from: 0 },
  house: { label: 'Houses', title: 'Name the house', from: 0 },
  first: { label: 'History', title: 'Which came first?', from: 0 },
  tier: { label: 'Pyramids', title: 'Top, heart or base?', from: 1 },
  riddle: { label: 'Facts', title: 'Whose story is this?', from: 1 },
  nose: { label: 'Perfumers', title: 'Name the perfumer', from: 2 },
};
// families that are easy to mix up, for the harder odd-one-out rounds
const NEAR = { citrus: ['green', 'fruit', 'marine'], floral: ['fruit', 'green'], green: ['citrus', 'floral', 'marine'], fruit: ['citrus', 'floral', 'gourmand'], spice: ['gourmand', 'wood', 'resin'], wood: ['resin', 'spice', 'animalic'], resin: ['wood', 'animalic', 'gourmand', 'spice'], gourmand: ['spice', 'resin', 'fruit'], animalic: ['resin', 'wood'], marine: ['green', 'citrus'] };
const TIER = { top: 'top', heart: 'heart', base: 'base' };

const ING = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
const USES = {}; for (const f of FRAGRANCES) for (const id of f.ingredients) USES[id] = (USES[id] || 0) + 1;
const BY_USE = INGREDIENTS.slice().sort((a, b) => (USES[b.id] || 0) - (USES[a.id] || 0));
const HOUSE_N = {}; for (const f of FRAGRANCES) HOUSE_N[f.house] = (HOUSE_N[f.house] || 0) + 1;
// perfumers by name; a house credited as its own perfumer, or a fragrance company, doesn't count as one
const person = (p) => !HOUSE_N[p] && !/^(IFF|Givaudan|Firmenich|Symrise|Mane|Takasago)$/i.test(p);
const noses = (f) => f.perfumer.split(/\s*,\s*/).filter(person);
const NOSE_N = {}; for (const f of FRAGRANCES) for (const p of noses(f)) NOSE_N[p] = (NOSE_N[p] || 0) + 1;
const COUNTRY = new Map(); for (const i of BY_USE) if (!COUNTRY.has(i.country)) COUNTRY.set(i.country, i.loc);
const famLabel = (k) => FAMILIES[k].label.toLowerCase();

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (a, k) => shuffle(a).slice(0, k);
const km = (a, b) => { const r = Math.PI / 180, s = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(s)); };
const esc = (s) => String(s).normalize('NFC').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const an = (w) => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
const WORDS = ['One', 'Two', 'Three', 'Four'];
const where = (i) => (i.place.includes(i.country) ? i.place : `${i.place}, ${i.country}`);
const and = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

// how well known the notes and perfumes in a question are: the easiest rounds stay with the classics
function ingPool(L) { return L === 0 ? BY_USE.slice(0, 60) : L === 1 ? BY_USE.slice(0, 140) : L === 2 ? BY_USE : BY_USE.slice(50); }
function fragPool(L) { return L === 0 ? FRAGRANCES.filter((f) => HOUSE_N[f.house] >= 8) : L === 1 ? FRAGRANCES.filter((f) => HOUSE_N[f.house] >= 4) : FRAGRANCES; }
const tierOf = (f, id) => ['top', 'heart', 'base'].filter((t) => f.tiers[t].some((n) => noteId(n) === id));
const fresh = (used, id) => !used.has(id);
const ingOpt = (i, ok) => ({ label: i.name, ok, thumb: `i:${i.id}`, c: i.c });

// each maker returns { prompt, subject, options: [{ label, sub, after, ok }], why, ids } or null to try again
const MAKE = {
  where({ L, opts, used }) {
    const ing = rnd(ingPool(L).filter((i) => fresh(used, i.id))); used.add(ing.id);
    const others = [...COUNTRY].filter(([c]) => c !== ing.country).map(([c, loc]) => [c, km(ing.loc, loc)]);
    let cand = L === 0 ? others.filter(([, d]) => d > 4500) : L === 1 ? others.filter(([, d]) => d > 1200 && d < 7500) : others.sort((a, b) => a[1] - b[1]).slice(0, 6);
    if (cand.length < opts - 1) cand = others;
    const wrong = sample(cand, opts - 1).map(([c]) => ({ label: c, ok: false }));
    return {
      prompt: `Where does <b>${esc(ing.name)}</b> come from?`, hint: 'Its classic source for perfumery', subject: { thumb: `i:${ing.id}`, c: ing.c },
      options: shuffle([{ label: ing.country, ok: true }, ...wrong]), why: `${ing.name} comes from ${where(ing)}.`, ids: [ing.id],
    };
  },
  note({ L, opts, used }) {
    const f = rnd(fragPool(L).filter((x) => x.ingredients.length >= 4 && fresh(used, x.id))); used.add(f.id);
    const mine = f.ingredients.map((id) => ING[id]).filter(Boolean).sort((a, b) => (USES[b.id] || 0) - (USES[a.id] || 0));
    const right = L === 0 ? rnd(mine.slice(0, 3)) : rnd(mine);
    const not = (i) => !f.ingredients.includes(i.id);
    let cand = L === 0 ? BY_USE.slice(0, 100).filter((i) => not(i) && i.family !== right.family) : L === 1 ? BY_USE.slice(0, 160).filter(not) : BY_USE.filter((i) => not(i) && i.family === right.family);
    if (cand.length < opts - 1) cand = BY_USE.filter(not);
    const t = tierOf(f, right.id)[0];
    return {
      prompt: `Which of these notes is in <b>${esc(f.name)}</b>?`, hint: `${f.house}, ${f.year}`, subject: { thumb: `f:${f.id}` },
      options: shuffle([ingOpt(right, true), ...sample(cand, opts - 1).map((i) => ingOpt(i, false))]),
      why: `${right.name} is in ${f.name}${t ? `, in its ${TIER[t]}` : ''}.`, ids: [right.id],
    };
  },
  odd({ L, opts, used }) {
    const pool = ingPool(L).filter((i) => fresh(used, i.id));
    const fams = Object.keys(FAMILIES).filter((k) => pool.filter((i) => i.family === k).length >= opts - 1);
    const A = rnd(fams);
    const Bs = L === 0 ? Object.keys(FAMILIES).filter((k) => k !== A && !NEAR[A].includes(k)) : L === 1 ? Object.keys(FAMILIES).filter((k) => k !== A) : NEAR[A];
    const B = rnd(Bs.filter((k) => pool.some((i) => i.family === k)).length ? Bs.filter((k) => pool.some((i) => i.family === k)) : Bs);
    const same = sample(pool.filter((i) => i.family === A), opts - 1);
    const odd = rnd(pool.filter((i) => i.family === B).length ? pool.filter((i) => i.family === B) : BY_USE.filter((i) => i.family === B));
    for (const i of [odd, ...same]) used.add(i.id);
    const n = WORDS[opts - 2];
    return {
      prompt: L === 0 ? `${n} of these are ${famLabel(A)} notes. Which one isn’t?` : `${n} of these share a family. Which one doesn’t belong?`,
      options: shuffle([{ label: odd.name, ok: true, after: FAMILIES[B].label }, ...same.map((i) => ({ label: i.name, ok: false, after: FAMILIES[A].label }))]),
      why: `${odd.name} is ${famLabel(B)}; the others are ${famLabel(A)}.`, ids: [odd.id, ...same.map((i) => i.id)],
    };
  },
  house({ L, opts, used }) {
    const named = (f) => f.house.toLowerCase().split(/[\s'&.-]+/).some((w) => w.length >= 4 && f.name.toLowerCase().includes(w));
    const f = rnd(fragPool(L).filter((x) => !named(x) && fresh(used, x.id) && HOUSES[x.house])); used.add(f.id);
    const all = Object.keys(HOUSE_N).filter((h) => h !== f.house && HOUSES[h]);
    let cand = L === 0 ? all.filter((h) => HOUSE_N[h] >= 8) : L === 1 ? all.filter((h) => HOUSE_N[h] >= 4)
      : all.sort((a, b) => km(HOUSES[f.house], HOUSES[a]) - km(HOUSES[f.house], HOUSES[b])).slice(0, 8);
    if (cand.length < opts - 1) cand = all;
    return {
      prompt: `Which house makes <b>${esc(f.name)}</b>?`, hint: `Launched in ${f.year}`, subject: { thumb: `f:${f.id}` },
      options: shuffle([{ label: f.house, ok: true }, ...sample(cand, opts - 1).map((h) => ({ label: h, ok: false }))]),
      why: noses(f).length ? `${f.name} is by ${f.house}, composed by ${and(noses(f))} in ${f.year}.` : `${f.name} is by ${f.house}, from ${f.year}.`, ids: f.ingredients,
    };
  },
  first({ L, used }) {
    const k = [2, 3, 4, 4][L], gap = [25, 8, 3, 1][L], pool = fragPool(L).filter((f) => fresh(used, f.id));
    for (let tries = 0; tries < 80; tries++) {
      const set = sample(pool, k), ys = set.map((f) => f.year).sort((a, b) => a - b);
      if (ys.some((y, i) => i && y - ys[i - 1] < gap)) continue;
      const old = set.reduce((a, b) => (b.year < a.year ? b : a));
      for (const f of set) used.add(f.id);
      return {
        prompt: k === 2 ? 'Which of these two came out first?' : 'Which of these came out first?',
        options: set.map((f) => ({ label: f.name, sub: f.house, ok: f === old, after: String(f.year) })),
        why: set.slice().sort((a, b) => a.year - b.year).map((f) => `${f.name}, ${f.year}`).join(' · '), ids: old.ingredients,
      };
    }
    return null;
  },
  tier({ L, used }) {
    const pool = fragPool(L).filter((f) => fresh(used, f.id) && f.tiers.top.length && f.tiers.heart.length && f.tiers.base.length);
    for (let tries = 0; tries < 40; tries++) {
      const f = rnd(pool), ids = f.ingredients.filter((id) => ING[id] && tierOf(f, id).length === 1);
      if (!ids.length) continue;
      const id = rnd(ids), t = tierOf(f, id)[0], ing = ING[id]; used.add(f.id);
      const mates = f.tiers[t].map(noteId).filter((x) => x && x !== id && ING[x]).slice(0, 2).map((x) => ING[x].name.toLowerCase());
      return {
        prompt: `Where does <b>${esc(ing.name)}</b> sit in <b>${esc(f.name)}</b>?`, hint: `${f.house}, ${f.year}`, subject: { thumb: `i:${id}`, c: ing.c },
        options: ['top', 'heart', 'base'].map((x) => ({ label: x[0].toUpperCase() + x.slice(1), sub: { top: 'The first minutes', heart: 'The next few hours', base: 'What lingers' }[x], ok: x === t })),
        why: `${ing.name} is in the ${t} of ${f.name}${mates.length ? `, with ${mates.join(' and ')}` : ''}.`, ids: [id],
      };
    }
    return null;
  },
  riddle({ L, opts, used }) {
    const tiers = L === 1 ? ['common', 'uncommon'] : L === 2 ? ['uncommon', 'rare', 'epic'] : ['rare', 'epic', 'legendary'];
    const pool = ingPool(Math.min(L, 2)).filter((i) => fresh(used, i.id) && FACTS[i.id]);
    for (let tries = 0; tries < 40; tries++) {
      const ing = rnd(pool), r = rnd(tiers.filter((x) => FACTS[ing.id][x])); if (!r) continue;
      // the note's own name is blanked out of the fact, plurals and all
      const words = [...new Set([...ing.name.split(/[\s'’-]+/), ...(ing.latin || '').split(/\s+/).slice(0, 1)].filter((w) => w.length >= 3).map((w) => w.toLowerCase()))];
      let text = FACTS[ing.id][r].fact;
      for (const w of words) text = text.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(e?s)?\\b`, 'gi'), '▒▒▒');
      if (text.length > 260) continue;
      used.add(ing.id);
      let cand = (L === 1 ? BY_USE.slice(0, 160).filter((i) => i.family !== ing.family) : BY_USE.filter((i) => i.family === ing.family)).filter((i) => i !== ing);
      if (cand.length < opts - 1) cand = BY_USE.filter((i) => i !== ing);
      return {
        prompt: 'Which note is this about?', quote: text,
        options: shuffle([ingOpt(ing, true), ...sample(cand, opts - 1).map((i) => ingOpt(i, false))]),
        why: `It’s ${ing.name}, from ${where(ing)}.`, ids: [ing.id],
      };
    }
    return null;
  },
  nose({ L, opts, used }) {
    const pool = fragPool(L).filter((f) => fresh(used, f.id) && noses(f).length === 1 && noses(f)[0] === f.perfumer);
    const f = rnd(pool), me = f.perfumer; used.add(f.id);
    const famous = Object.keys(NOSE_N).filter((p) => NOSE_N[p] >= 3 && p !== me);
    // the hardest rounds offer noses who also worked for the same house
    const sameHouse = [...new Set(FRAGRANCES.filter((x) => x.house === f.house).flatMap(noses))].filter((p) => p !== me);
    let wrong = L >= 3 ? sample(sameHouse, opts - 1) : [];
    wrong = [...wrong, ...sample(famous.filter((p) => !wrong.includes(p)), opts - 1 - wrong.length)];
    return {
      prompt: `Who composed <b>${esc(f.name)}</b>?`, hint: `${f.house}, ${f.year}`, subject: { thumb: `f:${f.id}` },
      options: shuffle([{ label: me, ok: true }, ...wrong.map((p) => ({ label: p, ok: false }))]),
      why: `${me} composed ${f.name} for ${f.house} in ${f.year}.`, ids: f.ingredients,
    };
  },
};

let lastCat = null, dlg = null;
// A: { facts: { has, discover, earn, mount }, thumb(el), onClose }
export function openChallenge(item, A) {
  const lv = LEVELS[item.level], L = lv.k;
  const cats = Object.keys(CATS).filter((c) => CATS[c].from <= L && c !== lastCat);
  const used = new Set();
  let cat = null, qs = [];
  for (let tries = 0; tries < 12 && qs.length < lv.n; tries++) {
    if (!cat) { cat = rnd(cats); qs = []; }
    let q = null; try { q = MAKE[cat]({ L, opts: lv.opts, used }); } catch {}
    if (q && q.options.length >= 2 && q.options.filter((o) => o.ok).length === 1) qs.push(q);
    else if (tries % 3 === 2) cat = null;
  }
  if (qs.length < lv.n) return A.onClose?.();
  lastCat = cat;

  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.className = 'sheet sky-ch'; document.body.append(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-ch="close"]')) dlg.close(); });
  }
  const C = CATS[cat];
  let qi = 0, right = 0, timer = 0, left = 0, done = false;
  dlg.dataset.level = item.level; dlg.dataset.sky = item.sky;
  dlg.innerHTML = `<div class="sheet-in">
    <button class="btn icon ghost sheet-x" data-ch="close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    <div class="ch-head"><span class="ch-art${item.gold ? ' gold' : ''}" aria-hidden="true">${item.art}</span><div><span class="ch-eyebrow"><b>${esc(item.name)}</b> · ${lv.label} · ${C.label}</span><h2>${C.title}</h2></div></div>
    <p class="sheet-lede ch-lede">You caught ${an(item.name.toLowerCase())}! ${lv.n === 1 ? 'Answer one question' : `Answer ${WORDS[lv.n - 1].toLowerCase()} questions in a row`}${lv.secs ? `, ${lv.secs} seconds each,` : ''} to win ${lv.says}.</p>
    ${lv.n > 1 ? `<div class="ch-pips" aria-hidden="true">${'<i></i>'.repeat(lv.n)}</div>` : ''}
    <div class="ch-body"></div>
  </div>`;
  const body = dlg.querySelector('.ch-body'), pips = [...dlg.querySelectorAll('.ch-pips i')];
  const finish = () => { if (done) return; done = true; clearInterval(timer); };
  dlg.addEventListener('close', () => { finish(); A.onClose?.(); }, { once: true });
  dlg.onkeydown = (e) => {
    const n = Number(e.key); if (!n) return;
    const b = body.querySelectorAll('.ch-opt')[n - 1]; if (b && !b.disabled) { e.preventDefault(); b.click(); }
  };

  function ask() {
    const q = qs[qi];
    pips.forEach((p, k) => p.classList.toggle('on', k === qi));
    body.innerHTML = `${q.subject ? `<div class="ch-subj"><span class="thumb ch-th" data-thumb="${q.subject.thumb}"><span class="ph"${q.subject.c ? ` style="background:radial-gradient(circle at 40% 35%, ${q.subject.c[1]}, ${q.subject.c[0]} 55%, ${q.subject.c[2]})"` : ''}></span></span><div><p class="ch-prompt">${q.prompt}</p>${q.hint ? `<span class="ch-hint">${esc(q.hint)}</span>` : ''}</div></div>` : `<p class="ch-prompt">${q.prompt}</p>`}
      ${q.quote ? `<blockquote class="ch-quote">${esc(q.quote).replace(/▒▒▒/g, '<span class="ch-blank" aria-label="blank"></span>')}</blockquote>` : ''}
      ${lv.secs ? '<div class="ch-clock" role="timer"><i></i><span></span></div>' : ''}
      <div class="ch-opts n${q.options.length}">${q.options.map((o, k) => `<button type="button" class="ch-opt" data-k="${k}"><kbd>${k + 1}</kbd>${o.thumb ? `<span class="thumb ch-oth" data-thumb="${o.thumb}"><span class="ph" style="background:radial-gradient(circle at 40% 35%, ${o.c[1]}, ${o.c[0]} 55%, ${o.c[2]})"></span></span>` : ''}<span class="ch-ol">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>${o.after ? `<em class="ch-after">${esc(o.after)}</em>` : ''}</button>`).join('')}</div>
      <p class="ch-why" hidden></p>
      <button type="button" class="btn sheet-go ch-next" hidden></button>`;
    body.querySelectorAll('[data-thumb]').forEach((el) => A.thumb(el));
    cascade(body.querySelectorAll('.ch-opt'), { step: 45, delay: 60 });
    body.querySelectorAll('.ch-opt').forEach((b) => b.addEventListener('click', () => pickAns(Number(b.dataset.k))));
    if (lv.secs) {
      left = lv.secs * 1000;
      const bar = body.querySelector('.ch-clock i'), num = body.querySelector('.ch-clock span');
      const show = () => { bar.style.transform = `scaleX(${left / (lv.secs * 1000)})`; num.textContent = Math.ceil(left / 1000); body.querySelector('.ch-clock').classList.toggle('low', left <= 5000); };
      show(); clearInterval(timer);
      timer = setInterval(() => { if (document.hidden) return; left -= 100; show(); if (left <= 0) pickAns(-1); }, 100);
    }
    setTimeout(() => body.querySelector('.ch-opt')?.focus({ preventScroll: true }), 30);
  }

  function pickAns(k) {
    const q = qs[qi]; clearInterval(timer);
    const btns = [...body.querySelectorAll('.ch-opt')]; if (btns[0].disabled) return;
    const ok = k >= 0 && q.options[k].ok;
    btns.forEach((b, j) => { b.disabled = true; b.classList.add(q.options[j].ok ? 'right' : j === k ? 'wrong' : 'dim'); });
    body.querySelector('.ch-opts').classList.add('shown');
    if (ok) { right++; burst(btns[k], '#2fb36a', { n: 10, spread: 40, stars: 3 }); }
    pips[qi]?.classList.add(ok ? 'ok' : 'no');
    const why = body.querySelector('.ch-why');
    why.innerHTML = `<b>${k < 0 ? 'Out of time.' : ok ? 'Right.' : 'Not quite.'}</b> ${esc(q.why)}`; why.hidden = false;
    const next = body.querySelector('.ch-next'), last = !ok || qi === qs.length - 1;
    next.textContent = !ok ? 'See how it went' : last ? 'Claim your fact' : 'Next question';
    next.hidden = false; next.onclick = () => (last ? end(ok) : (qi++, ask()));
    next.focus({ preventScroll: true });
  }

  function end(won) {
    finish();
    dlg.querySelector('.ch-lede')?.remove(); dlg.querySelector('.ch-pips')?.classList.add('done');
    const st = won ? skyStats.bump('won') : skyStats.get();
    const tally = `<p class="sheet-foot ch-tally">Sky challenges won: <b>${st.won}</b> of ${st.caught}</p>`;
    if (!won) {
      body.innerHTML = `<div class="ch-end"><h3 class="ch-big">It got away</h3><p class="sheet-lede">${right} of ${qs.length} right. ${item.sky === 'night' ? 'The sky is busy at night' : 'There is plenty more in the sky'}; keep an eye out for the next one.</p><button type="button" class="btn sheet-go" data-ch="close">Back to the globe</button>${tally}</div>`;
      body.querySelector('.sheet-go').focus({ preventScroll: true });
      return;
    }
    const p = prize(lv.prize(), [...new Set(qs.flatMap((q) => q.ids))].filter((id) => ING[id]), A.facts);
    const isNew = A.facts.discover(p.id, p.r), drops = A.facts.earn(p.id, p.r) || 0, R = RARITY[p.r];
    body.innerHTML = `<div class="ch-end win" style="--r:${R.col}"><h3 class="ch-big">Caught!</h3>
      <p class="sheet-lede">${qs.length === 1 ? 'Spot on' : qs.length === 2 ? 'Both right' : `All ${WORDS[qs.length - 1].toLowerCase()} right`}. The ${esc(item.name.toLowerCase())} left you ${an(R.label.toLowerCase())} fact about ${esc(ING[p.id].name.toLowerCase())}${isNew ? '' : ', one you already had'}.</p>
      <div class="ch-fact"></div>
      ${drops ? `<p class="ch-drops">+${drops} drops of ${esc(ING[p.id].name.toLowerCase())} for your lab</p>` : ''}
      <button type="button" class="btn sheet-go" data-ch="close">Back to the globe</button>${tally}</div>`;
    A.facts.mount(body.querySelector('.ch-fact'), p.id, p.r, { isNew });
    if (!calm()) setTimeout(() => burst(body.querySelector('.ch-big'), R.col, { n: 22, spread: 70, stars: 7 }), 120);
  }

  dlg.showModal();
  ask();
}

// the fact a win deals: one not yet found, at the best rarity this level pays, about a note from the questions when
// possible, otherwise about any note; once all of those are found, a fact already held (it still pays essence)
function prize(order, ids, facts) {
  const every = shuffle(INGREDIENTS.map((i) => i.id));
  for (const r of order) {
    const id = shuffle(ids).find((x) => FACTS[x]?.[r] && !facts.has(x, r)) || every.find((x) => FACTS[x]?.[r] && !facts.has(x, r));
    if (id) return { id, r };
  }
  const id = ids.find((x) => FACTS[x]?.[order[0]]) || every.find((x) => FACTS[x]?.[order[0]]);
  return { id, r: order[0] };
}
