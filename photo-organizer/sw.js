// App-shell cache so the organizer keeps working offline once installed.
// Photo data itself lives in IndexedDB, not here.
const CACHE = 'photo-organizer-v1';
const SHELL = [
  './', './index.html', './style.css', './lock.js', './app.js', './db.js', './exif.js', './blur.js', './faces.js',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

// Face-recognition model weights are large and only needed once the user
// opts into "자동 얼굴 그룹 찾기" — cached lazily on first use (see fetch
// handler below) rather than pre-cached at install time.

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // App shell: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, clone));
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // Cross-origin (face-api.js + model weights from CDN): cache-first so it works offline after first load
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});
