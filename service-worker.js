// service-worker.js (optional; not used by SAFE html unless you register it explicitly)
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { self.clients.claim(); });
self.addEventListener('fetch', () => {});
