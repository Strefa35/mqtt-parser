import mqtt, { type MqttClient, type IClientOptions } from 'mqtt';
import type Database from 'better-sqlite3';
import {
  getSetting,
  insertAppLog,
  insertMessage,
  listRules,
  type MessageRow,
} from './db.js';
import { bufferToDisplay, parsePayload, type ParseMode } from './parser.js';
import { applyTemplate, ruleMatches } from './rules-engine.js';
import { broadcast } from './ws-hub.js';

function parseModeFromSetting(s: string): ParseMode {
  if (s === 'json' || s === 'text' || s === 'hex' || s === 'auto') return s;
  return 'auto';
}

function parseKeepalive(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 60;
  return Math.min(3600, Math.max(10, Math.floor(n)));
}

export class MqttBridge {
  private client: MqttClient | null = null;
  private subscriptionPattern = '#';
  private connected = false;
  /** Serialize inbound handling so SQLite + publish never run concurrently (better-sqlite3 is not re-entrant). */
  private inboundSerial: Promise<void> = Promise.resolve();
  private readonly maxBytes: number;
  private readonly envHost: string;
  private readonly envPort: number;

  constructor(
    private readonly db: Database.Database,
    envHost: string,
    envPort: number,
    maxBytes: number
  ) {
    this.envHost = envHost;
    this.envPort = envPort;
    this.maxBytes = maxBytes;
  }

  private log(level: 'info' | 'warn' | 'error', message: string, meta?: unknown): void {
    insertAppLog(this.db, level, message, meta);
    const line = meta != null ? `${message} ${JSON.stringify(meta)}` : message;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    broadcast('log', { level, message, meta, at: Date.now() });
  }

  /** Effective host for the app MQTT client (settings override env). */
  resolveHost(): string {
    const s = getSetting(this.db, 'mqtt_client_host').trim();
    return s || this.envHost;
  }

  /** Effective port for the app MQTT client (settings override env). */
  resolvePort(): number {
    const s = getSetting(this.db, 'mqtt_client_port').trim();
    if (s === '') return this.envPort;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 && n < 65536 ? n : this.envPort;
  }

  getConnectionSummary(): {
    host: string;
    port: number;
    protocol: string;
    username: string;
    passwordSet: boolean;
    keepalive: number;
  } {
    const proto = getSetting(this.db, 'mqtt_protocol').trim();
    const protocol = proto === '5' ? '5' : '3.1.1';
    const user = getSetting(this.db, 'mqtt_username');
    const pass = getSetting(this.db, 'mqtt_password');
    return {
      host: this.resolveHost(),
      port: this.resolvePort(),
      protocol,
      username: user,
      passwordSet: pass.length > 0,
      keepalive: parseKeepalive(getSetting(this.db, 'mqtt_keepalive')),
    };
  }

  private buildClientOptions(): IClientOptions {
    const host = this.resolveHost();
    const port = this.resolvePort();
    const protocol = getSetting(this.db, 'mqtt_protocol').trim() === '5' ? 5 : 4;
    const username = getSetting(this.db, 'mqtt_username').trim();
    const password = getSetting(this.db, 'mqtt_password');
    const keepalive = parseKeepalive(getSetting(this.db, 'mqtt_keepalive'));

    const opts: IClientOptions = {
      protocolVersion: protocol as 4 | 5,
      reconnectPeriod: 2000,
      connectTimeout: 10_000,
      clientId: `mqtt-parser-${Math.random().toString(16).slice(2)}`,
      keepalive,
    };
    if (username) opts.username = username;
    if (password) opts.password = password;
    return opts;
  }

  private destroyClient(): void {
    if (this.client) {
      this.client.removeAllListeners();
      this.client.end(true);
      this.client = null;
    }
    this.connected = false;
  }

  /** Reconnect using current DB settings (after config change). */
  restartConnection(): void {
    this.log('info', 'MQTT client restarting with new broker settings');
    this.destroyClient();
    this.start();
  }

  start(): void {
    this.subscriptionPattern = getSetting(this.db, 'subscription_pattern') || '#';
    const host = this.resolveHost();
    const port = this.resolvePort();
    const url = `mqtt://${host}:${port}`;
    const opts = this.buildClientOptions();

    this.client = mqtt.connect(url, opts);

    this.client.on('connect', () => {
      this.connected = true;
      this.log('info', 'MQTT client connected', {
        url,
        protocolVersion: opts.protocolVersion,
        username: opts.username ?? null,
      });
      this.client?.subscribe(this.subscriptionPattern, { qos: 0 }, (err) => {
        if (err) {
          this.log('error', 'MQTT subscribe failed', { err: String(err) });
          return;
        }
        this.log('info', 'MQTT subscribed', { pattern: this.subscriptionPattern });
      });
    });

    this.client.on('reconnect', () => {
      this.log('warn', 'MQTT reconnecting');
    });

    this.client.on('close', () => {
      this.connected = false;
      this.log('warn', 'MQTT connection closed');
    });

    this.client.on('error', (err) => {
      this.log('error', 'MQTT error', { err: String(err) });
    });

    this.client.on('message', (topic, payload, packet) => {
      this.inboundSerial = this.inboundSerial
        .then(() => this.handleIncoming(topic, payload, packet))
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          console.error('mqtt-bridge: inbound handling failed', e);
          try {
            insertAppLog(this.db, 'error', 'Inbound MQTT handling failed', { err: msg });
          } catch {
            /* avoid secondary DB errors */
          }
        });
    });
  }

  isConnected(): boolean {
    return this.connected && this.client?.connected === true;
  }

  getSubscriptionPattern(): string {
    return this.subscriptionPattern;
  }

  reloadSubscription(): void {
    const next = getSetting(this.db, 'subscription_pattern') || '#';
    if (!this.client?.connected) {
      this.subscriptionPattern = next;
      return;
    }
    const prev = this.subscriptionPattern;
    this.subscriptionPattern = next;
    this.client.unsubscribe(prev, () => {
      this.client?.subscribe(next, { qos: 0 }, (err) => {
        if (err) {
          this.log('error', 'MQTT resubscribe failed', { err: String(err) });
          return;
        }
        this.log('info', 'MQTT subscription updated', { pattern: next });
      });
    });
  }

  publish(
    topic: string,
    payload: string,
    qos: 0 | 1 | 2,
    retain: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client?.connected) {
        reject(new Error('MQTT client not connected'));
        return;
      }
      this.client.publish(topic, payload, { qos, retain }, (err) => {
        if (err) {
          this.log('error', 'MQTT publish failed', { topic, err: String(err) });
          reject(err);
          return;
        }
        this.log('info', 'MQTT publish sent', { topic, qos, retain });
        resolve();
      });
    });
  }

  private async handleIncoming(
    topic: string,
    payload: Buffer,
    packet: { qos: number; retain: boolean }
  ): Promise<void> {
    if (payload.length > this.maxBytes) {
      this.log('warn', 'Message dropped: payload too large', {
        topic,
        bytes: payload.length,
        max: this.maxBytes,
      });
      return;
    }

    const mode = parseModeFromSetting(getSetting(this.db, 'default_parse_mode'));
    const { encoding, display } = bufferToDisplay(payload);
    const parse = parsePayload(display, encoding, mode);
    const parsedJson = parse.ok
      ? JSON.stringify(parse.value)
      : JSON.stringify({ error: parse.error, mode: parse.mode });

    const receivedAt = Date.now();
    let id: number;
    try {
      id = insertMessage(this.db, {
        receivedAt,
        topic,
        qos: packet.qos,
        retain: packet.retain,
        payloadEncoding: encoding,
        payloadDisplay: display,
        parsedJson,
        parseMode: parse.mode,
      });
    } catch (e) {
      this.log('error', 'Failed to persist message', { err: String(e) });
      return;
    }

    const row: MessageRow = {
      id,
      received_at: receivedAt,
      topic,
      qos: packet.qos,
      retain: packet.retain ? 1 : 0,
      payload_encoding: encoding,
      payload_display: display,
      parsed_json: parsedJson,
      parse_mode: parse.mode,
    };

    broadcast('message', row);
    this.log('info', 'Message received', { topic, id });

    const rules = listRules(this.db);
    for (const rule of rules) {
      if (!ruleMatches(rule, topic, display)) continue;
      const body = applyTemplate(rule.reply_payload_template, {
        topic,
        payloadDisplay: display,
        parse,
      });
      try {
        await this.publish(rule.reply_topic, body, 0, false);
        this.log('info', 'Rule reply published', { ruleId: rule.id, rule: rule.name });
      } catch {
        /* logged in publish */
      }
    }
  }
}
