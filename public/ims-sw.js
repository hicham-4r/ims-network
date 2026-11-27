/* IMS installability: no CacheStorage, no private response storage. */
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin || url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname === "/_next" || url.pathname.startsWith("/_next/")) return;
  event.respondWith(fetch(request).catch(() => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IMS Network — Offline</title><body><main><h1>You're offline</h1><p>Reconnect to access IMS Network. For your privacy, account data and conversations are not stored for offline access.</p><p><a href="/dashboard">Try again</a></p></main></body></html>`, {status:503, headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"}})));
});
