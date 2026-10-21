// The login streak and the daily chest. Opening the site on consecutive days (UTC, like the daily scent) builds a
// streak, and each day's chest (opened from the bar along the top) grows through a seven-day ladder that ends on a
// legendary, then climbs it again with an extra fact in each chest per week kept up (two at most).
// Missing a day starts the streak over.
import { RARITY } from './rarity.js';

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
// "one rare or better"
export const rarer = (r) => `one ${RARITY[r].label.toLowerCase()}${r === 'legendary' ? '' : ' or better'}`;
export const CHEST = '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="g-ch-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cf8b4c"/><stop offset="1" stop-color="#84501f"/></linearGradient><linearGradient id="g-ch-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a0"/><stop offset="1" stop-color="#d49a2c"/></linearGradient></defs><path d="M7 21h34v17a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3z" fill="url(#g-ch-w)"/><path class="g-ch-lid" d="M7 21c0-7.5 5-12.5 17-12.5S41 13.5 41 21z" fill="url(#g-ch-w)"/><path d="M7 20h34v4.5H7z" fill="url(#g-ch-g)"/><path d="M13 10v31M35 10v31" stroke="url(#g-ch-g)" stroke-width="3"/><rect x="20" y="18.5" width="8" height="10.5" rx="2" fill="url(#g-ch-g)" stroke="#8a5a14" stroke-width=".8"/><circle cx="24" cy="23.4" r="1.5" fill="#6b3f12"/><path d="M24 24.5v2.3" stroke="#6b3f12" stroke-width="1.2" stroke-linecap="round"/></svg>';
