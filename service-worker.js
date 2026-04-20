const CACHE_NAME = "zerovault-static-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./src/app.js",
  "./src/ui.js",
  "./src/state.js",
  "./src/vault.js",
  "./src/qrcode.js",
  "./src/crypto/crypto.js",
  "./src/crypto/encoding.js",
  "./src/features/passwords.js",
  "./src/features/importers.js",
  "./src/features/totp.js",
  "./src/features/kdf.js",
  "./src/features/validation.js",
  "./src/features/reports.js",
  "./src/argon2-adapter.js",
  "./tests/index.html",
  "./tests/runner.js",
  "./tests/passwords.test.mjs",
  "./tests/imports.test.mjs",
  "./logo.png",
  "./favicon.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
