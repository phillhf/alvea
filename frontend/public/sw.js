// Service Worker – Betten & Entlassreinigung
// Version: 2.0 – Mit API-Cache für Offline-Lesezugriff

const CACHE_STATIC  = "betten-static-v3";
const CACHE_API     = "betten-api-v3";

// GET-Endpunkte die offline gecacht werden (read-only)
const CACHE_API_PATTERNS = [
  /^\/api\/tasks/,
  /^\/api\/stations/,
  /^\/api\/defects/,
  /^\/api\/announcements/,
  /^\/api\/modules/,
  /^\/api\/settings/,
  /^\/api\/o2\/(flaschen|anfragen|lager|typen|barcodes|bestand)/,
  /^\/api\/ruecksendungen/,
  /^\/api\/lockers/,
  /^\/api\/hierarchy/,
  /^\/api\/houses/,
  /^\/api\/areas/,
  /^\/api\/users/,
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) =>
      cache.addAll(["/", "/index.html"])
    )
  );
  self.skipWaiting();
});

// ── Activate: alte Caches löschen ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_STATIC && k !== CACHE_API)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nur eigene Origin behandeln
  if (url.origin !== self.location.origin) return;

  // API-Requests
  if (url.pathname.startsWith("/api/")) {
    // POST/PATCH/PUT/DELETE: immer Network, nie cachen
    if (request.method !== "GET") {
      event.respondWith(fetch(request));
      return;
    }

    // GET-Requests: Network-First, Fallback auf Cache
    const shouldCache = CACHE_API_PATTERNS.some((p) => p.test(url.pathname));

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (shouldCache && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_API).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          if (shouldCache) {
            const cached = await caches.match(request);
            if (cached) return cached;
          }
          return new Response(
            JSON.stringify({ error: "offline", cached: false }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        })
    );
    return;
  }

  // Statische Assets (Vite-Hashes = sicher für Cache-First)
  if (url.pathname.startsWith("/assets/") ||
      url.pathname.endsWith(".woff2") ||
      url.pathname.endsWith(".woff") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".ico")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_STATIC).then((c) => c.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML-Navigation: Network-First, Fallback auf /index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then(
          (cached) =>
            cached ||
            new Response("<h1>Offline</h1><p>Bitte Verbindung prüfen.</p>", {
              status: 503,
              headers: { "Content-Type": "text/html" },
            })
        )
      )
    );
    return;
  }
});

// ── Nachricht von App empfangen ───────────────────────────────────────────────
self.addEventListener("message", (event) => {
  // Cache leeren wenn Update verfügbar
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
  if (event.data === "clearApiCache") {
    caches.delete(CACHE_API);
  }
});
