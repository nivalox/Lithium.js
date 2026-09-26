// Scramjet 2.x backend for the Lithium client (see ultraviolet.js for the
// backend module contract).

export async function init(ctx) {
  if (!window.crossOriginIsolated) {
    console.warn("[lithium] page is not cross-origin isolated, some proxied sites will break (needs https or localhost, and the server's COOP/COEP headers)")
  }

  for (const src of ["/scram/scramjet.js", "/controller/controller.api.js", "/utils/scramjet-utils.js"]) {
    await ctx.load_script(src)
  }
  const api = window.$scramjetController
  if (!api?.Controller) throw new Error("scramjet controller global ($scramjetController) is missing")

  // the transport is a plain object handed straight to the controller
  const { default: Transport } = await import(ctx.transport_url)

  const controller = new api.Controller({
    serviceworker: ctx.serviceworker,
    transport: new Transport({ wisp: ctx.wisp_url }),
    config: {
      scramjetPath: "/scram/scramjet.js",
      wasmPath: "/scram/scramjet.wasm",
      injectPath: "/controller/controller.inject.js",
    },
  })
  // don't create frames before this resolves or the first navigation can 404
  await controller.wait()
  ctx.state.controller = controller

  // browsers kill idle service workers after ~30s and scramjet's worker
  // forgets its routes when that happens (later navigations 404 until a
  // reload). a ping resets the idle timer.
  setInterval(() => navigator.serviceWorker.controller?.postMessage("keepalive"), 15000)

  console.log(`[lithium] scramjet ready (${ctx.transport} over ${ctx.wisp_url})`)
}

export function navigate(url, ctx) {
  // one frame, reused (creating a new one per navigation leaks iframes)
  if (!ctx.state.frame) {
    const utils = window.$scramjetUtils
    ctx.state.frame = ctx.state.controller.createFrame(ctx.iframe(), {
      plugins: [
        // target="_blank" / window.open would otherwise escape the proxy
        new utils.CatchEscapedLinksPlugin(() => new URL(location.href)),
        // scramjet tells us where the page went, no polling needed
        new utils.UrlWatcherPlugin((u) => ctx.report_url(String(u))),
      ],
    })
  }
  ctx.state.frame.go(url) // synchronous
    }
