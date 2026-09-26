import { createRequire } from "node:module"
import { dirname } from "node:path"

import { uvPath } from "@titaniumnetwork-dev/ultraviolet"
import { scramjetPath } from "@mercuryworkshop/scramjet/path"
import { baremuxPath } from "@mercuryworkshop/bare-mux/node"
// npm aliases for the older (bare-mux generation) transports, see meta.js
import { epoxyPath as epoxy_bm_path } from "epoxy-transport-bm"
import { libcurlPath as libcurl_bm_path } from "libcurl-transport-bm"

import { PROXY_META, TRANSPORT_META } from "./meta.js"
import { LithiumError } from "./errors.js"

const require = createRequire(import.meta.url)
// browser files for the 2.x packages live next to their entry point
const dir_of = (specifier) => dirname(require.resolve(specifier))

// Ultraviolet config, served at /uv/uv.config.js. We generate it because the
// one shipped in the package points at root-relative files (/uv.sw.js, ...)
// that don't exist when everything is served under /uv/. UV injects these
// paths into every proxied page, so they all have to resolve. `prefix` is
// where proxied pages live, deliberately outside /uv/ (the static files).
const UV_CONFIG = `self.__uv$config = {
  prefix: "/service/",
  encodeUrl: Ultraviolet.codec.xor.encode,
  decodeUrl: Ultraviolet.codec.xor.decode,
  handler: "/uv/uv.handler.js",
  client: "/uv/uv.client.js",
  bundle: "/uv/uv.bundle.js",
  config: "/uv/uv.config.js",
  sw: "/uv/uv.sw.js",
};
`

const proxy_defs = new Map()
const transport_defs = new Map()

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/

// --------------------------------------------------------------- built-ins --
// A proxy definition:
//   name, interface, isolation, packages
//   routes(app)       optional, runs BEFORE mounts (so it can shadow a file)
//   mounts()          [{ label, url, dir, files }] static folders to serve
//   clientModule      URL of the browser-side module (custom proxies only,
//                     built-ins are bundled with the client)
//   serviceWorker     JS source for the worker (custom proxies only,
//                     built-ins use client/sw.js)
proxy_defs.set("ultraviolet", {
  name: "ultraviolet",
  ...PROXY_META.ultraviolet,
  builtin: true,
  routes(app) {
    app.get("/uv/uv.config.js", (_req, res) => {
      res.type("js").send(UV_CONFIG)
    })
  },
  mounts: () => [
    { label: "ultraviolet", url: "/uv/", dir: uvPath, files: ["uv.bundle.js", "uv.sw.js", "uv.handler.js", "uv.client.js"] },
    { label: "bare-mux", url: "/baremux/", dir: baremuxPath, files: ["worker.js"] },
  ],
})

proxy_defs.set("scramjet", {
  name: "scramjet",
  ...PROXY_META.scramjet,
  builtin: true,
  mounts: () => [
    { label: "scramjet", url: "/scram/", dir: scramjetPath, files: ["scramjet.js", "scramjet.wasm"] },
    { label: "scramjet-controller", url: "/controller/", dir: dir_of("@mercuryworkshop/scramjet-controller"), files: ["controller.sw.js", "controller.api.js", "controller.inject.js"] },
    { label: "scramjet-utils", url: "/utils/", dir: dir_of("@mercuryworkshop/scramjet-utils"), files: ["scramjet-utils.js"] },
  ],
})

// A transport definition:
//   name
//   interfaces: { [interface]: { package?, major?, mount, dir, entry? } }
//     mount  URL folder it's served under (e.g. "/epoxy/")
//     dir    folder on disk, or a function returning it
//     entry  file the browser imports (default "index.mjs")
transport_defs.set("epoxy", {
  name: "epoxy",
  builtin: true,
  interfaces: {
    "bare-mux": { ...TRANSPORT_META.epoxy["bare-mux"], mount: "/bm/epoxy/", dir: () => epoxy_bm_path },
    "proxy-transports": { ...TRANSPORT_META.epoxy["proxy-transports"], mount: "/epoxy/", dir: () => dir_of("@mercuryworkshop/epoxy-transport") },
  },
})

transport_defs.set("libcurl", {
  name: "libcurl",
  builtin: true,
  interfaces: {
    "bare-mux": { ...TRANSPORT_META.libcurl["bare-mux"], mount: "/bm/libcurl/", dir: () => libcurl_bm_path },
    "proxy-transports": { ...TRANSPORT_META.libcurl["proxy-transports"], mount: "/libcurl/", dir: () => dir_of("@mercuryworkshop/libcurl-transport") },
  },
})

// ------------------------------------------------------------ compatibility --
export function supports(proxy, transport) {
  const p = proxy_defs.get(proxy)
  const t = transport_defs.get(transport)
  return Boolean(p && t && t.interfaces[p.interface])
}

// -> { supported, interface, reason }
export function get_compatibility(proxy, transport) {
  const p = proxy_defs.get(proxy)
  const t = transport_defs.get(transport)
  if (!p) return { supported: false, interface: null, reason: `unknown proxy "${proxy}"` }
  if (!t) return { supported: false, interface: p.interface, reason: `unknown transport "${transport}"` }
  if (!t.interfaces[p.interface]) {
    return {
      supported: false,
      interface: p.interface,
      reason: `${proxy} uses the ${p.interface} interface, ${transport} only provides: ${Object.keys(t.interfaces).join(", ")}`,
    }
  }
  return { supported: true, interface: p.interface, reason: null }
}

// ---------------------------------------------------------------- public api --
export const proxies = {
  list: () => [...proxy_defs.keys()],
  has: (name) => proxy_defs.has(name),

  // plain-data description (safe to log / JSON.stringify)
  get(name) {
    const p = proxy_defs.get(name)
    if (!p) return null
    return {
      name: p.name,
      interface: p.interface,
      isolation: Boolean(p.isolation),
      builtin: Boolean(p.builtin),
      transports: transports.list().filter((t) => supports(name, t)),
      packages: (p.packages ?? []).map((x) => x.name),
    }
  },

  // Register your own proxy engine. You provide the server side (what to
  // serve), the service worker source and a browser module (see README,
  // "Custom backends").
  register(name, def = {}) {
    if (typeof name !== "string" || !NAME_RE.test(name)) {
      throw new LithiumError("INVALID_BACKEND", `proxy name must match ${NAME_RE}`, { name })
    }
    if (proxy_defs.has(name)) throw new LithiumError("BACKEND_EXISTS", `proxy "${name}" is already registered`, { name })

    const missing = ["interface", "serviceWorker", "clientModule"].filter((k) => typeof def[k] !== "string" || !def[k])
    if (missing.length) {
      throw new LithiumError("INVALID_BACKEND", `proxy "${name}" is missing: ${missing.join(", ")}`, { name, missing })
    }
    if (def.mounts != null && typeof def.mounts !== "function") {
      throw new LithiumError("INVALID_BACKEND", `proxy "${name}": mounts must be a function returning [{ label, url, dir, files }]`, { name })
    }
    if (def.routes != null && typeof def.routes !== "function") {
      throw new LithiumError("INVALID_BACKEND", `proxy "${name}": routes must be a function (app) => void`, { name })
    }
    proxy_defs.set(name, {
      name,
      interface: def.interface,
      isolation: Boolean(def.isolation),
      packages: def.packages ?? [],
      routes: def.routes,
      mounts: def.mounts ?? (() => []),
      serviceWorker: def.serviceWorker,
      clientModule: def.clientModule,
      builtin: false,
    })
  },
}

export const transports = {
  list: () => [...transport_defs.keys()],
  has: (name) => transport_defs.has(name),

  get(name) {
    const t = transport_defs.get(name)
    if (!t) return null
    return {
      name: t.name,
      builtin: Boolean(t.builtin),
      interfaces: Object.keys(t.interfaces),
      proxies: proxies.list().filter((p) => supports(p, name)),
    }
  },

  register(name, def = {}) {
    if (typeof name !== "string" || !NAME_RE.test(name)) {
      throw new LithiumError("INVALID_BACKEND", `transport name must match ${NAME_RE}`, { name })
    }
    if (transport_defs.has(name)) throw new LithiumError("BACKEND_EXISTS", `transport "${name}" is already registered`, { name })

    const entries = Object.entries(def.interfaces ?? {})
    if (!entries.length) {
      throw new LithiumError("INVALID_BACKEND", `transport "${name}" must provide at least one interface`, { name })
    }
    for (const [iface, impl] of entries) {
      const ok = impl && typeof impl.mount === "string" && impl.mount.startsWith("/") && impl.mount.endsWith("/") && impl.dir
      if (!ok) {
        throw new LithiumError("INVALID_BACKEND", `transport "${name}", interface "${iface}": needs mount ("/some/path/") and dir`, { name, interface: iface })
      }
    }
    transport_defs.set(name, { name, builtin: false, interfaces: Object.fromEntries(entries) })
  },
}

// ------------------------------------------------------------- for the server --
// Turns names into the full definitions, or throws a LithiumError that says
// what's wrong and what would work instead.
export function resolve_backend(proxy, transport) {
  const p = proxy_defs.get(proxy)
  if (!p) {
    throw new LithiumError("UNKNOWN_PROXY", `unknown proxy "${proxy}" (expected: ${proxies.list().join(", ")})`, {
      proxy, available: proxies.list(),
    })
  }
  const t = transport_defs.get(transport)
  if (!t) {
    throw new LithiumError("UNKNOWN_TRANSPORT", `unknown transport "${transport}" (expected: ${transports.list().join(", ")})`, {
      transport, available: transports.list(),
    })
  }
  const impl = t.interfaces[p.interface]
  if (!impl) {
    throw new LithiumError(
      "INCOMPATIBLE_TRANSPORT",
      `transport "${transport}" can't be used with ${proxy}: ${proxy} uses the ${p.interface} interface, ${transport} only provides ${Object.keys(t.interfaces).join(", ")}`,
      {
        proxy, transport, proxyInterface: p.interface, transportInterfaces: Object.keys(t.interfaces),
        compatibleTransports: transports.list().filter((x) => supports(proxy, x)),
      }
    )
  }
  return { proxy: p, transport: t, interface: p.interface, impl }
}

// every static folder the backend needs: the proxy's own + the transport's
export function mounts_for(backend) {
  const list = backend.proxy.mounts()
  const dir = typeof backend.impl.dir === "function" ? backend.impl.dir() : backend.impl.dir
  list.push({
    label: `${backend.transport.name} (${backend.interface} interface)`,
    url: backend.impl.mount,
    dir,
    files: [backend.impl.entry ?? "index.mjs"],
  })
  return list
}

// what check_packages() needs to verify this combination
export function packages_for(backend) {
  const list = (backend.proxy.packages ?? []).map((p) => ({ ...p, role: "proxy" }))
  if (backend.impl.package) {
    list.push({
      name: backend.impl.package, major: backend.impl.major, role: "transport",
      transport: backend.transport.name, interface: backend.interface,
    })
  }
  return list
}
