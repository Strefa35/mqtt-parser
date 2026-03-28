import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Config, MessageRow } from './api';
import * as api from './api';
import { useWebSocket } from './hooks/useWebSocket';
import { applyTheme, LS_THEME, readStoredTheme, type Theme } from './theme';
import { ConfigView } from './tabs/ConfigTab';
import { HistoryView } from './tabs/HistoryTab';
import { LivePublishSplitView } from './tabs/LiveTab';
import { HelpView } from './tabs/HelpTab';
import { LogsView } from './tabs/LogsTab';
import { IconChevronDownSmall, IconThemeContrast } from './icons';
import { MainNavTabIcon, type MainNavTabId } from './tabIcons';

type Tab = MainNavTabId;

export default function App() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);
  const [tab, setTab] = useState<Tab>('live');
  const [live, setLive] = useState<MessageRow[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [healthMqtt, setHealthMqtt] = useState<string>('');

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

  useEffect(() => {
    void loadConfig();
    api.getHealth().then((h) => setHealthMqtt(h.mqtt)).catch(() => {});
  }, [loadConfig]);

  useEffect(() => {
    const id = setInterval(() => {
      api.getHealth().then((h) => setHealthMqtt(h.mqtt)).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
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

  return (
    <>
      <header className="app-header">
        <h1>MQTT Parser</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            MQTT: {healthMqtt || '—'}
          </span>
          <span className={`ws-pill ${wsState === 'open' ? 'ok' : 'err'}`}>
            WebSocket {wsState}
          </span>
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
            }}
          />
        )}
        {tab === 'logs' && <LogsView />}
        {tab === 'help' && <HelpView />}
      </main>
    </>
  );
}
