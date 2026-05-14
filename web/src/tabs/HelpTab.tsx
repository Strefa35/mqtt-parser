import { useEffect, useState } from 'react';
import * as api from '../api';

export function HelpView() {
  const [hostIp, setHostIp] = useState<string | null>(null);
  const [hostIpError, setHostIpError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const info = await api.getHostInfo();
        setHostIp(info.hostIp);
      } catch (e) {
        setHostIpError(String(e));
      }
    })();
  }, []);

  return (
    <section className="panel help-panel">
      <h2>Help</h2>
      <p className="help-lead">
        This page summarizes how to use the MQTT Parser web UI. For deployment and API details,
        see the project README.
      </p>

      <h3>Live feed</h3>
      <p>
        Incoming messages (WebSocket, last 500). Use <strong>History</strong> for filters and bulk
        actions. Payloads start as <strong>plain text</strong>; <strong>click a payload</strong> to
        toggle formatted JSON for that row only (ignored if text is selected), same as in
        History. <strong>Drag the grips</strong> on the table header edges to resize Time / Topic /
        Payload columns (saved in this browser).
      </p>

      <h3>Live &amp; Publish layout</h3>
      <p>
        Drag the <strong>vertical splitter</strong> between the live feed and the right panel to
        change the split ratio (saved in this browser). Use the <strong>Publish</strong> and{' '}
        <strong>Rules</strong> sub-tabs on the right for manual publish and auto-reply rules.
      </p>

      <h3>Publish</h3>
      <p>
        Successful publishes are stored in SQLite (up to 30 presets, shared for this server). Pick
        a recent command from the list to fill topic and payload.
      </p>

      <h3>Rules</h3>
      <p>
        Rules run in order. Topic patterns use MQTT <code>+</code> and <code>#</code>. Reply
        templates may use <code>{'{{topic}}'}</code>, <code>{'{{payload}}'}</code>, and{' '}
        <code>{'{{parsed}}'}</code>. Use the <strong>On</strong> column to enable or disable a rule;
        use edit and delete actions on each row as needed.
      </p>

      <h3>History</h3>
      <p>
        Browse and filter persisted messages from SQLite. Payloads behave like the live feed: click
        a payload (when no text is selected) to toggle plain vs formatted JSON per row. The table
        has a fixed checkbox column and fixed row-action column; drag the grips on{' '}
        <strong>ID</strong>, <strong>Time</strong>, and <strong>Topic</strong> headers to resize
        only the ID / Time / Topic / Payload columns (proportions saved in this browser). Use bulk
        delete or delete-by-filter with confirmation where offered.
      </p>

      <h3>Config</h3>
      <p>
        Set the parser subscription pattern, default parse mode, and <strong>two</strong> MQTT client
        profiles: <strong>embedded</strong> (in-container Mosquitto) and <strong>external</strong>{' '}
        (another broker on the network). Each has its own host/port; empty values use documented
        defaults (<code>127.0.0.1</code> + <code>MQTT_PORT</code> for embedded,{' '}
        <code>MQTT_HOST</code> + <code>MQTT_PORT</code> for external). Username, password, protocol,
        and keepalive are shared. The host hint is display-only for operators.
      </p>

      <h3>Logs</h3>
      <p>
        Application log lines from SQLite; the list refreshes periodically. Use{' '}
        <strong>Refresh from DB</strong> to reload immediately.
      </p>

      <h3>Header &amp; theme</h3>
      <p>
        The header includes an <strong>Embedded / External</strong> toggle in the same style as the
        Mosquitto switch (pill track + white knob); it uses theme accent blues instead of red/green.
        Hover each label for a short tooltip. A small dot <strong>inside the sliding knob</strong> (right
        when Embedded is selected, left when External) shows the <strong>MQTT client</strong> state for
        the active broker (same meaning as <code>MQTT:</code>): <strong>green</strong> when connected,{' '}
        <strong>red</strong> when disconnected, <strong>amber</strong> while health is loading or when
        Embedded is on but Mosquitto has not started yet. There is also an{' '}
        <strong>ON/OFF toggle</strong> for the in-container Mosquitto broker (green glow = on, red glow =
        off; MQTT icon on the knob). Hover for a full tooltip. The dot and <code>MQTT:</code> line refresh
        from <code>/api/health</code> every few seconds. <strong>WebSocket</strong> status is shown
        separately. Choose <strong>Theme</strong>{' '}
        in the tab bar for dark, light, or
        system appearance (stored in the browser).
      </p>

      <h3>Docker Host</h3>
      <p>
        {hostIpError ? (
          <span style={{ color: 'var(--danger)' }}>Error: {hostIpError}</span>
        ) : hostIp ? (
          <>Docker host IP: <code>{hostIp}</code></>
        ) : (
          <em>Loading host IP...</em>
        )}
      </p>
    </section>
  );
}
