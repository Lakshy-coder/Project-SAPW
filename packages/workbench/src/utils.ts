import { useState, useEffect, useRef } from 'react';
import { WS_URL } from './api';
import type { WsEvent } from './api';

export function useWebSocket(onEvent: (e: WsEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;
        ws.onopen  = () => setConnected(true);
        ws.onclose = () => { setConnected(false); setTimeout(connect, 2500); };
        ws.onerror = () => ws.close();
        ws.onmessage = (ev) => {
          try { onEvent(JSON.parse(ev.data)); } catch {}
        };
      } catch { setTimeout(connect, 2500); }
    };
    connect();
    return () => wsRef.current?.close();
  }, []);

  return connected;
}

export function nodeStateColor(state: string): string {
  const map: Record<string, string> = {
    PENDING: '#4a5470', RUNNING: '#4c9fff', SUCCESS: '#3dd68c',
    FAILED: '#e04a4a', BLOCKED: '#f5a623'
  };
  return map[state] ?? '#4a5470';
}

export function shortHash(h?: string): string {
  if (!h) return '—';
  return h.slice(0, 8) + '…' + h.slice(-4);
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.round(diff/1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff/60000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}
