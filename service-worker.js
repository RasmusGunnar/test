const CACHE = "webkiosk-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./familieoversigt_index_v11_autosync_READY_UPDATED.html",
  "./webkiosk_apple_crisp_with_settings_fab.html",
  "./manifest.webmanifest"
];

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))) .then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e=>{
  if(e.request.method!=="GET") return;
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fetchP = fetch(e.request).then(res=>{
        caches.open(CACHE).then(c=>c.put(e.request, res.clone()));
        return res;
      }).catch(()=>cached);
      return cached || fetchP;
    })
  );
});