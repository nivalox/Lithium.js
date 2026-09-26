// Plain data about the built-in backends. No imports of the proxy packages
// here on purpose: `lithium doctor` uses this to diagnose an install where
// those packages are missing or broken, so it has to load no matter what.

// Two incompatible generations of transport packages exist:
//   "bare-mux"          used by Ultraviolet 3.x (epoxy ^2, libcurl ^1)
//   "proxy-transports"  used by Scramjet 2.x    (epoxy ^3, libcurl ^2)
// A proxy speaks exactly one interface and can only use a transport that
// ships that interface.

export const PROXY_META = {
  ultraviolet: {
    title: "Ultraviolet",
    interface: "bare-mux",
    // send COOP/COEP headers (cross-origin isolation)? Scramjet needs it.
    // Ultraviolet's service-worker responses don't opt in to COEP, so it
    // would be blocked inside an isolated page.
    isolation: false,
    packages: [
      { name: "@titaniumnetwork-dev/ultraviolet", major: 3 },
      { name: "@mercuryworkshop/bare-mux", major: 2 },
    ],
  },
  scramjet: {
    title: "Scramjet",
    interface: "proxy-transports",
    isolation: true,
    // pinned = the exact version Lithium was built and tested against. A
    // different version is a warning (0.x releases break in minor bumps).
    packages: [
      { name: "@mercuryworkshop/scramjet", major: 2, pinned: "2.0.67-alpha.2" },
      { name: "@mercuryworkshop/scramjet-controller", major: 0, pinned: "0.0.14" },
      { name: "@mercuryworkshop/scramjet-utils", major: 0, pinned: "0.0.3" },
    ],
  },
}

// `package` is the npm install name (the *-bm ones are npm aliases, see
// package.json), `major` the major version that speaks that interface.
export const TRANSPORT_META = {
  epoxy: {
    "bare-mux": { package: "epoxy-transport-bm", major: 2 },
    "proxy-transports": { package: "@mercuryworkshop/epoxy-transport", major: 3 },
  },
  libcurl: {
    "bare-mux": { package: "libcurl-transport-bm", major: 1 },
    "proxy-transports": { package: "@mercuryworkshop/libcurl-transport", major: 2 },
  },
}

export const CORE_PACKAGES = [
  { name: "express", major: 5 },
  { name: "cheerio" },
  { name: "@mercuryworkshop/wisp-js" },
]
