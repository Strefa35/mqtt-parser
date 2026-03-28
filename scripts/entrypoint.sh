#!/bin/bash
set -euo pipefail

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
MQTT_PORT="${MQTT_PORT:-1883}"
HTTP_PORT="${HTTP_PORT:-8080}"
export MQTT_PORT HTTP_PORT

DATA_DIR="$(dirname "${SQLITE_PATH:-/data/mqtt-parser.db}")"
mkdir -p "$DATA_DIR"

# SQLite lives on a host bind mount; own it by PUID/PGID so files are not root on the host.
if [ "$(id -u)" = 0 ]; then
  chown -R "${PUID}:${PGID}" "$DATA_DIR" || true
fi

envsubst '${MQTT_PORT}' < /etc/mosquitto/mosquitto.conf.template > /etc/mosquitto/mosquitto.conf

mosquitto -c /etc/mosquitto/mosquitto.conf -d
sleep 1

if [ "$(id -u)" = 0 ]; then
  exec setpriv --reuid="$PUID" --regid="$PGID" --init-groups -- node /app/dist/index.js
else
  exec node /app/dist/index.js
fi
