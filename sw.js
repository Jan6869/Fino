/* Fino – Service Worker: macht die App offline nutzbar.
   Er lädt ausschließlich die eigenen Dateien dieser App. Deine Buchungen
   liegen in der Datenbank des Browsers und werden nie versendet. */
const CACHE = 'fino-v5';   // bei jeder neuen Version hochzählen (und VERSION in app.js ebenso)
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest',
  'fonts/inter-latin-opsz-normal.woff2',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Aus dem Cache antworten (sofort, auch offline) und im Hintergrund aktualisieren.
   Eine neue Version erscheint dadurch beim nächsten Start. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    })
  );
});
