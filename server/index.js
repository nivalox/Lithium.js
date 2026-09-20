import express from "express"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { join, dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import fs from "node:fs"
import { load } from "cheerio"

// --- proxy engines -----------------------------------------------------------
import { uvPath } from "@titaniumnetwork-dev/ultraviolet"
import { scramjetPath } from "@mercuryworkshop/scramjet/path"

// --- transports --------------------------------------------------------------
// There are TWO incompatible generations of the transport packages:
//   Ultraviolet 3.x  -> bare-mux interface        (epoxy ^2, libcurl ^1)
//   Scramjet 2.x     -> proxy-transports interface (epoxy ^3, libcurl ^2)
// Mixing them "sort of works" and then dies on random sites, so we install
// both and serve each proxy its own. The *-bm packages are npm aliases (see
// package.json) for the older bare-mux generation.
import { baremuxPath } from "@mercuryworkshop/bare-mux/node"
import { epoxyPath as epoxy_bm_path } from "epoxy-transport-bm"
import { libcurlPath as libcurl_bm_path } from "libcurl-transport-bm"

import { server as wisp } from "@mercuryworkshop/wisp-js/server"

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

const PROXIES = ["ultraviolet", "scramjet"]
const TRANSPORTS = ["epoxy", "libcurl"]

// browser files for the 2.x packages live next to their entry point
const dir_of = (specifier) => dirname(require.resolve(specifier))

// yell (once, at startup) if a mounted folder isn't what we expected, instead
// of letting it turn into a mystery 404 in the browser later
function check_dir(label, dir, file) {
  if (!fs.existsSync(join(dir, file))) {
    console.error(`[lithium] ${label}: expected "${file}" in ${dir} but it isn't there`)
  }
}

// main function
export function create_lithium_server(opts = {}) {
  const static_dir = opts.staticDir || "public"
  const port = opts.port || 8080
  const proxy = opts.proxy || "ultraviolet"
  const transport = opts.transport || "epoxy"
  // Scramjet passes cross-origin isolation on to every proxied site, and lots
  // of sites need it. Turn this off only if your own UI page loads
  // third-party assets (fonts, images, ...) that don't send CORP/CORS headers.
  const isolation = opts.crossOriginIsolation !== false

  if (!PROXIES.includes(proxy)) {
    throw new Error(`[lithium] unknown proxy "${proxy}" (expected: ${PROXIES.join(", ")})`)
  }
  if (!TRANSPORTS.includes(transport)) {
    throw new Error(`[lithium] unknown transport "${transport}" (expected: ${TRANSPORTS.join(", ")})`)
  }

  // absolute or relative, resolve() handles both (and Windows drive letters)
  const static_path = resolve(process.cwd(), static_dir)
  const client_path = join(__dirname, "..", "client")

  const app = express()
  const server = createServer(app)

  // Scramjet only: COOP/COEP make the page cross-origin isolated. Skipped for
  // Ultraviolet, whose service-worker responses don't opt in to COEP and would
  // get blocked inside an isolated page.
  if (proxy === "scramjet" && isolation) {
    app.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin")
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp")
      next()
    })
  }

  app.use("/client/", express.static(client_path))

  // sw.js has to be served from the root so its scope covers the whole site.
  // The client registers it as /sw.js?proxy=<name> and it loads only that
  // proxy's code.
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Service-Worker-Allowed", "/")
    res.sendFile(join(client_path, "sw.js"))
  })

  if (proxy === "ultraviolet") {
    const bm = transport === "epoxy" ? epoxy_bm_path : libcurl_bm_path
    app.use("/uv/", express.static(uvPath))
    app.use("/baremux/", express.static(baremuxPath))
    app.use(`/bm/${transport}/`, express.static(bm))

    check_dir("ultraviolet", uvPath, "uv.bundle.js")
    check_dir("bare-mux", baremuxPath, "worker.js")
    check_dir(`${transport} (bare-mux gen)`, bm, "index.mjs")
  } else {
    const core = dir_of(`@mercuryworkshop/${transport}-transport`)
    const controller = dir_of("@mercuryworkshop/scramjet-controller")
    const utils = dir_of("@mercuryworkshop/scramjet-utils")

    app.use("/scram/", express.static(scramjetPath))
    app.use("/controller/", express.static(controller))
    app.use("/utils/", express.static(utils))
    app.use(`/${transport}/`, express.static(core))

    check_dir("scramjet", scramjetPath, "scramjet.js")
    check_dir("scramjet", scramjetPath, "scramjet.wasm")
    check_dir("scramjet-controller", controller, "controller.sw.js")
    check_dir("scramjet-controller", controller, "controller.api.js")
    check_dir("scramjet-controller", controller, "controller.inject.js")
    check_dir("scramjet-utils", utils, "scramjet-utils.js")
    check_dir(`${transport} (proxy-transports gen)`, core, "index.mjs")
  }

  // --- config injection ------------------------------------------------------
  // The client reads window.__LITHIUM_CONFIG__ to know which proxy/transport
  // the server was started with.
  const config_script =
    "window.__LITHIUM_CONFIG__=" +
    JSON.stringify({ proxy, transport }).replace(/</g, "\\u003c") +
    ";"

  function inject_config(html) {
    try {
      const $ = load(html)
      const tag = `<script>${config_script}</script>`
      if ($("head").length) $("head").prepend(tag)
      else if ($("body").length) $("body").prepend(tag)
      else return tag + html
      return $.html()
    } catch (err) {
      console.error("[lithium] cheerio injection failed:", err)
      return html
    }
  }

  // map a request path to an .html file inside static_path, or null.
  // Never returns anything outside static_path (no ../ tricks).
  function html_file_for(req_path) {
    let rel
    try {
      rel = decodeURIComponent(req_path)
    } catch {
      return null
    }
    if (rel.endsWith("/")) rel += "index.html"
    if (!rel.endsWith(".html")) return null

    const full = resolve(static_path, "." + rel)
    if (full !== static_path && !full.startsWith(static_path + sep)) return null
    try {
      return fs.statSync(full).isFile() ? full : null
    } catch {
      return null
    }
  }

  // parsing HTML on every request is wasteful, so cache by mtime
  const html_cache = new Map()
  function read_html(file) {
    const mtime = fs.statSync(file).mtimeMs
    const hit = html_cache.get(file)
    if (hit && hit.mtime === mtime) return hit.html
    const html = inject_config(fs.readFileSync(file, "utf8"))
    html_cache.set(file, { mtime, html })
    return html
  }

  app.use((req, res, next) => {
    if (req.method !== "GET") return next()
    const file = html_file_for(req.path)
    if (!file) return next()
    try {
      return res.type("html").send(read_html(file))
    } catch (err) {
      console.error("[lithium] failed to read/inject file:", err)
      next()
    }
  })

  // everything else in the static dir (js, css, images, ...)
  app.use(express.static(static_path))

  // nothing in static dir matched "/" -> show that we're alive
  app.get("/", (_req, res) => {
    res.json({
      msg: "lithium server running",
      proxy,
      transport,
      staticDir: static_path,
    })
  })

  // wisp lives at /wisp/ and nowhere else
  server.on("upgrade", (req, sock, head) => {
    let pathname = null
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname
    } catch {}

    if (pathname === "/wisp/" && req.headers.upgrade?.toLowerCase() === "websocket") {
      req.url = pathname
      wisp.routeRequest(req, sock, head)
    } else if (server.listenerCount("upgrade") === 1) {
      // only close it if nobody else (e.g. your own ws handler) is listening
      sock.destroy()
    }
  })

  return { app, server, port }
}
