// Service worker Hermest Board.
// Стратегия обновляемости (критично для приложения на N устройств):
//  - навигации и index.html — network-first: свежий UI всегда, кэш лишь офлайн;
//  - хэшированные ассеты Vite (/assets/*) иммутабельны — cache-first, дёшево и офлайн;
//  - /api/* — динамика, не кэшируется вовсе (иначе устаревают провайдеры/джобы);
//  - skipWaiting + clients.claim: новая версия SW берёт управление сразу, без «сброса вручную».
const CACHE_NAME = "hermest-board-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./hermest-board.svg",
  "./site.webmanifest"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Сторонние (мост :8788, внешние API) и динамические /api/* — мимо кэша, как есть.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isNavigation = request.mode === "navigate"
    || url.pathname === "/"
    || url.pathname.endsWith("/index.html");
  event.respondWith(isNavigation ? networkFirst(request) : cacheFirst(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match("./index.html");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
