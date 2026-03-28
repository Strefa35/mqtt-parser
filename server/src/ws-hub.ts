import WebSocket from 'ws';

const clients = new Set<WebSocket>();

export function registerClient(ws: WebSocket): void {
  clients.add(ws);
  ws.on('close', () => {
    clients.delete(ws);
  });
}

export function broadcast(event: string, data: unknown): void {
  const msg = JSON.stringify({ event, data });
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
