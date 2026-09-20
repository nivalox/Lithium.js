# Lithium.JS

![npm version](https://img.shields.io/npm/v/lithium.js?color=blue)
![npm downloads](https://img.shields.io/npm/dw/lithium.js)
![license](https://img.shields.io/badge/license-AGPL-purple?color=663366)
![node version](https://img.shields.io/badge/node-%3E%3D24.0-brightgreen)
![status](https://img.shields.io/badge/status-beta-orange)
![proxy engines](https://img.shields.io/badge/proxies-UV%20%7C%20Scramjet-purple)

A flexible web proxy framework to make your skid dream a reality.

## Features

- **Proxy Support**: Ultraviolet 3.x or Scramjet 2.x, picked in the server file (maybe have a switcher??)
- **Multiple Transports**: Epoxy and Libcurl transport options
- **Easy Configuration**: Setup in less than 10 minutes.
- **Modular Design**: Clean separation of client and server code

## Installation

```bash
npm install lithium.js
```

Scramjet 2.x is published under the `alpha` tag and Lithium pins the exact
versions it was built against, so you don't need to install Scramjet yourself.

## Quick Start

### Server Setup

```javascript
import { create_lithium_server } from "lithium.js";

const { server, port } = create_lithium_server({
  staticDir: 'public',
  port: 8080,
  proxy: 'ultraviolet',
  transport: 'epoxy'
})

server.listen(port, () => {
  console.log(`Lithium server running on http://localhost:${port}`)
})
```

** Ensure that you import it relative to your type in package.json.

`create_lithium_server` doesn't call `listen` for you, so you can attach your
own routes to the returned `app` first. Want to just try it? `npm start` runs
a ready-made server (`PROXY`, `TRANSPORT`, `PORT` and `STATIC_DIR` env vars).

### Client Setup

```javascript
import { init_lithium, navigate } from "/client/index.js";

await init_lithium({
  searchEngine: 'google',
  onReady: () => {
    console.log('Lithium is ready!')
  }
})

navigate('example.com')
navigate('search query')
```

When you are linking this script, make sure to add type="module".

`init_lithium` loads everything the chosen proxy needs (bare-mux, the Ultraviolet
bundle, the Scramjet controller, ...) by itself, so you no longer need extra
`<script>` tags. It rejects if setup fails, so wrap it in try/catch if you want
to show an error.

Pages are shown in an iframe. Give yours the id `proxyFrame` (and optionally put
it inside an element with id `container`), or Lithium will create one for you.

## Configuration

### Server Options

| Option               | Type    | Default         | Description                                                                 |
|----------------------|---------|-----------------|-----------------------------------------------------------------------------|
| staticDir            | string  | `'public'`      | Directory for static files (relative to `process.cwd()`, or absolute)       |
| port                 | number  | `8080`          | Port, returned from `create_lithium_server` for you to `listen` on          |
| proxy                | string  | `'ultraviolet'` | Proxy type: `'ultraviolet'` or `'scramjet'`                                 |
| transport            | string  | `'epoxy'`       | Transport type: `'epoxy'` or `'libcurl'`                                    |
| crossOriginIsolation | boolean | `true`          | Scramjet only. Sends COOP/COEP headers (see below)                          |

Unknown `proxy` / `transport` values throw at startup.

### Client Options

| Option       | Type     | Default    | Description                                                    |
|--------------|----------|------------|----------------------------------------------------------------|
| searchEngine | string   | `'google'` | Search engine: `'google'` or `'duckduckgo'`                    |
| onReady      | function | `null`     | Callback when initialization completes                         |
| onUrlChange  | function | `null`     | Scramjet only. Called with the real URL when the page changes  |

## Usage Examples

### Navigate to a URL

```javascript
navigate('google.com')
navigate('https://example.com')
```

### Perform a search

```javascript
navigate('search')
```

### Check current config

```javascript
console.log(window.__LITHIUM_CONFIG__)
// { proxy: "ultraviolet", transport: "epoxy" }
```

### Switch proxy types

```javascript
const { server, port } = create_lithium_server({
  proxy: 'scramjet',
  transport: 'libcurl'
})
```

## How the transports work (read this if you touch package.json)

The transport packages come in two generations that are **not** interchangeable:

| Proxy            | Interface          | epoxy | libcurl |
|------------------|--------------------|-------|---------|
| Ultraviolet 3.x  | bare-mux           | ^2    | ^1      |
| Scramjet 2.x     | proxy-transports   | ^3    | ^2      |

Mixing them can look like it works and then fail on specific sites. Lithium
installs both: the normal `@mercuryworkshop/epoxy-transport` and
`@mercuryworkshop/libcurl-transport` are the Scramjet generation, and the
`epoxy-transport-bm` / `libcurl-transport-bm` entries in `package.json` are npm
aliases for the bare-mux generation that Ultraviolet uses. Don't "clean up" the
aliases or bump their versions to match.

Files are served at:

| Path                         | What                                   |
|------------------------------|----------------------------------------|
| `/uv/`, `/baremux/`          | Ultraviolet + bare-mux                 |
| `/bm/epoxy/`, `/bm/libcurl/` | transport for Ultraviolet              |
| `/scram/`, `/controller/`, `/utils/` | Scramjet, its controller, its plugins |
| `/epoxy/`, `/libcurl/`       | transport for Scramjet                 |
| `/wisp/`                     | wisp websocket                         |

## Troubleshooting

### Config not loading
- Check browser console for `[lithium] config:`
- Ensure your HTML is a `.html` file in `staticDir` (config is injected into `<head>` when the file is served)

### Proxy not working
- Check if service worker registered: `navigator.serviceWorker.controller`
- Verify proxy files are accessible in Network tab
- Look for errors in console, and for `[lithium] ...: expected "..." in ...` lines in the server log

### Scramjet: some sites break, or a warning about cross-origin isolation
- `crossOriginIsolated` must be `true` in the browser console (needs `localhost` or https)
- If your own page loads third-party fonts/images and they got blocked, either serve them with CORS/CORP headers or set `crossOriginIsolation: false` (some proxied sites will then break)

### Transport issues
- Ultraviolet: ensure the BareMux worker is accessible at `/baremux/worker.js`
- Check WISP connection in DevTools (`/wisp/`)
- Verify transport files are served (see the table above)

## Copyright notice
```
    sythora/Platinum: A flexible web proxy framework to make your skid dream a reality.
    Copyright (C) 2026 sythora & nivalos

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
```

Lithium.js is a modified version of the work above (renamed from Platinum,
Scramjet 2.x integration, updated transports, bug fixes). Modified September 20, 2026.
