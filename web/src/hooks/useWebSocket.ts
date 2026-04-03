import { useEffect, useRef, useState } from 'react';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER_MS = 400;

function nextReconnectDelayMs(attempt: number): number {
  const exp = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_BASE_MS * 2 ** attempt
  );
  const jitter = Math.floor(Math.random() * RECONNECT_JITTER_MS);
  return Math.min(RECONNECT_MAX_MS, exp + jitter);
}

export function useWebSocket(
  onEvent: (event: string, data: unknown) => void
): 'open' | 'closed' | 'error' {
  const [st, setSt] = useState<'open' | 'closed' | 'error'>('closed');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || '';
    const wsPath = `${base}/ws`;
    const url = `${proto}//${location.host}${wsPath}`;

    const cancelledRef = { current: false };
    const reconnectRef = { current: null as ReturnType<typeof setTimeout> | null };
    const wsRef = { current: null as WebSocket | null };
    let attempt = 0;

    const clearReconnect = () => {
      if (reconnectRef.current != null) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelledRef.current) return;
      clearReconnect();
      const delay = nextReconnectDelayMs(attempt);
      attempt += 1;
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null;
        if (!cancelledRef.current) connect();
      }, delay);
    };

    const connect = () => {
      if (cancelledRef.current) return;
      clearReconnect();
      setSt((prev) => (prev === 'open' ? prev : 'closed'));

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelledRef.current) {
          ws.close();
          return;
        }
        attempt = 0;
        setSt('open');
      };

      ws.onerror = () => {
        if (cancelledRef.current) return;
        setSt('error');
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (cancelledRef.current) return;
        setSt('closed');
        scheduleReconnect();
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as { event: string; data: unknown };
          onEventRef.current(msg.event, msg.data);
        } catch {
          /* ignore */
        }
      };
    };

    connect();

    return () => {
      cancelledRef.current = true;
      clearReconnect();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return st;
}
