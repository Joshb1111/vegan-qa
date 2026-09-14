/* Vegan Chat — service worker.
   Network-first for the HTML document so a new deploy is picked up immediately
   (no stale index.html pointing at a deleted asset hash → no blank first load).
   Content-hashed /assets/* are immutable, so those stay cache-first for speed.
   Everything falls back to cache when offline. /api/* is never intercepted. */
const CACHE = 'vegan-chat-v3';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Only handle our own same-origin GETs. Never touch the API.
    if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;

    const putInCache = (resp) => {
        if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
    };

    // Content-hashed assets are immutable — a given filename never changes.
    // Cache-first is safe and fast; fetch + cache on a miss.
    // Only the build's hashed bundles (name-HASH.ext) are immutable; the game's models, textures and sounds under /assets/ change, so they go network-first like the HTML.
    if (/^\/assets\/[^/]+-[A-Za-z0-9_]{6,}\.(js|css|woff2?|png|svg|jpe?g)$/.test(url.pathname)) {
        e.respondWith(
            caches.match(e.request).then((cached) => cached || fetch(e.request).then(putInCache))
        );
        return;
    }

    // Everything else (the HTML document, manifest, icons): network-first so it's
    // always current, falling back to the cache only when the network fails.
    e.respondWith(
        fetch(e.request).then(putInCache).catch(() => caches.match(e.request))
    );
});
