import Database from 'better-sqlite3';
import type { ParseMode } from './parser.js';
import type { RuleRow } from './rules-engine.js';

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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at INTEGER NOT NULL,
  topic TEXT NOT NULL,
  qos INTEGER NOT NULL,
  retain INTEGER NOT NULL,
  payload_encoding TEXT NOT NULL,
  payload_display TEXT NOT NULL,
  parsed_json TEXT,
  parse_mode TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_received ON messages (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages (topic);

CREATE TABLE IF NOT EXISTS app_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_logs_at ON app_logs (at DESC);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  topic_pattern TEXT NOT NULL,
  payload_regex TEXT,
  reply_topic TEXT NOT NULL,
  reply_payload_template TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  payload TEXT NOT NULL,
  last_used_at INTEGER NOT NULL,
  UNIQUE(topic, payload)
);
CREATE INDEX IF NOT EXISTS idx_publish_presets_last_used ON publish_presets (last_used_at DESC);
`;

const DEFAULTS: Record<string, string> = {
  subscription_pattern: '#',
  default_parse_mode: 'auto',
  host_hint: '',
  /** Legacy single client target; migrated into profile keys on open (see migrateLegacyMqttClientSettings). */
  mqtt_client_host: '',
  mqtt_client_port: '',
  /** "1" = run Mosquitto in container (supervisor); "0" = stop embedded broker. */
  embedded_mqtt_broker_enabled: '1',
  /** "embedded" | "external" — which host/port profile the app MQTT client uses. */
  mqtt_active_profile: 'embedded',
  /** Profile → in-container / loopback broker (empty host → 127.0.0.1, empty port → MQTT_PORT). */
  mqtt_embedded_host: '',
  mqtt_embedded_port: '',
  /** Profile → broker elsewhere on the network (empty host/port → MQTT_HOST / MQTT_PORT env). */
  mqtt_external_host: '',
  mqtt_external_port: '',
  mqtt_username: '',
  mqtt_password: '',
  /** "3.1.1" | "5" */
  mqtt_protocol: '5',
  mqtt_keepalive: '60',
};

function migrateLegacyMqttClientSettings(db: Database.Database): void {
  const legacyH = getSetting(db, 'mqtt_client_host').trim();
  const legacyP = getSetting(db, 'mqtt_client_port').trim();
  if (legacyH && !getSetting(db, 'mqtt_embedded_host').trim()) {
    setSetting(db, 'mqtt_embedded_host', legacyH);
  }
  if (legacyP && !getSetting(db, 'mqtt_embedded_port').trim()) {
    setSetting(db, 'mqtt_embedded_port', legacyP);
  }
  if (legacyH && !getSetting(db, 'mqtt_external_host').trim()) {
    setSetting(db, 'mqtt_external_host', legacyH);
  }
  if (legacyP && !getSetting(db, 'mqtt_external_port').trim()) {
    setSetting(db, 'mqtt_external_port', legacyP);
  }
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  const ins = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of Object.entries(DEFAULTS)) {
    ins.run(k, v);
  }
  migrateLegacyMqttClientSettings(db);
  return db;
}

export function getSetting(db: Database.Database, key: string): string {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? DEFAULTS[key] ?? '';
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

export function insertMessage(
  db: Database.Database,
  input: {
    receivedAt: number;
    topic: string;
    qos: number;
    retain: boolean;
    payloadEncoding: string;
    payloadDisplay: string;
    parsedJson: string | null;
    parseMode: ParseMode;
  }
): number {
  const info = db
    .prepare(
      `INSERT INTO messages (received_at, topic, qos, retain, payload_encoding, payload_display, parsed_json, parse_mode)
       VALUES (@receivedAt, @topic, @qos, @retain, @payloadEncoding, @payloadDisplay, @parsedJson, @parseMode)`
    )
    .run({
      receivedAt: input.receivedAt,
      topic: input.topic,
      qos: input.qos,
      retain: input.retain ? 1 : 0,
      payloadEncoding: input.payloadEncoding,
      payloadDisplay: input.payloadDisplay,
      parsedJson: input.parsedJson,
      parseMode: input.parseMode,
    });
  return Number(info.lastInsertRowid);
}

export type MessageListFilter = {
  page: number;
  limit: number;
  topicContains?: string;
  fromTs?: number;
  toTs?: number;
  search?: string;
};

function buildWhere(f: MessageListFilter): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.topicContains?.trim()) {
    parts.push('topic LIKE ?');
    params.push(`%${f.topicContains.trim()}%`);
  }
  if (f.fromTs != null) {
    parts.push('received_at >= ?');
    params.push(f.fromTs);
  }
  if (f.toTs != null) {
    parts.push('received_at <= ?');
    params.push(f.toTs);
  }
  if (f.search?.trim()) {
    parts.push(
      '(topic LIKE ? OR payload_display LIKE ? OR IFNULL(parsed_json, "") LIKE ?)'
    );
    const q = `%${f.search.trim()}%`;
    params.push(q, q, q);
  }
  const sql = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  return { sql, params };
}

export function countMessages(db: Database.Database, f: MessageListFilter): number {
  const { sql, params } = buildWhere(f);
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM messages ${sql}`)
    .get(...params) as { c: number };
  return row.c;
}

export function listMessages(
  db: Database.Database,
  f: MessageListFilter
): MessageRow[] {
  const { sql, params } = buildWhere(f);
  const limit = Math.min(Math.max(f.limit, 1), 200);
  const page = Math.max(f.page, 1);
  const offset = (page - 1) * limit;
  return db
    .prepare(
      `SELECT id, received_at, topic, qos, retain, payload_encoding, payload_display, parsed_json, parse_mode
       FROM messages ${sql}
       ORDER BY received_at DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as MessageRow[];
}

export function deleteMessageById(db: Database.Database, id: number): number {
  const info = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  return info.changes;
}

export function deleteMessagesByIds(db: Database.Database, ids: number[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const info = db
    .prepare(`DELETE FROM messages WHERE id IN (${placeholders})`)
    .run(...ids);
  return info.changes;
}

export function deleteMessagesByFilter(db: Database.Database, f: MessageListFilter): number {
  const { sql, params } = buildWhere(f);
  const info = db.prepare(`DELETE FROM messages ${sql}`).run(...params);
  return info.changes;
}

export function insertAppLog(
  db: Database.Database,
  level: string,
  message: string,
  meta?: unknown
): void {
  db.prepare(
    'INSERT INTO app_logs (at, level, message, meta) VALUES (?, ?, ?, ?)'
  ).run(Date.now(), level, message, meta == null ? null : JSON.stringify(meta));
}

export type AppLogRow = {
  id: number;
  at: number;
  level: string;
  message: string;
  meta: string | null;
};

export function listAppLogs(db: Database.Database, limit: number): AppLogRow[] {
  const n = Number.isFinite(limit) ? limit : 200;
  const lim = Math.min(Math.max(n, 1), 500);
  return db
    .prepare(
      'SELECT id, at, level, message, meta FROM app_logs ORDER BY id DESC LIMIT ?'
    )
    .all(lim) as AppLogRow[];
}

export function listRules(db: Database.Database): RuleRow[] {
  return db
    .prepare(
      'SELECT id, sort_order, name, enabled, topic_pattern, payload_regex, reply_topic, reply_payload_template FROM rules ORDER BY sort_order ASC, id ASC'
    )
    .all() as RuleRow[];
}

export function getRule(db: Database.Database, id: number): RuleRow | undefined {
  return db
    .prepare(
      'SELECT id, sort_order, name, enabled, topic_pattern, payload_regex, reply_topic, reply_payload_template FROM rules WHERE id = ?'
    )
    .get(id) as RuleRow | undefined;
}

export function countRules(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS c FROM rules').get() as { c: number };
  return row.c;
}

const MAX_RULES = 100;

export function insertRule(
  db: Database.Database,
  row: Omit<RuleRow, 'id'>
): number {
  if (countRules(db) >= MAX_RULES) {
    throw new Error(`Maximum ${MAX_RULES} rules`);
  }
  const info = db
    .prepare(
      `INSERT INTO rules (sort_order, name, enabled, topic_pattern, payload_regex, reply_topic, reply_payload_template)
       VALUES (@sort_order, @name, @enabled, @topic_pattern, @payload_regex, @reply_topic, @reply_payload_template)`
    )
    .run({
      sort_order: row.sort_order,
      name: row.name,
      enabled: row.enabled,
      topic_pattern: row.topic_pattern,
      payload_regex: row.payload_regex,
      reply_topic: row.reply_topic,
      reply_payload_template: row.reply_payload_template,
    });
  return Number(info.lastInsertRowid);
}

export function updateRule(db: Database.Database, id: number, row: Partial<RuleRow>): void {
  const existing = getRule(db, id);
  if (!existing) throw new Error('Rule not found');
  const next = { ...existing, ...row, id };
  db.prepare(
    `UPDATE rules SET sort_order = ?, name = ?, enabled = ?, topic_pattern = ?, payload_regex = ?, reply_topic = ?, reply_payload_template = ?
     WHERE id = ?`
  ).run(
    next.sort_order,
    next.name,
    next.enabled,
    next.topic_pattern,
    next.payload_regex,
    next.reply_topic,
    next.reply_payload_template,
    id
  );
}

export function deleteRule(db: Database.Database, id: number): number {
  return db.prepare('DELETE FROM rules WHERE id = ?').run(id).changes;
}

const MAX_PUBLISH_PRESETS = 30;

export type PublishPresetRow = {
  id: number;
  topic: string;
  payload: string;
  last_used_at: number;
};

export function listPublishPresets(db: Database.Database): PublishPresetRow[] {
  return db
    .prepare(
      `SELECT id, topic, payload, last_used_at FROM publish_presets
       ORDER BY last_used_at DESC LIMIT ?`
    )
    .all(MAX_PUBLISH_PRESETS) as PublishPresetRow[];
}

/** Remember topic+payload after a successful publish; bumps last_used_at and caps list size. */
export function upsertPublishPreset(
  db: Database.Database,
  topic: string,
  payload: string
): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO publish_presets (topic, payload, last_used_at)
     VALUES (?, ?, ?)
     ON CONFLICT(topic, payload) DO UPDATE SET last_used_at = excluded.last_used_at`
  ).run(topic, payload, now);
  const row = db.prepare('SELECT COUNT(*) AS n FROM publish_presets').get() as { n: number };
  if (row.n > MAX_PUBLISH_PRESETS) {
    const excess = row.n - MAX_PUBLISH_PRESETS;
    db.prepare(
      `DELETE FROM publish_presets WHERE id IN (
         SELECT id FROM publish_presets ORDER BY last_used_at ASC LIMIT ?
       )`
    ).run(excess);
  }
}
