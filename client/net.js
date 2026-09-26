// Best-effort network visibility + header policy for the proxied page.
//
// SCOPE, HONESTLY: Lithium's Node server never sees the proxied site's raw
// HTTP traffic (that goes browser -> service worker -> wisp tunnel -> the
// real site, as bytes, not parsed HTTP). So this works client-side instead:
// it's installed on the proxied iframe's window (same-origin, since that's
// how UV/Scramjet serve proxied pages) and wraps fetch()/XMLHttpRequest.
//   - fetch(): full control. Request headers are filtered before sending,
//     and the Response is rebuilt with filtered headers before the page's
//     own code sees it.
//   - XMLHttpRequest: observed only (logged), the header policy is NOT
//     enforced on it — rebuilding a native XHR's headers isn't practical.
//   - Anything that isn't fetch/XHR (<img>, <script src>, <link>, CSS,
//     etc.) is invisible here entirely.
//   - Only requests made AFTER this installs are seen. It installs on the
//     iframe's "load" event, so very early/synchronous requests on that
//     page can be missed.

export const DEFAULT_POLICY = { mode: "filter", block: [], allow: null }

// mode: "passthrough" -> do nothing (headers pass exactly as the proxy already
//       delivered them); "filter" -> apply block/allow
// block: header names (case-insensitive) to strip
// allow: if an array, ONLY these header names survive (block still applies on top)
export function apply_policy(headers, policy) {
  if (policy.mode === "passthrough") return { headers, blocked: [] }
  const out = new Headers()
  const blocked = []
  const block = new Set((policy.block ?? []).map((h) => h.toLowerCase()))
  const allow = policy.allow ? new Set(policy.allow.map((h) => h.toLowerCase())) : null
  for (const [k, v] of headers.entries()) {
    const lk = k.toLowerCase()
    if (block.has(lk) || (allow && !allow.has(lk))) {
      blocked.push(k)
      continue
    }
    out.append(k, v)
  }
  return { headers: out, blocked }
}

const headers_to_object = (headers) => Object.fromEntries(headers.entries())

// win: the proxied iframe's contentWindow
//   get_policy() -> current policy (read live, so changes apply mid-session)
//   emit(entry)  -> called once per completed request
//   dbg(...)     -> debug logger, called for policy decisions
export function install(win, { get_policy, emit, dbg = () => {} }) {
  if (!win || win.__lithiumNetHooked) return
  win.__lithiumNetHooked = true

  const orig_fetch = win.fetch?.bind(win)
  if (orig_fetch) {
    win.fetch = async (input, init = {}) => {
      const policy = get_policy()
      const url = typeof input === "string" ? input : input.url
      const method = (init.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase()
      const started = win.performance?.now?.() ?? Date.now()

      let req_headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined) || {})
      const { headers: filtered_req, blocked: blocked_req } = apply_policy(req_headers, policy)
      if (blocked_req.length) dbg(`blocked request headers on ${url}: ${blocked_req.join(", ")}`)

      const finish = (fields) => emit({ type: "fetch", method, url, ts: Date.now(), duration: Math.round((win.performance?.now?.() ?? Date.now()) - started), requestHeaders: headers_to_object(filtered_req), blockedRequestHeaders: blocked_req, blockedResponseHeaders: [], responseHeaders: null, ...fields })

      let response
      try {
        response = await orig_fetch(input instanceof Request ? new Request(input, { headers: filtered_req }) : input, { ...init, headers: filtered_req })
      } catch (err) {
        finish({ status: 0, ok: false, error: err.message })
        throw err
      }

      if (policy.mode === "passthrough") {
        finish({ status: response.status, ok: response.ok, responseHeaders: headers_to_object(response.headers) })
        return response
      }
      const { headers: filtered_res, blocked: blocked_res } = apply_policy(response.headers, policy)
      if (blocked_res.length) dbg(`blocked response headers on ${url}: ${blocked_res.join(", ")}`)
      finish({ status: response.status, ok: response.ok, responseHeaders: headers_to_object(filtered_res), blockedResponseHeaders: blocked_res })
      if (!blocked_res.length) return response
      const body = await response.clone().blob()
      return new Response(body, { status: response.status, statusText: response.statusText, headers: filtered_res })
    }
  }

  const OrigXHR = win.XMLHttpRequest
  if (OrigXHR) {
    win.XMLHttpRequest = class extends OrigXHR {
      open(method, url, ...rest) {
        this.__lithium = { method, url, started: win.performance?.now?.() ?? Date.now() }
        return super.open(method, url, ...rest)
      }
      send(...args) {
        this.addEventListener("loadend", () => {
          const info = this.__lithium || {}
          let responseHeaders = null
          try {
            responseHeaders = Object.fromEntries(
              this.getAllResponseHeaders().trim().split(/\r?\n/).filter(Boolean).map((l) => { const i = l.indexOf(":"); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
            )
          } catch {}
          emit({
            type: "xhr", method: info.method || "GET", url: info.url || "", status: this.status, ok: this.status >= 200 && this.status < 400,
            duration: Math.round((win.performance?.now?.() ?? Date.now()) - (info.started ?? 0)), ts: Date.now(),
            requestHeaders: null, responseHeaders, blockedRequestHeaders: [], blockedResponseHeaders: [],
            note: "XHR is observed only, header policy isn't enforced on it",
          })
        })
        return super.send(...args)
      }
    }
  }
}
