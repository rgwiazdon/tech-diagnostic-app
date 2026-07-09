/*
  Service worker for Bell Diagnostic Coach.
  --------------------------------------------------------------------
  Strategy: NETWORK FIRST, falling back to cache.

  Why: the app must work offline in the field, but techs must never get
  stuck on a stale version. So we always try to fetch the newest file
  from the network; if there's no signal, we serve the cached copy.

  This means you no longer have to bump the version to see your changes.
  (Bumping it is still good hygiene when you change files.)
*/

const CACHE_VERSION = "bdc-v13";

const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./pt-data.js",
  "./piston-chart.js",
  "./knowledge.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

// Install: pre-cache the app so it works offline immediately.
// Individual failures don't sink the whole install.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(APP_FILES.map((f) => cache.add(f).catch(() => null)))
    )
  );
  self.skipWaiting(); // take over right away instead of waiting for old tabs
});

// Activate: delete every old cache version.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: try the network first so fresh files always win.
// If the network fails (no signal), fall back to the cached copy.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone(); // save a fresh copy for offline use
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        // Offline: serve from cache; for page loads fall back to index.html.
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
