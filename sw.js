/*
  Service worker for Bell Diagnostic Coach.
  --------------------------------------------------------------------
  Its only job in version one is to cache the app files so the tool
  keeps working in the field even when there is no cell signal.
  If you change any app file, bump the CACHE_VERSION number below so
  phones pull the fresh copy on their next visit.
*/

const CACHE_VERSION = "bdc-v2";

// All the files that make up the app. Paths are relative so the app
// works no matter what folder it is served from.
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./pt-data.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

// On install: pre-cache every app file.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

// On activate: delete any old caches from previous versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// On fetch: serve from cache first, fall back to the network.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
