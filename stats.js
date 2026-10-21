// Shared daily stats: how many players finished today's scent, how many of them found each note and
// how the scores spread. Backed by the Firebase Realtime Database (firebase.js), so each signed-in user, anonymous or not,
// counts once a day (the database rules in database.rules.json enforce that). Until FIREBASE is filled in,
// or wherever Firebase can't load, every call quietly returns null.

import { connect, enabled } from './firebase.js';

// record one finished daily scent: the notes found and the score, counted once per browser per day
export async function submit(date, found) {
  const s = await connect(); if (!s) return false;
  const { db, d } = s, uid = s.a.currentUser?.uid, inc = db.increment(1);
  if (!uid) return false;
  const u = { [`subs/${date}/${uid}`]: true, [`daily/${date}/n`]: inc, [`daily/${date}/score/${found.length}`]: inc };
  for (const id of found) u[`daily/${date}/notes/${id}`] = inc;
  try { await db.update(db.ref(d), u); return true; }
  catch (e) {
    // the rules turn down a second submission from the same browser, which still counts as sent
    try { return (await db.get(db.ref(d, `subs/${date}/${uid}`))).val() === true; } catch { return false; }
  }
}

// today's totals: { n, notes: {id: count}, score: {found: count} }
export async function load(date) {
  const s = await connect(); if (!s) return null;
  try { const v = (await s.db.get(s.db.ref(s.d, `daily/${date}`))).val() || {}; return { n: v.n || 0, notes: v.notes || {}, score: v.score || {} }; }
  catch (e) { console.warn('Fraguessr: could not read shared stats', e); return null; }
}

export { enabled };
