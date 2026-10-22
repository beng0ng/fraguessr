// The login streak and the daily discovery set (called the chest in the code). Opening the site on consecutive days
// (UTC, like the daily scent) builds a streak, and each day's set (opened from the bar along the top) grows through a
// seven-day ladder that ends on a legendary, then climbs it again with an extra fact in each set per week kept up (two at most).
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
// the daily discovery set: a lacquered coffret tied with silk, three sample vials inside
export const CHEST = '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="g-cf-box" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f2c42"/><stop offset="1" stop-color="#20111b"/></linearGradient><linearGradient id="g-cf-lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a3d5c"/><stop offset="1" stop-color="#3a2032"/></linearGradient><linearGradient id="g-cf-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c0"/><stop offset=".5" stop-color="#e3b14c"/><stop offset="1" stop-color="#a5711b"/></linearGradient><linearGradient id="g-cf-glass" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".3" stop-color="#fff" stop-opacity=".1"/><stop offset=".8" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".45"/></linearGradient><linearGradient id="g-cf-silk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe3ea"/><stop offset=".5" stop-color="#eab5c5"/><stop offset="1" stop-color="#c98399"/></linearGradient></defs><ellipse cx="24" cy="43.6" rx="17" ry="1.9" fill="#000" opacity=".2"/><g class="g-ch-in"><rect x="8.5" y="21" width="31" height="5" rx="1.2" fill="url(#g-cf-silk)" opacity=".9"/><rect x="13.2" y="9" width="4.6" height="3.4" rx=".9" fill="url(#g-cf-gold)"/><rect x="14.3" y="12.2" width="2.4" height="1.7" fill="#f4eef0" opacity=".8"/><rect x="12.4" y="13.7" width="6.2" height="12.8" rx="1.7" fill="#e5577e"/><rect x="12.4" y="13.7" width="6.2" height="3.2" rx="1.2" fill="#fff" opacity=".35"/><rect x="12.4" y="13.7" width="6.2" height="12.8" rx="1.7" fill="url(#g-cf-glass)" stroke="#fff" stroke-opacity=".7" stroke-width=".5"/><rect x="21.7" y="6.5" width="4.6" height="3.4" rx=".9" fill="url(#g-cf-gold)"/><rect x="22.8" y="9.7" width="2.4" height="1.7" fill="#f4eef0" opacity=".8"/><rect x="20.9" y="11.2" width="6.2" height="15.3" rx="1.7" fill="#f0b440"/><rect x="20.9" y="11.2" width="6.2" height="3.2" rx="1.2" fill="#fff" opacity=".35"/><rect x="20.9" y="11.2" width="6.2" height="15.3" rx="1.7" fill="url(#g-cf-glass)" stroke="#fff" stroke-opacity=".7" stroke-width=".5"/><rect x="30.2" y="9" width="4.6" height="3.4" rx=".9" fill="url(#g-cf-gold)"/><rect x="31.3" y="12.2" width="2.4" height="1.7" fill="#f4eef0" opacity=".8"/><rect x="29.4" y="13.7" width="6.2" height="12.8" rx="1.7" fill="#9d6ef0"/><rect x="29.4" y="13.7" width="6.2" height="3.2" rx="1.2" fill="#fff" opacity=".35"/><rect x="29.4" y="13.7" width="6.2" height="12.8" rx="1.7" fill="url(#g-cf-glass)" stroke="#fff" stroke-opacity=".7" stroke-width=".5"/></g><rect x="6" y="24" width="36" height="17.5" rx="2.6" fill="url(#g-cf-box)"/><rect x="6" y="24" width="36" height="1.6" fill="url(#g-cf-gold)"/><rect x="7.5" y="38.8" width="33" height=".8" rx=".4" fill="url(#g-cf-gold)" opacity=".8"/><rect x="22" y="25.6" width="4" height="15.9" fill="url(#g-cf-silk)"/><rect x="6.6" y="26.4" width="1" height="13" rx=".5" fill="#fff" opacity=".12"/><g class="g-ch-lid"><rect x="5" y="17.4" width="38" height="7.2" rx="2.2" fill="url(#g-cf-lid)"/><rect x="5" y="23.2" width="38" height="1.4" rx=".7" fill="url(#g-cf-gold)"/><rect x="6.5" y="18.4" width="35" height="1" rx=".5" fill="#fff" opacity=".18"/><rect x="22" y="17.4" width="4" height="7.2" fill="url(#g-cf-silk)"/><path d="M24 17.6c-2.6-4.2-8.4-4.6-8-1.4.3 2.2 4.8 2.2 8 1.4zM24 17.6c2.6-4.2 8.4-4.6 8-1.4-.3 2.2-4.8 2.2-8 1.4z" fill="url(#g-cf-silk)" stroke="#b9718a" stroke-width=".6"/><path d="M23 18.2 20.5 23M25 18.2 27.5 23" stroke="#e7b3c3" stroke-width="1.6" stroke-linecap="round"/><circle cx="24" cy="17.8" r="1.6" fill="#f3c9d6" stroke="#b9718a" stroke-width=".5"/></g></svg>';
