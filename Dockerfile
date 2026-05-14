# --- Frontend build ---
FROM node:20-bookworm AS web
WORKDIR /w
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- Runtime: Ubuntu + Mosquitto + Node (native modules compiled for this image) ---
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl gettext-base mosquitto mosquitto-clients \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs build-essential python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/ ./
RUN npm run build && npm prune --omit=dev

COPY --from=web /w/dist ./public

COPY config/mosquitto.conf.template /etc/mosquitto/mosquitto.conf.template
COPY scripts/entrypoint.sh /entrypoint.sh
COPY scripts/mqtt-supervisor.sh /app/scripts/mqtt-supervisor.sh
RUN chmod +x /entrypoint.sh /app/scripts/mqtt-supervisor.sh

ENV SQLITE_PATH=/data/mqtt-parser.db \
    HTTP_PORT=8080 \
    MQTT_PORT=1883 \
    MQTT_HOST=127.0.0.1 \
    MAX_MESSAGE_BYTES=262144 \
    PUID=1000 \
    PGID=1000

EXPOSE 8080 1883

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD sh -c 'curl -fsS "http://127.0.0.1:${HTTP_PORT:-8080}/api/health" >/dev/null' || exit 1

ENTRYPOINT ["/entrypoint.sh"]
