# HTTP and WebSocket API

Reference for the **MQTT Parser** server (`server/`, Fastify). All paths are relative to the server origin (e.g. `http://localhost:8080`). Unless noted, use **`Content-Type: application/json`** for request bodies.

Error responses typically use **`{ "error": "<message>" }`** with a 4xx/5xx status.

For system design, see [ARCHITECTURE.md](ARCHITECTURE.md). For product behavior of the UI, see [REQUIREMENTS.md](REQUIREMENTS.md).

---

## Conventions

| Topic | Detail |
| ------- | -------- |
| JSON field names | REST bodies use **camelCase** where listed below. Message list **items** use **snake_case** column names (`received_at`, `payload_display`, …) matching SQLite. |
| Query parameters | Spelling matches the implementation: `topicContains`, `fromTs`, `toTs`, etc. |
| Authentication | None on the default server; place a reverse proxy in front if exposing beyond a trusted network. |

---

## `GET /api/health`

Liveness and MQTT client status.

### Response 200 (health)

```json
{
  "ok": true,
  "mqtt": "connected",
  "broker": { "host": "127.0.0.1", "port": 1883, "tls": false },
  "mqttActiveProfile": "embedded",
  "embeddedMqttBrokerEnabled": true,
  "embeddedMqttBrokerRunning": true,
  "limits": { "maxMessageBytes": 262144 }
}
```

`mqtt` is `"connected"` or `"disconnected"`. `mqttActiveProfile` is which client profile is in use (`embedded` \| `external`). `embeddedMqttBrokerEnabled` is the desired state from SQLite; `embeddedMqttBrokerRunning` reflects whether the Mosquitto PID file points at a live process (Linux `/proc` check from the Node user).

---

## `GET /api/config`

Returns current operator and broker-client settings.

**Response 200** (shape)

- `broker`: `hostHint` (omitted if empty), `internalHost` (deprecated; same role as `mqttClient.host`), `port`, `tls`, `anonymous`
- `mqttClient`: effective connection for the **active** profile — `host`, `port`, `hostUsesEnvFallback`, `portUsesEnvFallback`, `envFallbackHost`, `envFallbackPort`, `username`, `passwordSet`, `protocol` (`"3.1.1"` \| `"5"`), `keepalive`, `activeProfile` (`embedded` \| `external`)
- `mqttEmbedded`, `mqttExternal`: same sub-shape as the host/port part of `mqttClient` (resolved host/port + fallback flags) for the two stored profiles
- `embeddedMqttBrokerEnabled`, `embeddedMqttBrokerRunning`: desired vs observed Mosquitto in the container
- `subscriptionPattern`, `defaultParseMode`, `sqlitePath`, `httpPort`

---

## `PATCH /api/config`

Partial update. Omitted keys are left unchanged.

| Body field | Type | Effect |
| ------------ | ------ | -------- |
| `embeddedMqttBrokerEnabled` | boolean | Stored; writes control file for `mqtt-supervisor.sh` so Mosquitto starts/stops without restarting the container |
| `mqttActiveProfile` | `"embedded"` \| `"external"` | Stored; **reconnect** MQTT client using that profile’s host/port |
| `mqttEmbeddedHost` | string | Trimmed; stored; **reconnect** if embedded profile is active |
| `mqttEmbeddedPort` | number, `""`, or `null` | Valid port or clear; **reconnect** if embedded profile is active. Invalid/out-of-range values are ignored (no 4xx) |
| `mqttExternalHost` | string | Trimmed; stored; **reconnect** if external profile is active |
| `mqttExternalPort` | number, `""`, or `null` | Valid port or clear; **reconnect** if external profile is active. Invalid/out-of-range values are ignored (no 4xx) |
| `subscriptionPattern` | string (non-empty after trim) | Updates subscription; calls `reloadSubscription()` |
| `defaultParseMode` | `"auto"` \| `"json"` \| `"text"` \| `"hex"` | Stored default parse mode |
| `hostHint` | string | Operator hint (devices still use real network path) |
| `mqttClientHost` | string | Trimmed; stored on the **currently active** profile (`mqtt_embedded_*` or `mqtt_external_*`); **reconnect** |
| `mqttClientPort` | number, `""`, or `null` | Same as above for the active profile’s port; **reconnect** if changed. Invalid/out-of-range values are ignored (no 4xx) |
| `mqttClientUsername` | string | Stored; **reconnect** |
| `mqttClientPassword` | any (if key present) | Stored as string (`""` clears); **reconnect**. Omit property to leave password unchanged |
| `mqttProtocol` | `"3.1.1"` \| `"5"` | Stored; **reconnect** |
| `mqttKeepalive` | number (coerced) | Seconds, stored; **reconnect** |

### Response 200 (config)

Same shape as `GET /api/config`.

---

## `GET /api/messages`

Paginated stored messages (newest first).

### Query parameters

| Parameter | Default | Notes |
| ----------- | --------- | -------- |
| `page` | `1` | ≥ 1 |
| `limit` | `50` | Clamped 1–200 |
| `topicContains` | — | Substring match on `topic` |
| `fromTs` | — | Epoch ms, `received_at >= fromTs` |
| `toTs` | — | Epoch ms, `received_at <= toTs` |
| `search` | — | Matches `topic`, `payload_display`, or `parsed_json` text |

### Response 200 (messages)

```json
{
  "total": 123,
  "page": 1,
  "limit": 50,
  "items": [
    {
      "id": 1,
      "received_at": 1710000000000,
      "topic": "sensors/temp",
      "qos": 0,
      "retain": 0,
      "payload_encoding": "utf8",
      "payload_display": "{\"v\":1}",
      "parsed_json": "...",
      "parse_mode": "auto"
    }
  ]
}
```

---

## `DELETE /api/messages/:id`

**Response 200** — `{ "deleted": 1 }`  
**400** — invalid id  
**404** — no row

---

## `POST /api/messages/delete-bulk`

### Body (delete bulk)

```json
{ "ids": [1, 2, 3] }
```

`ids` **must** be an array (can be empty → `deleted: 0`).

**Response 200** — `{ "deleted": <number> }`  
**400** — `{ "error": "ids array required" }`

---

## `POST /api/messages/delete-by-filter`

Deletes all messages matching the filter. **Dangerous** if filters are empty (matches all rows).

### Body (delete by filter)

```json
{
  "confirm": true,
  "topicContains": "optional",
  "fromTs": 1710000000000,
  "toTs": 1710000000000,
  "search": "optional"
}
```

`confirm` **must** be boolean `true`. `fromTs` / `toTs` must be **numbers** if present (per server implementation).

**Response 200** — `{ "deleted": <number> }`  
**400** — missing `confirm: true`

---

## `GET /api/logs`

Application log lines from SQLite.

### Query

- `limit` — optional, passed to `listAppLogs` (server clamps in DB layer, typically 1–500).

### Response 200 (logs)

```json
{
  "items": [
    {
      "id": 1,
      "at": 1710000000000,
      "level": "info",
      "message": "MQTT client connected",
      "meta": "{\"url\":\"...\"}"
    }
  ]
}
```

`meta` may be `null`.

---

## `GET /api/rules`

### Response 200 (rules)

```json
{
  "items": [
    {
      "id": 1,
      "sort_order": 0,
      "name": "Echo",
      "enabled": 1,
      "topic_pattern": "cmd/#",
      "payload_regex": null,
      "reply_topic": "ack/out",
      "reply_payload_template": "{{payload}}"
    }
  ]
}
```

Ordered by `sort_order`, then `id`. Max **100** rules (enforced on insert).

---

## `POST /api/rules`

### Body (camelCase)

| Field | Required | Notes |
| ------- | ---------- | -------- |
| `name` | yes | Non-empty trim |
| `topicPattern` | yes | Non-empty trim |
| `replyTopic` | yes | Non-empty trim |
| `replyPayloadTemplate` | yes | **string** |
| `enabled` | no | Default true if omitted |
| `sortOrder` | no | Default `0` |
| `payloadRegex` | no | Omit or empty → stored as `null` |

**Response 200** — `{ "id": <newId> }`  
**400** — validation or max rules exceeded (`error` message)

---

## `PATCH /api/rules/:id`

Partial update. Only provided fields override; others keep existing values.

| Body field | Notes |
| ------------ | -------- |
| `sortOrder`, `name`, `enabled`, `topicPattern`, `replyTopic`, `replyPayloadTemplate` | Standard merge |
| `payloadRegex` | If **string**: trim; empty string → `null`. If **not** sent as a string, existing `payload_regex` is **unchanged** (you cannot clear via `null` alone — use `""`). |

**Response 200** — `{ "ok": true }`  
**400** — invalid id  
**404** — rule not found

---

## `DELETE /api/rules/:id`

**Response 200** — `{ "deleted": 1 }`  
**400** / **404** — as for messages

---

## `GET /api/publish-presets`

Up to **30** presets, newest `lastUsedAt` first.

### Response 200 (publish presets)

```json
{
  "items": [
    {
      "id": 1,
      "topic": "cmd/on",
      "payload": "{}",
      "lastUsedAt": 1710000000000
    }
  ]
}
```

---

## `POST /api/publish`

Publishes via the app’s MQTT client (must be connected to the broker).

### Body (publish)

```json
{
  "topic": "required/topic",
  "payload": "",
  "qos": 0,
  "retain": false
}
```

| Field | Notes |
| ------- | -------- |
| `topic` | Required, non-empty trim |
| `payload` | Optional; default `""` |
| `qos` | `0`, `1`, or `2` |
| `retain` | boolean |

On **success**: upserts **`publish_presets`** for this topic+payload and trims to 30 rows.

**Response 200** — `{ "ok": true }`  
**400** — validation  
**503** — MQTT publish failed (e.g. client not connected); `{ "error": "<message>" }`

---

## WebSocket `GET /ws`

Upgrade to a WebSocket. Each **text** message is one JSON object:

### `event: "message"`

```json
{
  "event": "message",
  "data": {
    "id": 1,
    "received_at": 1710000000000,
    "topic": "…",
    "qos": 0,
    "retain": 0,
    "payload_encoding": "utf8",
    "payload_display": "…",
    "parsed_json": "…",
    "parse_mode": "auto"
  }
}
```

Same row shape as `GET /api/messages` items.

### `event: "log"`

```json
{
  "event": "log",
  "data": {
    "level": "info",
    "message": "…",
    "meta": {},
    "at": 1710000000000
  }
}
```

`meta` may be any JSON value the server attached when logging.

Clients should ignore unknown `event` types for forward compatibility.

---

## Static files and SPA fallback

- `GET /*` (non-API, non-WS) serves files from `public/` (Vite build).
- Unknown **GET** paths fall back to **`index.html`** for client-side routing.

---

## Changelog

Document versioned API changes here when you introduce breaking behavior; the server does not ship OpenAPI in-tree today.
