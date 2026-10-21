// Player accounts on the public site: sign up or sign in with an email and password or with Google (Firebase
// Authentication, see firebase.js), and a profile sheet with the player's record. A signed-in player's collection
// is saved to users/<uid>/save in the Realtime Database, which only they can read or write, and sync.js keeps it
// merged with this browser's copy. Signing up from a guest visit keeps the same user, so nothing played so far is
// lost, and signing in on a device adds what was played there to the account. Until Firebase is set up the
// account button stays hidden.
import { connect, enabled } from './firebase.js';
import { linkSync } from './sync.js';

const PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/></svg>';
const GOOGLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-1.9 3.3-4.8 3.3-8.1z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14c-.2-.7-.4-1.3-.4-2s.1-1.4.4-2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1L5.8 10c.9-2.7 3.3-4.6 6.2-4.6z"/></svg>';
// progress that belongs to whoever is signed in; signing out takes it off the device (it's safe in the account)
const MINE = /^noteguessr:(facts|newfacts|notes|miles|stats|lab|login|sky|scent:.*|chest:.*)$/;
const ERRORS = {
  'auth/invalid-email': 'That doesn’t look like an email address.',
  'auth/missing-password': 'Enter a password.',
  'auth/weak-password': 'Use at least 6 characters for your password.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
  'auth/credential-already-in-use': 'That account is already in use. Sign in instead.',
  'auth/invalid-credential': 'That email and password don’t match.',
  'auth/wrong-password': 'That email and password don’t match.',
  'auth/user-not-found': 'There’s no account with that email yet.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
  'auth/network-request-failed': 'Couldn’t reach the server. Check your connection and try again.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
  'auth/operation-not-allowed': 'This way of signing in isn’t switched on yet.',
  'auth/requires-recent-login': 'For your safety, sign out and back in, then try again.',
};
const QUIET = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nameOf = (u) => u.displayName || u.email?.split('@')[0] || 'Player';
const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const avatar = (u, cls = '') => `<i class="acct-av ${cls}" style="--h:${hue(u.uid)}">${esc(nameOf(u).trim()[0]?.toUpperCase() || '?')}</i>`;
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

// button: the header's account button; summary(): the player's record as [[value, label], …] (may be async);
// sync: { onAdopt, onState, set(s) } wires the account's save into the app; onChange(user|null) after sign-in changes
export function initAccount({ button, summary, sync: hooks, onChange }) {
  if (!button) return null;
  if (!enabled()) { button.hidden = true; return null; }
  button.hidden = false;
  let fb = null, user = null, sync = null, view = 'up', syncedAt = 0, syncState = 'local', sheet = null;

  const paint = () => {
    const real = user && !user.isAnonymous;
    button.classList.toggle('in', !!real);
    button.innerHTML = real ? `${avatar(user)}<span>${esc(nameOf(user))}</span>` : `${PERSON}<span>Sign in</span>`;
    button.setAttribute('aria-label', real ? `Your account: ${nameOf(user)}` : 'Sign in or create an account');
    button.title = real ? 'Your account' : 'Sign in';
  };
  paint();

  function linkSave(u) {
    sync?.stop(); sync = null;
    if (!u || u.isAnonymous) { hooks.set(null); hooks.onState('local'); syncState = 'local'; return; }
    const { db, d } = fb, ref = db.ref(d, `users/${u.uid}/save`);
    sync = linkSync({
      fatal: (e) => /permission/i.test(e?.code || e?.message || ''),
      busy: () => false,
      put: (save) => db.set(ref, { json: JSON.stringify(save), at: db.serverTimestamp() }),
      listen: (got, fail) => db.onValue(ref, (snap) => { const v = snap.val(); let data = {}; try { data = v?.json ? JSON.parse(v.json) : {}; } catch {} got(data); }, (e) => fail(/permission/i.test(e?.code || e?.message || ''))),
    }, { onAdopt: hooks.onAdopt, onState: (st) => { syncState = st; if (st === 'synced') syncedAt = Date.now(); hooks.onState(st); if (sheet?.open && user && !user.isAnonymous) refreshSync(); } });
    hooks.set(sync);
  }

  connect().then((c) => {
    if (!c) { button.hidden = true; return; }
    fb = c;
    fb.auth.onAuthStateChanged(fb.a, (u) => {
      const was = user?.uid;
      user = u; paint();
      if (!u) { fb.auth.signInAnonymously(fb.a).catch(() => {}); return; }
      if (u.uid !== was || (!u.isAnonymous && !sync)) linkSave(u);
      onChange?.(u.isAnonymous ? null : u);
      if (sheet?.open) render();
    });
  });

  button.addEventListener('click', () => { if (!fb) return; view = user && !user.isAnonymous ? 'me' : view === 'me' ? 'up' : view; open(); });

  function open() {
    if (!sheet) {
      sheet = document.createElement('dialog'); sheet.className = 'sheet acct-sheet'; document.body.append(sheet);
      sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); else act(e); });
      sheet.addEventListener('submit', (e) => { e.preventDefault(); submit(e.target); });
    }
    render();
    if (!sheet.open) sheet.showModal();
  }
  const shell = (html) => `<div class="sheet-in"><button class="btn icon ghost sheet-x" data-acct="close" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>${html}</div>`;
  const field = (name, label, type, extra = '') => `<label class="acct-field"><span>${label}</span><input name="${name}" type="${type}" ${extra}></label>`;

  function render() {
    if (user && !user.isAnonymous) return renderMe();
    if (view === 'me') view = 'up';
    const up = view === 'up', reset = view === 'reset';
    sheet.innerHTML = shell(reset
      ? `<h2>Reset your password</h2><p class="sheet-lede">We’ll email you a link to choose a new one.</p>
        <form class="acct-form" data-form="reset" novalidate>${field('email', 'Email', 'email', 'autocomplete="email" required')}
          <p class="acct-msg" role="alert"></p><button class="btn primary" type="submit">Send the link</button></form>
        <button class="acct-link" data-acct="in">Back to sign in</button>`
      : `<h2>${up ? 'Create your account' : 'Welcome back'}</h2>
        <p class="sheet-lede">${up ? 'Keep your collection, streaks and lab safe, and pick up where you left off on any device.' : 'Sign in to pick up your collection, streaks and lab on this device.'}</p>
        <div class="acct-tabs" role="tablist"><button role="tab" aria-selected="${up}" data-acct="up">Create account</button><button role="tab" aria-selected="${!up}" data-acct="in">Sign in</button></div>
        <form class="acct-form" data-form="${up ? 'up' : 'in'}" novalidate>
          ${up ? field('name', 'Name', 'text', 'autocomplete="nickname" maxlength="40" placeholder="What should we call you?"') : ''}
          ${field('email', 'Email', 'email', 'autocomplete="email" required')}
          ${field('password', 'Password', 'password', `autocomplete="${up ? 'new-password' : 'current-password'}" required minlength="6"${up ? ' placeholder="At least 6 characters"' : ''}`)}
          <p class="acct-msg" role="alert"></p>
          <button class="btn primary" type="submit">${up ? 'Create account' : 'Sign in'}</button>
          ${up ? '' : '<button class="acct-link" type="button" data-acct="reset">Forgot your password?</button>'}
        </form>
        <div class="acct-or"><span>or</span></div>
        <button class="btn acct-google" data-acct="google">${GOOGLE}Continue with Google</button>
        <p class="acct-fine">${up ? 'What you’ve played on this device comes with you into the new account.' : 'What you’ve played on this device is added to your account.'}</p>`);
    sheet.querySelector('input')?.focus();
  }

  async function renderMe() {
    const since = user.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString('en', { month: 'long', year: 'numeric' }) : '';
    const google = user.providerData.some((p) => p.providerId === 'google.com'), email = user.providerData.some((p) => p.providerId === 'password');
    sheet.innerHTML = shell(`<div class="acct-head">${avatar(user, 'big')}<div><h2>${esc(nameOf(user))}</h2><p class="sheet-lede">${esc(user.email || '')}${since ? ` · Joined ${since}` : ''}</p></div></div>
      <p class="acct-sync" data-st="${syncState}"></p>
      <h3>Your record</h3>
      <div class="acct-grid" aria-busy="true"></div>
      <details class="acct-more"><summary>Account settings</summary>
        <form class="acct-form" data-form="name" novalidate>${field('name', 'Name', 'text', `autocomplete="nickname" maxlength="40" value="${esc(user.displayName || '')}"`)}<button class="btn" type="submit">Save name</button></form>
        <div class="acct-row">${email ? '<button class="btn ghost" data-acct="pw">Email me a password reset link</button>' : ''}${google ? '<span class="acct-fine">Signed in with Google</span>' : ''}</div>
        <p class="acct-msg" role="alert"></p>
        <div class="acct-danger"><button class="btn ghost" data-acct="delete">Delete account</button></div>
      </details>
      <button class="btn acct-out" data-acct="out">Sign out</button>
      <p class="acct-fine">Signing out takes your progress off this device. It stays safe in your account.</p>`);
    refreshSync();
    const grid = sheet.querySelector('.acct-grid');
    try {
      const rows = await summary();
      if (grid.isConnected) { grid.innerHTML = rows.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join(''); grid.removeAttribute('aria-busy'); }
    } catch { grid.remove(); }
  }
  function refreshSync() {
    const el = sheet?.querySelector('.acct-sync'); if (!el) return;
    el.dataset.st = syncState;
    el.textContent = syncState === 'synced' ? `Saved to your account${syncedAt ? `, ${ago(syncedAt)}` : ''}. It follows you to any device you sign in on.` : syncState === 'retry' ? 'Saved on this device. Your account couldn’t be reached just now, so it will try again.' : 'Connecting to your account…';
  }

  const say = (msg, ok) => { const m = sheet.querySelector('.acct-msg'); if (m) { m.textContent = msg; m.classList.toggle('ok', !!ok); } };
  const fail = (e) => { if (QUIET.has(e?.code)) return say(''); console.warn('Fraguessr: account', e); say(ERRORS[e?.code] || 'Something went wrong. Please try again.'); };
  const busy = (on) => sheet.querySelectorAll('button, input').forEach((x) => { x.disabled = on; });

  async function submit(form) {
    const { auth, a } = fb, f = Object.fromEntries(new FormData(form)), kind = form.dataset.form;
    const email = (f.email || '').trim(), pw = f.password || '', name = (f.name || '').trim().slice(0, 40);
    if (kind !== 'name' && !email) return say(ERRORS['auth/invalid-email']);
    if ((kind === 'up' || kind === 'in') && !pw) return say(ERRORS['auth/missing-password']);
    if (kind === 'up' && pw.length < 6) return say(ERRORS['auth/weak-password']);
    busy(true);
    try {
      if (kind === 'up') {
        // the guest user becomes the account, so everything it has already counted stays with it
        const cur = a.currentUser, cred = auth.EmailAuthProvider.credential(email, pw);
        const { user: u } = cur?.isAnonymous ? await auth.linkWithCredential(cur, cred) : await auth.createUserWithEmailAndPassword(a, email, pw);
        if (name) await auth.updateProfile(u, { displayName: name });
        await welcome(u);
      } else if (kind === 'in') {
        await auth.signInWithEmailAndPassword(a, email, pw);
      } else if (kind === 'reset') {
        await auth.sendPasswordResetEmail(a, email);
        busy(false); return say('Check your inbox for a link to choose a new password.', true);
      } else if (kind === 'name') {
        await auth.updateProfile(user, { displayName: name || null }); paint(); onChange?.(user);
        busy(false); renderMe(); return;
      }
    } catch (e) { busy(false); return fail(e); }
    busy(false);
  }
  // onAuthStateChanged doesn't fire when a guest is linked or renamed, so the new account is picked up here
  async function welcome(u) { await u.reload().catch(() => {}); user = fb.a.currentUser; paint(); linkSave(user); onChange?.(user); render(); }

  async function act(e) {
    const b = e.target.closest('[data-acct]'); if (!b || b.disabled) return;
    const k = b.dataset.acct, { auth, a } = fb || {};
    if (k === 'close') return sheet.close();
    if (k === 'up' || k === 'in' || k === 'reset') { view = k; return render(); }
    if (k === 'google') {
      busy(true);
      const provider = new auth.GoogleAuthProvider();
      try {
        const cur = a.currentUser;
        if (cur?.isAnonymous) {
          try { const { user: u } = await auth.linkWithPopup(cur, provider); busy(false); return welcome(u); }
          catch (err) {
            // that Google account already has a Fraguessr account: sign in to it (this device's play is merged in)
            if (err?.code !== 'auth/credential-already-in-use') throw err;
            await auth.signInWithCredential(a, auth.GoogleAuthProvider.credentialFromError(err));
          }
        } else await auth.signInWithPopup(a, provider);
      } catch (err) { busy(false); return fail(err); }
      return busy(false);
    }
    if (k === 'pw') { try { await auth.sendPasswordResetEmail(a, user.email); say(`A reset link is on its way to ${user.email}.`, true); } catch (err) { fail(err); } return; }
    if (k === 'out') {
      if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'Sign out of this device?'; return; }
      busy(true); await leave(() => auth.signOut(a)); return;
    }
    if (k === 'delete') {
      // Firebase only lets a fresh sign-in delete an account, so the player confirms with their password (or Google)
      const pwd = user.providerData.some((p) => p.providerId === 'password');
      if (!b.classList.contains('sure')) {
        b.classList.add('sure'); b.textContent = 'Delete my account for good';
        if (pwd) b.insertAdjacentHTML('beforebegin', field('confirm', 'Your password, to confirm', 'password', 'autocomplete="current-password"'));
        say('This deletes your account and the progress saved in it. It can’t be undone.');
        sheet.querySelector('[name=confirm]')?.focus(); return;
      }
      busy(true);
      try {
        if (pwd) await auth.reauthenticateWithCredential(user, auth.EmailAuthProvider.credential(user.email, sheet.querySelector('[name=confirm]')?.value || ''));
        else await auth.reauthenticateWithPopup(user, new auth.GoogleAuthProvider());
      } catch (err) { busy(false); return /wrong-password|invalid-credential/.test(err?.code) ? say('That password isn’t right.') : fail(err); }
      try {
        sync?.stop(); sync = null;
        await fb.db.remove(fb.db.ref(fb.d, `users/${user.uid}`));
        await leave(() => auth.deleteUser(user), false);
      } catch (err) { busy(false); linkSave(user); fail(err); }
    }
  }
  // sign out (or delete): save first, then take this player's progress off the device and start fresh as a guest
  async function leave(go, save = true) {
    if (save) await Promise.race([sync?.flush(), new Promise((r) => setTimeout(r, 4000))]);
    sync?.stop(); sync = null; hooks.set(null);
    await go();
    for (const k of Object.keys(localStorage)) if (MINE.test(k)) localStorage.removeItem(k);
    location.reload();
  }
  return { open };
}
