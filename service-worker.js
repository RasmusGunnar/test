// /service-worker.js
/* Minimal SW: cache-bust via ?vv=... i registreringen */
const CACHE = 'webkiosk-cache-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k!==CACHE && caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      try {
        const net = await fetch(req);
        cache.put(req, net.clone());
        return net;
      } catch {
        const hit = await cache.match(req);
        return hit || new Response('', {status: 504, statusText:'Offline'});
      }
    })
  );
});
