import fs from "node:fs"
import { dirname, join, basename } from "node:path"
import { fileURLToPath } from "node:url"
import { TRANSPORT_META } from "./meta.js"

const HERE = dirname(fileURLToPath(import.meta.url))

// Find an installed package the way Node would (nested node_modules first,
// then hoisted ones), but by reading its package.json directly. That works
// for npm aliases and for packages whose "exports" hide package.json, and it
// never imports the package.
export function find_package(name, from = HERE) {
  let dir = from
  for (;;) {
    if (basename(dir) !== "node_modules") {
      const pj = join(dir, "node_modules", ...name.split("/"), "package.json")
      if (fs.existsSync(pj)) {
        let version = null
        try { version = JSON.parse(fs.readFileSync(pj, "utf8")).version ?? null } catch {}
        return { name, dir: dirname(pj), version }
      }
    }
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

export function major_of(version) {
  const m = /^(\d+)\./.exec(version ?? "")
  return m ? Number(m[1]) : null
}

// which interface generation does this installed transport major belong to?
function generation_of(transport, major) {
  const meta = TRANSPORT_META[transport]
  if (!meta) return null
  for (const [iface, m] of Object.entries(meta)) if (m.major === major) return iface
  return null
}

// items: [{ name, major?, pinned?, role: "proxy"|"transport"|"core",
//           transport?, interface? }]
// returns one finding per item: { level: "ok"|"warn"|"error", code?, package,
//   installed, message, ...details }
export function check_packages(items) {
  return items.map((item) => {
    const found = find_package(item.name)
    const base = { package: item.name, role: item.role }

    if (!found) {
      return {
        ...base, level: "error", code: "PACKAGE_MISSING", installed: null,
        message: `${item.name} is not installed`,
        hint: "run `npm install`",
      }
    }
    const installed = found.version
    const found_major = major_of(installed)

    if (item.major != null && found_major !== item.major) {
      if (item.role === "transport") {
        const generation = generation_of(item.transport, found_major)
        return {
          ...base, level: "error", code: "TRANSPORT_VERSION_MISMATCH",
          installed, expected: `${item.major}.x`, interface: item.interface,
          detected: generation ? `${generation} generation` : `major ${found_major}`,
          path: found.dir,
          message:
            `${item.name} ${installed} is installed but the ${item.interface} interface needs ${item.major}.x` +
            (generation ? ` (${installed} is the ${generation} generation)` : ""),
          hint: "don't change the transport package versions in package.json; see the README's transport section",
        }
      }
      return {
        ...base, level: "error", code: "PACKAGE_VERSION_MISMATCH",
        installed, expected: `${item.major}.x`, path: found.dir,
        message: `${item.name} ${installed} is installed but Lithium needs ${item.major}.x`,
        hint: "reinstall lithium.js so its pinned dependency versions are used",
      }
    }

    if (item.pinned && installed !== item.pinned) {
      return {
        ...base, level: "warn", code: "UNTESTED_VERSION", installed, expected: item.pinned,
        message: `${item.name} ${installed} is installed, Lithium was tested with ${item.pinned}`,
      }
    }
    return { ...base, level: "ok", installed, message: `${item.name} ${installed ?? "(unknown version)"}` }
  })
}
