import { WebSocketServer, WebSocket } from 'ws';
import pino from 'pino';

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private logger = pino();

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
    });
  }

  broadcast(event: string, payload: any) {
    const message = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
    this.logger.info({ event, payload }, 'Broadcasting WS event');
  }
}
