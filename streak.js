// The login streak and the daily chest. Opening the site on consecutive days (UTC, like the daily scent) builds a
// streak; finishing the day's scent opens that day's chest, and the chest grows through a seven-day ladder that
// ends on a legendary, then climbs it again with an extra fact in each chest per week kept up (two at most).
// Missing a day starts the streak over.
const KEY = 'noteguessr:login';
export const LADDER = [
  { n: 2, best: 'uncommon' },
  { n: 3, best: 'rare' },
  { n: 3, best: 'rare' },
  { n: 4, best: 'epic' },
  { n: 4, best: 'epic' },
  { n: 5, best: 'epic' },
  { n: 6, best: 'legendary' },
];
// the chest for the k-th day of a streak
export const chestFor = (k) => { const x = LADDER[(k - 1) % 7]; return { ...x, n: x.n + Math.min(2, Math.floor((k - 1) / 7)) }; };
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const prev = (d) => day(Date.parse(d) - 864e5);
function read() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} }

// a visit today: carries yesterday's streak on, or starts a new one; returns what changed
export function checkIn() {
  const d = day(), s = read();
  if (s?.last === d) return { ...s, fresh: false };
  const n = s?.last === prev(d) ? s.n + 1 : 1;
  const next = { last: d, n, best: Math.max(n, s?.best || 0), chest: s?.chest || null };
  write(next);
  return { ...next, fresh: true, lost: s && s.last !== prev(d) && s.n > 1 ? s.n : 0 };
}
// the streak as it stands (0 once a day has been missed), today's rung on the ladder, and whether its chest is open
export function loginState() {
  const d = day(), s = read() || {};
  const n = s.last === d || s.last === prev(d) ? s.n || 0 : 0, k = Math.max(1, n);
  return { n, best: s.best || 0, rung: (k - 1) % 7, chest: chestFor(k), tomorrow: chestFor(k + 1), opened: s.chest === d, today: d };
}
export function markOpened() { const s = read(); if (s) write({ ...s, chest: day() }); }
