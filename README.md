# Lithium.JS

![npm version](https://img.shields.io/npm/v/@sythora/platinum.js?color=blue)
![npm downloads](https://img.shields.io/npm/dw/lithium.js)
![license](https://img.shields.io/badge/license-AGPL-purple?color=663366)
![node version](https://img.shields.io/badge/node-%3E%3D18.0-brightgreen)
![status](https://img.shields.io/badge/status-beta-orange)
![proxy engines](https://img.shields.io/badge/proxies-UV%20%7C%20Scramjet-purple)

A flexible web proxy framework to make your skid dream a reality.

## Features

- **Proxy Support**: Switch between Ultraviolet and Scramjet through the server file (maybe have a switcher??)
- **Multiple Transports**: Epoxy and Libcurl transport options
- **Easy Configuration**: Setup in less than 10 minutes.
- **Modular Design**: Clean separation of client and server code

## Installation

```bash
npm install lithium.js
```

## Quick Start

### Server Setup

```javascript
import { create_platinum_server } from "lithium.js";

const { app, server } = create_platinum_server({
  staticDir: 'public',
  port: 8080,
  proxy: 'ultraviolet',
  transport: 'epoxy'
})

server.listen(8080, () => {
  console.log('Lithium server running on http://localhost:8080')
})
```

** Ensure that you import it relative to your type in package.json.
### Client Setup

```javascript
import { init_platinum, navigate } from "/client/index.js";

await init_platinum({
  searchEngine: 'google',
  onReady: () => {
    console.log('Platinum is ready!')
  }
})

navigate('example.com')
navigate('search query')
```

When you are linking this script, make sure to add type="module"
Also, if you get scramjet controller errors, include this in your html:
```html
<script src="/scram/scramjet.all.js"></script>
<script src="/baremux/index.js"></script>
```

## Configuration

### Server Options

| Option     | Type   | Default        | Description                                 |
|------------|--------|----------------|---------------------------------------------|
| staticDir  | string | `'public'`     | Directory for static files                  |
| port       | number | `8080`         | Server port                                 |
| proxy      | string | `'ultraviolet'`| Proxy type: `'ultraviolet'` or `'scramjet'` |
| transport  | string | `'epoxy'`      | Transport type: `'epoxy'` or `'libcurl'`    |

### Client Options

| Option       | Type     | Default    | Description                                  |
|--------------|----------|------------|----------------------------------------------|
| searchEngine | string   | `'google'` | Search engine: `'google'` or `'duckduckgo'` |
| onReady      | function | `null`     | Callback when initialization completes        |

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
console.log(window.__PLATINUM_CONFIG__)
// { proxy: "ultraviolet", transport: "epoxy" }
```

### Switch proxy types

```javascript
const { app, server } = create_platinum_server({
  proxy: 'scramjet',
  transport: 'libcurl'
})
```

## Troubleshooting

### Config not loading
- Check browser console for `[platinum] config loaded from server`
- Ensure HTML has `<head>` tag for cfg injection

### Proxy not working
- Check if service worker registered: `navigator.serviceWorker.controller`
- Verify proxy files are accessible in Network tab
- Look for errors in console

### Transport issues
- Ensure BareMux worker is accessible at `/baremux/worker.js`
- Check WISP connection in DevTools
- Verify transport files are served

## Copyright notice
```
    sythora/Platinum: A flexible web proxy framework to make your skid dream a reality.
    Copyright (C) 2025 sythora

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
