import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import {
  countMessages,
  deleteMessageById,
  deleteMessagesByFilter,
  deleteMessagesByIds,
  deleteRule,
  getRule,
  getSetting,
  insertRule,
  listAppLogs,
  listMessages,
  listPublishPresets,
  listRules,
  openDb,
  setSetting,
  updateRule,
  upsertPublishPreset,
  type MessageListFilter,
} from './db.js';
import { MqttBridge } from './mqtt-bridge.js';
import {
  isEmbeddedMosquittoProcessRunning,
  syncEmbeddedMosquittoControlFile,
} from './mosquitto-control.js';
import { registerClient } from './ws-hub.js';

type WebsocketRouteArg = WebSocket | { socket: WebSocket };

function websocketFromRouteArg(connection: WebsocketRouteArg): WebSocket {
  return 'socket' in connection ? connection.socket : connection;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, '../public');

const DEFAULT_HTTP_PORT = 8080;
const DEFAULT_MQTT_PORT = 1883;
const DEFAULT_MAX_MESSAGE_BYTES = 262144;
const MAX_MESSAGE_BYTES_CAP = 256 * 1024 * 1024;

function envTcpPort(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  const p = Math.floor(n);
  if (p < 1 || p > 65535) return fallback;
  return p;
}

function envMaxMessageBytes(fallback: number): number {
  const n = Number(process.env.MAX_MESSAGE_BYTES);
  if (!Number.isFinite(n)) return fallback;
  const b = Math.floor(n);
  if (b <= 0) return fallback;
  return Math.min(b, MAX_MESSAGE_BYTES_CAP);
}

const SQLITE_PATH = process.env.SQLITE_PATH ?? '/data/mqtt-parser.db';
const HTTP_PORT = envTcpPort('HTTP_PORT', DEFAULT_HTTP_PORT);
const MQTT_HOST = process.env.MQTT_HOST ?? '127.0.0.1';
const MQTT_PORT = envTcpPort('MQTT_PORT', DEFAULT_MQTT_PORT);
const MOSQUITTO_PID_FILE = process.env.MOSQUITTO_PID_FILE ?? '/tmp/mosquitto-mqtt-parser.pid';
const MAX_MESSAGE_BYTES = envMaxMessageBytes(DEFAULT_MAX_MESSAGE_BYTES);
const DOCKER_HOST_IP = process.env.DOCKER_HOST_IP ?? 'host.docker.internal';

const db = openDb(SQLITE_PATH);

function embeddedMqttBrokerDesired(): boolean {
  return getSetting(db, 'embedded_mqtt_broker_enabled') === '1';
}

syncEmbeddedMosquittoControlFile(SQLITE_PATH, embeddedMqttBrokerDesired());

const bridge = new MqttBridge(db, MQTT_HOST, MQTT_PORT, MAX_MESSAGE_BYTES);
bridge.start();

const app = Fastify({ logger: true });

await app.register(fastifyWebsocket);

function mqttProfileBlock(profile: 'embedded' | 'external') {
  const hostKey = profile === 'embedded' ? 'mqtt_embedded_host' : 'mqtt_external_host';
  const portKey = profile === 'embedded' ? 'mqtt_embedded_port' : 'mqtt_external_port';
  const storedH = getSetting(db, hostKey).trim();
  const storedP = getSetting(db, portKey).trim();
  const envFallbackHost = profile === 'embedded' ? '127.0.0.1' : MQTT_HOST;
  return {
    host: bridge.resolveHostForProfile(profile),
    port: bridge.resolvePortForProfile(profile),
    hostUsesEnvFallback: storedH === '',
    portUsesEnvFallback: storedP === '',
    envFallbackHost,
    envFallbackPort: MQTT_PORT,
  };
}

function configResponse() {
  const mc = bridge.getConnectionSummary();
  const active = mc.activeProfile;
  const activeHostKey = active === 'embedded' ? 'mqtt_embedded_host' : 'mqtt_external_host';
  const activePortKey = active === 'embedded' ? 'mqtt_embedded_port' : 'mqtt_external_port';
  const activeStoredH = getSetting(db, activeHostKey).trim();
  const activeStoredP = getSetting(db, activePortKey).trim();
  const activeEnvHost = active === 'embedded' ? '127.0.0.1' : MQTT_HOST;
  return {
    broker: {
      hostHint: getSetting(db, 'host_hint') || undefined,
      /** @deprecated use mqttClient — kept for older UIs */
      internalHost: mc.host,
      port: mc.port,
      tls: false,
      anonymous: !mc.username,
    },
    mqttClient: {
      host: mc.host,
      port: mc.port,
      hostUsesEnvFallback: activeStoredH === '',
      portUsesEnvFallback: activeStoredP === '',
      envFallbackHost: activeEnvHost,
      envFallbackPort: MQTT_PORT,
      username: mc.username,
      passwordSet: mc.passwordSet,
      protocol: mc.protocol,
      keepalive: mc.keepalive,
      activeProfile: mc.activeProfile,
    },
    mqttEmbedded: mqttProfileBlock('embedded'),
    mqttExternal: mqttProfileBlock('external'),
    embeddedMqttBrokerEnabled: embeddedMqttBrokerDesired(),
    embeddedMqttBrokerRunning: isEmbeddedMosquittoProcessRunning(MOSQUITTO_PID_FILE),
    subscriptionPattern: getSetting(db, 'subscription_pattern'),
    defaultParseMode: getSetting(db, 'default_parse_mode'),
    sqlitePath: SQLITE_PATH,
    httpPort: HTTP_PORT,
  };
}

function parseListFilter(q: Record<string, string | string[] | undefined>): MessageListFilter {
  const g = (k: string) => {
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const num = (v: string | undefined) => {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    page: Math.max(1, Number(g('page') ?? '1') || 1),
    limit: Math.min(200, Math.max(1, Number(g('limit') ?? '50') || 50)),
    topicContains: g('topicContains') ?? undefined,
    fromTs: num(g('fromTs')),
    toTs: num(g('toTs')),
    search: g('search') ?? undefined,
  };
}

app.get('/api/health', async () => {
  const mc = bridge.getConnectionSummary();
  return {
    ok: true,
    mqtt: bridge.isConnected() ? 'connected' : 'disconnected',
    broker: {
      host: mc.host,
      port: mc.port,
      tls: false,
    },
    mqttActiveProfile: mc.activeProfile,
    embeddedMqttBrokerEnabled: embeddedMqttBrokerDesired(),
    embeddedMqttBrokerRunning: isEmbeddedMosquittoProcessRunning(MOSQUITTO_PID_FILE),
    limits: {
      maxMessageBytes: MAX_MESSAGE_BYTES,
    },
  };
});

app.get('/api/host-info', async () => {
  return {
    hostIp: DOCKER_HOST_IP,
  };
});

app.get('/api/config', async () => configResponse());

app.patch<{ Body: Record<string, unknown> }>('/api/config', async (req) => {
  const body = req.body ?? {};
  let reconnectMqtt = false;

  if (typeof body.embeddedMqttBrokerEnabled === 'boolean') {
    setSetting(db, 'embedded_mqtt_broker_enabled', body.embeddedMqttBrokerEnabled ? '1' : '0');
  }
  if (body.mqttActiveProfile === 'embedded' || body.mqttActiveProfile === 'external') {
    setSetting(db, 'mqtt_active_profile', body.mqttActiveProfile);
    reconnectMqtt = true;
  }

  if (typeof body.mqttEmbeddedHost === 'string') {
    setSetting(db, 'mqtt_embedded_host', body.mqttEmbeddedHost.trim());
    if (bridge.getActiveProfile() === 'embedded') reconnectMqtt = true;
  }
  if (body.mqttEmbeddedPort !== undefined) {
    if (body.mqttEmbeddedPort === '' || body.mqttEmbeddedPort === null) {
      setSetting(db, 'mqtt_embedded_port', '');
      if (bridge.getActiveProfile() === 'embedded') reconnectMqtt = true;
    } else {
      const p =
        typeof body.mqttEmbeddedPort === 'number'
          ? body.mqttEmbeddedPort
          : Number(body.mqttEmbeddedPort);
      if (Number.isFinite(p) && p > 0 && p < 65536) {
        setSetting(db, 'mqtt_embedded_port', String(Math.floor(p)));
        if (bridge.getActiveProfile() === 'embedded') reconnectMqtt = true;
      }
    }
  }
  if (typeof body.mqttExternalHost === 'string') {
    setSetting(db, 'mqtt_external_host', body.mqttExternalHost.trim());
    if (bridge.getActiveProfile() === 'external') reconnectMqtt = true;
  }
  if (body.mqttExternalPort !== undefined) {
    if (body.mqttExternalPort === '' || body.mqttExternalPort === null) {
      setSetting(db, 'mqtt_external_port', '');
      if (bridge.getActiveProfile() === 'external') reconnectMqtt = true;
    } else {
      const p =
        typeof body.mqttExternalPort === 'number'
          ? body.mqttExternalPort
          : Number(body.mqttExternalPort);
      if (Number.isFinite(p) && p > 0 && p < 65536) {
        setSetting(db, 'mqtt_external_port', String(Math.floor(p)));
        if (bridge.getActiveProfile() === 'external') reconnectMqtt = true;
      }
    }
  }

  if (typeof body.subscriptionPattern === 'string' && body.subscriptionPattern.trim()) {
    setSetting(db, 'subscription_pattern', body.subscriptionPattern.trim());
    bridge.reloadSubscription();
  }
  if (typeof body.defaultParseMode === 'string') {
    const m = body.defaultParseMode;
    if (m === 'auto' || m === 'json' || m === 'text' || m === 'hex') {
      setSetting(db, 'default_parse_mode', m);
    }
  }
  if (typeof body.hostHint === 'string') {
    setSetting(db, 'host_hint', body.hostHint);
  }

  if (typeof body.mqttClientHost === 'string') {
    const k =
      getSetting(db, 'mqtt_active_profile').trim() === 'external'
        ? 'mqtt_external_host'
        : 'mqtt_embedded_host';
    setSetting(db, k, body.mqttClientHost.trim());
    reconnectMqtt = true;
  }
  if (body.mqttClientPort !== undefined) {
    const k =
      getSetting(db, 'mqtt_active_profile').trim() === 'external'
        ? 'mqtt_external_port'
        : 'mqtt_embedded_port';
    if (body.mqttClientPort === '' || body.mqttClientPort === null) {
      setSetting(db, k, '');
      reconnectMqtt = true;
    } else {
      const p =
        typeof body.mqttClientPort === 'number'
          ? body.mqttClientPort
          : Number(body.mqttClientPort);
      if (Number.isFinite(p) && p > 0 && p < 65536) {
        setSetting(db, k, String(Math.floor(p)));
        reconnectMqtt = true;
      }
    }
  }
  if (typeof body.mqttClientUsername === 'string') {
    setSetting(db, 'mqtt_username', body.mqttClientUsername);
    reconnectMqtt = true;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'mqttClientPassword')) {
    setSetting(db, 'mqtt_password', String(body.mqttClientPassword ?? ''));
    reconnectMqtt = true;
  }
  if (typeof body.mqttProtocol === 'string') {
    const pr = body.mqttProtocol;
    if (pr === '3.1.1' || pr === '5') {
      setSetting(db, 'mqtt_protocol', pr === '5' ? '5' : '3.1.1');
      reconnectMqtt = true;
    }
  }
  if (body.mqttKeepalive !== undefined) {
    const k =
      typeof body.mqttKeepalive === 'number'
        ? body.mqttKeepalive
        : Number(body.mqttKeepalive);
    if (Number.isFinite(k)) {
      setSetting(db, 'mqtt_keepalive', String(Math.floor(k)));
      reconnectMqtt = true;
    }
  }

  if (reconnectMqtt) {
    bridge.restartConnection();
  }

  syncEmbeddedMosquittoControlFile(SQLITE_PATH, embeddedMqttBrokerDesired());

  return configResponse();
});

app.get('/api/messages', async (req) => {
  const f = parseListFilter(req.query as Record<string, string | string[] | undefined>);
  const total = countMessages(db, f);
  const items = listMessages(db, f);
  return { total, page: f.page, limit: f.limit, items };
});

app.delete<{ Params: { id: string } }>('/api/messages/:id', async (req, reply) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return reply.code(400).send({ error: 'Invalid id' });
  const n = deleteMessageById(db, id);
  if (!n) return reply.code(404).send({ error: 'Not found' });
  return { deleted: n };
});

app.post<{ Body: { ids?: unknown } }>('/api/messages/delete-bulk', async (req, reply) => {
  const idsRaw = req.body?.ids;
  if (!Array.isArray(idsRaw)) {
    return reply.code(400).send({ error: 'ids array required' });
  }
  const ids = idsRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  const deleted = deleteMessagesByIds(db, ids);
  return { deleted };
});

app.post<{ Body: Record<string, unknown> }>('/api/messages/delete-by-filter', async (req, reply) => {
  const b = req.body ?? {};
  if (b.confirm !== true) {
    return reply.code(400).send({ error: 'confirm: true is required' });
  }
  const f: MessageListFilter = {
    page: 1,
    limit: 200,
    topicContains: typeof b.topicContains === 'string' ? b.topicContains : undefined,
    fromTs: typeof b.fromTs === 'number' ? b.fromTs : undefined,
    toTs: typeof b.toTs === 'number' ? b.toTs : undefined,
    search: typeof b.search === 'string' ? b.search : undefined,
  };
  const deleted = deleteMessagesByFilter(db, f);
  return { deleted };
});

app.get('/api/logs', async (req) => {
  const q = req.query as Record<string, string | string[] | undefined>;
  let lim = Number(
    (Array.isArray(q.limit) ? q.limit[0] : q.limit) ?? '200'
  );
  if (!Number.isFinite(lim)) lim = 200;
  return { items: listAppLogs(db, lim) };
});

app.get('/api/rules', async () => ({ items: listRules(db) }));

app.post<{
  Body: {
    name?: unknown;
    enabled?: unknown;
    sortOrder?: unknown;
    topicPattern?: unknown;
    payloadRegex?: unknown;
    replyTopic?: unknown;
    replyPayloadTemplate?: unknown;
  };
}>('/api/rules', async (req, reply) => {
  const b = req.body ?? {};
  if (typeof b.name !== 'string' || !b.name.trim()) {
    return reply.code(400).send({ error: 'name required' });
  }
  if (typeof b.topicPattern !== 'string' || !b.topicPattern.trim()) {
    return reply.code(400).send({ error: 'topicPattern required' });
  }
  if (typeof b.replyTopic !== 'string' || !b.replyTopic.trim()) {
    return reply.code(400).send({ error: 'replyTopic required' });
  }
  if (typeof b.replyPayloadTemplate !== 'string') {
    return reply.code(400).send({ error: 'replyPayloadTemplate required' });
  }
  try {
    const id = insertRule(db, {
      sort_order: typeof b.sortOrder === 'number' ? b.sortOrder : 0,
      name: b.name.trim(),
      enabled: b.enabled === false ? 0 : 1,
      topic_pattern: b.topicPattern.trim(),
      payload_regex:
        typeof b.payloadRegex === 'string' && b.payloadRegex.trim()
          ? b.payloadRegex.trim()
          : null,
      reply_topic: b.replyTopic.trim(),
      reply_payload_template: b.replyPayloadTemplate,
    });
    return { id };
  } catch (e) {
    return reply.code(400).send({ error: String(e) });
  }
});

app.patch<{
  Params: { id: string };
  Body: Record<string, unknown>;
}>('/api/rules/:id', async (req, reply) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return reply.code(400).send({ error: 'Invalid id' });
  const existing = getRule(db, id);
  if (!existing) return reply.code(404).send({ error: 'Not found' });
  const b = req.body ?? {};
  const next = {
    sort_order:
      typeof b.sortOrder === 'number' ? b.sortOrder : existing.sort_order,
    name: typeof b.name === 'string' ? b.name : existing.name,
    enabled:
      typeof b.enabled === 'boolean' ? (b.enabled ? 1 : 0) : existing.enabled,
    topic_pattern:
      typeof b.topicPattern === 'string' ? b.topicPattern : existing.topic_pattern,
    payload_regex:
      typeof b.payloadRegex === 'string'
        ? b.payloadRegex.trim() || null
        : existing.payload_regex,
    reply_topic:
      typeof b.replyTopic === 'string' ? b.replyTopic : existing.reply_topic,
    reply_payload_template:
      typeof b.replyPayloadTemplate === 'string'
        ? b.replyPayloadTemplate
        : existing.reply_payload_template,
  };
  updateRule(db, id, next);
  return { ok: true };
});

app.delete<{ Params: { id: string } }>('/api/rules/:id', async (req, reply) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return reply.code(400).send({ error: 'Invalid id' });
  const n = deleteRule(db, id);
  if (!n) return reply.code(404).send({ error: 'Not found' });
  return { deleted: n };
});

app.get('/api/publish-presets', async () => {
  const items = listPublishPresets(db).map((r) => ({
    id: r.id,
    topic: r.topic,
    payload: r.payload,
    lastUsedAt: r.last_used_at,
  }));
  return { items };
});

app.post<{
  Body: {
    topic?: unknown;
    payload?: unknown;
    qos?: unknown;
    retain?: unknown;
  };
}>('/api/publish', async (req, reply) => {
  const b = req.body ?? {};
  if (typeof b.topic !== 'string' || !b.topic.trim()) {
    return reply.code(400).send({ error: 'topic required' });
  }
  const payload = typeof b.payload === 'string' ? b.payload : '';
  const qos = (typeof b.qos === 'number' ? b.qos : 0) as 0 | 1 | 2;
  const retain = Boolean(b.retain);
  if (![0, 1, 2].includes(qos)) {
    return reply.code(400).send({ error: 'qos must be 0, 1, or 2' });
  }
  try {
    const t = b.topic.trim();
    await bridge.publish(t, payload, qos, retain);
    upsertPublishPreset(db, t, payload);
    return { ok: true };
  } catch (e) {
    return reply.code(503).send({ error: String(e) });
  }
});

app.get('/ws', { websocket: true }, (connection, _request) => {
  registerClient(websocketFromRouteArg(connection as WebsocketRouteArg));
});

await app.register(fastifyStatic, {
  root: publicRoot,
  prefix: '/',
  wildcard: false,
});

app.setNotFoundHandler((req, reply) => {
  if (req.method !== 'GET') {
    return reply.code(404).send({ error: 'Not found' });
  }
  if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
    return reply.code(404).send({ error: 'Not found' });
  }
  return reply.sendFile('index.html');
});

await app.listen({ port: HTTP_PORT, host: '0.0.0.0' });
