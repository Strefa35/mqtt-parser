import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageRow } from '../api';
import * as api from '../api';
import { LIVE_FEED_DEFAULT_ROW_PAYLOAD } from '../defaults';
import { IconTrash } from '../icons';
import { fmtTime, formatPayloadForDisplay } from '../utils/format';

const LS_HISTORY_TABLE_COL_PCTS = 'mqttParser.historyTableColPcts';

type HistoryColPcts = [number, number, number, number];

const HISTORY_COL_MIN: HistoryColPcts = [3, 8, 10, 15];

function readHistoryTableColPcts(): HistoryColPcts {
  const def: HistoryColPcts = [5, 14, 22, 59];
  try {
    const raw = localStorage.getItem(LS_HISTORY_TABLE_COL_PCTS);
    if (!raw) return def;
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return def;
    let arr: number[];
    if (p.length === 4) {
      arr = p.map((x) => Number(x));
    } else if (p.length === 5) {
      arr = p.slice(1, 5).map((x) => Number(x));
    } else if (p.length === 6) {
      arr = p.slice(1, 5).map((x) => Number(x));
    } else {
      return def;
    }
    if (arr.length !== 4 || arr.some((n) => !Number.isFinite(n))) return def;
    for (let i = 0; i < 4; i++) {
      if (arr[i] < HISTORY_COL_MIN[i]) return def;
    }
    const sum = arr.reduce((a, b) => a + b, 0);
    if (sum <= 0) return def;
    const s = 100 / sum;
    const norm = (x: number) => Math.round(x * s * 10) / 10;
    const out: HistoryColPcts = [
      norm(arr[0]),
      norm(arr[1]),
      norm(arr[2]),
      norm(arr[3]),
    ];
    const drift = 100 - out.reduce((a, b) => a + b, 0);
    out[3] = Math.round((out[3] + drift) * 10) / 10;
    return out;
  } catch {
    return def;
  }
}

export function HistoryView() {
  const [items, setItems] = useState<MessageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [topicContains, setTopicContains] = useState('');
  const [search, setSearch] = useState('');
  const [fromTs, setFromTs] = useState('');
  const [toTs, setToTs] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const [rowPayloadMode, setRowPayloadMode] = useState<Record<number, 'plain' | 'json'>>({});

  const load = useCallback(async () => {
    setErr(null);
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (topicContains.trim()) p.set('topicContains', topicContains.trim());
    if (search.trim()) p.set('search', search.trim());
    if (fromTs.trim()) {
      const t = Date.parse(fromTs);
      if (!Number.isNaN(t)) p.set('fromTs', String(t));
    }
    if (toTs.trim()) {
      const t = Date.parse(toTs);
      if (!Number.isNaN(t)) p.set('toTs', String(t));
    }
    try {
      const r = await api.getMessages(p);
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      setErr(String(e));
    }
  }, [page, limit, topicContains, search, fromTs, toTs]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ids = new Set(items.map((m) => m.id));
    setRowPayloadMode((prev) => {
      const next: Record<number, 'plain' | 'json'> = {};
      for (const id of Object.keys(prev).map(Number)) {
        if (ids.has(id)) next[id] = prev[id];
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [items]);

  const toggleRowPayload = useCallback((id: number) => {
    setRowPayloadMode((prev) => {
      const eff = prev[id] ?? LIVE_FEED_DEFAULT_ROW_PAYLOAD;
      return { ...prev, [id]: eff === 'json' ? 'plain' : 'json' };
    });
  }, []);

  const onHistoryPayloadClick = useCallback(
    (id: number) => {
      const sel = typeof window !== 'undefined' ? window.getSelection()?.toString() ?? '' : '';
      if (sel.length > 0) return;
      toggleRowPayload(id);
    },
    [toggleRowPayload]
  );

  const historyTableRef = useRef<HTMLTableElement>(null);
  const historyColDragRef = useRef<{
    which: 0 | 1 | 2;
    startX: number;
    initialPcts: HistoryColPcts;
  } | null>(null);

  const [historyColPcts, setHistoryColPcts] = useState<HistoryColPcts>(() =>
    readHistoryTableColPcts()
  );
  const historyColPctsRef = useRef<HistoryColPcts>(historyColPcts);
  historyColPctsRef.current = historyColPcts;

  useEffect(() => {
    try {
      localStorage.setItem(LS_HISTORY_TABLE_COL_PCTS, JSON.stringify(historyColPcts));
    } catch {
      /* ignore */
    }
  }, [historyColPcts]);

  const beginHistoryColResize = useCallback(
    (
      e: { preventDefault: () => void; stopPropagation: () => void; clientX: number },
      which: 0 | 1 | 2
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const initialPcts = historyColPctsRef.current;
      historyColDragRef.current = {
        which,
        startX: e.clientX,
        initialPcts: [
          initialPcts[0],
          initialPcts[1],
          initialPcts[2],
          initialPcts[3],
        ],
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: globalThis.MouseEvent) => {
        const d = historyColDragRef.current;
        const tbl = historyTableRef.current;
        if (!d || !tbl) return;
        const tw = tbl.getBoundingClientRect().width;
        if (tw < 1) return;
        const deltaPct = ((ev.clientX - d.startX) / tw) * 100;
        const { which: w, initialPcts: ip } = d;
        const i = w;
        const j = i + 1;
        const mins = HISTORY_COL_MIN;
        const sumPair = ip[i] + ip[j];
        setHistoryColPcts(() => {
          let ni = ip[i] + deltaPct;
          ni = Math.max(mins[i], Math.min(ni, sumPair - mins[j]));
          const nj = sumPair - ni;
          const next: HistoryColPcts = [ip[0], ip[1], ip[2], ip[3]];
          next[i] = Math.round(ni * 10) / 10;
          next[j] = Math.round(nj * 10) / 10;
          return next;
        });
      };

      const onUp = () => {
        historyColDragRef.current = null;
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    []
  );

  const toggle = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} message(s)?`)) return;
    try {
      await api.deleteBulk([...selected]);
      setSelected(new Set());
      await load();
    } catch (e) {
      alert(String(e));
    }
  };

  const deleteFiltered = async () => {
    if (
      !confirm(
        'Delete ALL messages matching current filters? This cannot be undone. Type OK in the next prompt.'
      )
    ) {
      return;
    }
    if (!confirm('Really delete by filter?')) return;
    const body: Record<string, unknown> & { confirm: true } = { confirm: true };
    if (topicContains.trim()) body.topicContains = topicContains.trim();
    if (search.trim()) body.search = search.trim();
    if (fromTs.trim()) {
      const t = Date.parse(fromTs);
      if (!Number.isNaN(t)) body.fromTs = t;
    }
    if (toTs.trim()) {
      const t = Date.parse(toTs);
      if (!Number.isNaN(t)) body.toTs = t;
    }
    try {
      const r = await api.deleteByFilter(body);
      alert(`Deleted ${r.deleted} row(s).`);
      setSelected(new Set());
      await load();
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <section className="panel history-feed-stack">
      <h2>Message history (SQLite)</h2>
      {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
      <div className="row">
        <label>
          Topic contains
          <input
            value={topicContains}
            onChange={(e) => setTopicContains(e.target.value)}
          />
        </label>
        <label>
          Search (topic / payload / parsed)
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          From (ISO date)
          <input
            placeholder="2026-01-01T00:00:00"
            value={fromTs}
            onChange={(e) => setFromTs(e.target.value)}
          />
        </label>
        <label>
          To (ISO date)
          <input
            placeholder="2026-12-31T23:59:59"
            value={toTs}
            onChange={(e) => setToTs(e.target.value)}
          />
        </label>
        <button type="button" className="primary" onClick={() => void load()}>
          Apply
        </button>
      </div>
      <div className="row">
        <button type="button" className="ghost" onClick={() => void deleteSelected()}>
          Delete selected
        </button>
        <button type="button" className="danger" onClick={() => void deleteFiltered()}>
          Delete by filter (confirm twice)
        </button>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Total: {total} — page {page} of {Math.max(1, Math.ceil(total / limit))}
        </span>
      </div>
      <div className="history-table-scroll">
        <table ref={historyTableRef} className="history-feed-table">
          <colgroup>
            <col
              className="history-col-checkbox"
              style={{ width: '2.5rem', minWidth: '2.5rem' }}
            />
            {historyColPcts.map((pct, idx) => (
              <col key={idx} style={{ width: `${pct}%` }} />
            ))}
            <col
              className="history-col-actions"
              style={{ width: '2.75rem', minWidth: '2.75rem' }}
            />
          </colgroup>
          <thead>
            <tr>
              <th className="history-th-check" scope="col" aria-label="Select rows">
                {'\u00a0'}
              </th>
              <th className="live-th-resizable" scope="col">
                ID
                <span
                  className="live-col-resize-handle"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize ID and Time columns"
                  title="Drag to resize ID vs Time"
                  onMouseDown={(e) => beginHistoryColResize(e, 0)}
                />
              </th>
              <th className="live-th-resizable" scope="col">
                Time
                <span
                  className="live-col-resize-handle"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Time and Topic columns"
                  title="Drag to resize Time vs Topic"
                  onMouseDown={(e) => beginHistoryColResize(e, 1)}
                />
              </th>
              <th className="live-th-resizable" scope="col">
                Topic
                <span
                  className="live-col-resize-handle"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Topic and Payload columns"
                  title="Drag to resize Topic vs Payload"
                  onMouseDown={(e) => beginHistoryColResize(e, 2)}
                />
              </th>
              <th scope="col">Payload</th>
              <th scope="col" className="history-th-actions" aria-label="Row actions">
                {'\u00a0'}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const rowMode = rowPayloadMode[m.id] ?? LIVE_FEED_DEFAULT_ROW_PAYLOAD;
              return (
              <tr key={m.id}>
                <td className="history-cell-checkbox">
                  <span className="history-checkbox-wrap">
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={() => toggle(m.id)}
                    />
                  </span>
                </td>
                <td className="mono history-cell-id">{m.id}</td>
                <td className="mono">{fmtTime(m.received_at)}</td>
                <td className="mono history-cell-topic">
                  <div className="live-cell-scroll">{m.topic}</div>
                </td>
                <td className="mono history-cell-payload">
                  <div
                    className="live-payload-cell-toggle"
                    role="button"
                    tabIndex={0}
                    title="Click: toggle plain / formatted JSON for this row only"
                    onClick={() => onHistoryPayloadClick(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onHistoryPayloadClick(m.id);
                      }
                    }}
                  >
                    {rowMode === 'json' ? (
                      <pre className="live-payload-pre history-payload-cell">
                        <span className="badge">{m.payload_encoding}</span>
                        {'\n'}
                        {formatPayloadForDisplay(m.payload_display, 'json')}
                      </pre>
                    ) : (
                      <div className="history-payload-cell">
                        <span className="badge">{m.payload_encoding}</span>{' '}
                        {formatPayloadForDisplay(m.payload_display, 'plain')}
                      </div>
                    )}
                  </div>
                </td>
                <td className="history-actions-cell">
                  <button
                    type="button"
                    className="danger rules-icon-btn"
                    aria-label={`Delete message ${m.id}`}
                    data-tooltip="Delete message"
                    onClick={async () => {
                      if (!confirm(`Delete message ${m.id}?`)) return;
                      try {
                        await api.deleteMessage(m.id);
                        await load();
                      } catch (e) {
                        alert(String(e));
                      }
                    }}
                  >
                    <IconTrash />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row history-pagination-row">
        <button
          type="button"
          className="ghost"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </button>
        <button
          type="button"
          className="ghost"
          disabled={page * limit >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
