// Shared daily stats: how many players finished today's scent, how many of them found each note and
// how the scores spread. Backed by a Firebase Realtime Database with anonymous sign-in, so each browser
// counts once a day (the database rules in database.rules.json enforce that). Until FIREBASE is filled in,
// or wherever Firebase can't load, every call quietly returns null.

// Paste the web app config from the Firebase console (Project settings > Your apps) here.
export const FIREBASE = null;

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const config = () => globalThis.FRAGUESSR_FIREBASE || FIREBASE;
let boot = null;
function connect() {
  if (!config()) return Promise.resolve(null);
  return (boot ||= (async () => {
    const [{ initializeApp }, db, auth] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-database.js`), import(`${SDK}/firebase-auth.js`)]);
    const app = initializeApp(config(), 'fraguessr-stats'), d = db.getDatabase(app), a = auth.getAuth(app);
    const emu = globalThis.FRAGUESSR_EMULATOR; // tests only: { db: [host, port], auth: 'http://host:port' }
    if (emu) { db.connectDatabaseEmulator(d, ...emu.db); auth.connectAuthEmulator(a, emu.auth, { disableWarnings: true }); }
    const { user } = await auth.signInAnonymously(a);
    return { db, d, uid: user.uid };
  })().catch((e) => { console.warn('Fraguessr: shared stats are off', e); boot = null; return null; }));
}

// record one finished daily scent: the notes found and the score, counted once per browser per day
export async function submit(date, found) {
  const s = await connect(); if (!s) return false;
  const { db, d, uid } = s, inc = db.increment(1);
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

export const enabled = () => !!config();
