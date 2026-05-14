/**
 * Same-origin path for API calls. Honors Vite `base` when the UI is served under a subpath.
 */
function apiUrl(path: string): string {
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || '';
  const p = path.startsWith('/') ? path : `/${path}`;
  return base === '' ? p : `${base}${p}`;
}

async function j<T>(input: Response | Promise<Response>): Promise<T> {
  const r = await input;
  const t = await r.text();
  let body: unknown = null;
  try {
    body = t ? JSON.parse(t) : null;
  } catch {
    body = t;
  }
  if (!r.ok) {
    const err =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : t || r.statusText;
    throw new Error(err);
  }
  return body as T;
}

export type MqttProfileConfig = {
  host: string;
  port: number;
  hostUsesEnvFallback: boolean;
  portUsesEnvFallback: boolean;
  envFallbackHost: string;
  envFallbackPort: number;
};

export type MqttClientConfig = {
  host: string;
  port: number;
  hostUsesEnvFallback: boolean;
  portUsesEnvFallback: boolean;
  envFallbackHost: string;
  envFallbackPort: number;
  username: string;
  passwordSet: boolean;
  protocol: '3.1.1' | '5';
  keepalive: number;
  activeProfile: 'embedded' | 'external';
};

export type Config = {
  broker: {
    hostHint?: string;
    internalHost: string;
    port: number;
    tls: boolean;
    anonymous: boolean;
  };
  mqttClient: MqttClientConfig;
  mqttEmbedded: MqttProfileConfig;
  mqttExternal: MqttProfileConfig;
  embeddedMqttBrokerEnabled: boolean;
  embeddedMqttBrokerRunning: boolean;
  subscriptionPattern: string;
  defaultParseMode: string;
  sqlitePath: string;
  httpPort: number;
};

function isMqttProfileBlock(o: unknown): o is MqttProfileConfig {
  if (!o || typeof o !== 'object') return false;
  const x = o as Record<string, unknown>;
  return (
    typeof x.host === 'string' &&
    typeof x.port === 'number' &&
    typeof x.hostUsesEnvFallback === 'boolean' &&
    typeof x.portUsesEnvFallback === 'boolean' &&
    typeof x.envFallbackHost === 'string' &&
    typeof x.envFallbackPort === 'number'
  );
}

function isConfig(o: unknown): o is Config {
  if (!o || typeof o !== 'object') return false;
  const c = o as Record<string, unknown>;
  const mc = c.mqttClient;
  if (mc == null || typeof mc !== 'object') return false;
  const m = mc as Record<string, unknown>;
  return (
    c.broker != null &&
    typeof c.broker === 'object' &&
    typeof m.host === 'string' &&
    typeof m.port === 'number' &&
    typeof m.activeProfile === 'string' &&
    (m.activeProfile === 'embedded' || m.activeProfile === 'external') &&
    isMqttProfileBlock(c.mqttEmbedded) &&
    isMqttProfileBlock(c.mqttExternal) &&
    typeof c.embeddedMqttBrokerEnabled === 'boolean' &&
    typeof c.embeddedMqttBrokerRunning === 'boolean'
  );
}

async function fetchConfig(
  method: 'GET' | 'PATCH',
  patchBody?: Record<string, unknown>
): Promise<Config> {
  const init: RequestInit =
    method === 'PATCH'
      ? {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody ?? {}),
        }
      : {};
  const r = await fetch(apiUrl('/api/config'), init);
  const t = await r.text();
  let parsed: unknown;
  try {
    parsed = t ? JSON.parse(t) : null;
  } catch {
    throw new Error(
      `Invalid JSON from /api/config (HTTP ${r.status}): ${t.slice(0, 180)}`
    );
  }
  if (!r.ok) {
    const err =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : t || r.statusText;
    throw new Error(err);
  }
  if (!isConfig(parsed)) {
    throw new Error(
      `Unexpected /api/config response (missing mqttClient). Raw: ${t.slice(0, 200)}`
    );
  }
  return parsed;
}

export type MessageRow = {
  id: number;
  received_at: number;
  topic: string;
  qos: number;
  retain: number;
  payload_encoding: string;
  payload_display: string;
  parsed_json: string | null;
  parse_mode: string;
};

export type Rule = {
  id: number;
  sort_order: number;
  name: string;
  enabled: number;
  topic_pattern: string;
  payload_regex: string | null;
  reply_topic: string;
  reply_payload_template: string;
};

export type AppLog = {
  id: number;
  at: number;
  level: string;
  message: string;
  meta: string | null;
};

export function getConfig() {
  return fetchConfig('GET');
}

export function patchConfig(body: Record<string, unknown>) {
  return fetchConfig('PATCH', body);
}

export function getMessages(params: URLSearchParams) {
  return j<{ total: number; page: number; limit: number; items: MessageRow[] }>(
    fetch(apiUrl(`/api/messages?${params.toString()}`))
  );
}

export function deleteMessage(id: number) {
  return j<{ deleted: number }>(
    fetch(apiUrl(`/api/messages/${id}`), { method: 'DELETE' })
  );
}

export function deleteBulk(ids: number[]) {
  return j<{ deleted: number }>(
    fetch(apiUrl('/api/messages/delete-bulk'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
  );
}

export function deleteByFilter(
  body: Record<string, unknown> & { confirm: true }
) {
  return j<{ deleted: number }>(
    fetch(apiUrl('/api/messages/delete-by-filter'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

export function getLogs(limit = 200) {
  return j<{ items: AppLog[] }>(fetch(apiUrl(`/api/logs?limit=${limit}`)));
}

export function getRules() {
  return j<{ items: Rule[] }>(fetch(apiUrl('/api/rules')));
}

export function createRule(body: Record<string, unknown>) {
  return j<{ id: number }>(
    fetch(apiUrl('/api/rules'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

export function updateRule(id: number, body: Record<string, unknown>) {
  return j<{ ok: boolean }>(
    fetch(apiUrl(`/api/rules/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

export function deleteRule(id: number) {
  return j<{ deleted: number }>(
    fetch(apiUrl(`/api/rules/${id}`), { method: 'DELETE' })
  );
}

export type PublishPreset = {
  id: number;
  topic: string;
  payload: string;
  lastUsedAt: number;
};

export function getPublishPresets() {
  return j<{ items: PublishPreset[] }>(fetch(apiUrl('/api/publish-presets')));
}

/** Save a topic+payload pair to Recent commands without publishing it. */
export function addPublishPreset(body: { topic: string; payload: string }) {
  return j<{ ok: boolean }>(
    fetch(apiUrl('/api/publish-presets'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

export function publishMqtt(body: {
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
}) {
  return j<{ ok: boolean }>(
    fetch(apiUrl('/api/publish'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

export type AppHealth = {
  ok: boolean;
  mqtt: string;
  broker: { host: string; port: number; tls: boolean };
  mqttActiveProfile?: 'embedded' | 'external';
  embeddedMqttBrokerEnabled: boolean;
  embeddedMqttBrokerRunning: boolean;
};

export type HostInfo = {
  hostIp: string;
};

export function getHealth() {
  return j<AppHealth>(fetch(apiUrl('/api/health')));
}

export function getHostInfo() {
  return j<HostInfo>(fetch(apiUrl('/api/host-info')));
}
