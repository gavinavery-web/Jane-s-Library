const CACHE_NAME = 'janes-library-v4';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './src/app.js',
  './src/libraryStore.js',
  './src/isbn.js',
  './src/filters.js',
  './src/backup.js',
  './src/googleDriveBackup.js',
  './src/config/googleDriveConfig.js',
  './src/categories.js',
  './src/ocrCandidates.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon.svg',
  './assets/ui/home-library.jpg',
  './assets/ui/shelves-library-optimized.jpg',
  './assets/ui/book-spines-optimized.jpg',
  './assets/ui/settings-library.jpg',
  './assets/ui/book-open.svg',
  './assets/ui/reading-lady.svg',
  './assets/ui/library-donkey.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }))
  );
});
