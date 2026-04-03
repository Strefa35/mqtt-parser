# Dependencies and libraries

This document lists the main **npm packages** used in MQTT Parser, with **resolved versions** from **`package-lock.json`** (exact tree at last `npm install`). Ranges in `package.json` (e.g. `^5.2.1`) may differ until you reinstall.

For API and architecture, see [API.md](API.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Layer: container runtime (Docker image)

These are not npm packages but the **runtime stack** shipped in the image (`Dockerfile`).

| Component | Typical version | Role |
|-----------|-----------------|------|
| **Ubuntu** | 24.04 | Base OS |
| **Node.js** | 20.x (NodeSource) | Executes `server` after `npm run build` |
| **Eclipse Mosquitto** | distro package (e.g. 2.0.x) | MQTT broker inside the container |
| **system packages** | `curl`, `gettext-base`, `build-essential`, `python3` | Healthcheck, `envsubst` for Mosquitto config, native build for `better-sqlite3` |

---

## Layer: backend — production (`server/`)

HTTP server, SQLite, MQTT client, static SPA + WebSocket.

| Package | Version | Role |
|---------|---------|------|
| **fastify** | 5.8.4 | Low-overhead HTTP framework; registers routes, plugins |
| **@fastify/static** | 8.3.0 | Serves the Vite `public/` build (`index.html`, assets) |
| **@fastify/websocket** | 11.2.0 | WebSocket upgrade on `/ws`, integrates with Fastify |
| **better-sqlite3** | 11.10.0 | Synchronous SQLite bindings; WAL, schema, CRUD for messages/rules/settings/logs |
| **mqtt** | 5.15.1 | MQTT **v3.1.1 / v5** client; subscribe, publish, reconnect (used by `mqtt-bridge.ts`) |

---

## Layer: backend — development (`server/`)

Used for TypeScript compile and local dev only; **not** required at runtime in production after `npm run build` + `npm prune --omit=dev`.

| Package | Version | Role |
|---------|---------|------|
| **typescript** | 5.9.3 | Compiles `server/src/*.ts` → `dist/` |
| **tsx** | 4.21.0 | Run/watch TypeScript during `npm run dev` without a separate build step |
| **@types/node** | 22.19.15 | Type definitions for Node APIs |
| **@types/better-sqlite3** | 7.6.13 | Type definitions for `better-sqlite3` |

---

## Layer: frontend — UI (`web/`)

Browser React application.

| Package | Version | Role |
|---------|---------|------|
| **react** | 18.3.1 | UI components, hooks, state |
| **react-dom** | 18.3.1 | React renderer for the DOM; `createRoot` in `main.tsx` |

---

## Layer: frontend — build & types (`web/`)

Build pipeline and editor/type-checking only; output is static files under `dist/` → copied to `server/public/` in Docker.

| Package | Version | Role |
|---------|---------|------|
| **vite** | 6.4.1 | Dev server, proxy to API, production bundle (ESM, fast HMR) |
| **@vitejs/plugin-react** | 4.7.0 | React Fast Refresh + JSX/TSX in Vite |
| **typescript** | 5.7.3 | Type-checking and `.tsx` compilation via Vite/esbuild |
| **@types/react** | 18.3.28 | Type definitions for React |
| **@types/react-dom** | 18.3.7 | Type definitions for `react-dom` |

---

## Notable transitive dependency (backend)

Worth knowing for debugging WebSocket behavior; installed automatically with `@fastify/websocket`.

| Package | Version | Pulled in by | Role |
|---------|---------|--------------|------|
| **ws** | 8.20.0 | `@fastify/websocket` | WebSocket protocol implementation used under the Fastify plugin |

---

## Refreshing this document

After upgrading dependencies, run `npm update` / change `package.json`, then `npm install` in `web/` and `server/`, and update the **Version** cells above from the new lockfiles (`node_modules/<pkg>/package.json` or the `"version"` field under each `node_modules/<pkg>` entry in `package-lock.json`).
