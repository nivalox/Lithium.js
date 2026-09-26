import fs from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { PROXY_META, TRANSPORT_META, CORE_PACKAGES } from "./meta.js"
import { check_packages } from "./pkgs.js"
import { color } from "./color.js"

const HERE = dirname(fileURLToPath(import.meta.url))

// Diagnoses a Lithium install. Never throws: problems are returned as data
// so it works on exactly the installs that are broken.
//   run_doctor({ proxy?, transport? }) -> { ok, errors, warnings, checks: [...] }
export async function run_doctor(opts = {}) {
  const checks = []
  const add = (section, level, message, extra = {}) => checks.push({ section, level, message, ...extra })
  const add_findings = (section, findings) => {
    for (const f of findings) {
      const { level, message, ...rest } = f
      add(section, level, message, rest)
    }
  }

  // ---- environment
  let need = null
  try {
    const engines = JSON.parse(fs.readFileSync(join(HERE, "..", "package.json"), "utf8")).engines?.node
    need = Number(/(\d+)/.exec(engines ?? "")?.[1]) || null
  } catch {}
  const have = Number(process.versions.node.split(".")[0])
  if (need && have < need) {
    add("Environment", "warn", `Node.js ${process.version} (Lithium.js declares node >=${need})`, { code: "NODE_VERSION" })
  } else {
    add("Environment", "ok", `Node.js ${process.version}`)
  }

  // ---- packages
  add_findings("Core packages", check_packages(CORE_PACKAGES.map((p) => ({ ...p, role: "core" }))))

  for (const [name, meta] of Object.entries(PROXY_META)) {
    add_findings(`${meta.title} (${meta.interface} interface)`, check_packages(meta.packages.map((p) => ({ ...p, role: "proxy" }))))
  }

  for (const [tname, ifaces] of Object.entries(TRANSPORT_META)) {
    const items = Object.entries(ifaces).map(([iface, m]) => ({
      name: m.package, major: m.major, role: "transport", transport: tname, interface: iface,
    }))
    const findings = check_packages(items)
    // label which generation each line is, that's the point of this section
    findings.forEach((f, i) => { if (f.level !== "error") f.message += ` (${tname}, ${items[i].interface} generation)` })
    add_findings("Transports", findings)
  }

  // ---- served files (needs the packages to be importable)
  let reg = null
  try {
    reg = await import("./registry.js")
  } catch (err) {
    const first = String(err?.message ?? err).split("\n")[0]
    add("Files", "error", `couldn't load Lithium's backends: ${first}`, {
      code: "BACKENDS_LOAD_FAILED", hint: "a package is missing or broken, fix the errors above and run `npm install`",
    })
  }

  const wanted_proxy = opts.proxy ?? "ultraviolet"
  const wanted_transport = opts.transport ?? "epoxy"

  if (reg) {
    const seen = new Set()
    for (const p of Object.keys(PROXY_META)) {
      for (const t of Object.keys(TRANSPORT_META)) {
        let mounts
        try { mounts = reg.mounts_for(reg.resolve_backend(p, t)) } catch (err) {
          add("Files", "error", `${p} + ${t}: ${err.message}`, { code: err.code ?? "MOUNT_FAILED" })
          continue
        }
        for (const m of mounts) {
          const key = `${m.url}|${m.dir}`
          if (seen.has(key)) continue
          seen.add(key)
          const missing = m.files.filter((f) => !fs.existsSync(join(m.dir, f)))
          if (missing.length) add("Files", "error", `${m.url} (${m.label}) is missing ${missing.join(", ")} in ${m.dir}`, { code: "FILES_MISSING", path: m.dir, missing })
          else add("Files", "ok", `${m.url} (${m.label})`)
        }
      }
    }

    // ---- the configuration you're about to run
    const compat = reg.get_compatibility(wanted_proxy, wanted_transport)
    const section = `Configuration (proxy=${wanted_proxy}, transport=${wanted_transport})`
    if (!compat.supported) {
      add(section, "error", compat.reason, { code: "INCOMPATIBLE_TRANSPORT" })
    } else {
      add(section, "ok", `${wanted_proxy} and ${wanted_transport} are compatible (${compat.interface} interface)`)
      const isolated = reg.proxies.get(wanted_proxy)?.isolation
      add(section, "info", isolated
        ? "cross-origin isolation: on (COOP/COEP headers are sent; your own page must not load third-party assets without CORS/CORP)"
        : "cross-origin isolation: off")
      add(section, "info", "service workers need https or localhost; Scramjet also needs the page to be cross-origin isolated")
    }
  }

  const errors = checks.filter((c) => c.level === "error").length
  const warnings = checks.filter((c) => c.level === "warn").length
  return { ok: errors === 0, errors, warnings, checks }
}

const ICON = { ok: "✓", warn: "!", error: "✗", info: "•" }
const PAINT = { ok: color.green, warn: color.yellow, error: color.red, info: color.gray }

export function format_doctor(result) {
  const lines = ["", "Lithium doctor", ""]
  let section = null
  for (const c of result.checks) {
    if (c.section !== section) {
      if (section !== null) lines.push("")
      lines.push(c.section)
      section = c.section
    }
    const paint = PAINT[c.level] ?? ((x) => x)
    lines.push(`  ${paint(ICON[c.level] ?? "?")} ${c.message}`)
    if ((c.level === "error" || c.level === "warn") && c.hint) lines.push(color.dim(`      → ${c.hint}`))
  }
  lines.push("")
  lines.push(
    result.ok
      ? color.green(`No problems found${result.warnings ? ` (${result.warnings} warning${result.warnings === 1 ? "" : "s"})` : ""}.`)
      : color.red(`${result.errors} problem${result.errors === 1 ? "" : "s"} found${result.warnings ? `, ${result.warnings} warning${result.warnings === 1 ? "" : "s"}` : ""}.`)
  )
  lines.push("")
  return lines.join("\n")
}
