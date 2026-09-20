// lithium service worker
// Registered as /sw.js?proxy=<ultraviolet|scramjet> by client/index.js, and
// only loads the code for the proxy it was asked for. Has to be served from
// the site root so its scope covers the proxied routes.
const proxy = new URL(self.location.href).searchParams.get("proxy") || "ultraviolet"

// Without these, the worker only takes control after a reload, so the very
// first request from the iframe would skip the proxy entirely.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

if (proxy === "scramjet") {
  // Scramjet 2.x: the controller decides what to route. shouldRoute() is
  // false for its own runtime files, so they don't get intercepted.
  importScripts("/controller/controller.sw.js")

  self.addEventListener("fetch", (event) => {
    if ($scramjetController.shouldRoute(event)) {
      event.respondWith($scramjetController.route(event))
    }
  })
} else {
  // Ultraviolet 3.x (transport is handled by bare-mux on the page side)
  importScripts("/uv/uv.bundle.js")
  importScripts("/uv/uv.config.js")
  importScripts(self.__uv$config.sw || "/uv/uv.sw.js")

  const uv = new UVServiceWorker()

  self.addEventListener("fetch", (event) => {
    if (uv.route(event)) event.respondWith(uv.fetch(event))
  })
}
