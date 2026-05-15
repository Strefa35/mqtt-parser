# Smoke Tests

This document shows the quickest way to build the container and verify that the application is running.

## 1. Build and start

Run the commands from the project root.

```bash
docker compose up --build -d
```

## 2. Check container status

```bash
docker compose ps
docker compose logs -f mqtt-parser
```

## 3. Check the HTTP health endpoint

```bash
curl http://localhost:8080/api/health
```

If `jq` is available, the output is easier to read:

```bash
curl -s http://localhost:8080/api/health | jq
```

## 4. Check MQTT publish and subscribe

If `mosquitto-clients` is installed on the host:

```bash
mosquitto_sub -h localhost -p 1883 -t test/topic
```

In a second terminal:

```bash
mosquitto_pub -h localhost -p 1883 -t test/topic -m "hello"
```

If you prefer to run the client tools inside the container:

```bash
docker compose exec mqtt-parser mosquitto_sub -h localhost -p 1883 -t test/topic
```

In a second terminal:

```bash
docker compose exec mqtt-parser mosquitto_pub -h localhost -p 1883 -t test/topic -m "hello"
```

## 5. Stop the stack

```bash
docker compose down
```

## Recommended name

Use `SMOKE-TESTS.md` rather than `CHECK.md`.

`CHECK.md` is too generic, while `SMOKE-TESTS.md` makes the purpose clear: build the image, start the stack, verify the health endpoint, and confirm MQTT traffic works.
