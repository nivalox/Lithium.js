// Ultraviolet 3.x backend for the Lithium client.
// A backend module exports:
//   init(ctx)                 load scripts, set up the transport
//   navigate(url, ctx)        show a real URL (already normalised) in ctx.iframe()
//   current_url(ctx)          optional: real URL currently shown (polled)
// ctx.state is yours to keep things in.

export async function init(ctx) {
  // bare-mux carries the transport (a SharedWorker), UV bundle does the rewriting
  await ctx.load_script("/baremux/index.js")
  await ctx.load_script("/uv/uv.bundle.js")
  await ctx.load_script("/uv/uv.config.js")

  const conn = new BareMux.BareMuxConnection("/baremux/worker.js")
  await conn.setTransport(ctx.transport_url, [{ wisp: ctx.wisp_url }])
  console.log(`[lithium] ultraviolet ready (${ctx.transport} over ${ctx.wisp_url})`)
}

export function navigate(url, ctx) {
  ctx.iframe().src = __uv$config.prefix + __uv$config.encodeUrl(url)
}

// ultraviolet has no url-change hook, so Lithium polls this
export function current_url(ctx) {
  const frame = ctx.iframe(false)
  const cfg = window.__uv$config
  if (!frame || !cfg) return null
  const path = frame.contentWindow.location.pathname
  return path.startsWith(cfg.prefix) ? cfg.decodeUrl(path.slice(cfg.prefix.length)) : null
}
