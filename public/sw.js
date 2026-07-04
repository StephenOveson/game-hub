/**
 * Deliberately minimal service worker.
 *
 * This app is a live WebSocket game — caching app shell chunks risks serving
 * stale builds after a deploy, and there's nothing useful to do offline. So
 * the SW handles exactly one thing: navigation requests get a network-first
 * fetch with a cached offline fallback page. Assets, API calls, and the
 * /ws upgrade are never touched.
 */
const CACHE = "card-room-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((r) => r ?? Response.error())
    )
  );
});
