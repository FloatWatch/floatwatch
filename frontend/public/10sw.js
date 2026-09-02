self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  if (url.pathname.includes("*")) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch (_error) {
        return Response.error();
      }
    })(),
  );
});
