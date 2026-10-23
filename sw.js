// Fraguessr's service worker (build 27af0c1a62). Stamped modules (?v=) never change, so they come from the device;
// the page, the thumbnails and the fonts' stylesheet are refreshed from the network and kept for offline visits.
const V = '27af0c1a62', ASSETS = 'fraguessr-assets', PAGES = 'fraguessr-pages', IMAGES = 'fraguessr-images';
const KEEP = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/[^/]+@\d|fonts\.gstatic\.com\/)/;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const c = await caches.open(ASSETS);
  for (const r of await c.keys()) { const u = new URL(r.url); if (u.origin === location.origin && u.searchParams.has('v') && u.searchParams.get('v') !== V) await c.delete(r); }
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
