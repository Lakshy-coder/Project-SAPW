import { useState, useEffect, useCallback } from 'react';
import './index.css';
import {
  ALL_CAPABILITIES, apiPost, apiGet, API_BASE
} from './api';
import type {
  Capability, RiskLevel, Citation, ArtifactRecord, WsEvent,
  Job, ExecutionNode
} from './api';
import { useWebSocket, shortHash } from './utils';

type RightTab = 'evidence' | 'artifacts' | 'security' | 'audit';
type NavView  = 'workbench' | 'knowledge' | 'tools' | 'admin';

// ─── ExecutionGraph component ─────────────────────────────────────────────────
function ExecutionGraph({ nodes }: { nodes: ExecutionNode[] }) {
  if (nodes.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">⬡</div>
        Submit a task to see the execution graph
      </div>
    );
  }
  return (
    <div className="graph-track">
      {nodes.map(n => (
        <div key={n.id} className={`graph-node node-${n.state}`}>
          <div className="node-body">
            <div className="node-type">{n.type.replace(/_/g, ' ')}</div>
            <div className="node-id">ID: {n.id.slice(0, 12)}…</div>
            {n.outputsHash && (
              <div className="node-hash">hash: {shortHash(n.outputsHash)}</div>
            )}
          </div>
          <span className={`node-badge badge-${n.state}`}>{n.state}</span>
        </div>
      ))}
    </div>
  );
}

// ─── LogStream component ──────────────────────────────────────────────────────
function LogStream({ events }: { events: { type: string; text: string; ts: string }[] }) {
  return (
    <div className="log-stream">
      {events.length === 0
        ? <span style={{ color: 'var(--text-muted)' }}>Awaiting events…</span>
        : events.map((e, i) => (
          <div key={i} className={`log-line ${e.type}`}>
            <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{e.ts}</span>
            {e.text}
          </div>
        ))
      }
    </div>
  );
}

// ─── QuickAiChat component ────────────────────────────────────────────────────
function QuickAiChat() {
  const [msg, setMsg]         = useState('');
  const [reply, setReply]     = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!msg.trim() || loading) return;
    setLoading(true); setReply(null); setError(null);
    try {
      const data: any = await apiPost('/api/ai/chat', { message: msg });
      setReply(data.response);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="card" style={{ margin: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>⚡ Quick AI Chat (qwen3:4b)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="Ask Qwen anything…"
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask()}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" onClick={ask} disabled={loading || !msg.trim()}
          style={{ whiteSpace: 'nowrap', padding: '7px 14px', fontSize: 12 }}>
          {loading ? <><span className="spinner" />…</> : 'Ask'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--accent-red)', wordBreak: 'break-word' }}>⚠ {error}</div>}
      {reply && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-base)', borderRadius: 6,
          padding: '10px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 300, overflowY: 'auto' }}>
          {reply}
        </div>
      )}
    </div>
  );
}

// ─── EvidencePanel ────────────────────────────────────────────────────────────
function EvidencePanel({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return <div className="empty-state"><div className="icon">📚</div>No citations yet</div>;
  return (
    <>
      {citations.map((c, i) => (
        <div key={i} className="citation-card">
          <div className="citation-title">{c.documentTitle}</div>
          <div className="citation-meta">v{c.documentVersion} · {c.location} · score {c.score.toFixed(3)} · {c.retriever}</div>
          <div className="citation-excerpt">"{c.excerpt}"</div>
        </div>
      ))}
    </>
  );
}

// ─── ArtifactsPanel ──────────────────────────────────────────────────────────
function ArtifactsPanel({ artifacts, jobId }: { artifacts: ArtifactRecord[]; jobId: string | null }) {
  if (!jobId) return <div className="empty-state"><div className="icon">📄</div>No job selected</div>;
  if (artifacts.length === 0) return <div className="empty-state"><div className="icon">📄</div>No artifacts yet</div>;
  return (
    <>
      {artifacts.map(a => (
        <div key={a.id} className="artifact-row">
          <span className="artifact-icon">{a.type === 'XLSX' ? '📊' : a.type === 'PDF' ? '📕' : '📄'}</span>
          <div className="artifact-body">
            <div className="artifact-name">{a.filename}</div>
            <div className="artifact-hash">{a.sha256}</div>
          </div>
          <div className="artifact-actions">
            <a href={`${API_BASE}/api/artifacts/${a.id}/download`} download>
              <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>↓</button>
            </a>
          </div>
        </div>
      ))}
    </>
  );
}

// ─── SecurityPanel ─────────────────────────────────────────────────────────────
function SecurityPanel({ health }: { health: any }) {
  if (!health) return <div className="empty-state"><div className="icon">🛡</div>Loading…</div>;
  const { sovereignMode, components, networkPolicy } = health;
  return (
    <>
      <div className="card">
        <div className="sec-row"><span className="sec-label">Mode</span>
          <span className={`sec-val ${sovereignMode ? 'ok' : 'warn'}`}>{sovereignMode ? 'SOVEREIGN' : 'DEVELOPMENT'}</span>
        </div>
        <div className="sec-row"><span className="sec-label">Sandbox</span>
          <span className={`sec-val ${components?.sandbox?.status === 'UP' ? 'ok' : 'warn'}`}>{components?.sandbox?.status ?? '—'}</span>
        </div>
        <div className="sec-row"><span className="sec-label">Qdrant</span>
          <span className={`sec-val ${components?.qdrant?.status === 'UP' ? 'ok' : 'warn'}`}>{components?.qdrant?.status ?? '—'}</span>
        </div>
        <div className="sec-row"><span className="sec-label">Models</span>
          <span className={`sec-val ${components?.modelState === 'READY' ? 'ok' : 'warn'}`}>{components?.modelState ?? '—'}</span>
        </div>
        <div className="sec-row"><span className="sec-label">Cloud Inference</span>
          <span className="sec-val ok">BLOCKED</span>
        </div>
        <div className="sec-row"><span className="sec-label">Public WAN</span>
          <span className={`sec-val ${networkPolicy?.publicEndpointsAllowed ? 'warn' : 'ok'}`}>
            {networkPolicy?.publicEndpointsAllowed ? 'ALLOWED (dev)' : 'BLOCKED'}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, padding: '4px 2px' }}>
        Network enforcement is applied at the OS/container level. This panel is observability only.
      </div>
      {components?.models?.map((m: any) => (
        <div key={m.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <div>
            <div style={{ fontWeight: 600 }}>{m.name}</div>
            <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{m.capabilities.join(', ')}</div>
          </div>
          <span className={`tag`} style={{ alignSelf: 'center', background: m.available ? 'rgba(61,214,140,0.15)' : 'rgba(224,74,74,0.15)', color: m.available ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {m.available ? 'ONLINE' : 'UNAVAILABLE'}
          </span>
        </div>
      ))}
    </>
  );
}

// ─── AuditPanel ─────────────────────────────────────────────────────────────
function AuditPanel({ jobId }: { jobId: string | null }) {
  const [chain, setChain]     = useState<any[]>([]);
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchChain = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const d: any = await apiGet(`/api/jobs/${jobId}/audit`);
      setChain(d.events ?? []);
    } catch {}
    setLoading(false);
  }, [jobId]);

  const fetchReceipt = useCallback(async () => {
    if (!jobId) return;
    try {
      const r: any = await apiGet(`/api/jobs/${jobId}/receipt`);
      setReceipt(r);
    } catch {}
  }, [jobId]);

  useEffect(() => { fetchChain(); }, [fetchChain]);

  if (!jobId) return <div className="empty-state"><div className="icon">🔏</div>No job selected</div>;

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={fetchChain} style={{ fontSize: 12, padding: '5px 10px' }}>↻ Refresh</button>
        <button className="btn btn-secondary" onClick={fetchReceipt} style={{ fontSize: 12, padding: '5px 10px' }}>Seal Receipt</button>
      </div>
      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
      {receipt && (
        <div className="card">
          <div style={{ fontSize: 11, marginBottom: 6, fontWeight: 600, color: 'var(--accent-teal)' }}>SIGNED EXECUTION RECEIPT</div>
          <div style={{ fontSize: 10, fontFamily: 'Courier New', wordBreak: 'break-all', color: 'var(--text-secondary)' }}>
            rootHash: {receipt.rootHash}<br />
            keyId: {receipt.keyId}<br />
            sig: {receipt.signature?.slice(0, 40)}…
          </div>
        </div>
      )}
      {chain.length === 0
        ? <div className="empty-state">No audit events yet</div>
        : chain.map((ev, i) => (
          <div key={ev.id} className="card" style={{ fontSize: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>#{ev.seq} {ev.eventType}</span>
              <span style={{ color: 'var(--text-muted)' }}>{ev.createdAt?.slice(11, 19)}</span>
            </div>
            <div className="hash-text">in:  {ev.inputHash?.slice(0, 20)}…</div>
            <div className="hash-text">out: {ev.outputHash?.slice(0, 20)}…</div>
            <div className="hash-text">blk: {ev.blockHash?.slice(0, 20)}…</div>
          </div>
        ))
      }
    </>
  );
}

// ─── Knowledge Search view ─────────────────────────────────────────────────
function KnowledgeView() {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(false);
  const [ingestTitle, setIngestTitle] = useState('');
  const [ingestContent, setIngestContent] = useState('');
  const [ingestVer, setIngestVer] = useState('1.0');

  const search = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const d: any = await apiGet(`/api/knowledge/search?query=${encodeURIComponent(query)}`);
      setResults(d.citations ?? []);
    } catch {}
    setLoading(false);
  };

  const ingest = async () => {
    try {
      await apiPost('/api/knowledge/ingest', { title: ingestTitle, content: ingestContent, version: ingestVer });
      setIngestTitle(''); setIngestContent(''); alert('Document ingested.');
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="card">
        <div className="section-title" style={{ marginBottom: 10 }}>Search Knowledge Base</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="search" placeholder="Search SOPs, policies, documents…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
          <button className="btn btn-primary" onClick={search} disabled={loading} style={{ whiteSpace: 'nowrap' }}>{loading ? '…' : 'Search'}</button>
        </div>
        {results.length > 0 && <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map((c, i) => <div key={i} className="citation-card">
            <div className="citation-title">{c.documentTitle}</div>
            <div className="citation-meta">v{c.documentVersion} · {c.location} · score {c.score.toFixed(3)}</div>
            <div className="citation-excerpt">"{c.excerpt}"</div>
          </div>)}
        </div>}
      </div>
      <div className="card">
        <div className="section-title" style={{ marginBottom: 10 }}>Ingest Document</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="text" placeholder="Title" value={ingestTitle} onChange={e => setIngestTitle(e.target.value)} />
          <input type="text" placeholder="Version (e.g. 1.0)" value={ingestVer} onChange={e => setIngestVer(e.target.value)} style={{ width: 120 }} />
          <textarea className="prompt-input" placeholder="Document content…" value={ingestContent} onChange={e => setIngestContent(e.target.value)} style={{ minHeight: 120 }} />
          <button className="btn btn-primary" onClick={ingest} style={{ alignSelf: 'flex-start' }}>Ingest</button>
        </div>
      </div>
    </div>
  );
}

// ─── Tools view ───────────────────────────────────────────────────────────────
function ToolsView() {
  const [tools, setTools]       = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [input, setInput]       = useState('{}');
  const [result, setResult]     = useState<any | null>(null);

  useEffect(() => {
    apiGet<{ tools: any[] }>('/api/tools').then(d => setTools(d.tools)).catch(() => {});
  }, []);

  const execute = async () => {
    if (!selected) return;
    try {
      const parsed = JSON.parse(input);
      const d = await apiPost<any>(`/api/tools/${selected.id}/execute`, { input: parsed });
      setResult(d);
    } catch (e: any) { setResult({ error: e.message }); }
  };

  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="section-title">Tool / MCP Gateway</div>
      {tools.map(t => (
        <div key={t.id} className="card" style={{ cursor: 'pointer', border: selected?.id === t.id ? '1px solid var(--accent-blue)' : undefined }}
          onClick={() => { setSelected(t); setResult(null); }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.description}</div>
            </div>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: t.riskLevel === 'HIGH' ? 'rgba(224,74,74,0.15)' : 'rgba(61,214,140,0.15)', color: t.riskLevel === 'HIGH' ? 'var(--accent-red)' : 'var(--accent-green)' }}>
              {t.riskLevel}
            </span>
          </div>
        </div>
      ))}
      {selected && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Execute: {selected.name}</div>
          <label className="form-label">JSON Input</label>
          <textarea className="prompt-input" value={input} onChange={e => setInput(e.target.value)} style={{ minHeight: 100, fontFamily: 'Courier New', fontSize: 12 }} />
          <button className="btn btn-primary" onClick={execute} style={{ marginTop: 8 }}>Execute Tool</button>
          {result && (
            <pre style={{ marginTop: 12, fontSize: 11, fontFamily: 'Courier New', color: 'var(--text-secondary)', background: 'var(--bg-base)', padding: 10, borderRadius: 6, overflow: 'auto' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* ─── AI Engineering Analysis ─────────────────────────────────────── */}
      <EngineeringAnalysis />
    </div>
  );
}

// ─── Engineering Analysis component (used inside ToolsView) ──────────────────
// Calls POST /api/ai/analyze: runs ASME B31.3 tool → Qwen interprets result.
const DEFAULT_PIPE_INPUT = {
  designPressureMPa: 12,
  outsideDiameterMM: 219.1,
  allowableStressMPa: 138,
  weldJointFactor: 1.0,
  yCoefficient: 0.4,
  measuredThicknessMM: 7.0
};

function EngineeringAnalysis() {
  const [toolInputStr, setToolInputStr] = useState(JSON.stringify(DEFAULT_PIPE_INPUT, null, 2));
  const [question, setQuestion]         = useState('Is this pipe wall thickness adequate? What are the risks if not?');
  const [loading, setLoading]           = useState(false);
  const [analysisResult, setResult]     = useState<any | null>(null);
  const [error, setError]               = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true); setResult(null); setError(null);
    let toolInput: any;
    try {
      toolInput = JSON.parse(toolInputStr);
    } catch {
      setError('Invalid JSON in tool input'); setLoading(false); return;
    }
    try {
      const data = await apiPost<any>('/api/ai/analyze', {
        toolId: 'asme-b31-3-pipe-thickness',
        toolInput,
        question: question.trim() || undefined
      });
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const statusColor = analysisResult?.toolResult?.status === 'PASS'
    ? 'var(--accent-green)' : analysisResult?.toolResult?.status === 'FAIL'
    ? 'var(--accent-red)' : 'var(--text-muted)';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>🤖</span>
        <div style={{ fontWeight: 600 }}>AI Engineering Analysis — ASME B31.3 Pipe Thickness</div>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(224,74,74,0.15)', color: 'var(--accent-red)', marginLeft: 'auto' }}>HIGH RISK</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Runs the deterministic ASME B31.3 §304.1.2 calculator, then asks Qwen3-4B to interpret the result and explain compliance status.
      </div>

      <label className="form-label">Tool Input (JSON)</label>
      <textarea
        className="prompt-input"
        value={toolInputStr}
        onChange={e => setToolInputStr(e.target.value)}
        style={{ minHeight: 140, fontFamily: 'Courier New', fontSize: 11 }}
      />

      <label className="form-label">Engineer's Question (optional)</label>
      <input
        type="text"
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder="Ask Qwen about this result…"
      />

      <button
        className="btn btn-primary"
        onClick={runAnalysis}
        disabled={loading}
        style={{ alignSelf: 'flex-start' }}
      >
        {loading ? <><span className="spinner" />Analyzing…</> : '⚡ Run AI Analysis'}
      </button>

      {error && (
        <div style={{ fontSize: 12, color: 'var(--accent-red)', wordBreak: 'break-word' }}>⚠ {error}</div>
      )}

      {analysisResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Tool result summary */}
          <div style={{ background: 'var(--bg-base)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
              📐 Deterministic Calculation — Authoritative
              <span style={{ marginLeft: 10, color: statusColor, fontWeight: 700 }}>
                [{analysisResult.toolResult?.status}]
              </span>
            </div>
            <div style={{ fontSize: 11, fontFamily: 'Courier New', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              Min. required: <strong style={{ color: 'var(--text-primary)' }}>{analysisResult.toolResult?.minimumRequiredThicknessMM} mm</strong>
              {analysisResult.toolResult?.measuredThicknessMM !== undefined && (
                <> &nbsp;·&nbsp; Measured: <strong style={{ color: statusColor }}>{analysisResult.toolResult.measuredThicknessMM} mm</strong></>
              )}
              <br />
              Formula: <span style={{ color: 'var(--text-secondary)' }}>{analysisResult.toolResult?.formula}</span>
              <br />
              Code: {analysisResult.toolResult?.assumptions?.codeEdition} §{analysisResult.toolResult?.assumptions?.formulaId}
              &nbsp;·&nbsp; Tool: {analysisResult.toolRecord?.status} in {analysisResult.toolRecord?.durationMs}ms
            </div>
          </div>

          {/* Qwen interpretation */}
          <div style={{ background: 'var(--bg-base)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
              🤖 AI Interpretation — Explanatory <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({analysisResult.model})</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.65 }}>
              {analysisResult.interpretation}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [navView, setNavView]       = useState<NavView>('workbench');
  const [rightTab, setRightTab]     = useState<RightTab>('evidence');
  const [prompt, setPrompt]         = useState('');
  const [selectedCaps, setSelectedCaps] = useState<Set<Capability>>(new Set(['GENERAL_REASONING']));
  const [riskLevel, setRiskLevel]   = useState<RiskLevel>('LOW');
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [citations, setCitations]   = useState<Citation[]>([]);
  const [artifacts, setArtifacts]   = useState<ArtifactRecord[]>([]);
  const [health, setHealth]         = useState<any>(null);
  const [logs, setLogs]             = useState<{ type: string; text: string; ts: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const pushLog = useCallback((type: string, text: string) => {
    setLogs(prev => [...prev.slice(-99), { type, text, ts: new Date().toLocaleTimeString() }]);
  }, []);

  // WebSocket
  const wsConnected = useWebSocket((ev: WsEvent) => {
    const { event, payload } = ev;
    if (event === 'job.started')    pushLog('job',  `▶ Job started: ${payload.jobId?.slice(0,12)}…`);
    if (event === 'job.completed')  { pushLog('job', `✓ Job completed: ${payload.jobId?.slice(0,12)}…`); }
    if (event === 'node.started')   pushLog('node', `  ↳ Node ${payload.type} RUNNING`);
    if (event === 'node.completed') {
      pushLog('node', `  ✓ Node ${payload.type ?? ''} ${payload.state}`);
      setCurrentJob(prev => {
        if (!prev) return prev;
        const nodes = prev.nodes.map(n => n.id === payload.nodeId ? { ...n, state: payload.state, outputsHash: payload.outputsHash } : n);
        return { ...prev, nodes };
      });
    }
    if (event === 'job.plan_created') {
      setCurrentJob(prev => prev ? { ...prev, nodes: payload.plan } : prev);
    }
    if (event === 'security.alert') pushLog('error', `⚠ SECURITY ALERT: ${payload.message}`);
  });

  // Poll health
  useEffect(() => {
    const tick = () => apiGet<any>('/api/health').then(setHealth).catch(() => {});
    tick(); const id = setInterval(tick, 8000);
    return () => clearInterval(id);
  }, []);

  const toggleCap = (cap: Capability) => {
    setSelectedCaps(prev => {
      const next = new Set(prev);
      next.has(cap) ? next.delete(cap) : next.add(cap);
      return next;
    });
  };

  const submitJob = async () => {
    if (!prompt.trim() || selectedCaps.size === 0) return;
    setSubmitting(true);
    setCitations([]); setArtifacts([]);
    try {
      const job = await apiPost<Job>('/api/jobs', {
        intent: prompt,
        capabilities: Array.from(selectedCaps),
        riskLevel
      });
      setCurrentJob(job);
      pushLog('job', `Submitted job ${job.id?.slice(0,12)}…`);
    } catch (e: any) {
      pushLog('error', `Error: ${e.message}`);
    }
    setSubmitting(false);
  };

  const isSovereign = health?.sovereignMode;

  return (
    <div className="app-layout">
      {/* ─── Topbar ──────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon">⚙</div>
          SIH 2026 · Sovereign AI Workbench
        </div>
        <div className="topbar-divider" />
        <span className={`topbar-badge ${isSovereign ? 'sovereign' : 'dev'}`}>
          {isSovereign ? '🛡 SOVEREIGN' : '⚠ DEV MODE'}
        </span>
        <div className="topbar-spacer" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          <span className={`status-dot ${wsConnected ? 'up' : 'down'}`} />
          {wsConnected ? 'WS Live' : 'WS Offline'}
          <span className={`status-dot ${health?.components?.api?.status === 'UP' ? 'up' : 'down'}`} />
          API
        </div>
      </header>

      {/* ─── Sidebar ─────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-section-label">Workbench</div>
          {([['workbench','⬡','AI Workbench'],['knowledge','📚','Knowledge']] as const).map(([v,icon,label]) => (
            <button key={v} className={`nav-item ${navView===v?'active':''}`} onClick={() => setNavView(v as any)}>
              <span className="icon">{icon}</span>{label}
            </button>
          ))}
        </div>
        <div className="sidebar-section">
          <div className="sidebar-section-label">Operations</div>
          {([['tools','🔧','Tool Gateway']] as const).map(([v,icon,label]) => (
            <button key={v} className={`nav-item ${navView===v?'active':''}`} onClick={() => setNavView(v as any)}>
              <span className="icon">{icon}</span>{label}
            </button>
          ))}
        </div>
        {currentJob && (
          <div className="sidebar-section" style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="sidebar-section-label">Current Job</div>
            <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ fontFamily: 'Courier New', wordBreak: 'break-all' }}>{currentJob.id?.slice(0, 18)}…</div>
              <span className={`tag`} style={{ marginTop: 4, background: currentJob.status === 'COMPLETED' ? 'rgba(61,214,140,0.15)' : 'rgba(76,159,255,0.12)', color: currentJob.status === 'COMPLETED' ? 'var(--accent-green)' : 'var(--accent-blue)' }}>
                {currentJob.status}
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* ─── Main ────────────────────────────────────────── */}
      <main className="main-content">
        {navView === 'workbench' && <>
          {/* Job submission form */}
          <div className="job-form-area">
            <div>
              <label className="form-label">Task / Prompt</label>
              <textarea
                className="prompt-input"
                placeholder="Describe the industrial task… e.g. 'Check pipe wall thickness for 8-inch line at 12 MPa design pressure.'"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Capabilities</label>
              <div className="capability-grid">
                {ALL_CAPABILITIES.map(cap => (
                  <label key={cap.key} className={`cap-toggle ${selectedCaps.has(cap.key) ? 'selected' : ''}`}>
                    <input type="checkbox" checked={selectedCaps.has(cap.key)} onChange={() => toggleCap(cap.key)} />
                    {cap.icon} {cap.label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <label className="form-label">Risk Level</label>
                <select
                  value={riskLevel}
                  onChange={e => setRiskLevel(e.target.value as RiskLevel)}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', padding: '7px 10px', fontSize: 13, outline: 'none' }}
                >
                  {(['LOW','MEDIUM','HIGH','CRITICAL'] as const).map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 18, alignSelf: 'flex-end' }}
                onClick={submitJob}
                disabled={submitting || !prompt.trim() || selectedCaps.size === 0}
              >
                {submitting ? <><span className="spinner" />Submitting…</> : '▶ Run Job'}
              </button>
            </div>
          </div>

          {/* Execution graph */}
          <div className="panel-header">
            <span className="section-title">⬡ Execution Graph</span>
            {currentJob && <span className="tag">{currentJob.nodes.length} nodes</span>}
          </div>
          <div className="graph-area">
            <ExecutionGraph nodes={currentJob?.nodes ?? []} />
          </div>

          {/* Log stream */}
          <div style={{ padding: '0 18px 0' }}>
            <div className="panel-header" style={{ padding: '10px 0', border: 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Event Log</span>
            </div>
            <LogStream events={logs} />
          </div>

          {/* Quick AI Chat */}
          <QuickAiChat />
        </>}

        {navView === 'knowledge' && <KnowledgeView />}
        {navView === 'tools'     && <ToolsView />}
      </main>

      {/* ─── Right Panel ─────────────────────────────────── */}
      <aside className="right-panel">
        <div className="panel-tabs">
          {([['evidence','📚','Evidence'],['artifacts','📄','Artifacts'],['security','🛡','Security'],['audit','🔏','Audit']] as const).map(([k,icon,label]) => (
            <button key={k} className={`panel-tab ${rightTab===k?'active':''}`} onClick={() => setRightTab(k)}>
              {icon} {label}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {rightTab === 'evidence'  && <EvidencePanel citations={citations} />}
          {rightTab === 'artifacts' && <ArtifactsPanel artifacts={artifacts} jobId={currentJob?.id ?? null} />}
          {rightTab === 'security'  && <SecurityPanel health={health} />}
          {rightTab === 'audit'     && <AuditPanel jobId={currentJob?.id ?? null} />}
        </div>
      </aside>
    </div>
  );
}
