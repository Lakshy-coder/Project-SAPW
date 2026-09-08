import { useState, useEffect, useRef } from 'react';
import { WS_URL } from './api';
import type { WsEvent } from './api';

export function useWebSocket(onEvent: (e: WsEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    shouldReconnectRef.current = true;

    const connect = () => {
      if (!shouldReconnectRef.current) return;

      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
        };

        ws.onclose = () => {
          setConnected(false);
          if (!shouldReconnectRef.current) return;
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
          }
          reconnectTimerRef.current = setTimeout(connect, 2500);
        };

        ws.onerror = () => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            onEventRef.current(message);
          } catch {
            // Ignore malformed WS payloads.
          }
        };
      } catch {
        if (!shouldReconnectRef.current) return;
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(connect, 2500);
      }
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
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
