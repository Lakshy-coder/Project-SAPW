import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './App.css';
import { apiPost, apiGet, API_BASE } from './api';
import type {
  Capability,
  RiskLevel,
  Citation,
  ArtifactRecord,
  WsEvent,
  Job,
  ExecutionNode,
} from './api';
import { useWebSocket, shortHash } from './utils';

type RightTab = 'evidence' | 'artifacts' | 'security' | 'audit';
type NavView = 'workbench' | 'knowledge' | 'tools';

const CAPABILITY_DETAILS: Record<Capability, { label: string; description: string }> = {
  GENERAL_REASONING: {
    label: 'Local reasoning',
    description: 'Uses the local model to interpret the industrial request and context.',
  },
  CODE_GENERATION: {
    label: 'Implementation',
    description: 'Builds or adapts logic when a task requires code work.',
  },
  CODE_EXECUTION: {
    label: 'Computation',
    description: 'Runs computation in the controlled execution environment.',
  },
  VISION_EXTRACTION: {
    label: 'Vision',
    description: 'Extracts structured information from visual or document input.',
  },
  SOP_RETRIEVAL: {
    label: 'SOP / RAG',
    description: 'Retrieves relevant controlled engineering sources and standards.',
  },
  EMBEDDINGS: {
    label: 'Context retrieval',
    description: 'Matches related technical context from local knowledge memory.',
  },
  ASME_CALCULATION: {
    label: 'Engineering calculation',
    description: 'Runs the deterministic engineering calculation needed for the task.',
  },
  DOCUMENT_GENERATION: {
    label: 'Deliverable',
    description: 'Prepares the final output or artifact expected by the user.',
  },
  POLICY_CHECK: {
    label: 'Policy check',
    description: 'Checks the task against applicable safety and governance rules.',
  },
  SIGNED_AUDIT: {
    label: 'Signed audit',
    description: 'Records execution history and seals the result for traceability.',
  },
};

const RISK_OPTIONS: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function humanizeNodeType(type: string): string {
  const values: Record<string, string> = {
    INTENT_EXTRACTION: 'Understanding request',
    POLICY_PRECHECK: 'Checking safety rules',
    REASONING: 'Local AI reasoning',
    CODE_GENERATION: 'Preparing implementation',
    CODE_EXECUTION: 'Running computation',
    VISION_EXTRACTION: 'Extracting visual data',
    SOP_RETRIEVAL: 'Finding relevant sources',
    EMBEDDINGS: 'Preparing technical context',
    ASME_CALCULATION: 'Running engineering calculation',
    POLICY_CHECK: 'Checking governance',
    DOCUMENT_GENERATION: 'Preparing deliverable',
    SIGNED_AUDIT: 'Sealing execution record',
    VERIFICATION_GATE: 'Verifying result',
    EVIDENCE_SEALING: 'Sealing evidence',
    FINAL_DELIVERY: 'Preparing deliverable',
    CAPABILITY_WORK: 'Running task work',
  };

  return values[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function ExecutionGraph({ nodes }: { nodes: ExecutionNode[] }) {
  if (!nodes.length) {
    return (
      <div className="empty-state compact">
        <div className="empty-mark">◎</div>
        <strong>Execution stages</strong>
        <span>Submit a task to see how the system executes it.</span>
      </div>
    );
  }

  return (
    <div className="graph-track">
      {nodes.map((node, index) => (
        <div key={node.id} className={`graph-node node-${node.state.toLowerCase()}`}>
          <div className="graph-step">{String(index + 1).padStart(2, '0')}</div>

          <div className="node-body">
            <div className="node-type">{humanizeNodeType(node.type)}</div>
            <div className="node-meta">
              <span>Job {node.jobId.slice(0, 8)}…</span>
              {node.outputsHash ? <span>Hash {shortHash(node.outputsHash)}</span> : null}
            </div>
          </div>

          <span className={`node-badge badge-${node.state.toLowerCase()}`}>{node.state}</span>
        </div>
      ))}
    </div>
  );
}

function LogStream({ events }: { events: { type: string; text: string; ts: string }[] }) {
  if (!events.length) {
    return (
      <div className="log-stream">
        <div className="log-placeholder">Awaiting execution events…</div>
      </div>
    );
  }

  return (
    <div className="log-stream">
      {events.map((event, index) => (
        <div key={`${event.ts}-${index}`} className={`log-line ${event.type}`}>
          <span className="log-time">{event.ts}</span>
          <span>{event.text}</span>
        </div>
      ))}
    </div>
  );
}

function QuickAiChat() {
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    if (!message.trim() || loading) return;

    setLoading(true);
    setReply(null);
    setError(null);

    try {
      const result: any = await apiPost('/api/ai/chat', { message });
      setReply(result.response);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="secondary-panel quick-chat">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LOCAL MODEL</span>
          <h3>Quick reasoning</h3>
        </div>
        <span className="model-chip">Local model</span>
      </div>

      <p className="helper-copy">Ask the local model a quick question without starting the full execution pipeline.</p>

      <div className="inline-form">
        <input
          type="text"
          placeholder="Ask the local model…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask();
          }}
        />

        <button className="btn btn-dark" onClick={ask} disabled={loading || !message.trim()}>
          {loading ? 'Asking…' : 'Ask'}
        </button>
      </div>

      {error ? <div className="inline-error">{error}</div> : null}
      {reply ? <div className="chat-reply">{reply}</div> : null}
    </section>
  );
}

function EvidencePanel({ citations }: { citations: Citation[] }) {
  if (!citations.length) {
    return (
      <div className="empty-state">
        <div className="empty-mark">⌁</div>
        <strong>No evidence yet</strong>
        <span>Verified citations will appear here after retrieval.</span>
      </div>
    );
  }

  return (
    <div className="panel-list">
      {citations.map((citation, index) => (
        <article key={`${citation.documentId}-${index}`} className="evidence-item">
          <div className="item-topline">
            <span className="source-type">SOURCE {String(index + 1).padStart(2, '0')}</span>
            <span className="verified-dot">●</span>
          </div>

          <div className="citation-title">{citation.documentTitle}</div>

          <div className="citation-meta">
            {citation.documentVersion ? `v${citation.documentVersion}` : 'Version unavailable'}
            {' · '}
            {citation.location || 'Location unavailable'}
            {' · '}
            {citation.retriever || 'local retriever'}
            {typeof citation.score === 'number' ? ` · ${citation.score.toFixed(3)}` : ''}
          </div>

          <div className="citation-excerpt">“{citation.excerpt}”</div>
        </article>
      ))}
    </div>
  );
}

function ArtifactsPanel({ artifacts, jobId }: { artifacts: ArtifactRecord[]; jobId: string | null }) {
  if (!jobId) {
    return (
      <div className="empty-state">
        <div className="empty-mark">□</div>
        <strong>No job selected</strong>
        <span>Artifacts will appear when the pipeline produces a deliverable.</span>
      </div>
    );
  }

  if (!artifacts.length) {
    return (
      <div className="empty-state">
        <div className="empty-mark">□</div>
        <strong>Artifacts</strong>
        <span>No artifacts yet. A final result or file will appear here when available.</span>
      </div>
    );
  }

  return (
    <div className="panel-list">
      {artifacts.map((artifact) => (
        <article key={artifact.id} className="artifact-item">
          <div className="file-icon">{artifact.type === 'XLSX' ? 'X' : artifact.type === 'PDF' ? 'P' : 'D'}</div>

          <div className="artifact-body">
            <div className="artifact-name">{artifact.filename}</div>
            <div className="artifact-meta">{artifact.type} · {artifact.sizeBytes ? `${artifact.sizeBytes} bytes` : 'Size unavailable'}</div>
          </div>

          <a className="icon-button" href={`${API_BASE}/api/artifacts/${artifact.id}/download`} download>
            ↓
          </a>
        </article>
      ))}
    </div>
  );
}

function SecurityPanel({ health }: { health: any }) {
  if (!health) {
    return (
      <div className="empty-state">
        <span className="spinner dark" />
        <strong>Reading system state…</strong>
      </div>
    );
  }

  const { sovereignMode, components, networkPolicy } = health;

  const rows = [
    ['Runtime', sovereignMode ? 'Sovereign mode' : 'Development mode', sovereignMode ? 'ok' : 'warn'],
    ['Model location', health?.components?.models?.[0]?.location ?? 'Local', 'ok'],
    ['Cloud inference', networkPolicy?.cloudInferenceAllowed ? 'Allowed' : 'Blocked', networkPolicy?.cloudInferenceAllowed ? 'warn' : 'ok'],
    ['Network policy', networkPolicy?.mode ?? 'Unavailable', sovereignMode ? 'ok' : 'warn'],
    ['Sandbox', components?.sandbox?.status ?? 'Unavailable', components?.sandbox?.status === 'UP' ? 'ok' : 'warn'],
    ['Database', components?.qdrant?.status ?? 'Unavailable', components?.qdrant?.status === 'UP' ? 'ok' : 'warn'],
    ['Audit', components?.audit?.status ?? 'Waiting', 'ok'],
  ];

  return (
    <div className="panel-list">
      <div className="security-card">
        <div className="eyebrow">SECURITY STATE</div>

        {rows.map(([label, value, tone]) => (
          <div className="security-row" key={String(label)}>
            <span>{String(label)}</span>
            <strong className={`tone-${String(tone)}`}>{String(value)}</strong>
          </div>
        ))}
      </div>

      <div className="security-note">
        <span className="note-mark">i</span>
        <span>Security status is derived from runtime checks. Monitoring is not presented as proof of network enforcement.</span>
      </div>

      {(components?.models ?? []).map((model: any) => (
        <div className="model-row" key={model.id ?? model.name ?? 'model'}>
          <div>
            <strong>{model.name ?? 'Model'}</strong>
            <span>{model.capabilities?.join(', ') ?? 'Capabilities unavailable'}</span>
          </div>

          <span className={`status-label ${model.available ? 'ok' : 'bad'}`}>
            {model.available ? 'READY' : 'UNAVAILABLE'}
          </span>
        </div>
      ))}
    </div>
  );
}

function AuditPanel({ jobId }: { jobId: string | null }) {
  const [events, setEvents] = useState<any[]>([]);
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchAudit = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);

    try {
      const data: any = await apiGet(`/api/jobs/${jobId}/audit`);
      setEvents(data.events ?? []);
    } catch {
      // Intentionally silent.
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const fetchReceipt = useCallback(async () => {
    if (!jobId) return;

    try {
      const data: any = await apiGet(`/api/jobs/${jobId}/receipt`);
      setReceipt(data);
    } catch {
      // Intentionally silent.
    }
  }, [jobId]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  if (!jobId) {
    return (
      <div className="empty-state">
        <div className="empty-mark">⌁</div>
        <strong>No job selected</strong>
        <span>Audit and provenance data will appear after a task starts.</span>
      </div>
    );
  }

  return (
    <div className="panel-list">
      <div className="audit-intro">
        <div className="eyebrow">AUDIT & PROVENANCE</div>
        <p>Execution history is recorded so the result can be independently checked later.</p>
      </div>

      <div className="audit-actions">
        <button className="btn btn-light" onClick={fetchAudit}>Refresh</button>
        <button className="btn btn-dark" onClick={fetchReceipt}>Verify receipt</button>
      </div>

      {loading ? <div className="loading-line"><span className="spinner dark" />Reading audit chain…</div> : null}

      {receipt ? (
        <div className="receipt-card">
          <div className="eyebrow">SIGNED EXECUTION RECEIPT</div>
          <div className="receipt-status">{receipt.valid === false ? 'INVALID / TAMPERED' : 'VERIFIED'}</div>

          <dl>
            <div>
              <dt>Execution ID</dt>
              <dd>{receipt.jobId ?? jobId}</dd>
            </div>
            <div>
              <dt>Root hash</dt>
              <dd>{receipt.rootHash ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Signature</dt>
              <dd>{receipt.signature ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Key ID</dt>
              <dd>{receipt.keyId ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{receipt.valid === false ? 'INVALID' : (receipt.status ?? 'VERIFIED')}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="empty-state compact">
          <div className="empty-mark">⌁</div>
          <strong>Awaiting execution receipt</strong>
          <span>Audit data will appear after the backend records the job.</span>
        </div>
      )}

      {!events.length ? (
        <div className="empty-state compact">No audit events yet.</div>
      ) : (
        events.map((event) => (
          <article className="audit-item" key={event.id ?? `${event.seq ?? 0}-${event.eventType}`}>
            <div className="audit-item-head">
              <strong>#{event.seq ?? 0} {event.eventType}</strong>
              <span>{event.createdAt?.slice(11, 19)}</span>
            </div>

            <div className="hash-text">IN {event.inputHash ? event.inputHash.slice(0, 24) + '…' : '—'}</div>
            <div className="hash-text">OUT {event.outputHash ? event.outputHash.slice(0, 24) + '…' : '—'}</div>
            <div className="hash-text">BLK {event.blockHash ? event.blockHash.slice(0, 24) + '…' : '—'}</div>
          </article>
        ))
      )}
    </div>
  );
}

function KnowledgeView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Citation[]>([]);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [version, setVersion] = useState('1.0');

  const search = async () => {
    if (!query.trim()) return;

    setLoading(true);

    try {
      const data: any = await apiGet(`/api/knowledge/search?query=${encodeURIComponent(query)}`);
      setResults(data.citations ?? []);
    } catch {
      // Silent.
    } finally {
      setLoading(false);
    }
  };

  const ingest = async () => {
    try {
      await apiPost('/api/knowledge/ingest', {
        title,
        content,
        version,
      });

      setTitle('');
      setContent('');
      alert('Document ingested.');
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <span className="eyebrow">KNOWLEDGE & RAG</span>
        <h1>Controlled engineering sources.</h1>
        <p>Search controlled engineering sources and add versioned documents for retrieval.</p>
      </div>

      <section className="secondary-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">RETRIEVAL</span>
            <h3>Search SOPs and standards</h3>
          </div>
        </div>

        <div className="inline-form">
          <input
            type="search"
            placeholder="Search SOPs, standards, policies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search();
            }}
          />

          <button className="btn btn-dark" onClick={search} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {results.length > 0 ? (
          <div className="results-list">
            {results.map((result, index) => (
              <div className="evidence-item" key={`${result.documentId}-${index}`}>
                <div className="citation-title">{result.documentTitle}</div>
                <div className="citation-meta">
                  v{result.documentVersion}
                  {' · '}
                  {result.location}
                  {' · '}
                  {result.score.toFixed(3)}
                </div>
                <div className="citation-excerpt">“{result.excerpt}”</div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="secondary-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">INGEST</span>
            <h3>Add a controlled source</h3>
          </div>
        </div>

        <div className="form-stack">
          <input type="text" placeholder="Document title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input type="text" placeholder="Version" value={version} onChange={(e) => setVersion(e.target.value)} />
          <textarea className="standard-textarea" placeholder="Document content…" value={content} onChange={(e) => setContent(e.target.value)} />
          <button className="btn btn-dark align-start" onClick={ingest}>Ingest source</button>
        </div>
      </section>
    </div>
  );
}

function ToolsView() {
  const [tools, setTools] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [input, setInput] = useState('{}');
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    apiGet<{ tools: any[] }>('/api/tools')
      .then((data) => setTools(data.tools))
      .catch(() => {});
  }, []);

  const execute = async () => {
    if (!selected) return;

    try {
      const parsed = JSON.parse(input);
      const data = await apiPost<any>(`/api/tools/${selected.id}/execute`, { input: parsed });
      setResult(data);
    } catch (e: any) {
      setResult({ error: e.message });
    }
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <span className="eyebrow">OPERATIONS</span>
        <h1>Tool gateway.</h1>
        <p>Inspect available deterministic tools and execute them through the controlled gateway.</p>
      </div>

      <div className="tool-list">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`tool-card ${selected?.id === tool.id ? 'selected' : ''}`}
            onClick={() => {
              setSelected(tool);
              setResult(null);
            }}
          >
            <div>
              <strong>{tool.name}</strong>
              <span>{tool.description}</span>
            </div>

            <span className={`risk-tag ${tool.riskLevel === 'HIGH' ? 'high' : 'normal'}`}>
              {tool.riskLevel}
            </span>
          </button>
        ))}
      </div>

      {selected ? (
        <section className="secondary-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">TOOL EXECUTION</span>
              <h3>{selected.name}</h3>
            </div>
          </div>

          <textarea className="standard-textarea mono-area" value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn btn-dark align-start" onClick={execute}>Execute tool</button>

          {result ? <pre className="result-box">{JSON.stringify(result, null, 2)}</pre> : null}
        </section>
      ) : null}
    </div>
  );
}

export default function App() {
  const [navView, setNavView] = useState<NavView>('workbench');
  const [rightTab, setRightTab] = useState<RightTab>('evidence');
  const [prompt, setPrompt] = useState('');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('LOW');
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [logs, setLogs] = useState<{ type: string; text: string; ts: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const currentJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentJobIdRef.current = currentJob?.id ?? null;
  }, [currentJob?.id]);

  const pushLog = useCallback((type: string, text: string) => {
    setLogs((previous) => [...previous.slice(-99), { type, text, ts: new Date().toLocaleTimeString() }]);
  }, []);

  const wsConnected = useWebSocket((event: WsEvent) => {
    const { event: eventType, payload } = event;
    const currentJobId = currentJobIdRef.current;

    if (payload?.jobId) {
      if (!currentJobId) return;
      if (payload.jobId !== currentJobId) return;
    }

    if (eventType === 'job.started') {
      if (!payload?.jobId) return;
      pushLog('job', `Job started · ${payload.jobId.slice(0, 12)}…`);
    }

    if (eventType === 'job.running') {
      if (!payload?.jobId) return;
      pushLog('job', `Job running · ${payload.jobId.slice(0, 12)}…`);
    }

    if (eventType === 'job.completed') {
      if (!payload?.jobId) return;
      pushLog('success', `Job completed · ${payload.jobId.slice(0, 12)}…`);
    }

    if (eventType === 'job.failed') {
      pushLog('error', `Job failed · ${payload?.reason ?? 'Unknown error'}`);
    }

    if (eventType === 'node.started') {
      if (!payload?.jobId) return;
      pushLog('node', `${payload.type ?? 'NODE'} · running`);
    }

    if (eventType === 'node.completed') {
      if (!payload?.jobId) return;
      pushLog('node', `${payload.type ?? 'NODE'} · ${payload.state}`);

      setCurrentJob((previous) => {
        if (!previous || previous.id !== payload.jobId) return previous;

        return {
          ...previous,
          nodes: previous.nodes.map((node) =>
            node.id === payload.nodeId
              ? { ...node, state: payload.state, outputsHash: payload.outputsHash, updatedAt: new Date().toISOString() }
              : node,
          ),
        };
      });
    }

    if (eventType === 'node.failed') {
      if (!payload?.jobId) return;
      pushLog('error', `${payload.type ?? 'NODE'} · FAILED · ${payload.failureReason ?? 'Unknown error'}`);

      setCurrentJob((previous) => {
        if (!previous || previous.id !== payload.jobId) return previous;

        return {
          ...previous,
          nodes: previous.nodes.map((node) =>
            node.id === payload.nodeId
              ? { ...node, state: 'FAILED', updatedAt: new Date().toISOString() }
              : node,
          ),
        };
      });
    }

    if (eventType === 'job.plan_created') {
      if (!payload?.jobId) return;
      setCurrentJob((previous) => {
        if (!previous || previous.id !== payload.jobId) return previous;
        return { ...previous, nodes: Array.isArray(payload.plan) ? payload.plan : previous.nodes };
      });
    }

    if (eventType === 'security.alert') {
      pushLog('error', `Security alert · ${payload?.message ?? 'Security alert'}`);
    }
  });

  useEffect(() => {
    const tick = () => {
      apiGet<any>('/api/health')
        .then(setHealth)
        .catch(() => {});
    };

    tick();
    const interval = setInterval(tick, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!currentJob?.id) return;

    apiGet<any>(`/api/jobs/${currentJob.id}`)
      .then((job) => setCurrentJob((previous) => previous ? { ...previous, ...job } : job))
      .catch(() => {});
  }, [currentJob?.id]);

  const submitJob = async () => {
    if (!prompt.trim()) return;

    setSubmitting(true);

    setCitations([]);
    setArtifacts([]);
    setLogs([]);
    setCurrentJob(null);

    try {
      // Submit task intent without hardcoding capabilities.
      // Backend will use CapabilitySelector to choose appropriate capabilities.
      const job = await apiPost<Job>('/api/jobs', {
        intent: prompt,
        riskLevel,
      });

      setCurrentJob(job);
      pushLog('job', `Submitted job · ${job.id?.slice(0, 12)}…`);
    } catch (e: any) {
      pushLog('error', `Request failed · ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const plannedCapabilities = (currentJob?.request?.capabilities as Capability[] | undefined) ?? [];

  const trustedResultText = useMemo(() => {
    if (!currentJob) {
      return 'No verified result yet. The system is still processing the task.';
    }

    if (currentJob.status === 'FAILED') {
      return 'Execution failed. A trusted result could not be produced.';
    }

    if (currentJob.status === 'BLOCKED') {
      return 'Result blocked. A safety or policy gate stopped the pipeline.';
    }

    if (currentJob.status === 'PARTIAL') {
      return 'Partial result. Verification did not complete for all required checks.';
    }

    if (currentJob.status === 'COMPLETED' || currentJob.status === 'SUCCESS' || currentJob.status === 'VERIFIED') {
      return 'Execution completed. Review the evidence and audit record before accepting the result.';
    }

    return 'Execution is in progress. The verified result will appear when the pipeline completes.';
  }, [currentJob]);

  const isSovereign = Boolean(health?.sovereignMode);

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-title">Sovereign</div>
            <div className="brand-subtitle">Industrial AI Workbench</div>
          </div>
        </div>

        <div className="topbar-context">
          <span className="crumb">SIH 2026</span>
          <span className="crumb-separator">/</span>
          <strong>{navView === 'workbench' ? 'Workbench' : navView === 'knowledge' ? 'Knowledge & RAG' : 'Tool Gateway'}</strong>
        </div>

        <div className="topbar-search">
          <span>⌕</span>
          <span>Search parameters, documents or telemetry…</span>
          <kbd>Ctrl K</kbd>
        </div>

        <div className="topbar-right">
          <span className={`state-pill ${isSovereign ? 'sovereign' : 'dev'}`}>
            <span className="live-dot" />
            {isSovereign ? 'SOVEREIGN' : 'DEV MODE'}
          </span>

          <span className="topbar-stat">WS {wsConnected ? 'LIVE' : 'OFFLINE'}</span>
          <span className="topbar-stat">API {health?.components?.api?.status === 'UP' ? 'READY' : '—'}</span>

          <div className="avatar">LR</div>
        </div>
      </header>

      <aside className="sidebar">
        <div>
          <div className="sidebar-group">
            <div className="sidebar-label">WORK</div>
            <button className={`nav-item ${navView === 'workbench' ? 'active' : ''}`} onClick={() => setNavView('workbench')}>
              <span>◈</span>
              Workbench
            </button>
            <button className={`nav-item ${navView === 'knowledge' ? 'active' : ''}`} onClick={() => setNavView('knowledge')}>
              <span>▣</span>
              Knowledge & RAG
            </button>
          </div>

          <div className="sidebar-group">
            <div className="sidebar-label">OPERATIONS</div>
            <button className={`nav-item ${navView === 'tools' ? 'active' : ''}`} onClick={() => setNavView('tools')}>
              <span>⌘</span>
              Tool Gateway
            </button>
            <button className="nav-item" onClick={() => setRightTab('security')}>
              <span>◇</span>
              Security State
            </button>
          </div>

          <div className="sidebar-group">
            <div className="sidebar-label">PROOF</div>
            <button className="nav-item" onClick={() => setRightTab('evidence')}>
              <span>⌁</span>
              Evidence
            </button>
            <button className="nav-item" onClick={() => setRightTab('audit')}>
              <span>⌁</span>
              Audit & Governance
            </button>
            <button className="nav-item" onClick={() => setRightTab('artifacts')}>
              <span>□</span>
              Artifacts
            </button>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="enclave-card">
            <div className="eyebrow">ENCLAVE STATE</div>
            <div className="enclave-status">
              <span className="live-dot" />
              {isSovereign ? 'Sovereign runtime' : 'Development runtime'}
            </div>

            <div className="proof-line">
              <span>Proof root</span>
              <strong>{currentJob?.id ? `${currentJob.id.slice(0, 12)}…` : 'Awaiting job'}</strong>
            </div>
          </div>

          <div className="sidebar-version">SOVEREIGN v1.0 · SIH 2026</div>
        </div>
      </aside>

      <main className="main-content">
        {navView === 'workbench' && (
          <>
            <section className="hero panel">
              <div>
                <span className="eyebrow">SOVEREIGN INDUSTRIAL AI WORKBENCH</span>
                <h1>Engineering intelligence,<br />without the cloud.</h1>
                <p>Turn an industrial problem into a verified result using local AI, deterministic tools, controlled knowledge and traceable evidence.</p>
              </div>

              <div className="hero-side">
                <span>LOCAL MODELS</span>
                <span>DETERMINISTIC TOOLS</span>
                <span>VERIFIED EVIDENCE</span>
              </div>
            </section>

            <section className="info-stack">
              <div className="panel workflow-card">
                <div className="section-kicker">HOW IT WORKS</div>
                <div className="flow-steps">
                  {[
                    ['01', 'UNDERSTAND', 'The system interprets the request.'],
                    ['02', 'PLAN', 'Required capabilities are selected automatically.'],
                    ['03', 'EXECUTE', 'Local AI and deterministic tools perform the work.'],
                    ['04', 'VERIFY', 'The result is checked before being trusted.'],
                    ['05', 'PROVE', 'Evidence and execution history are recorded.'],
                    ['06', 'DELIVER', 'The verified result or artifact is returned.'],
                  ].map(([step, title, text]) => (
                    <div className="flow-step" key={step}>
                      <span className="flow-number">{step}</span>
                      <div className="flow-labels">
                        <strong>{title}</strong>
                        <small>{text}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel status-card">
                <div className="section-kicker">LOCAL RUNTIME</div>
                <div className="status-grid">
                  <div>
                    <span>Model</span>
                    <strong>{health?.components?.models?.[0]?.name ?? 'Waiting for runtime'}</strong>
                  </div>
                  <div>
                    <span>Location</span>
                    <strong>Local</strong>
                  </div>
                  <div>
                    <span>Network</span>
                    <strong>{health?.networkPolicy?.cloudInferenceAllowed ? 'Cloud inference allowed' : 'No cloud inference'}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong className={health?.components?.models?.some((m: any) => m.available) ? 'status-ready' : 'status-unavailable'}>
                      {health?.components?.models?.some((m: any) => m.available) ? 'Ready' : 'Waiting for runtime'}
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel orchestrator">
              <div className="orchestrator-head">
                <div>
                  <div className="section-kicker">TASK ORCHESTRATOR</div>
                  <h2>What do you need to solve?</h2>
                </div>

                <div className="risk-control">
                  <span>Risk</span>
                  <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as RiskLevel)}>
                    {RISK_OPTIONS.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
              </div>

              <textarea
                className="hero-input"
                placeholder="Describe an engineering or industrial task…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />

              <div className="helper-text">
                Example: Calculate required pipe wall thickness using the supplied design parameters and the applicable engineering standard.
              </div>

              <div className="orchestrator-actions">
                <button className="btn btn-dark run-button" onClick={submitJob} disabled={submitting || !prompt.trim()}>
                  {submitting ? (
                    <>
                      <span className="spinner" />
                      Running…
                    </>
                  ) : (
                    <>
                      Run sovereign pipeline
                      <span className="cta-arrow">→</span>
                    </>
                  )}
                </button>
              </div>
            </section>

            <section className="panel system-plan">
              <div className="section-kicker">SYSTEM PLAN</div>
              {plannedCapabilities.length ? (
                <>
                  <h3>System-selected execution plan</h3>
                  <div className="plan-list">
                    {plannedCapabilities.map((capability) => (
                      <div className="plan-item" key={capability}>
                        <span className="plan-check">✓</span>
                        <div>
                          <strong>{CAPABILITY_DETAILS[capability]?.label ?? capability}</strong>
                          <small>{CAPABILITY_DETAILS[capability]?.description ?? 'Required capability selected by the backend planner.'}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <h3>Current backend capability selection</h3>
                  <div className="plan-empty">This build currently initializes new jobs with the default GENERAL_REASONING capability; capability selection is not yet automated beyond that static fallback.</div>
                </>
              )}
            </section>

            <div className="main-lower-grid">
              <section className="panel execution-panel">
                <div className="section-kicker">WHAT THE WORKBENCH IS DOING</div>
                <h3>Execution stages</h3>
                <ExecutionGraph nodes={currentJob?.nodes ?? []} />
                <LogStream events={logs} />
              </section>

              <section className="panel trusted-result-panel">
                <div className="section-kicker">TRUSTED RESULT</div>
                <h3>Verified outcome</h3>
                <div className="result-state">
                  {trustedResultText}
                </div>
                <div className="result-summary">
                  {currentJob ? `Job ${currentJob.id.slice(0, 12)}…` : 'Awaiting execution'}
                </div>
              </section>
            </div>

            <div className="lower-grid">
              <QuickAiChat />
            </div>
          </>
        )}

        {navView === 'knowledge' && <KnowledgeView />}
        {navView === 'tools' && <ToolsView />}
      </main>

      <aside className="right-rail">
        <div className="right-tabs">
          {(['evidence', 'artifacts', 'security', 'audit'] as RightTab[]).map((tab) => (
            <button
              key={tab}
              className={`tab-button ${rightTab === tab ? 'active' : ''}`}
              onClick={() => setRightTab(tab)}
            >
              {tab === 'evidence' ? 'Evidence' : tab === 'artifacts' ? 'Artifacts' : tab === 'security' ? 'Security' : 'Audit'}
            </button>
          ))}
        </div>

        {rightTab === 'evidence' && <EvidencePanel citations={citations} />}
        {rightTab === 'artifacts' && <ArtifactsPanel artifacts={artifacts} jobId={currentJob?.id ?? null} />}
        {rightTab === 'security' && <SecurityPanel health={health} />}
        {rightTab === 'audit' && <AuditPanel jobId={currentJob?.id ?? null} />}
      </aside>
    </div>
  );
}