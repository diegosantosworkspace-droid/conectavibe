const CACHE = "conectavibe-v1";
const STATIC = ["/", "/index.html", "/manifest.json", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Nao cachear Firebase, APIs externas ou chamadas nao-GET
  if (e.request.method !== "GET") return;
  if (url.hostname.includes("firebase") || url.hostname.includes("googleapis") || url.hostname.includes("gstatic") ||
      url.hostname.includes("open-meteo") || url.hostname.includes("rss2json") || url.hostname.includes("itunes") ||
      url.hostname.includes("tailwindcss") || url.hostname.includes("fonts.")) {
    return;
  }
  // Ignora esquemas nao suportados pelo Cache (chrome-extension, etc.)
  if (!e.request.url.startsWith("http")) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone).catch(() => {}));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});