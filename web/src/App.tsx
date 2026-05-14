import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { AppHealth, Config, MessageRow } from './api';
import * as api from './api';
import { useWebSocket } from './hooks/useWebSocket';
import { applyTheme, LS_THEME, readStoredTheme, type Theme } from './theme';
import { ConfigView } from './tabs/ConfigTab';
import { HistoryView } from './tabs/HistoryTab';
import { LivePublishSplitView } from './tabs/LiveTab';
import { HelpView } from './tabs/HelpTab';
import { LogsView } from './tabs/LogsTab';
import { IconChevronDownSmall, IconMqttBrokerKnob, IconThemeContrast } from './icons';
import { MainNavTabIcon, type MainNavTabId } from './tabIcons';

type Tab = MainNavTabId;

const MQTT_PROFILE_TOOLTIP_EMBEDDED =
  'Embedded profile: the app MQTT client uses the in-container broker host/port from Config (defaults to 127.0.0.1 and MQTT_PORT).';
const MQTT_PROFILE_TOOLTIP_EXTERNAL =
  'External profile: the app MQTT client uses the network broker host/port from Config (defaults to MQTT_HOST and MQTT_PORT).';
const MOSQUITTO_BROKER_TOGGLE_TOOLTIP =
  'In-container Eclipse Mosquitto broker: ON — devices can connect to this container on MQTT_PORT (e.g. 1883). OFF — no broker process here; point devices and the app External profile at another broker on the network.';

export default function App() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [tab, setTab] = useState<Tab>('live');
  const [live, setLive] = useState<MessageRow[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [headerHealth, setHeaderHealth] = useState<AppHealth | null>(null);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [headerErr, setHeaderErr] = useState<string | null>(null);

  const onWs = useCallback((event: string, data: unknown) => {
    if (event === 'message') {
      setLive((prev) => {
        const row = data as MessageRow;
        const next = [row, ...prev];
        return next.slice(0, 500);
      });
    }
  }, []);

  const wsState = useWebSocket(onWs);

  const loadConfig = useCallback(() => {
    setConfigLoading(true);
    setConfigError(null);
    return api
      .getConfig()
      .then((c) => {
        setConfig(c);
        setConfigError(null);
      })
      .catch((e) => {
        setConfig(null);
        setConfigError(String(e));
      })
      .finally(() => {
        setConfigLoading(false);
      });
  }, []);

  const refreshHeaderHealth = useCallback(() => {
    api.getHealth().then((h) => setHeaderHealth(h)).catch(() => {});
  }, []);

  useEffect(() => {
    void loadConfig();
    refreshHeaderHealth();
  }, [loadConfig, refreshHeaderHealth]);

  useEffect(() => {
    const id = setInterval(() => {
      refreshHeaderHealth();
    }, 3000);
    return () => clearInterval(id);
  }, [refreshHeaderHealth]);

  const patchFromHeader = useCallback(async (body: Record<string, unknown>) => {
    setHeaderBusy(true);
    setHeaderErr(null);
    try {
      const c = await api.patchConfig(body);
      setConfig(c);
      setConfigError(null);
      const h = await api.getHealth();
      setHeaderHealth(h);
    } catch (e) {
      setHeaderErr(String(e));
    } finally {
      setHeaderBusy(false);
    }
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(LS_THEME, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const liveTab = tab === 'live';
    const history = tab === 'history';
    document.documentElement.classList.toggle('layout-live', liveTab);
    document.body.classList.toggle('layout-live', liveTab);
    document.documentElement.classList.toggle('layout-history', history);
    document.body.classList.toggle('layout-history', history);
    return () => {
      document.documentElement.classList.remove('layout-live', 'layout-history');
      document.body.classList.remove('layout-live', 'layout-history');
    };
  }, [tab]);

  const tabs: { id: Tab; label: string }[] = useMemo(
    () => [
      { id: 'live', label: 'Live & Publish' },
      { id: 'history', label: 'History' },
      { id: 'config', label: 'Config' },
      { id: 'logs', label: 'Logs' },
      { id: 'help', label: 'Help' },
    ],
    []
  );

  /**
   * Shown inside the profile toggle knob (right when Embedded, left when External).
   * Green / red / amber align with MQTT client health (and embedded broker startup).
   */
  const profileMqttStatusDot = useMemo(() => {
    if (!config) return null;
    const h = headerHealth;
    if (!h) {
      return {
        cls: 'warn' as const,
        title: 'MQTT client status not loaded yet.',
      };
    }
    const profile = h.mqttActiveProfile ?? config.mqttClient.activeProfile;
    const { host, port } = h.broker;
    if (h.mqtt === 'connected') {
      return {
        cls: 'on' as const,
        title: `MQTT client connected (${profile} → ${host}:${port}).`,
      };
    }
    if (profile === 'embedded' && h.embeddedMqttBrokerEnabled && !h.embeddedMqttBrokerRunning) {
      return {
        cls: 'warn' as const,
        title: `In-container broker is on but Mosquitto is not running yet (${host}:${port}).`,
      };
    }
    return {
      cls: 'off' as const,
      title: `MQTT client disconnected (${profile} → ${host}:${port}).`,
    };
  }, [config, headerHealth]);

  const mosquittoEnabledLive =
    config != null &&
    (headerHealth?.embeddedMqttBrokerEnabled ?? config.embeddedMqttBrokerEnabled);

  return (
    <>
      <header className="app-header">
        <h1>MQTT Parser</h1>
        <div className="header-toolbar">
          <button
            type="button"
            role="switch"
            className={`profile-mqtt-toggle ${
              config?.mqttClient.activeProfile === 'external'
                ? 'profile-mqtt-toggle--external'
                : 'profile-mqtt-toggle--embedded'
            }`}
            aria-checked={config?.mqttClient.activeProfile === 'external'}
            aria-label={
              config
                ? `MQTT client profile: ${config.mqttClient.activeProfile}${
                    headerHealth?.mqtt ? `, ${headerHealth.mqtt}` : ''
                  }`
                : 'MQTT client profile'
            }
            disabled={headerBusy || !config}
            onClick={() =>
              void patchFromHeader({
                mqttActiveProfile:
                  config?.mqttClient.activeProfile === 'embedded' ? 'external' : 'embedded',
              })
            }
          >
            <span className="profile-mqtt-toggle-track" aria-hidden>
              <span
                className="profile-mqtt-toggle-label profile-mqtt-toggle-label--emb"
                title={MQTT_PROFILE_TOOLTIP_EMBEDDED}
              >
                Embedded
              </span>
              <span
                className="profile-mqtt-toggle-label profile-mqtt-toggle-label--ext"
                title={MQTT_PROFILE_TOOLTIP_EXTERNAL}
              >
                External
              </span>
              <span className="profile-mqtt-toggle-knob">
                {profileMqttStatusDot && (
                  <span
                    className={`mqtt-client-status-dot ${profileMqttStatusDot.cls}`}
                    title={profileMqttStatusDot.title}
                  />
                )}
              </span>
            </span>
          </button>
          <div className="mosquitto-toggle-wrap">
            <button
              type="button"
              role="switch"
              className={`mosquitto-power-toggle ${
                mosquittoEnabledLive ? 'mosquitto-power-toggle--on' : 'mosquitto-power-toggle--off'
              }`}
              aria-checked={mosquittoEnabledLive}
              aria-label={
                mosquittoEnabledLive
                  ? 'In-container Mosquitto broker: on'
                  : 'In-container Mosquitto broker: off'
              }
              title={MOSQUITTO_BROKER_TOGGLE_TOOLTIP}
              disabled={headerBusy || !config}
              onClick={() =>
                void patchFromHeader({
                  embeddedMqttBrokerEnabled: !config!.embeddedMqttBrokerEnabled,
                })
              }
            >
              <span className="mosquitto-power-toggle-track" aria-hidden>
                <span className="mosquitto-power-toggle-label mosquitto-power-toggle-label--on">
                  ON
                </span>
                <span className="mosquitto-power-toggle-label mosquitto-power-toggle-label--off">
                  OFF
                </span>
                <span className="mosquitto-power-toggle-knob">
                  <IconMqttBrokerKnob />
                </span>
              </span>
            </button>
          </div>
          <span className="muted header-mqtt-line">
            MQTT: {headerHealth?.mqtt ?? '—'}
          </span>
          <span className={`ws-pill ${wsState === 'open' ? 'ok' : 'err'}`}>
            WebSocket {wsState}
          </span>
          {headerErr && (
            <span className="header-err" title={headerErr}>
              {headerErr.length > 48 ? `${headerErr.slice(0, 48)}…` : headerErr}
            </span>
          )}
        </div>
      </header>
      <nav className="tabs" aria-label="Main navigation">
        <div className="tabs-list">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-strip-inner">
                <MainNavTabIcon tabId={t.id} />
                <span>{t.label}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="tabs-theme">
          <div className="tabs-theme-control">
            <span className="tabs-theme-icon" aria-hidden={true}>
              <IconThemeContrast />
            </span>
            <span className="tabs-theme-title">Theme</span>
            <span className="tabs-theme-chevron" aria-hidden={true}>
              <IconChevronDownSmall />
            </span>
            <select
              id="app-theme-select"
              className="tabs-theme-select-native"
              value={theme}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'dark' || v === 'light' || v === 'system') setTheme(v);
              }}
              aria-label="Color theme"
              title={`Theme: ${theme}`}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>
        </div>
      </nav>
      <main
        className={
          tab === 'live' ? 'main-live' : tab === 'history' ? 'main-history' : undefined
        }
      >
        <div className="warn-banner">
          Default deployment uses <strong>plain MQTT (no TLS)</strong> and{' '}
          <strong>anonymous</strong> access. Do not expose the broker port to the public
          internet without hardening (TLS, authentication, firewall).
        </div>
        {tab === 'live' && <LivePublishSplitView items={live} />}
        {tab === 'history' && <HistoryView />}
        {tab === 'config' && (
          <ConfigView
            config={config}
            loading={configLoading}
            error={configError}
            onRetry={() => void loadConfig()}
            onSaved={(c) => {
              setConfig(c);
              setConfigError(null);
              refreshHeaderHealth();
            }}
          />
        )}
        {tab === 'logs' && <LogsView />}
        {tab === 'help' && <HelpView />}
      </main>
    </>
  );
}
