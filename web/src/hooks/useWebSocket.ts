import { useEffect, useRef, useState } from 'react';

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
    const ws = new WebSocket(url);
    ws.onopen = () => setSt('open');
    ws.onclose = () => setSt('closed');
    ws.onerror = () => setSt('error');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { event: string; data: unknown };
        onEventRef.current(msg.event, msg.data);
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, []);

  return st;
}
