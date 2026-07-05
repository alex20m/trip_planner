const CACHE = "tripplan-v2";
const STATIC = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Nätverk-först, cache som fallback. Varje sida/route du besöker medan du har
// nät sparas automatiskt, så samma URL kan öppnas offline med senast kända data.
// Sidans egen kod (IndexedDB-lagret) sköter sen läsdata på ett mer strukturerat
// sätt – det här är ett skyddsnät för själva app-skalet (HTML/JS/CSS).
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const isNavigation = e.request.mode === "navigate";

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(e.request, { ignoreSearch: isNavigation });
        if (cached) return cached;
        if (isNavigation) return caches.match("/"); // sista utväg: cachad startsida
        return Response.error();
      })
  );
});
