// Keeps a player's collection in their account so it follows them between devices. The browser's
// localStorage stays the working copy; this mirrors it to one private document per person
// (data/users/<id>/save, which nobody else can read) and merges the two whenever either side changes, so
// nothing earned on any device is lost. Where account saving isn't available, or for a viewer who can't save, it does nothing.
const P = 'noteguessr:', DAY = /^noteguessr:scent:(\d{4}-\d{2}-\d{2})$/, KEEP_DAYS = 45;
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(P + k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch {} };
// JSON with sorted keys, to tell whether two saves really differ
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
const recent = (days) => Object.fromEntries(Object.keys(days).sort().slice(-KEEP_DAYS).map((d) => [d, days[d]]));

function local() {
  const days = {};
  for (let i = 0; i < localStorage.length; i++) { const m = localStorage.key(i)?.match(DAY); if (m) try { days[m[1]] = JSON.parse(localStorage.getItem(m[0])); } catch {} }
  return { facts: [...new Set(read('facts', []))].sort(), notes: read('notes', {}), miles: read('miles', {}), stats: read('stats', {}), streak: read('scent:streak', null), login: read('login', null), days: recent(days), lab: labOf(read('lab', {})) };
}
const labOf = (l) => ({ got: l?.got || {}, used: l?.used || {}, made: l?.made || {} });
const pick = (d = {}) => ({ facts: d.facts || [], notes: d.notes || {}, miles: d.miles || {}, stats: d.stats || {}, streak: d.streak || null, login: d.login || null, days: d.days || {}, lab: labOf(d.lab) });
// the lab's drops earned, drops spent and perfumes blended are running totals, so the larger of each wins
const maxOf = (a, b) => { const o = { ...a }; for (const [k, n] of Object.entries(b)) if (typeof n === 'number') o[k] = Math.max(o[k] || 0, n); return o; };

// the union of two saves: every fact, the higher count of each note, the earliest record of each milestone,
// the best stats, the newer streak, and for each day the further-played game
function merge(a, b) {
  const facts = [...new Set([...a.facts, ...b.facts])].sort();
  const notes = { ...a.notes }; for (const [k, n] of Object.entries(b.notes)) notes[k] = Math.max(notes[k] || 0, n);
  const miles = { ...b.miles, ...a.miles }; for (const [k, m] of Object.entries(b.miles)) if (a.miles[k] && m.at < a.miles[k].at) miles[k] = m;
  const stats = { ...a.stats }; for (const [k, v] of Object.entries(b.stats)) if (typeof v === 'number') stats[k] = Math.max(stats[k] || 0, v);
  const sa = a.streak, sb = b.streak, streak = !sa ? sb : !sb ? sa : sa.last !== sb.last ? (sa.last > sb.last ? sa : sb) : sa.n >= sb.n ? sa : sb;
  // the login streak: the later visit wins (the longer streak on the same day), keeping the best and the latest chest
  const la = a.login, lb = b.login, lw = !la ? lb : !lb ? la : la.last !== lb.last ? (la.last > lb.last ? la : lb) : la.n >= lb.n ? la : lb;
  const login = lw && { ...lw, best: Math.max(la?.best || 0, lb?.best || 0), chest: [la?.chest, lb?.chest].filter(Boolean).sort().pop() || null };
  const days = { ...a.days };
  for (const [d, v] of Object.entries(b.days)) { const cur = days[d]; if (!cur || (v.over && !cur.over) || (!!v.over === !!cur.over && (v.log?.length || 0) > (cur.log?.length || 0))) days[d] = v; }
  const lab = { got: maxOf(a.lab.got, b.lab.got), used: maxOf(a.lab.used, b.lab.used), made: maxOf(a.lab.made, b.lab.made) };
  return { facts, notes, miles, stats, streak, login, days: recent(days), lab };
}
function apply(s) {
  write('facts', s.facts); write('notes', s.notes); write('miles', s.miles); write('stats', s.stats);
  if (s.streak) write('scent:streak', s.streak);
  if (s.login) write('login', s.login);
  write('lab', s.lab);
  for (const [d, v] of Object.entries(s.days)) write('scent:' + d, v);
}

// onAdopt: the local copy just took in progress from another device; onState: 'local' | 'synced' | 'retry'
export async function startSync({ onAdopt, onState }) {
  const c = window.claude;
  const [db, user] = c?.use ? await Promise.all([c.use('db'), c.use('user')]) : [null, null];
  const uid = user && (await user.id());
  if (!db || !uid) { onState('local'); return null; }
  const ref = db.doc(`data/users/${uid}/save`);
  let cloud = null, busy = false, again = false, dead = false, timer = 0;
  const off = () => { dead = true; clearTimeout(timer); onState('local'); };
  async function sync() {
    if (dead || !cloud) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      const mine = local(), merged = merge(mine, cloud);
      if (canon(merged) !== canon(mine)) { apply(merged); onAdopt(); }
      if (canon(merged) !== canon(cloud)) {
        try { await ref.set({ v: 1, ...merged, at: new Date().toISOString() }); }
        catch (e) { if (e?.code === 'unavailable') { await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200)); await ref.set({ v: 1, ...merged, at: new Date().toISOString() }); } else throw e; }
        cloud = merged;
      }
      onState('synced');
    } catch (e) {
      // a viewer who may not save (view-only, or a full store) keeps playing on this browser's copy
      if (['invalid_argument', 'not_granted', 'capability_disabled', 'capability_removed', 'revoked', 'quota_exceeded', 'transform_error'].includes(e?.code)) off(); else { onState('retry'); clearTimeout(timer); timer = setTimeout(() => { timer = 0; sync(); }, 20000); }
    }
    busy = false;
    if (again) { again = false; sync(); }
  }
  // the first snapshot starts the merge; later ones bring in what other devices saved
  ref.onSnapshot((snap) => {
    if (snap.metadata.hasPendingWrites) return;
    const first = !cloud;
    cloud = pick(snap.exists ? snap.data() : {});
    if (first || canon(cloud) !== canon(local())) sync();
  }, (e) => (e?.code === 'revoked' || e?.code === 'invalid_argument' ? off() : onState('retry')));
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); timer = 0; sync(); } });
  // a change on this device: save it to the account after a short pause, so a burst of finds is one write
  return { dirty() { if (dead) return; clearTimeout(timer); timer = setTimeout(() => { timer = 0; sync(); }, 1500); } };
}
