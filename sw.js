// Fraguessr's service worker (build db83f2dc61). Stamped modules (?v=) never change, so they come from the device;
// the page, the thumbnails and the fonts' stylesheet are refreshed from the network and kept for offline visits.
// Versioned libraries (the 3D and globe code, the fonts, Firebase's SDK) never change at their address, so they are kept too.
const V = 'db83f2dc61', ASSETS = 'fraguessr-assets', PAGES = 'fraguessr-pages', IMAGES = 'fraguessr-images', META = 'fraguessr-meta';
const KEEP = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/[^/]+@\d|fonts\.gstatic\.com\/|www\.gstatic\.com\/firebasejs\/\d)/;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // the previous build's files stay one more round, for a tab still open on it
  const m = await caches.open(META), seen = (await (await m.match('versions'))?.json().catch(() => null)) || [];
  const keep = [...seen.filter((x) => x !== V), V].slice(-2);
  await m.put('versions', new Response(JSON.stringify(keep)));
  const c = await caches.open(ASSETS);
  for (const r of await c.keys()) { const u = new URL(r.url); if (u.origin === location.origin && u.searchParams.has('v') && !keep.includes(u.searchParams.get('v'))) await c.delete(r); }
  await self.clients.claim();
})()));
const put = (name, req, res) => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(name).then((c) => c.put(req, copy)); } return res; };
const cacheFirst = async (name, req) => (await caches.match(req)) || put(name, req, await fetch(req));
const networkFirst = async (name, req) => { try { return put(name, req, await fetch(req)); } catch (err) { const hit = await caches.match(req); if (hit) return hit; throw err; } };
const fresh = async (name, req) => { const hit = await caches.match(req), net = fetch(req).then((res) => put(name, req, res)).catch(() => hit); return hit || net; };
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (u.searchParams.has('v')) return e.respondWith(cacheFirst(ASSETS, req));
    if (u.pathname.includes('/thumbs/')) return e.respondWith(fresh(IMAGES, req));
    return e.respondWith(networkFirst(PAGES, req));
  }
  if (KEEP.test(req.url)) return e.respondWith(cacheFirst(ASSETS, req));
  if (u.hostname === 'fonts.googleapis.com') return e.respondWith(fresh(ASSETS, req));
});
