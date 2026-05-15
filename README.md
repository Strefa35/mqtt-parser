# MQTT Parser

Single **Ubuntu**-based Docker image running **Eclipse Mosquitto** and a **Node.js** web stack: MQTT subscription, **SQLite** persistence, **WebSocket** live feed, **rules** for auto-replies, and manual **publish** from the UI — the **Live** stream shares one tab with a resizable split: **Publish** and **Rules** on the right (sub-tabs). Top-level tabs also include **History**, **Config**, **Logs**, and **Help** (in-app usage guide); work tabs keep short on-screen copy, with fuller operator notes on **Help**.

## Screenshot

Default **Live & Publish** view: live feed (left) and **Publish** / **Rules** sub-tabs (right). You can replace [`docs/screenshots/live-publish.png`](docs/screenshots/live-publish.png) with your own capture if you want an exact match to your build.

![MQTT Parser — Live & Publish (default tab)](docs/screenshots/live-publish.png)

See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for the full product specification, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for runtime and code layout, and [docs/API.md](docs/API.md) for the HTTP and WebSocket API.

For a quick build-and-verify checklist, see [docs/SMOKE-TESTS.md](docs/SMOKE-TESTS.md).

## Quick start

```bash
docker compose up --build
```

- **Web UI:** [http://localhost:8080](http://localhost:8080) (or the host port you map)
- **MQTT:** broker listens on container port **1883** — map it for devices, e.g. `-p 1883:1883`
- **SQLite:** the compose file mounts **`./data`** on the host → you get `data/mqtt-parser.db` (and optional `-wal`/`-shm`) in the project folder after the first run.
- **File ownership:** the web app runs as **`PUID`/`PGID`** (default `1000:1000`) so `data/` is not owned by root on the host. Set them to match your user, e.g. create a `.env` next to `docker-compose.yml`:

  ```bash
  echo "PUID=$(id -u)" >> .env
  echo "PGID=$(id -g)" >> .env
  ```

  **Mosquitto** is started/stopped by **`mqtt-supervisor.sh`** (root), which follows a control file written next to SQLite; the **Node** process drops privileges to **`PUID`/`PGID`**.

### Plain Docker

```bash
docker build -t mqtt-parser .
mkdir -p data
docker run --rm \
  -e PUID="$(id -u)" -e PGID="$(id -g)" \
  -p 8080:8080 -p 1883:1883 \
  -v "$(pwd)/data:/data" \
  mqtt-parser
```

Devices connect to `tcp://<host-ip>:1883` (or the mapped port). The UI shows a **host hint** field for operators; it does not change networking.

## Data persistence

- **SQLite** path inside the container: `/data/mqtt-parser.db` (see `SQLITE_PATH`).
- Besides **messages**, **rules**, **settings**, and **app logs**, the database stores **`publish_presets`**: up to **30** recent **topic + payload** pairs (deduplicated by topic and payload, most recently used first). They are updated after successful `POST /api/publish` calls and can also be saved directly via `POST /api/publish-presets`. The Publish UI loads them via `GET /api/publish-presets`.
- **`docker compose`** maps **`./data`** from the project root to `/data`, so the database is visible on the host as **`data/mqtt-parser.db`**. The directory is created automatically when the container starts if it does not exist.
- If you previously used the old **named volume** `mqtt-parser-data`, that data still lives under Docker’s volume storage (`docker volume inspect …`); copy the `.db` file out if you need it, or switch back to a named volume in `docker-compose.yml`.
- With plain `docker run`, mount the same way:

```bash
docker run --rm \
  -e PUID="$(id -u)" -e PGID="$(id -g)" \
  -p 8080:8080 -p 1883:1883 \
  -v "$(pwd)/data:/data" \
  mqtt-parser
```

## Environment variables

| Variable | Default | Description |
| ---------- | --------- | ------------- |
| `PUID` | `1000` | Unix UID for the **Node** process (SQLite writer); should match host user for `./data` ownership |
| `PGID` | `1000` | Unix GID for the **Node** process |
| `HTTP_PORT` | `8080` | Web server listen port inside the container |
| `MQTT_PORT` | `1883` | Mosquitto listener port (must match app) |
| `MQTT_HOST` | `127.0.0.1` | Default broker host for the **external** client profile when its host field is empty |
| `DOCKER_HOST_IP` | `host.docker.internal` | Value returned by `GET /api/docker-host` as `hostAddress` for external client connection hints |
| `SQLITE_PATH` | `/data/mqtt-parser.db` | SQLite database file path |
| `MAX_MESSAGE_BYTES` | `262144` | Drop inbound MQTT payloads larger than this (bytes) |
| `MOSQUITTO_PID_FILE` | `/tmp/mosquitto-mqtt-parser.pid` | PID file used by `mqtt-supervisor.sh` and API running-state checks; must match Mosquitto `pid_file` |
| `MOSQUITTO_SUPERVISOR_INTERVAL` | `2` | Poll interval (seconds) for `mqtt-supervisor.sh` control loop |

If you change `HTTP_PORT` or `MQTT_PORT`, publish the same ports with `-p` / `compose` accordingly.

**Broker vs profiles:** Mosquitto (when enabled) listens on `MQTT_PORT` inside the container. The parser stores two client profiles — **embedded** (defaults to `127.0.0.1` + `MQTT_PORT` when fields are empty) and **external** (defaults to `MQTT_HOST` + `MQTT_PORT`). The **header** and **`PATCH /api/config`** choose the active profile and whether the in-container Mosquitto process should run (`mqtt-supervisor.sh` polls `<sqlite-dir>/.run_embedded_mosquitto`, written by Node).

## Web UI

Tabs (left to right): **Live & Publish** · **History** · **Config** · **Logs** · **Help**.

| Tab | Notes |
| ----- | -------- |
| **Live & Publish** | **Vertical split**: live feed (WebSocket, last 500) and a right panel with **Publish** / **Rules** sub-tabs. Draggable divider ratio: `mqttParser.livePublishSplitPct`. Rules: **On** dot toggles enable/disable; edit/delete per row. |
| **History** | Paginated SQLite messages, filters, bulk and filter delete. Columns: fixed checkbox · **ID** · Time · Topic · Payload · fixed delete. Resize grips on **ID**, **Time**, **Topic** only (`mqttParser.historyTableColPcts`). Full-viewport layout. |
| **Config** | Subscription pattern, parse mode, embedded + external MQTT client profiles (shared auth), host hint. Use the header for active profile and container Mosquitto on/off. |
| **Logs** | Application logs from SQLite; periodic refresh and manual refresh. |
| **Help** | In-app usage guide (payload toggle, column resize, publish presets, rules templates, etc.). |

Browser-only preferences (not in SQLite) include theme, live split ratio, live column widths, and history table column widths. Longer explanations for operators live on the **Help** tab.

## Security notes

The default image uses **non-TLS MQTT** and **anonymous** broker access, suitable for lab or trusted LANs only. Do not expose port **1883** to the public internet without TLS, authentication, and firewall rules.

## HTTP API (optional automation)

Full reference: **[docs/API.md](docs/API.md)** (REST + WebSocket). Short list:

- `GET /api/health` · `GET /api/docker-host` · `GET` \| `PATCH /api/config` · `GET /api/messages` · `DELETE /api/messages/:id` · `POST /api/messages/delete-bulk` · `POST /api/messages/delete-by-filter`
- `GET /api/logs` · `GET` / `POST` / `PATCH` / `DELETE` **`/api/rules`** and **`/api/rules/:id`**
- `GET /api/publish-presets` · `POST /api/publish-presets` · `POST /api/publish` · `GET /ws`

## Development (without Docker)

Requires Node.js 20+.

```bash
# Terminal 1 — broker (or use any MQTT broker on 1883)
mosquitto -p 1883

# Terminal 2 — API + static (serves ../web/dist); for UI dev use Vite separately
cd server && npm install && npm run build
SQLITE_PATH=/tmp/mqtt-parser.db MQTT_PORT=1883 node dist/index.js

# Terminal 3 — web dev server (proxies /api and /ws)
cd web && npm install && npm run dev
```

## Cleaning build and runtime artifacts

Remove generated files so the tree matches a fresh clone (see also `.gitignore`).

**Script (from anywhere):**

```bash
./scripts/clean.sh              # docker compose down + remove node_modules, dist, data
./scripts/clean.sh --rmi        # same, plus docker compose down --rmi local
./scripts/clean.sh --prune      # same as default, then global docker builder/system prune
./scripts/clean.sh --help
```

**Manual (from the repository root):**

```bash
docker compose down
rm -rf web/node_modules web/dist server/node_modules server/dist data
```

- **`web/node_modules`**, **`server/node_modules`** — from local `npm install`.
- **`web/dist`**, **`server/dist`** — from local `npm run build` (the Docker image builds its own copy inside the build context).
- **`data/`** — SQLite files from the compose bind mount (`./data:/data`).

Do **not** delete `package-lock.json` or source files.

**Optional — Docker only:** remove the compose project’s local image after `down`:

```bash
docker compose down --rmi local
```

**Optional — broader host cleanup** (affects unused Docker data globally, not just this project):

```bash
docker builder prune -f
docker system prune -f
```

After cleaning, run again with `docker compose up --build`, or reinstall locally (`npm install` in `web/` and `server/` as needed).

## Project layout

- `config/` — Mosquitto template rendered at start (`MQTT_PORT`)  
- `scripts/entrypoint.sh` — prepares runtime, starts `mqtt-supervisor.sh`, then runs Node as `PUID`/`PGID`  
- `scripts/clean.sh` — removes local `node_modules`, `dist`, `data`, runs `docker compose down` (optional `--rmi`, `--prune`)  
- `server/` — Fastify API, MQTT client, SQLite, rules engine  
- `web/` — React + Vite UI (`src/tabs/*.tsx` — Live, History, Config, Logs, Help; `App.tsx` shell)  
- `docs/REQUIREMENTS.md` — requirements  
- `docs/ARCHITECTURE.md` — system and module architecture  
- `docs/API.md` — HTTP and WebSocket API reference  
- `docs/DEPENDENCIES.md` — npm packages by layer (versions from lockfiles)  
- `docs/screenshots/` — README screenshot(s) (`live-publish.png`)
