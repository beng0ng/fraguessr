// The site's one Firebase project, shared by the daily stats (stats.js) and player accounts (account.js): a
// Realtime Database guarded by database.rules.json, and Firebase Authentication. Every visitor gets an anonymous
// sign-in, which counts their daily once; signing up turns that same user into a real account. Until FIREBASE is
// filled in, or wherever Firebase can't load, connect() resolves null and both stay off.

// Paste the web app config from the Firebase console (Project settings > Your apps) here.
export const FIREBASE = null;

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const config = () => globalThis.FRAGUESSR_FIREBASE || FIREBASE;
export const enabled = () => !!config();
let boot = null;
// { db, auth: the SDK modules; d: the database; a: the auth instance, already signed in (anonymously at least) }
export function connect() {
  if (!config()) return Promise.resolve(null);
  return (boot ||= (async () => {
    const [{ initializeApp }, db, auth] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-database.js`), import(`${SDK}/firebase-auth.js`)]);
    const app = initializeApp(config(), 'fraguessr'), d = db.getDatabase(app), a = auth.getAuth(app);
    const emu = globalThis.FRAGUESSR_EMULATOR; // tests only: { db: [host, port], auth: 'http://host:port' }
    if (emu) { db.connectDatabaseEmulator(d, ...emu.db); auth.connectAuthEmulator(a, emu.auth, { disableWarnings: true }); }
    await a.authStateReady();
    if (!a.currentUser) await auth.signInAnonymously(a);
    return { db, auth, d, a };
  })().catch((e) => { console.warn('Fraguessr: Firebase is off', e); boot = null; return null; }));
}
