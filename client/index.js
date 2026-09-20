// lithium client
// Load with <script type="module"> (or import it). It pulls in whatever
// proxy scripts it needs by itself, no extra <script> tags required.

// the server injects this into your html (see server/index.js)
const server_config = () => (typeof window !== "undefined" && window.__LITHIUM_CONFIG__) || {}

const state = {
  proxy: null,
  transport: null,
  ready: false,
  controller: null, // scramjet only
  frame: null, // scramjet only
  search_engine: "google",
  on_url_change: null,
}

// helper to load scripts dynamically
function load_script(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = src
    script.onload = resolve
    script.onerror = () => reject(new Error(`failed to load ${src}`))
    document.head.appendChild(script)
  })
}

// The browser only says "script evaluation failed" when a service worker can't
// start, which is nearly always an importScripts() that 404'd. Check every
// file the worker imports and say which one is missing.
async function diagnose_sw(proxy) {
  const probe = async (path, note = "") => {
    try {
      const r = await fetch(path, { cache: "no-store" })
      console.error(`[lithium]   ${r.status} ${path} (${r.headers.get("content-type")}) ${note}`)
      return r
    } catch (e) {
      console.error(`[lithium]   failed ${path}: ${e.message}`)
    }
  }
  console.error("[lithium] the service worker failed to start, checking the files it imports:")
  if (proxy === "scramjet") {
    await probe("/controller/controller.sw.js")
    return
  }
  for (const p of ["/uv/uv.bundle.js", "/uv/uv.sw.js", "/uv/uv.handler.js", "/uv/uv.client.js"]) await probe(p)
  const cfg = await probe("/uv/uv.config.js")
  if (cfg?.ok) {
    // the paths the config itself points at are what actually get imported
    for (const m of (await cfg.text()).matchAll(/\b(handler|client|bundle|config|sw)\s*:\s*["']([^"']+)["']/g)) {
      await probe(m[2], `<- config.${m[1]}`)
    }
  }
}

async function register_sw(proxy) {
  let registration
  try {
    registration = await navigator.serviceWorker.register(`/sw.js?proxy=${proxy}`, {
      scope: "/",
      updateViaCache: "none",
    })
  } catch (err) {
    await diagnose_sw(proxy).catch(() => {})
    throw err
  }
  await navigator.serviceWorker.ready

  // wait until the worker actually controls this page, or the first
  // navigation can slip past it
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true })
    )
  }
  return navigator.serviceWorker.controller ?? registration.active
}

function wisp_url() {
  return (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/"
}

// ultraviolet 3.x: transport goes through bare-mux (a SharedWorker)
async function init_ultraviolet(transport) {
  await load_script("/baremux/index.js")
  await load_script("/uv/uv.bundle.js")
  await load_script("/uv/uv.config.js")

  const conn = new BareMux.BareMuxConnection("/baremux/worker.js")
  await conn.setTransport(`/bm/${transport}/index.mjs`, [{ wisp: wisp_url() }])
  console.log(`[lithium] ultraviolet ready (${transport} over ${wisp_url()})`)
}

// scramjet 2.x: transport is a plain object handed to the controller
async function init_scramjet(transport, serviceworker) {
  if (!window.crossOriginIsolated) {
    console.warn("[lithium] page is not cross-origin isolated, some proxied sites will break (needs https or localhost, and the server's COOP/COEP headers)")
  }

  for (const src of ["/scram/scramjet.js", "/controller/controller.api.js", "/utils/scramjet-utils.js"]) {
    await load_script(src)
  }
  const api = window.$scramjetController
  if (!api?.Controller) throw new Error("scramjet controller global ($scramjetController) is missing")

  const { default: Transport } = await import(`/${transport}/index.mjs`)

  const controller = new api.Controller({
    serviceworker,
    transport: new Transport({ wisp: wisp_url() }),
    config: {
      scramjetPath: "/scram/scramjet.js",
      wasmPath: "/scram/scramjet.wasm",
      injectPath: "/controller/controller.inject.js",
    },
  })
  // don't create frames before this resolves or the first navigation can 404
  await controller.wait()
  state.controller = controller

  // browsers kill idle service workers after ~30s and scramjet's worker
  // forgets its routes when that happens (later navigations 404 until a
  // reload). a ping resets the idle timer.
  setInterval(() => navigator.serviceWorker.controller?.postMessage("keepalive"), 15000)

  console.log(`[lithium] scramjet ready (${transport} over ${wisp_url()})`)
}

// init the thing
export async function init_lithium(cfg = {}) {
  const conf = server_config()
  // same defaults as the server
  const proxy = conf.proxy || "ultraviolet"
  const transport = conf.transport || "epoxy"

  state.proxy = proxy
  state.transport = transport
  state.search_engine = cfg.searchEngine || "google"
  state.on_url_change = cfg.onUrlChange || null

  // keep these around so your own ui can read them
  localStorage.setItem("proxy", proxy)
  localStorage.setItem("transport", transport)
  localStorage.setItem("engine", state.search_engine)
  console.log("[lithium] config:", { proxy, transport })

  try {
    const serviceworker = await register_sw(proxy)
    if (proxy === "scramjet") await init_scramjet(transport, serviceworker)
    else if (proxy === "ultraviolet") await init_ultraviolet(transport)
    else throw new Error(`unknown proxy "${proxy}"`)
  } catch (err) {
    console.error("[lithium] init failed:", err)
    throw err // don't pretend we're ready
  }

  state.ready = true
  if (cfg.onReady) cfg.onReady()
}

// the iframe pages are shown in: #proxyFrame if you have one, else we make it
function get_iframe() {
  let iframe = document.getElementById("proxyFrame")
  if (!iframe) {
    iframe = document.createElement("iframe")
    iframe.id = "proxyFrame"
    iframe.style.cssText = "width:100%;height:100%;border:0"
    ;(document.getElementById("container") || document.body).appendChild(iframe)
  }
  return iframe
}

// go somewhere on the internet
export async function navigate(input) {
  if (!state.ready) {
    console.error("[lithium] not ready yet, await init_lithium() first")
    return
  }

  // read every time so a settings page can change it on the fly
  const engine = localStorage.getItem("engine") || state.search_engine
  const url = to_url(input, engine)

  const iframe = get_iframe()
  document.getElementById("container")?.classList.add("browsing")

  if (state.proxy === "scramjet") {
    // one frame, reused. (creating a new one per navigation leaks iframes)
    if (!state.frame) {
      const utils = window.$scramjetUtils
      const plugins = [
        // target="_blank" / window.open would otherwise escape the proxy
        new utils.CatchEscapedLinksPlugin(() => new URL(location.href)),
      ]
      if (state.on_url_change) plugins.push(new utils.UrlWatcherPlugin(state.on_url_change))
      state.frame = state.controller.createFrame(iframe, { plugins })
    }
    state.frame.go(url) // synchronous
    return
  }

  iframe.src = __uv$config.prefix + __uv$config.encodeUrl(url)
}

// checks if its a url or some random junk
export function is_url(v = "") {
  v = v.trim()
  if (/^https?:\/\//i.test(v)) return true
  if (/\s/.test(v)) return false // "what is 3.14" is a search, not a url
  return (
    /^[^\s/?#]+\.[a-z]{2,}(:\d+)?([/?#]|$)/i.test(v) || // example.com, a.b.co/path
    /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)/.test(v) // 192.168.1.1:8080
  )
}

// turn whatever was typed into a full url (or a search url)
export function to_url(input, engine = "google") {
  const val = input.trim()
  if (!is_url(val)) {
    const q = encodeURIComponent(val)
    return engine === "duckduckgo" ? `https://duckduckgo.com/?q=${q}` : `https://www.google.com/search?q=${q}`
  }
  return /^https?:\/\//i.test(val) ? val : "https://" + val
}
