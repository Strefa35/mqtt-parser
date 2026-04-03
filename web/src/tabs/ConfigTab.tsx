import { useEffect, useState } from 'react';
import type { Config } from '../api';
import * as api from '../api';

export function ConfigView({
  config,
  loading,
  error,
  onRetry,
  onSaved,
}: {
  config: Config | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSaved: (c: Config) => void;
}) {
  const [sub, setSub] = useState('#');
  const [mode, setMode] = useState('auto');
  const [hint, setHint] = useState('');
  const [mqttHost, setMqttHost] = useState('');
  const [mqttPort, setMqttPort] = useState('');
  const [mqttUser, setMqttUser] = useState('');
  const [mqttPass, setMqttPass] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [mqttProtocol, setMqttProtocol] = useState<'3.1.1' | '5'>('5');
  const [mqttKeepalive, setMqttKeepalive] = useState('60');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!config) return;
    setSub(config.subscriptionPattern);
    setMode(config.defaultParseMode);
    setHint(config.broker.hostHint ?? '');
    const mc = config.mqttClient;
    setMqttHost(mc.hostUsesEnvFallback ? '' : mc.host);
    setMqttPort(mc.portUsesEnvFallback ? '' : String(mc.port));
    setMqttUser(mc.username);
    setMqttPass('');
    setClearPassword(false);
    setMqttProtocol(mc.protocol === '5' ? '5' : '3.1.1');
    setMqttKeepalive(String(mc.keepalive));
  }, [config]);

  const save = async () => {
    setMsg(null);
    const portPart: Record<string, unknown> = {};
    if (mqttPort.trim() === '') {
      portPart.mqttClientPort = '';
    } else {
      const p = Number(mqttPort);
      if (!Number.isFinite(p) || p <= 0 || p >= 65536) {
        setMsg('Invalid MQTT port.');
        return;
      }
      portPart.mqttClientPort = p;
    }
    const k = Number(mqttKeepalive);
    if (!Number.isFinite(k) || k < 10 || k > 3600) {
      setMsg('Keepalive must be between 10 and 3600 seconds.');
      return;
    }
    try {
      const body: Record<string, unknown> = {
        subscriptionPattern: sub,
        defaultParseMode: mode,
        hostHint: hint,
        mqttClientHost: mqttHost.trim(),
        mqttClientUsername: mqttUser,
        mqttProtocol,
        mqttKeepalive: k,
        ...portPart,
      };
      if (clearPassword) {
        body.mqttClientPassword = '';
      } else if (mqttPass !== '') {
        body.mqttClientPassword = mqttPass;
      }
      const c = await api.patchConfig(body);
      onSaved(c);
      setMqttPass('');
      setClearPassword(false);
      setMsg(
        'Saved. MQTT client reconnected if broker host/port/auth/protocol changed.'
      );
    } catch (e) {
      setMsg(String(e));
    }
  };

  if (loading) {
    return (
      <section className="panel">
        <p>Loading config…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h2>Config</h2>
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Check that the API is reachable at{' '}
          <code className="mono">{import.meta.env.BASE_URL ?? '/'}api/config</code> (same host
          as this page). Rebuild the image if you changed the backend.
        </p>
        <button type="button" className="primary" onClick={onRetry}>
          Retry
        </button>
      </section>
    );
  }

  if (!config) {
    return (
      <section className="panel">
        <p>No config loaded.</p>
        <button type="button" className="primary" onClick={onRetry}>
          Retry
        </button>
      </section>
    );
  }

  const mc = config.mqttClient;

  return (
    <section className="panel">
      <h2>Broker &amp; parser settings</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: 0 }}>
        Broker for devices: <strong>{config.broker.hostHint || '<host>'}</strong>:
        <strong>{mc.port}</strong> (map container port, default <code>1883</code>).
      </p>

      <h3 style={{ marginTop: '1.25rem', fontSize: '0.95rem' }}>
        MQTT client (this app → broker)
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: 0 }}>
        Empty host/port → <code>{mc.envFallbackHost}</code>:<code>{mc.envFallbackPort}</code>{' '}
        (<code>MQTT_HOST</code> / <code>MQTT_PORT</code>). Plain TCP, no TLS.
      </p>
      <div className="row">
        <label>
          Broker host
          <input
            placeholder={mc.envFallbackHost}
            value={mqttHost}
            onChange={(e) => setMqttHost(e.target.value)}
          />
        </label>
        <label>
          Broker port
          <input
            placeholder={String(mc.envFallbackPort)}
            value={mqttPort}
            onChange={(e) => setMqttPort(e.target.value)}
          />
        </label>
        <label>
          Username (optional)
          <input
            value={mqttUser}
            onChange={(e) => setMqttUser(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="row">
        <label>
          Password (optional)
          <input
            type="password"
            placeholder={mc.passwordSet ? '(unchanged if left empty)' : ''}
            value={mqttPass}
            onChange={(e) => setMqttPass(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.35rem' }}>
          <input
            type="checkbox"
            checked={clearPassword}
            onChange={(e) => setClearPassword(e.target.checked)}
          />
          Clear stored password
        </label>
        <label>
          Protocol
          <select
            value={mqttProtocol}
            onChange={(e) =>
              setMqttProtocol(e.target.value === '5' ? '5' : '3.1.1')
            }
          >
            <option value="3.1.1">MQTT 3.1.1</option>
            <option value="5">MQTT 5</option>
          </select>
        </label>
        <label>
          Keepalive (s)
          <input
            value={mqttKeepalive}
            onChange={(e) => setMqttKeepalive(e.target.value)}
          />
        </label>
      </div>
      <p className="mono" style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
        Effective now: <strong>{mc.host}</strong>:<strong>{mc.port}</strong> —{' '}
        {mc.protocol} — keepalive {mc.keepalive}s —{' '}
        {mc.username ? `user "${mc.username}"` : 'anonymous'}
        {mc.passwordSet ? ' (password set)' : ''}
      </p>

      <h3 style={{ marginTop: '1.25rem', fontSize: '0.95rem' }}>Parser</h3>
      <div className="row">
        <label>
          Subscription pattern (app receives)
          <input value={sub} onChange={(e) => setSub(e.target.value)} />
        </label>
        <label>
          Default parse mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="auto">auto</option>
            <option value="json">json</option>
            <option value="text">text</option>
            <option value="hex">hex</option>
          </select>
        </label>
        <label>
          Host hint for devices (display only)
          <input
            placeholder="e.g. 192.168.1.10"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
          />
        </label>
        <button type="button" className="primary" onClick={() => void save()}>
          Save
        </button>
      </div>
      <p className="mono" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
        SQLite: {config.sqlitePath}
      </p>
      {msg && <p>{msg}</p>}
    </section>
  );
}
