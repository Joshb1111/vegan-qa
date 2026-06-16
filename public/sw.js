/* Vegan Chat — minimal service worker.
   Caches the page shell so the PWA opens instantly, but always
   network-fetches /api/* so chat answers never get stale. */
const CACHE = 'vegan-chat-v1';
const SHELL = ['/', '/manifest.json'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Never intercept API calls — they must always hit the network so
    // answers and rate limits are accurate.
    if (url.pathname.startsWith('/api/')) return;

    // Same-origin GETs: cache-first with a network fallback that updates the cache.
    if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

    e.respondWith(
        caches.match(e.request).then((cached) => {
            const networked = fetch(e.request)
                .then((resp) => {
                    if (resp && resp.status === 200) {
                        const copy = resp.clone();
                        caches.open(CACHE).then((c) => c.put(e.request, copy));
                    }
                    return resp;
                })
                .catch(() => cached);
            return cached || networked;
        })
    );
});
