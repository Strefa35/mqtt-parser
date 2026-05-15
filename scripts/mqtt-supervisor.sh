#!/bin/bash
# Keeps Mosquitto in sync with /data/.run_embedded_mosquitto (written by Node from SQLite).
set -euo pipefail

SQLITE_PATH="${SQLITE_PATH:-/data/mqtt-parser.db}"
DATA_DIR="$(dirname "$SQLITE_PATH")"
CONTROL_FILE="${EMBEDDED_MOSQUITTO_CONTROL_FILE:-$DATA_DIR/.run_embedded_mosquitto}"
PID_FILE="${MOSQUITTO_PID_FILE:-/tmp/mosquitto-mqtt-parser.pid}"
CONF="${MOSQUITTO_CONF:-/etc/mosquitto/mosquitto.conf}"
INTERVAL="${MOSQUITTO_SUPERVISOR_INTERVAL:-2}"

mkdir -p "$DATA_DIR"

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(tr -d '[:space:]' <"$PID_FILE" 2>/dev/null || true)"
    if [[ -z "$pid" ]]; then
      return 1
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      return 1
    fi
    if [[ -r "/proc/$pid/comm" ]]; then
      [[ "$(tr -d '[:space:]' <"/proc/$pid/comm" 2>/dev/null || true)" == "mosquitto" ]]
      return $?
    fi
    if [[ -r "/proc/$pid/cmdline" ]]; then
      local argv0 exe
      argv0="$(tr '\0' '\n' <"/proc/$pid/cmdline" 2>/dev/null | head -n1 || true)"
      exe="$(basename "$argv0")"
      [[ "$exe" == "mosquitto" ]]
      return $?
    fi
    return 1
  else
    return 1
  fi
}

stop_mosquitto() {
  if ! is_running; then
    rm -f "$PID_FILE"
    return 0
  fi
  local pid
  pid="$(tr -d '[:space:]' <"$PID_FILE")"
  kill -TERM "$pid" 2>/dev/null || true
  local i=0
  while [[ $i -lt 30 ]] && is_running; do
    sleep 0.2
    i=$((i + 1))
  done
  if is_running; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
}

start_mosquitto() {
  if is_running; then
    return 0
  fi
  rm -f "$PID_FILE"
  mosquitto -c "$CONF" -d
  sleep 0.4
}

desired_enabled() {
  if [[ -f "$CONTROL_FILE" ]]; then
    [[ "$(tr -d '[:space:]' <"$CONTROL_FILE")" == "1" ]]
  else
    # Before Node writes the file, default matches historical behaviour (broker on).
    return 0
  fi
}

while true; do
  if desired_enabled; then
    if ! is_running; then
      start_mosquitto || true
    fi
  else
    if is_running; then
      stop_mosquitto
    fi
  fi
  sleep "$INTERVAL"
done
