# MQTT Parser — Project Requirements

## 1. Overview

The project delivers an **MQTT Parser** packaged as a **Docker container** based on **Ubuntu**. The container runs an embedded **MQTT broker**, a **web application** served over HTTP, and supporting services so that external devices can publish and subscribe to MQTT topics while operators configure, observe, parse, and respond to traffic through the browser.

## 2. Goals

- Provide a single deployable unit (one container image) that is easy to run on a host with exposed ports.
- Allow field devices to connect to the broker using a known **host address** and **port** (mapped from the container).
- Surface received messages in a **web UI** in near real time (after the message is received by the broker and processed by the application).
- Support **parsing** of payloads (structure interpretation, optional validation, and derived fields for display or logging).
- Support **sending replies** (publishing responses) triggered by incoming device messages, according to configurable rules or manual actions.
- Support **outbound MQTT publish** from the container (operator-initiated or automated), not only passive reception.

## 3. Container Platform

| Requirement | Description |
| ------------- | ------------- |
| **Base image** | Ubuntu (version to be pinned in the Dockerfile for reproducibility). |
| **Process model** | One container runs the broker, the web stack, and the bridge worker. Runtime uses a minimal init script model: `entrypoint.sh` starts `mqtt-supervisor.sh` (broker on/off control loop) and runs Node as `PUID`/`PGID`. |
| **Ports** | At minimum: **MQTT** (default 1883 unless overridden) and **HTTP** (default 8080 unless overridden). Ports must be **documented** and **configurable** via environment variables or mounted config. |
| **Networking** | Devices on the LAN/WAN reach the broker via the **host’s IP/DNS** and the **published MQTT port** (`docker run -p …`). |

## 4. MQTT Broker (In-Container)

| Requirement | Description |
| ------------- | ------------- |
| **Embedded broker** | A standards-compliant MQTT broker runs **inside** the same container as the application (e.g. Eclipse Mosquitto or equivalent). |
| **Client connectivity** | After the container starts, MQTT clients (devices) can **connect, publish, and subscribe** using the exposed broker endpoint. |
| **Topics** | The system shall support MQTT **topics** and **wildcards** as defined by the broker; the web app shall allow configuring **subscriptions** (which topics the parser observes). |
| **Broker persistence** | Broker-level **retained** messages and persistence are configured in the broker; this is separate from the **application message store** below. |

## 5. Web Application (HTTP)

### 5.1 Functional areas

1. **Broker configuration**  
   - Connection parameters relevant to clients (host hint, port, TLS on/off if supported).  
   - Internal broker settings exposed safely (listen address, authentication if enabled).  
   - Optional: username/password or certificate-based auth for devices and for the app’s connection to the broker.

2. **Live message view**  
   - Display messages **received** from devices (topic, payload, QoS, retain flag, timestamp).  
   - Updates should appear in the UI without full page reload (e.g. **WebSockets** or **SSE**).  
   - **Implementation:** the live feed shares a tab with a **resizable vertical split**. The **right-hand panel** uses **sub-tabs** for **Publish** (manual outbound messages) and **Rules** (auto-reply configuration). Operators can adjust **live table column widths** and, per row, toggle how the payload is rendered (e.g. plain vs formatted JSON) without affecting other rows. **On-tab** instructional text stays **brief**; detailed behavior (payload toggle, column grips, split layout, presets, rules templates, history layout, logs refresh) is documented on a dedicated **Help** tab in the same UI.

3. **Parsing**  
   - Pluggable or configurable parsing (e.g. JSON, plain text, binary hex dump, or custom rules).  
   - Parsed output shown alongside raw payload in the UI and included in logs.

4. **Logging**  
   - Persist or stream **application logs** (connection events, parse errors, publish attempts).  
   - **Implementation:** logs are shown on a **Logs** tab (e.g. from SQLite with periodic refresh).  
   - Optional: searchable history and export (out of scope unless explicitly added later).

5. **Responses to incoming messages**  
   - Define **rules** or **actions**: on matching topic/payload pattern, **publish** a reply to a configurable topic with a configurable payload (static, templated, or derived from the incoming message).  
   - Manual **“reply”** or **“publish”** from the UI for ad-hoc testing.  
   - **Implementation:** rules should be **editable** in the UI (not only create/delete). The rules editor is grouped with **manual publish** in the **Live** area (right-hand panel: **Publish** / **Rules** sub-tabs), not as a separate top-level tab. The rules list shows **enabled** state as a **green** or **red** status indicator in the first column; the operator **clicks that control** to turn a rule on or off (no separate “toggle” action button required).

6. **Outbound MQTT from the container**  
   - UI and API to **publish** arbitrary messages to chosen topics.  
   - Same path may be used for automated responses and for operator-driven tests.  
   - **Implementation:** successful publishes may be **remembered** in the **application message store** (e.g. SQLite `publish_presets`: topic + payload, capped list, deduplicated) so operators can quickly re-select recent commands in the UI.

7. **In-app help**  
   - A **Help** tab shall summarize how to use the main UI areas (live feed, publish, rules, history, configuration, logs, theme/header), so operators are not dependent on external docs for day-to-day tasks.

### 5.2 Non-functional expectations

- **Usability**: Clear layout for configuration, live feed, and publish/reply controls; **Help** tab documents detailed interactions where work tabs use minimal copy.  
- **Security**: If the broker is reachable from untrusted networks, **authentication** and **TLS** should be supported and documented; default insecure mode acceptable only for **local/dev** with explicit warning.  
- **Observability**: Health endpoint or Docker `HEALTHCHECK` to verify broker + web stack are up.

### 5.3 Application message store (SQLite)

The web application persists **received MQTT messages** in **SQLite** for browsing, filtering, and administration.

| Requirement | Description |
| ------------- | ------------- |
| **Engine** | **SQLite** (single file), suitable for the initial deployment inside one container without a separate database service. |
| **Retention** | **No default expiry**: messages are kept **from the beginning** of operation unless the operator deletes them (or a future policy is added explicitly). |
| **Durability** | The database file path must be **documented** and **mountable** as a Docker volume so data survives container recreation. |
| **Write path** | Each message received by the application (after subscription) is **inserted** into the store in addition to being pushed to the live UI. |
| **Browse & filter** | The UI shall support **paginated** lists and **filters** (e.g. time range, topic, optional text match on payload or parsed fields as implementation allows). **Implementation:** in **history**, payload **plain vs formatted JSON** is toggled **per row** by **clicking the payload** (same interaction as the live feed), not via a global column mode control. The history table uses a **dedicated first column** for **row-selection checkboxes** (**fixed width**, not part of column resizing) and a **second column** for **message ID**; then **Time**, **Topic**, and **Payload**; and a **fixed-width** column for **row actions** (e.g. delete). **Resizing** applies **only** to the boundaries **between ID, Time, Topic, and Payload** (three draggable grips on those headers); checkbox and action columns remain fixed. Width proportions for the four data columns are **persisted** in the browser (e.g. `localStorage` key `mqttParser.historyTableColPcts`). The layout shall keep the checkbox column from collapsing when percentage-based column widths are used (e.g. non-empty header cell and minimum width on the column definition). |
| **Publish presets** | Optional rows in SQLite (or equivalent) holding **topic + payload** (and recency) for operator shortcuts; updated when a manual publish **succeeds**; exposed via HTTP API for the UI. |
| **Deletion** | The UI shall support **deleting** messages: by selection and/or by filter-based delete, with **confirmation** to avoid accidents. |
| **Performance** | Schema and **indexes** (e.g. on `received_at`, `topic`) shall support growing history without unusable query times for typical single-instance workloads. |
| **Limits** | Document practical limits of SQLite (concurrent writers, very large databases); if limits are hit in production, **migration to PostgreSQL** (or similar) is an expected evolution, not a blocker for v1. |

## 6. End-to-End Flows

### 6.1 Device → Web UI

1. Container starts; broker listens on the mapped MQTT port.  
2. Device connects to `host:mqtt_port` and publishes to a topic.  
3. Application subscribes (globally or per configured filter) and receives the message.  
4. Parser processes the payload; result is **logged**, **persisted in SQLite**, and **pushed** to the browser.

### 6.2 Web UI → Device (or broker subscribers)

1. Operator configures a rule or uses “Publish”.  
2. Application publishes to the broker on the chosen topic.  
3. Subscribed devices receive the message.

## 7. Configuration & Operations

- **Environment variables** for ports, broker bind address, log level, feature flags, and **SQLite database file path** (or equivalent connection string).  
- **Volume mounts** for broker config, TLS certs, persistent logs, and the **SQLite data file** (recommended for production-like use).  
- **README** (separate doc) with: `docker run` example, port mapping, firewall notes, TLS setup sketch, and where the database file lives.

## 8. Explicit Additions (Beyond the Original Brief)

The following items were not stated initially but are recommended so the product is deployable and maintainable:

| Area | Addition |
| ------ | ---------- |
| **Real-time UI** | WebSockets or SSE for live message stream (HTTP polling alone is usually insufficient for a good operator experience). |
| **Auth & TLS** | Optional MQTT and HTTP TLS; broker ACLs or passwords for non-lab deployments. |
| **Parser safety** | Limits on message size, rate, and parse depth to avoid DoS from malformed payloads. |
| **Rules engine scope** | Clarify whether “responses” are simple topic/payload templates or a full rule DSL; document limits (max rules, evaluation order). |
| **API** | REST + WebSocket are baseline capabilities for automation and UI operation: publish, list recent messages, manage rules, stream live events. |
| **Multi-tenancy** | Single-tenant container by default; no requirement for multiple isolated tenants unless added later. |
| **Versioning** | Image tags and changelog for reproducible deployments. |

## 9. Out of Scope (Unless Later Agreed)

- High-availability clustering of the broker across multiple containers.  
- MQTT 5 vs 3.1.1: support level to be stated in implementation docs (minimum is often 3.1.1 + optional MQTT 5).  
- Device provisioning or certificate lifecycle management beyond pointing devices at the broker URL/port.

## 10. Acceptance Criteria (High Level)

- [ ] `docker run` with published MQTT and HTTP ports allows a standard MQTT client to connect and publish.  
- [ ] The same published message appears in the web UI with topic, payload, and timestamp.  
- [ ] Parser output is visible for at least one supported format (e.g. JSON).  
- [ ] Operator can publish a message from the UI and a subscribed test client receives it.  
- [ ] A configured automatic response publishes when a matching inbound message arrives.  
- [ ] Operator can **manage rules** (including enable/disable via the **On** status control) from the **Rules** sub-tab next to **Publish** under **Live & Publish**.  
- [ ] Logs record receive/publish/parse events with sufficient detail for troubleshooting.  
- [ ] Received messages are **stored in SQLite** and can be **browsed**, **filtered**, and **deleted** via the web UI (with safe confirmation for destructive actions).  
- [ ] **History** table layout uses a **fixed-width** checkbox column and a **separate ID** column; **column resizing** applies only to **ID / Time / Topic / Payload**, not to checkbox or row-action columns.  
- [ ] Successful **manual publishes** are reflected in **stored publish presets** (or equivalent) and selectable in the UI.  
- [ ] A **Help** tab documents usage of the main UI (live feed, split layout, publish presets, rules, history, config, logs, theme).

---

*This document captures product requirements; the **application message store** is **SQLite** for the initial version. Other implementation choices (language, framework, broker) remain open unless recorded elsewhere.*
