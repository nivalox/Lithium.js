#!/usr/bin/env node
// lithium doctor [--proxy <name>] [--transport <name>] [--json]
import { run_doctor, format_doctor } from "../server/doctor.js"
import { set_color } from "../server/color.js"

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}

const HELP = `usage: lithium doctor [options]

Checks your install: package versions (including the two transport
generations), served files, and whether a proxy/transport pair is compatible.

options:
  --proxy <name>       proxy to check the configuration for   (default: ultraviolet)
  --transport <name>   transport to check the configuration for (default: epoxy)
  --json               machine-readable output
  --no-color           disable colored output (also respects NO_COLOR)
  -h, --help           this text

exit code is 1 if a problem was found, 0 otherwise.
`

const command = args[0]
if (!command || command === "-h" || command === "--help" || command === "help") {
  console.log(HELP)
  process.exit(command ? 0 : 1)
}
if (command !== "doctor") {
  console.error(`unknown command "${command}"\n\n${HELP}`)
  process.exit(1)
}

if (args.includes("--no-color")) set_color(false)
const result = await run_doctor({ proxy: flag("proxy"), transport: flag("transport") })
console.log(args.includes("--json") ? JSON.stringify(result, null, 2) : format_doctor(result))
process.exit(result.ok ? 0 : 1)
