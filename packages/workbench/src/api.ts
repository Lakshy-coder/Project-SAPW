export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
export const WS_URL   = import.meta.env.VITE_WS_URL  ?? 'ws://localhost:3001';

export type Capability =
  | 'GENERAL_REASONING'
  | 'CODE_GENERATION'
  | 'CODE_EXECUTION'
  | 'VISION_EXTRACTION'
  | 'SOP_RETRIEVAL'
  | 'EMBEDDINGS'
  | 'ASME_CALCULATION'
  | 'DOCUMENT_GENERATION'
  | 'POLICY_CHECK'
  | 'SIGNED_AUDIT';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type JobStatus = 'QUEUED' | 'RUNNING' | 'WAITING' | 'VERIFIED' | 'RETRYING' | 'BLOCKED' | 'FAILED' | 'COMPLETED' | 'CANCELLED' | 'SUCCESS' | 'PARTIAL';
export type NodeStatus = 'QUEUED' | 'RUNNING' | 'WAITING' | 'VERIFIED' | 'RETRYING' | 'BLOCKED' | 'FAILED' | 'COMPLETED' | 'CANCELLED' | 'SUCCESS' | 'PARTIAL' | 'PENDING';

export interface ExecutionNode {
  id: string; jobId: string; type: string; state: NodeStatus;
  inputsHash?: string; outputsHash?: string; updatedAt: string;
}

export interface Job {
  id: string; status: JobStatus; request: any; nodes: ExecutionNode[]; createdAt: string;
  result?: any;
  evidence?: any;
  verification?: any;
}

export interface Citation {
  documentId: string; documentTitle: string; documentVersion: string;
  chunkId: string; location: string; excerpt: string; score: number; retriever: string;
}

export interface ArtifactRecord {
  id: string; jobId: string; type: string; filename: string;
  sha256: string; createdAt: string; sizeBytes: number;
  executionId?: string;
  templateVersion?: string;
  generatorVersion?: string;
}

export interface WsEvent { event: string; payload: any; timestamp: string; }

export const ALL_CAPABILITIES: { key: Capability; label: string; icon: string }[] = [
  { key: 'GENERAL_REASONING',   label: 'Reasoning',          icon: '🧠' },
  { key: 'CODE_GENERATION',     label: 'Code Gen',           icon: '⚙️' },
  { key: 'CODE_EXECUTION',      label: 'Code Exec',          icon: '💻' },
  { key: 'VISION_EXTRACTION',   label: 'Vision',             icon: '👁' },
  { key: 'SOP_RETRIEVAL',       label: 'SOP / RAG',          icon: '📚' },
  { key: 'EMBEDDINGS',          label: 'Embeddings',         icon: '🧠' },
  { key: 'ASME_CALCULATION',    label: 'Eng. Calc',          icon: '📐' },
  { key: 'DOCUMENT_GENERATION', label: 'Deliverable',        icon: '📄' },
  { key: 'POLICY_CHECK',        label: 'Policy',             icon: '🛡' },
  { key: 'SIGNED_AUDIT',        label: 'Audit',              icon: '🔏' },
];

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  permissions: string[];
}

export interface StoredAuthSession {
  token: string;
  refreshToken: string;
  expiresAt?: string;
  user?: AuthUser;
}

const AUTH_STORAGE_KEY = 'sih2k26.auth';
let refreshSessionPromise: Promise<StoredAuthSession | null> | null = null;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseJsonResponse(response: Response): Promise<any> {
  return response.text().then((text) => {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  });
}

function readStoredAuthSession(): StoredAuthSession | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuthSession>;
    if (!parsed.token || !parsed.refreshToken) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return parsed as StoredAuthSession;
  } catch {
    return null;
  }
}

export function getStoredAuthSession(): StoredAuthSession | null {
  return readStoredAuthSession();
}

export function setStoredAuthSession(session: StoredAuthSession): void {
  const storage = getStorage();
  if (!storage) return;

  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAuthSession(options?: { suppressEvent?: boolean }): void {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(AUTH_STORAGE_KEY);
  }

  if (!options?.suppressEvent && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sih2k26:auth-expired'));
  }
}

async function refreshStoredSession(): Promise<StoredAuthSession | null> {
  const current = readStoredAuthSession();
  if (!current?.refreshToken) {
    clearStoredAuthSession();
    return null;
  }

  if (refreshSessionPromise) {
    return refreshSessionPromise;
  }

  refreshSessionPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });

      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload?.error ?? 'REFRESH_FAILED');
      }

      const nextSession: StoredAuthSession = {
        ...current,
        token: payload.token ?? current.token,
        refreshToken: payload.refreshToken ?? current.refreshToken,
        expiresAt: payload.expiresAt ?? current.expiresAt,
      };

      setStoredAuthSession(nextSession);
      return nextSession;
    } catch {
      clearStoredAuthSession();
      return null;
    } finally {
      refreshSessionPromise = null;
    }
  })();

  return refreshSessionPromise;
}

export function getCurrentAuthUser(): AuthUser | null {
  return readStoredAuthSession()?.user ?? null;
}

async function fetchWithAuth<T>(path: string, init: RequestInit, retry = false): Promise<T> {
  const session = readStoredAuthSession();
  const headers = new Headers(init.headers ?? {});

  if (session?.token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 && !retry && !path.includes('/api/auth/login') && !path.includes('/api/auth/refresh')) {
    const refreshed = await refreshStoredSession();
    if (refreshed) {
      const retryHeaders = new Headers(init.headers ?? {});
      retryHeaders.set('Authorization', `Bearer ${refreshed.token}`);
      if (typeof init.body === 'string' && !retryHeaders.has('Content-Type')) {
        retryHeaders.set('Content-Type', 'application/json');
      }
      return fetchWithAuth<T>(path, { ...init, headers: retryHeaders }, true);
    }

    clearStoredAuthSession();
    throw new Error('Authentication required');
  }

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(payload?.error ?? payload?.message ?? 'API error');
  }

  return payload as T;
}

// ─── API helpers ─────────────────────────────────────────────────────────────
export async function apiPost<T>(path: string, body: any): Promise<T> {
  return fetchWithAuth<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiGet<T>(path: string): Promise<T> {
  return fetchWithAuth<T>(path, {
    method: 'GET',
  });
}
