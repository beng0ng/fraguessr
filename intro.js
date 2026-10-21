// The opening page: shown on a bare visit (the page decides before its first paint, see the script in <head>).
// It fills in today's scent, runs a reel of notes from around the world, and has one door: today's game.
const MOTES = 22, REEL = 16;

export function initIntro({ daily, notes, colors, thumbs, onPlay }) {
  const el = document.getElementById('intro'), root = document.documentElement;
  if (!el) return null;
  if (!root.classList.contains('intro-on')) return el.remove(), null;
  const app = document.querySelector('.app'); app.inert = true;
  const set = (k, v) => { const n = el.querySelector(`[data-in="${k}"]`); if (n) n.textContent = v; };

  // motes: small soft dots in the ingredients' family colours, already spread through their climb when the page opens
  el.querySelector('.in-motes').innerHTML = Array.from({ length: MOTES }, (_, k) => {
    const t = 14 + Math.random() * 14, s = 4 + Math.random() * 9;
    return `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--s:${s.toFixed(1)}px;--c:${colors[k % colors.length]};--t:${t.toFixed(1)}s;--d:${(-Math.random() * t).toFixed(1)}s;--w:${((Math.random() - 0.5) * 120).toFixed(0)}px;--o:${(0.18 + Math.random() * 0.3).toFixed(2)}"></i>`;
  }).join('');

  const card = el.querySelector('.in-daily');
  Promise.resolve(daily).then((d) => {
    if (!d) return;
    card.style.setProperty('--c', d.color);
    set('label', d.label); el.querySelector('[data-in="name"]').innerHTML = `${esc(d.name)}<em>${esc(d.house)}</em>`;
    set('line', d.done ? `You named ${d.got} of ${d.total} notes${d.streak > 1 ? ` · ${d.streak}-day streak` : ''}. A new perfume arrives tomorrow.`
      : d.started ? `${d.got} of ${d.total} notes found so far.`
      : `${d.total} notes to find, five chances.${d.streak > 1 ? ` Keep your ${d.streak}-day streak going.` : ''}`);
    set('cta', d.done ? 'See your result' : d.started ? 'Keep playing' : 'Play');
    if (thumbs) {
      const img = new Image(); img.alt = ''; img.decoding = 'async';
      img.onload = () => card.querySelector('.in-art').replaceChildren(img);
      img.src = `${thumbs}h-${d.id}.webp`;
    }
    reel(new Set(d.notes));
  }).catch(() => reel(new Set()));

  // the reel: notes from all over the map, never one of today's (that would give answers away); drawn twice for a seamless loop
  function reel(skip) {
    const pool = notes.filter((n) => !skip.has(n.id));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const chips = pool.slice(0, REEL).map((n) => `<span class="in-note" style="--c:${n.c}"><i>${thumbs ? `<img src="${thumbs}i-${n.id}.webp" alt="" decoding="async">` : ''}</i><b>${esc(n.name)}</b><small>${esc(n.where)}</small></span>`).join('');
    el.querySelector('.in-reel-track').innerHTML = chips + `<span class="in-dup" aria-hidden="true">${chips}</span>`;
    el.querySelector('.in-reel').classList.add('on');
  }

  let gone = false;
  function leave() {
    if (gone) return; gone = true;
    app.inert = false; root.classList.add('intro-leaving');
    onPlay();
    el.classList.add('out');
    setTimeout(() => { root.classList.remove('intro-on', 'intro-leaving'); el.remove(); }, 750);
  }
  el.addEventListener('click', (e) => { if (e.target.closest('[data-go]')) leave(); });
  // Enter (or Escape, to close the page) goes into today's game; a focused button handles its own Enter
  const keys = (e) => {
    if (gone) return window.removeEventListener('keydown', keys, true);
    // caught first and kept from the app, whose own Escape would otherwise act on the game this opens
    if (e.key === 'Escape' || (e.key === 'Enter' && !e.target.closest?.('button'))) { e.preventDefault(); e.stopImmediatePropagation(); leave(); }
  };
  window.addEventListener('keydown', keys, true);
  return { leave };
}
const esc = (s) => String(s).normalize('NFC').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
