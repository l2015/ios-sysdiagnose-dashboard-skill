/**
 * Service Worker for iPhone Sysdiagnose Analyzer PWA
 * Provides offline caching and enables "Add to Home Screen"
 */

const CACHE_NAME = 'sysdiagnose-v0.3.3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './lib/pako.min.js',
  './lib/sql.js',
  './lib/sql-wasm.wasm',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;
  
  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request))
      .catch(() => caches.match('/index.html'))
  );
});
