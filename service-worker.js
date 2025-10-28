/* webkiosk: SW-killer – gør intet, afregistrerer sig selv, rydder caches */
self.addEventListener('install', (e) => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 1) Ryd alle caches (hvis en gammel SW har oprettet nogen)
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (err) {}

    // 2) Afregistrer denne SW (så der ikke er nogen fremover)
    try { await self.registration.unregister(); } catch (err) {}

    // 3) Få alle tabs under scope til at reloade én gang, så de kører “uden SW”
    try {
      const all = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      all.forEach((c) => c.navigate(c.url));
    } catch (err) {}
  })());
});

// 4) Ingen fetch-håndtering = ingen caching, ingen blokering
self.addEventListener('fetch', () => {});
