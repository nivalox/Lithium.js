// Minimal ANSI color helper for terminal output (zero dependencies, like a
// tiny colorama for Node). Auto-disables when stdout isn't a TTY or NO_COLOR
// is set (https://no-color.org); force with FORCE_COLOR=1.
//   import { color, set_color } from "./color.js"
//   console.log(color.green("ok"), color.red("failed"))
const is_tty = () => Boolean(process.stdout && process.stdout.isTTY)
let enabled = process.env.FORCE_COLOR ? true : !process.env.NO_COLOR && is_tty()

export function set_color(on) { enabled = Boolean(on) }
export function color_enabled() { return enabled }

const wrap = (open, close) => (s) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s))
export const color = {
  red: wrap(31, 39), green: wrap(32, 39), yellow: wrap(33, 39), blue: wrap(34, 39),
  magenta: wrap(35, 39), cyan: wrap(36, 39), gray: wrap(90, 39), bold: wrap(1, 22), dim: wrap(2, 22),
}
