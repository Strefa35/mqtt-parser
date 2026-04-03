import { useEffect, useState } from 'react';
import type { AppLog } from '../api';
import * as api from '../api';
import { fmtTime } from '../utils/format';

export function LogsView() {
  const [items, setItems] = useState<AppLog[]>([]);

  useEffect(() => {
    void api.getLogs(300).then((r) => setItems(r.items));
    const id = setInterval(() => {
      void api.getLogs(300).then((r) => setItems(r.items));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="panel">
      <h2>Application logs</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: 0 }}>
        From SQLite; auto-refresh ~4s.
      </p>
      <button
        type="button"
        className="ghost"
        style={{ marginBottom: '0.75rem' }}
        onClick={() => void api.getLogs(300).then((r) => setItems(r.items))}
      >
        Refresh from DB
      </button>
      <div className="msg-list" style={{ maxHeight: 480 }}>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id}>
                <td className="mono">{fmtTime(l.at)}</td>
                <td>{l.level}</td>
                <td className="mono">
                  {l.message}
                  {l.meta ? ` — ${l.meta}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
