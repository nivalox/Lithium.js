// `npm start`: quick way to try lithium without writing your own server file.
// PROXY=scramjet TRANSPORT=libcurl PORT=3000 STATIC_DIR=public npm start
import { create_lithium_server } from "./index.js"

const { server, port } = create_lithium_server({
  staticDir: process.env.STATIC_DIR || "public",
  port: Number(process.env.PORT) || 8080,
  proxy: process.env.PROXY || "ultraviolet",
  transport: process.env.TRANSPORT || "epoxy",
})

server.listen(port, () => {
  console.log(`Lithium server running on http://localhost:${port}`)
})
