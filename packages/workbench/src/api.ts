export const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
export const WS_URL   = import.meta.env.VITE_WS_URL  ?? 'ws://localhost:3001';

export type Capability =
  | 'CODE_EXECUTION' | 'VISION_EXTRACTION' | 'SOP_RETRIEVAL'
  | 'ASME_CALCULATION' | 'DOCUMENT_GENERATION' | 'POLICY_CHECK'
  | 'SIGNED_AUDIT' | 'GENERAL_REASONING' | 'EMBEDDING';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type JobStatus = 'QUEUED' | 'RUNNING' | 'WAITING' | 'VERIFIED' | 'RETRYING' | 'BLOCKED' | 'FAILED' | 'COMPLETED' | 'CANCELLED';
export type NodeStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'BLOCKED';

export interface ExecutionNode {
  id: string; jobId: string; type: string; state: NodeStatus;
  inputsHash?: string; outputsHash?: string; updatedAt: string;
}

export interface Job {
  id: string; status: JobStatus; request: any; nodes: ExecutionNode[]; createdAt: string;
}

export interface Citation {
  documentId: string; documentTitle: string; documentVersion: string;
  chunkId: string; location: string; excerpt: string; score: number; retriever: string;
}

export interface ArtifactRecord {
  id: string; jobId: string; type: string; filename: string;
  sha256: string; createdAt: string; sizeBytes: number;
}

export interface WsEvent { event: string; payload: any; timestamp: string; }

export const ALL_CAPABILITIES: { key: Capability; label: string; icon: string }[] = [
  { key: 'GENERAL_REASONING',   label: 'Reasoning',        icon: '🧠' },
  { key: 'CODE_EXECUTION',      label: 'Code Exec',        icon: '💻' },
  { key: 'VISION_EXTRACTION',   label: 'Vision',           icon: '👁' },
  { key: 'SOP_RETRIEVAL',       label: 'SOP / RAG',        icon: '📚' },
  { key: 'ASME_CALCULATION',    label: 'Eng. Calc',        icon: '📐' },
  { key: 'DOCUMENT_GENERATION', label: 'Deliverable',      icon: '📄' },
  { key: 'POLICY_CHECK',        label: 'Policy',           icon: '🛡' },
  { key: 'SIGNED_AUDIT',        label: 'Audit',            icon: '🔏' },
];

// ─── API helpers ─────────────────────────────────────────────────────────────
export async function apiPost<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error ?? 'API error');
  return json as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`);
  const json = await r.json();
  if (!r.ok) throw new Error(json.error ?? 'API error');
  return json as T;
}
