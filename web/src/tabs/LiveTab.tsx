import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageRow, PublishPreset, Rule } from '../api';
import * as api from '../api';
import { LIVE_FEED_DEFAULT_ROW_PAYLOAD } from '../defaults';
import { IconRuleEdit, IconTrash } from '../icons';
import { fmtTime, formatPayloadForDisplay } from '../utils/format';

const LS_LIVE_TABLE_COL_PCTS = 'mqttParser.liveTableColPcts';
const LIVE_COL_MIN_PCT = 8;

function readLiveTableColPcts(): [number, number, number] {
  const def: [number, number, number] = [12, 28, 60];
  try {
    const raw = localStorage.getItem(LS_LIVE_TABLE_COL_PCTS);
    if (!raw) return def;
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p) || p.length !== 3) return def;
    const a = Number(p[0]);
    const b = Number(p[1]);
    const c = Number(p[2]);
    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      !Number.isFinite(c) ||
      a < LIVE_COL_MIN_PCT ||
      b < LIVE_COL_MIN_PCT ||
      c < LIVE_COL_MIN_PCT
    ) {
      return def;
    }
    const sum = a + b + c;
    if (sum <= 0) return def;
    const s = 100 / sum;
    const norm = (x: number) => Math.round(x * s * 10) / 10;
    return [norm(a), norm(b), norm(c)];
  } catch {
    return def;
  }
}

function publishHistoryOptionLabel(e: Pick<PublishPreset, 'topic' | 'payload'>): string {
  const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
  const t = oneLine(e.topic);
  const pl = oneLine(e.payload);
  const tShow = t.length > 48 ? `${t.slice(0, 47)}…` : t;
  const pShow = pl.length > 36 ? `${pl.slice(0, 35)}…` : pl;
  return `${tShow} — ${pShow}`;
}

const LS_LIVE_PUBLISH_SPLIT_PCT = 'mqttParser.livePublishSplitPct';

function readLivePublishSplitPct(): number {
  try {
    const v = Number(localStorage.getItem(LS_LIVE_PUBLISH_SPLIT_PCT));
    if (Number.isFinite(v) && v >= 22 && v <= 82) return v;
  } catch {
    /* ignore */
  }
  return 58;
}

type LiveRightTab = 'publish' | 'rules';

export function LivePublishSplitView({ items }: { items: MessageRow[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);
  const [leftPct, setLeftPct] = useState(readLivePublishSplitPct);
  const [rightTab, setRightTab] = useState<LiveRightTab>('publish');

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      const x = e.clientX - r.left;
      let pct = (x / r.width) * 100;
      pct = Math.min(82, Math.max(22, pct));
      setLeftPct(pct);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = false;
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LIVE_PUBLISH_SPLIT_PCT, String(Math.round(leftPct)));
    } catch {
      /* ignore */
    }
  }, [leftPct]);

  return (
    <div ref={containerRef} className="live-publish-split">
      <div
        className="live-publish-pane live-publish-pane--feed"
        style={{ flex: `0 0 ${leftPct}%` }}
      >
        <LiveView items={items} inSplit />
      </div>
      <div
        className="live-publish-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize live and publish panels"
        tabIndex={0}
        onMouseDown={(e) => {
          e.preventDefault();
          dragRef.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setLeftPct((p) => Math.max(22, p - 2));
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            setLeftPct((p) => Math.min(82, p + 2));
          }
        }}
      />
      <div className="live-publish-pane live-publish-pane--publish">
        <div className="live-publish-subtabs" role="tablist" aria-label="Publish and rules">
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'publish'}
            className={rightTab === 'publish' ? 'active' : ''}
            onClick={() => setRightTab('publish')}
          >
            <span className="tab-strip-inner">Publish</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'rules'}
            className={rightTab === 'rules' ? 'active' : ''}
            onClick={() => setRightTab('rules')}
          >
            <span className="tab-strip-inner">Rules</span>
          </button>
        </div>
        <div
          className="live-publish-right-body"
          role="tabpanel"
          id={rightTab === 'publish' ? 'live-right-publish' : 'live-right-rules'}
        >
          {rightTab === 'publish' && <PublishView inSplit />}
          {rightTab === 'rules' && <RulesView inSplit />}
        </div>
      </div>
    </div>
  );
}

function LiveView({ items, inSplit }: { items: MessageRow[]; inSplit?: boolean }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const colDragRef = useRef<{
    which: 0 | 1;
    startX: number;
    w0: number;
    w1: number;
    w2: number;
  } | null>(null);

  const [colPcts, setColPcts] = useState<[number, number, number]>(() => readLiveTableColPcts());
  const colPctsRef = useRef<[number, number, number]>(colPcts);
  colPctsRef.current = colPcts;

  useEffect(() => {
    try {
      localStorage.setItem(LS_LIVE_TABLE_COL_PCTS, JSON.stringify(colPcts));
    } catch {
      /* ignore */
    }
  }, [colPcts]);

  const beginColResize = useCallback(
    (
      e: { preventDefault: () => void; stopPropagation: () => void; clientX: number },
      which: 0 | 1
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const p = colPctsRef.current;
      colDragRef.current = {
        which,
        startX: e.clientX,
        w0: p[0],
        w1: p[1],
        w2: p[2],
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: globalThis.MouseEvent) => {
        const d = colDragRef.current;
        const tbl = tableRef.current;
        if (!d || !tbl) return;
        const tw = tbl.getBoundingClientRect().width;
        if (tw < 1) return;
        const deltaPct = ((ev.clientX - d.startX) / tw) * 100;
        const { which: w, w0, w1, w2 } = d;
        setColPcts(() => {
          if (w === 0) {
            let n0 = w0 + deltaPct;
            let n1 = w1 - deltaPct;
            n0 = Math.max(
              LIVE_COL_MIN_PCT,
              Math.min(n0, 100 - LIVE_COL_MIN_PCT - w2)
            );
            n1 = 100 - n0 - w2;
            if (n1 < LIVE_COL_MIN_PCT) {
              n1 = LIVE_COL_MIN_PCT;
              n0 = 100 - n1 - w2;
            }
            return [
              Math.round(n0 * 10) / 10,
              Math.round(n1 * 10) / 10,
              w2,
            ];
          }
          let n1 = w1 + deltaPct;
          let n2 = w2 - deltaPct;
          n1 = Math.max(
            LIVE_COL_MIN_PCT,
            Math.min(n1, 100 - LIVE_COL_MIN_PCT - w0)
          );
          n2 = 100 - w0 - n1;
          if (n2 < LIVE_COL_MIN_PCT) {
            n2 = LIVE_COL_MIN_PCT;
            n1 = 100 - w0 - n2;
          }
          return [
            w0,
            Math.round(n1 * 10) / 10,
            Math.round(n2 * 10) / 10,
          ];
        });
      };

      const onUp = () => {
        colDragRef.current = null;
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

  const [rowPayloadMode, setRowPayloadMode] = useState<Record<number, 'plain' | 'json'>>({});

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

  const onPayloadCellClick = useCallback(
    (id: number) => {
      const sel = typeof window !== 'undefined' ? window.getSelection()?.toString() ?? '' : '';
      if (sel.length > 0) return;
      toggleRowPayload(id);
    },
    [toggleRowPayload]
  );

  return (
    <section
      className={
        inSplit ? 'panel live-feed-stack live-feed-stack--split' : 'panel live-feed-stack'
      }
    >
      <h2>Live feed</h2>
      <div className="live-feed-scroll">
        <table ref={tableRef} className="live-feed-table live-feed-table--3col">
          <colgroup>
            <col style={{ width: `${colPcts[0]}%` }} />
            <col style={{ width: `${colPcts[1]}%` }} />
            <col style={{ width: `${colPcts[2]}%` }} />
          </colgroup>
          <thead>
            <tr>
              <th className="live-th-resizable">
                Time
                <span
                  className="live-col-resize-handle"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Time and Topic column widths"
                  title="Drag to resize Time vs Topic"
                  onMouseDown={(e) => beginColResize(e, 0)}
                />
              </th>
              <th className="live-th-resizable">
                Topic
                <span
                  className="live-col-resize-handle"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Topic and Payload column widths"
                  title="Drag to resize Topic vs Payload"
                  onMouseDown={(e) => beginColResize(e, 1)}
                />
              </th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const rowMode = rowPayloadMode[m.id] ?? LIVE_FEED_DEFAULT_ROW_PAYLOAD;
              return (
                <tr key={m.id}>
                  <td className="mono">{fmtTime(m.received_at)}</td>
                  <td className="mono">
                    <div className="live-cell-scroll">{m.topic}</div>
                  </td>
                  <td className="mono">
                    <div
                      className="live-payload-cell-toggle"
                      role="button"
                      tabIndex={0}
                      title="Click: toggle plain / formatted JSON for this row only"
                      onClick={() => onPayloadCellClick(m.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onPayloadCellClick(m.id);
                        }
                      }}
                    >
                      {rowMode === 'json' ? (
                        <pre className="live-payload-pre live-cell-scroll">
                          <span className="badge">{m.payload_encoding}</span>
                          {'\n'}
                          {formatPayloadForDisplay(m.payload_display, 'json')}
                        </pre>
                      ) : (
                        <div className="live-cell-scroll">
                          <span className="badge">{m.payload_encoding}</span>{' '}
                          {formatPayloadForDisplay(m.payload_display, 'plain')}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && (
          <p style={{ padding: '1rem', color: 'var(--muted)' }}>No messages yet.</p>
        )}
      </div>
    </section>
  );
}

function PublishView({ inSplit }: { inSplit?: boolean }) {
  const [history, setHistory] = useState<PublishPreset[]>([]);
  const [topic, setTopic] = useState('test/topic');
  const [payload, setPayload] = useState('{"hello":"from-ui"}');
  const [historySelect, setHistorySelect] = useState('');
  const [qos, setQos] = useState(0);
  const [retain, setRetain] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const loadPresets = useCallback(async (fillFormFromFirst: boolean) => {
    try {
      setLoadErr(null);
      const r = await api.getPublishPresets();
      setHistory(r.items);
      if (fillFormFromFirst && r.items.length > 0) {
        setTopic(r.items[0].topic);
        setPayload(r.items[0].payload);
      }
    } catch (e) {
      setLoadErr(String(e));
    }
  }, []);

  useEffect(() => {
    void loadPresets(true);
  }, [loadPresets]);

  const send = async () => {
    setMsg(null);
    try {
      await api.publishMqtt({ topic, payload, qos, retain });
      await loadPresets(false);
      setMsg('Published.');
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <section
      className={
        inSplit ? 'panel publish-stack publish-stack--split' : 'panel publish-stack'
      }
    >
      {!inSplit && <h2>Publish</h2>}
      {loadErr && <p style={{ color: 'var(--danger)' }}>{loadErr}</p>}
      {history.length > 0 && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="publish-history-select">
            <span>Recent commands</span>
            <select
              value={historySelect}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== '') {
                  const id = Number(v);
                  const entry = history.find((h) => h.id === id);
                  if (entry) {
                    setTopic(entry.topic);
                    setPayload(entry.payload);
                  }
                }
                setHistorySelect('');
              }}
            >
              <option value="">Select…</option>
              {history.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {publishHistoryOptionLabel(e)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="row">
        <label>
          Topic
          <input value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        <label>
          QoS
          <select
            value={qos}
            onChange={(e) => setQos(Number(e.target.value))}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <label className="publish-retain-label">
          <input
            type="checkbox"
            checked={retain}
            onChange={(e) => setRetain(e.target.checked)}
          />
          Retain
        </label>
      </div>
      <label className={inSplit ? 'publish-payload-field' : undefined}>
        Payload
        <textarea value={payload} onChange={(e) => setPayload(e.target.value)} />
      </label>
      <div className="publish-actions">
        <button type="button" className="primary publish-submit-btn" onClick={() => void send()}>
          Publish
        </button>
      </div>
      {msg && <p>{msg}</p>}
    </section>
  );
}

const RULE_FORM_DEFAULTS = {
  name: 'Echo rule',
  topicPattern: 'devices/#',
  payloadRegex: '',
  replyTopic: 'devices/ack',
  replyTpl: 'got: {{payload}} on {{topic}}',
} as const;

function RulesView({ inSplit }: { inSplit?: boolean }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [name, setName] = useState(RULE_FORM_DEFAULTS.name);
  const [topicPattern, setTopicPattern] = useState(RULE_FORM_DEFAULTS.topicPattern);
  const [payloadRegex, setPayloadRegex] = useState(RULE_FORM_DEFAULTS.payloadRegex);
  const [replyTopic, setReplyTopic] = useState(RULE_FORM_DEFAULTS.replyTopic);
  const [replyTpl, setReplyTpl] = useState(RULE_FORM_DEFAULTS.replyTpl);

  const resetFormForNew = useCallback(() => {
    setEditingRuleId(null);
    setName(RULE_FORM_DEFAULTS.name);
    setTopicPattern(RULE_FORM_DEFAULTS.topicPattern);
    setPayloadRegex(RULE_FORM_DEFAULTS.payloadRegex);
    setReplyTopic(RULE_FORM_DEFAULTS.replyTopic);
    setReplyTpl(RULE_FORM_DEFAULTS.replyTpl);
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await api.getRules();
      setRules(r.items);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (r: Rule) => {
    setEditingRuleId(r.id);
    setName(r.name);
    setTopicPattern(r.topic_pattern);
    setPayloadRegex(r.payload_regex ?? '');
    setReplyTopic(r.reply_topic);
    setReplyTpl(r.reply_payload_template);
  };

  const saveRule = async () => {
    const n = name.trim();
    const tp = topicPattern.trim();
    const rt = replyTopic.trim();
    if (!n || !tp || !rt) {
      alert('Name, topic pattern, and reply topic are required.');
      return;
    }
    try {
      if (editingRuleId != null) {
        await api.updateRule(editingRuleId, {
          name: n,
          topicPattern: tp,
          payloadRegex: payloadRegex.trim(),
          replyTopic: rt,
          replyPayloadTemplate: replyTpl,
        });
        setEditingRuleId(null);
      } else {
        await api.createRule({
          name: n,
          topicPattern: tp,
          payloadRegex: payloadRegex.trim() || undefined,
          replyTopic: rt,
          replyPayloadTemplate: replyTpl,
          sortOrder: rules.length,
          enabled: true,
        });
      }
      await load();
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <section
      className={inSplit ? 'panel rules-stack rules-stack--split' : 'panel'}
    >
      {!inSplit && <h2>Auto-reply rules</h2>}
      {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
      <div className="row" style={{ alignItems: 'stretch' }}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Topic pattern
          <input
            value={topicPattern}
            onChange={(e) => setTopicPattern(e.target.value)}
          />
        </label>
        <label>
          Payload regex (optional)
          <input
            value={payloadRegex}
            onChange={(e) => setPayloadRegex(e.target.value)}
          />
        </label>
      </div>
      <div className="row">
        <label>
          Reply topic
          <input value={replyTopic} onChange={(e) => setReplyTopic(e.target.value)} />
        </label>
      </div>
      <label>
        Reply payload template
        <textarea value={replyTpl} onChange={(e) => setReplyTpl(e.target.value)} />
      </label>
      <div className="row" style={{ marginBottom: 0 }}>
        <button type="button" className="primary" onClick={() => void saveRule()}>
          {editingRuleId != null ? 'Save changes' : 'Add rule'}
        </button>
        {editingRuleId != null && (
          <button type="button" className="ghost" onClick={() => resetFormForNew()}>
            Cancel edit
          </button>
        )}
      </div>
      <div className={inSplit ? 'rules-table-scroll' : undefined}>
        <table style={{ marginTop: inSplit ? '0.75rem' : '1rem' }}>
          <thead>
            <tr>
              <th className="rules-col-on" scope="col">
                On
              </th>
              <th>Name</th>
              <th>Topic</th>
              <th>Reply</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr
                key={r.id}
                className={editingRuleId === r.id ? 'rules-row--editing' : undefined}
              >
                <td className="rules-col-on">
                  <button
                    type="button"
                    className={`rule-on-dot rule-on-toggle ${r.enabled ? 'rule-on-dot--on' : 'rule-on-dot--off'}`}
                    aria-label={r.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                    aria-pressed={r.enabled}
                    title={r.enabled ? 'Click to disable' : 'Click to enable'}
                    onClick={() =>
                      void api
                        .updateRule(r.id, { enabled: !r.enabled })
                        .then(() => load())
                    }
                  />
                </td>
                <td>{r.name}</td>
                <td className="mono">{r.topic_pattern}</td>
                <td className="mono">
                  {r.reply_topic}: {r.reply_payload_template.slice(0, 40)}
                  {r.reply_payload_template.length > 40 ? '…' : ''}
                </td>
                <td className="rules-actions-cell">
                  <div className="rules-actions">
                    <button
                      type="button"
                      className="ghost rules-icon-btn"
                      aria-label="Edit rule"
                      data-tooltip="Edit rule"
                      onClick={() => startEdit(r)}
                    >
                      <IconRuleEdit />
                    </button>
                    <button
                      type="button"
                      className="danger rules-icon-btn"
                      aria-label="Delete rule"
                      data-tooltip="Delete rule"
                      onClick={() => {
                        if (!confirm('Delete rule?')) return;
                        void api.deleteRule(r.id).then(() => {
                          if (editingRuleId === r.id) resetFormForNew();
                          void load();
                        });
                      }}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
