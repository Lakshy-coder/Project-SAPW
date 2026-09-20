import { useState, useEffect, useRef } from 'react';
import { WS_URL } from './api';
import type { WsEvent } from './api';

export function useWebSocket(onEvent: (e: WsEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const instanceIdRef = useRef(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    const instanceId = ++instanceIdRef.current;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const closeSocket = () => {
      if (wsRef.current) {
        const socket = wsRef.current;
        wsRef.current = null;
        socket.onopen = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          try {
            socket.close();
          } catch {
            // Ignore close failures during cleanup.
          }
        }
      }
    };

    const connect = () => {
      if (!shouldReconnectRef.current || instanceId !== instanceIdRef.current) return;

      try {
        closeSocket();
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (instanceId !== instanceIdRef.current) {
            try { ws.close(); } catch {
              // Ignore stale socket close issues.
            }
            return;
          }
          setConnected(true);
        };

        ws.onclose = () => {
          if (instanceId !== instanceIdRef.current) return;
          setConnected(false);
          if (!shouldReconnectRef.current) return;
          clearReconnectTimer();
          reconnectTimerRef.current = setTimeout(connect, 2500);
        };

        ws.onerror = () => {
          if (instanceId !== instanceIdRef.current) return;
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            try {
              ws.close();
            } catch {
              // Ignore stale close errors.
            }
          }
        };

        ws.onmessage = (event) => {
          if (instanceId !== instanceIdRef.current) return;
          try {
            const message = JSON.parse(event.data);
            onEventRef.current(message);
          } catch {
            // Ignore malformed WS payloads.
          }
        };
      } catch {
        if (instanceId !== instanceIdRef.current) return;
        clearReconnectTimer();
        if (shouldReconnectRef.current) {
          reconnectTimerRef.current = setTimeout(connect, 2500);
        }
      }
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      instanceIdRef.current += 1;
      clearReconnectTimer();
      closeSocket();
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
