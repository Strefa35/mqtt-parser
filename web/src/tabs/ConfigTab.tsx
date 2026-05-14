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
  const [embHost, setEmbHost] = useState('');
  const [embPort, setEmbPort] = useState('');
  const [extHost, setExtHost] = useState('');
  const [extPort, setExtPort] = useState('');
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
    const e = config.mqttEmbedded;
    const x = config.mqttExternal;
    setEmbHost(e.hostUsesEnvFallback ? '' : e.host);
    setEmbPort(e.portUsesEnvFallback ? '' : String(e.port));
    setExtHost(x.hostUsesEnvFallback ? '' : x.host);
    setExtPort(x.portUsesEnvFallback ? '' : String(x.port));
    setMqttUser(config.mqttClient.username);
    setMqttPass('');
    setClearPassword(false);
    setMqttProtocol(config.mqttClient.protocol === '5' ? '5' : '3.1.1');
    setMqttKeepalive(String(config.mqttClient.keepalive));
  }, [config]);

  const parsePortField = (
    raw: string,
    label: string
  ): { ok: true; value: number | '' } | { ok: false; err: string } => {
    if (raw.trim() === '') return { ok: true, value: '' };
    const p = Number(raw);
    if (!Number.isInteger(p) || p <= 0 || p >= 65536) {
      return { ok: false, err: `Invalid MQTT port (${label}): expected an integer in range 1-65535.` };
    }
    return { ok: true, value: p };
  };

  const save = async () => {
    setMsg(null);
    const ep = parsePortField(embPort, 'embedded');
    const xp = parsePortField(extPort, 'external');
    if (!ep.ok) {
      setMsg(ep.err);
      return;
    }
    if (!xp.ok) {
      setMsg(xp.err);
      return;
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
        mqttEmbeddedHost: embHost.trim(),
        mqttEmbeddedPort: ep.value === '' ? '' : ep.value,
        mqttExternalHost: extHost.trim(),
        mqttExternalPort: xp.value === '' ? '' : xp.value,
        mqttClientUsername: mqttUser,
        mqttProtocol,
        mqttKeepalive: k,
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
      setMsg('Saved. MQTT client reconnects when the active profile or broker settings change.');
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
  const e = config.mqttEmbedded;
  const x = config.mqttExternal;

  return (
    <section className="panel">
      <h2>Broker &amp; parser settings</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: 0 }}>
        Devices map to <strong>{config.broker.hostHint || '<host>'}</strong> on MQTT port{' '}
        <strong>{config.embeddedMqttBrokerEnabled ? String(e.port) : '—'}</strong> when the
        in-container Mosquitto is enabled (default <code>1883</code>). Use the header to pick
        the <strong>active</strong> client profile (embedded vs external) and to turn container
        Mosquitto on or off.
      </p>

      <h3 style={{ marginTop: '1.25rem', fontSize: '0.95rem' }}>
        MQTT client — embedded profile (in-container broker)
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: 0 }}>
        Empty host → <code>{e.envFallbackHost}</code>; empty port → <code>{e.envFallbackPort}</code>{' '}
        (<code>MQTT_PORT</code> in Docker).
      </p>
      <div className="row">
        <label>
          Broker host
          <input
            placeholder={e.envFallbackHost}
            value={embHost}
            onChange={(ev) => setEmbHost(ev.target.value)}
          />
        </label>
        <label>
          Broker port
          <input
            placeholder={String(e.envFallbackPort)}
            value={embPort}
            onChange={(ev) => setEmbPort(ev.target.value)}
          />
        </label>
      </div>

      <h3 style={{ marginTop: '1.25rem', fontSize: '0.95rem' }}>
        MQTT client — external profile (broker on the network)
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: 0 }}>
        Empty host → <code>{x.envFallbackHost}</code>; empty port → <code>{x.envFallbackPort}</code>{' '}
        (<code>MQTT_HOST</code> / <code>MQTT_PORT</code>). Plain TCP, no TLS.
      </p>
      <div className="row">
        <label>
          Broker host
          <input
            placeholder={x.envFallbackHost}
            value={extHost}
            onChange={(ev) => setExtHost(ev.target.value)}
          />
        </label>
        <label>
          Broker port
          <input
            placeholder={String(x.envFallbackPort)}
            value={extPort}
            onChange={(ev) => setExtPort(ev.target.value)}
          />
        </label>
      </div>

      <h3 style={{ marginTop: '1.25rem', fontSize: '0.95rem' }}>
        MQTT client — shared authentication
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: 0 }}>
        Used for whichever profile is active in the header.
      </p>
      <div className="row">
        <label>
          Username (optional)
          <input
            value={mqttUser}
            onChange={(ev) => setMqttUser(ev.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Password (optional)
          <input
            type="password"
            placeholder={mc.passwordSet ? '(unchanged if left empty)' : ''}
            value={mqttPass}
            onChange={(ev) => setMqttPass(ev.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.35rem' }}>
          <input
            type="checkbox"
            checked={clearPassword}
            onChange={(ev) => setClearPassword(ev.target.checked)}
          />
          Clear stored password
        </label>
        <label>
          Protocol
          <select
            value={mqttProtocol}
            onChange={(ev) =>
              setMqttProtocol(ev.target.value === '5' ? '5' : '3.1.1')
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
            onChange={(ev) => setMqttKeepalive(ev.target.value)}
          />
        </label>
      </div>
      <p className="mono" style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
        Active profile: <strong>{mc.activeProfile}</strong> — effective now:{' '}
        <strong>{mc.host}</strong>:<strong>{mc.port}</strong> — {mc.protocol} — keepalive{' '}
        {mc.keepalive}s — {mc.username ? `user "${mc.username}"` : 'anonymous'}
        {mc.passwordSet ? ' (password set)' : ''}
      </p>
      <p className="mono" style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
        Container Mosquitto:{' '}
        <strong>{config.embeddedMqttBrokerEnabled ? 'enabled' : 'disabled'}</strong>
        {config.embeddedMqttBrokerRunning ? ' (process running)' : ' (process stopped)'}
      </p>

      <h3 style={{ marginTop: '1.25rem', fontSize: '0.95rem' }}>Parser</h3>
      <div className="row">
        <label>
          Subscription pattern (app receives)
          <input value={sub} onChange={(ev) => setSub(ev.target.value)} />
        </label>
        <label>
          Default parse mode
          <select value={mode} onChange={(ev) => setMode(ev.target.value)}>
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
            onChange={(ev) => setHint(ev.target.value)}
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
