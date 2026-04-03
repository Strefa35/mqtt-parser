import WebSocket from 'ws';

const clients = new Set<WebSocket>();

function serializeBroadcast(event: string, data: unknown): string | null {
  try {
    return JSON.stringify({ event, data });
  } catch {
    /* ignore — try fallback below */
  }
  let fallback: unknown;
  try {
    fallback =
      data instanceof Error
        ? { name: data.name, message: data.message }
        : '[unserializable]';
    return JSON.stringify({
      event,
      data: fallback,
      serializationFallback: true,
    });
  } catch {
    /* ignore */
  }
  try {
    return JSON.stringify({
      event,
      data: null,
      serializationError: true,
    });
  } catch {
    return null;
  }
}

export function registerClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on('close', () => {
    clients.delete(ws);
  });
}

export function broadcast(event: string, data: unknown): void {
  const msg = serializeBroadcast(event, data);
  if (msg == null) return;
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(msg);
      } catch {
        clients.delete(ws);
      }
    }
  }
}
