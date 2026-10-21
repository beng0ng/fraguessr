// The opening page: shown on a bare visit (the page decides before its first paint, see the script in <head>).
// It fills in today's scent and the atlas's numbers, sends scent motes drifting up behind, and opens the door that is picked.
const MOTES = 26;

export function initIntro({ daily, counts, foot, colors, thumbs, onPlay, onExplore }) {
  const el = document.getElementById('intro'), root = document.documentElement;
  if (!el) return null;
  if (!root.classList.contains('intro-on')) return el.remove(), null;
  const app = document.querySelector('.app'); app.inert = true;
  const set = (k, v) => { const n = el.querySelector(`[data-in="${k}"]`); if (n) n.textContent = v; };

  // motes: small soft dots in the ingredients' family colours, already spread through their climb when the page opens
  const motes = el.querySelector('.in-motes');
  motes.innerHTML = Array.from({ length: MOTES }, (_, k) => {
    const t = 14 + Math.random() * 14, s = 4 + Math.random() * 9;
    return `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--s:${s.toFixed(1)}px;--c:${colors[k % colors.length]};--t:${t.toFixed(1)}s;--d:${(-Math.random() * t).toFixed(1)}s;--w:${((Math.random() - 0.5) * 120).toFixed(0)}px;--o:${(0.18 + Math.random() * 0.3).toFixed(2)}"></i>`;
  }).join('');

  set('atlas', `${counts.ingredients} ingredients from ${counts.countries} countries, traced into ${counts.perfumes} perfumes.`);
  if (foot) set('foot', foot);
  const card = el.querySelector('.in-daily');
  Promise.resolve(daily).then((d) => {
    if (!d) return;
    card.style.setProperty('--c', d.color);
    set('label', d.label); el.querySelector('[data-in="name"]').innerHTML = `${esc(d.name)}<em>${esc(d.house)}</em>`;
    set('line', d.done ? `You named ${d.got} of ${d.total} notes${d.streak > 1 ? ` · ${d.streak}-day streak` : ''}. A new perfume arrives tomorrow.`
      : d.started ? `${d.got} of ${d.total} notes found so far. Pick up where you left off.`
      : `Name its ${d.total} notes with five chances. Every one you find deals a fun fact.${d.streak > 1 ? ` Keep your ${d.streak}-day streak going.` : ''}`);
    set('cta', d.done ? 'See your result' : d.started ? 'Keep playing' : 'Play today’s scent');
    if (thumbs) {
      const img = new Image(); img.alt = ''; img.decoding = 'async';
      img.onload = () => card.querySelector('.in-art').replaceChildren(img);
      img.src = `${thumbs}h-${d.id}.webp`;
    }
  }).catch(() => {});

  let gone = false;
  function leave(go) {
    if (gone) return; gone = true;
    app.inert = false; root.classList.add('intro-leaving');
    (go === 'play' ? onPlay : onExplore)();
    el.classList.add('out');
    setTimeout(() => { root.classList.remove('intro-on', 'intro-leaving'); el.remove(); }, 750);
  }
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) leave(b.dataset.go); });
  // Enter plays, Escape opens the atlas (unless a door has keyboard focus, which handles its own Enter)
  const keys = (e) => {
    if (gone) return document.removeEventListener('keydown', keys);
    if (e.key === 'Escape') leave('explore');
    else if (e.key === 'Enter' && !e.target.closest?.('button')) { e.preventDefault(); leave('play'); }
  };
  document.addEventListener('keydown', keys);
  return { leave };
}
const esc = (s) => String(s).normalize('NFC').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
