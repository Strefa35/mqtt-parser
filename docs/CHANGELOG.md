# Changelog

Notable changes to **MQTT Parser** are recorded here. Versions follow the project tags or release branches (for example `v.0.0.1`).

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.0.2] — 2026-05-14

### Added

- **`mqtt-supervisor.sh`** — background supervisor (started from the container entrypoint) that starts or stops Mosquitto based on **`${SQLITE_DIR}/.run_embedded_mosquitto`**, so the bundled broker can be toggled at runtime without restarting the container.
- **`server/src/mosquitto-control.ts`** — writes the control file from Node; **`isEmbeddedMosquittoProcessRunning()`** checks the Mosquitto PID file (Linux `/proc` to avoid EPERM when Node runs non-root).
- **Dual MQTT client profiles** — **embedded** (defaults to `127.0.0.1` + `MQTT_PORT` when empty) and **external** (defaults to `MQTT_HOST` + `MQTT_PORT`); shared credentials and protocol settings.
- **SQLite settings** for `embedded_mqtt_broker_enabled`, `mqtt_active_profile`, and per-profile `mqtt_embedded_*` / `mqtt_external_*` host and port; legacy `mqtt_client_*` keys are migrated on database open when still present.
- **Web UI**: header controls for active profile and embedded Mosquitto on/off; **Config** tab updates for both profiles; related styling and API client helpers.
- **Health / config API** fields: `mqttActiveProfile`, `embeddedMqttBrokerEnabled`, `embeddedMqttBrokerRunning`, and profile-specific shapes on `GET /api/config` (see `docs/API.md`).

### Changed

- **Dockerfile** — copies and chmods `mqtt-supervisor.sh`; **entrypoint** starts the supervisor instead of always starting Mosquitto directly.
- **`config/mosquitto.conf.template`** — sets **`pid_file`** for clean stop/start by the supervisor.
- **`MqttBridge`** — reconnects using the active profile; config patches sync the Mosquitto control file.
- **API**: `/api/host-info` endpoint renamed to `/api/docker-host`; response field `hostIp` renamed to `hostAddress` for semantic clarity.
- **Web UI**: accessibility improvements — `role="switch"` and `aria-checked` replaced with `aria-pressed` for MQTT profile toggle button; tooltip pointer events fixed (`pointer-events: none`).
- **Payload parsing** (`web/src/utils/format.ts`): optimized `normalizePlainPayload()` with heuristic JSON detection (check for `{}` or `[]` braces) before attempting parse, reducing unnecessary exceptions on hex strings and plain values.
- **Live publish feedback** (`web/src/tabs/LiveTab.tsx`): publish success message now clears immediately (`setMsg(null)`) instead of showing "Published." text, providing cleaner UX.
- **Documentation** — `README.md`, `docs/API.md`, and `docs/ARCHITECTURE.md` updated for profiles, supervisor, and new environment variables (`MOSQUITTO_PID_FILE`, `MOSQUITTO_SUPERVISOR_INTERVAL`, clarified `MQTT_HOST`); added `/api/docker-host` endpoint reference.

---

## [0.0.1] — 2026-03-28

The first release of **MQTT Parser**.

### What it included

- **Single Docker image** (Ubuntu-based) running **Eclipse Mosquitto** and a **Node.js** stack: MQTT subscription, **SQLite** persistence, **WebSocket** live feed, **rules** for auto-replies, and manual **publish** from the UI.
- **Web UI** with tabs **Live & Publish** (resizable split: live feed + Publish / Rules sub-tabs), **History** (paginated messages, filters, bulk delete, column resize), **Config** (subscription pattern, parse mode, MQTT client to broker, host hint), **Logs**, and **Help** (in-app operator guide).
- **SQLite** for messages, rules, settings, app logs, and **publish presets** (recent successful publish topic/payload pairs for the UI).
- **REST + WebSocket API** for health, config, messages, logs, rules, publish, and presets (see `docs/API.md`).
- **Documentation**: `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DEPENDENCIES.md`.
- **Runtime**: entrypoint starts Mosquitto then Node; Node drops to **`PUID`/`PGID`** for `/data` ownership; env vars for `HTTP_PORT`, `MQTT_PORT`, `MQTT_HOST`, `SQLITE_PATH`, `MAX_MESSAGE_BYTES`.
- **Security posture**: non-TLS MQTT and anonymous broker by default, intended for lab or trusted LANs only.
