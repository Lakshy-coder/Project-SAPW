import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';
import { ModelRouter } from '../src/models/ModelRouter';
import { ragService } from '../src/rag/RagService';

// Representative RAG mock with 3 chunks (matching topK=3 policy)
const mockRagResponse = {
  context: 'ASME Section VIII Div 1 states minimum thickness requirements.\n\nASME B31.3 process piping applies to most refinery pipework.\n\nWeld joint efficiency factor E is specified in Table 302.3.5.',
  citations: [
    {
      documentId: 'asme-viii-1',
      documentTitle: 'ASME Section VIII Div 1',
      documentVersion: '2021',
      chunkId: 'chunk-1',
      location: 'Part UG-27',
      excerpt: 'ASME Section VIII Div 1 states minimum thickness requirements.',
      score: 0.95,
      retriever: 'bm25'
    },
    {
      documentId: 'asme-b31-3',
      documentTitle: 'ASME B31.3',
      documentVersion: '2022',
      chunkId: 'chunk-5',
      location: 'Section 304.1.2',
      excerpt: 'ASME B31.3 process piping applies to most refinery pipework.',
      score: 0.88,
      retriever: 'bm25'
    },
    {
      documentId: 'asme-b31-3',
      documentTitle: 'ASME B31.3',
      documentVersion: '2022',
      chunkId: 'chunk-9',
      location: 'Table 302.3.5',
      excerpt: 'Weld joint efficiency factor E is specified in Table 302.3.5.',
      score: 0.77,
      retriever: 'bm25'
    }
  ],
  retrieverUsed: 'bm25' as const,
  documentCount: 3,
  status: 'READY' as const
};

describe('RAG-to-Reasoning execution flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes RAG context, citations, and deterministic results to REASONING node', async () => {
    const routeSpy = vi.spyOn(ModelRouter, 'route').mockResolvedValue('Model response based on evidence');

    vi.spyOn(ragService, 'search').mockResolvedValue(mockRagResponse);

    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const token = loginRes.body.session.token as string;

    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        intent: 'Calculate thickness and use RAG context',
        capabilities: ['ASME_CALCULATION', 'SOP_RETRIEVAL', 'GENERAL_REASONING'],
        rawRequest: { designPressureMPa: 1.5, outsideDiameterMM: 200, allowableStressMPa: 100 }
      });

    const jobId = createRes.body.id as string;

    let final: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      const res = await request(app).get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
      final = res.body;
      if (final.status !== 'QUEUED' && final.status !== 'RUNNING') break;
    }

    expect(final.status).toBe('COMPLETED');

    // ── RAG node grounding checks ──────────────────────────────────────────────
    const sopNode = final.nodes.find((n: any) => n.type === 'SOP_RETRIEVAL');
    expect(sopNode.result.context).toContain('ASME Section VIII Div 1');
    expect(sopNode.result.citations.length).toBe(3); // 3 citations = topK=3

    // ── REASONING prompt composition checks ───────────────────────────────────
    expect(routeSpy).toHaveBeenCalled();
    const promptPassedToModel = routeSpy.mock.calls[0][1];

    expect(promptPassedToModel).toContain('USER TASK:');
    expect(promptPassedToModel).toContain('Calculate thickness and use RAG context');

    // Compact ASME format (not pretty-printed JSON)
    expect(promptPassedToModel).toContain('DETERMINISTIC ENGINEERING RESULT (authoritative');
    expect(promptPassedToModel).toContain('t_min =');
    expect(promptPassedToModel).toContain('ASME B31.3');
    // Verify it is NOT verbose pretty-printed JSON
    expect(promptPassedToModel).not.toContain('"minimumRequiredThicknessMM"');

    // RAG evidence is present
    expect(promptPassedToModel).toContain('RETRIEVED KNOWLEDGE / SOP EVIDENCE:');
    expect(promptPassedToModel).toContain('ASME Section VIII Div 1');

    // Citations are compact text lines, not JSON blobs
    expect(promptPassedToModel).toContain('CITATIONS:');
    expect(promptPassedToModel).toContain('[1]');
    expect(promptPassedToModel).toContain('[2]');
    expect(promptPassedToModel).toContain('[3]');
    // Verify NOT pretty-printed JSON citations
    expect(promptPassedToModel).not.toContain('"documentId"');

    // Concise instruction is present
    expect(promptPassedToModel).toContain('concise engineering explanation');
    expect(promptPassedToModel).toContain('Do not recalculate the deterministic result');
    expect(promptPassedToModel).toContain('Do not invent or fabricate source references');

    // Prompt is kept within reasonable size for local inference
    expect(promptPassedToModel.length).toBeLessThan(3000);
  });

  it('ASME result is still present and verifiable in the final job result', async () => {
    vi.spyOn(ModelRouter, 'route').mockResolvedValue('Minimum required thickness is 1.4911 mm per ASME B31.3-2022.');
    vi.spyOn(ragService, 'search').mockResolvedValue(mockRagResponse);

    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const token = loginRes.body.session.token as string;

    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        intent: 'Calculate required pipe wall thickness',
        capabilities: ['ASME_CALCULATION', 'SOP_RETRIEVAL', 'GENERAL_REASONING'],
        rawRequest: { designPressureMPa: 1.5, outsideDiameterMM: 200, allowableStressMPa: 100, weldJointFactor: 1, yCoefficient: 0.4 }
      });

    const jobId = createRes.body.id as string;

    let final: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      const res = await request(app).get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
      final = res.body;
      if (final.status !== 'QUEUED' && final.status !== 'RUNNING') break;
    }

    expect(final.status).toBe('COMPLETED');

    // The authoritative deterministic result must still be 1.4911
    expect(final.result?.answer).toContain('1.4911');

    // ASME node must be VERIFIED
    const asmeNode = final.nodes.find((n: any) => n.type === 'ASME_CALCULATION');
    expect(asmeNode.state).toBe('VERIFIED');
    expect(asmeNode.result.minimumRequiredThicknessMM).toBe(1.4911);
    expect(asmeNode.verification.status).toBe('PASS');
  });

  it('works when RAG returns EMPTY — no fabricated citations', async () => {
    const routeSpy = vi.spyOn(ModelRouter, 'route').mockResolvedValue('Model response based on NO evidence');

    vi.spyOn(ragService, 'search').mockResolvedValue({
      context: '',
      citations: [],
      retrieverUsed: 'bm25' as const,
      documentCount: 0,
      status: 'EMPTY' as const
    });

    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const token = loginRes.body.session.token as string;

    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        intent: 'Calculate thickness and use RAG context',
        capabilities: ['SOP_RETRIEVAL', 'GENERAL_REASONING']
      });

    const jobId = createRes.body.id as string;

    let final: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      const res = await request(app).get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
      final = res.body;
      if (final.status !== 'QUEUED' && final.status !== 'RUNNING') break;
    }

    expect(final.status).toBe('COMPLETED');
    const sopNode = final.nodes.find((n: any) => n.type === 'SOP_RETRIEVAL');
    expect(sopNode.result.context).toBe('');
    expect(sopNode.result.citations.length).toBe(0);

    expect(routeSpy).toHaveBeenCalled();
    const promptPassedToModel = routeSpy.mock.calls[0][1];
    // With empty RAG: no fabricated citations or evidence sections
    expect(promptPassedToModel).not.toContain('CITATIONS:');
    expect(promptPassedToModel).not.toContain('RETRIEVED KNOWLEDGE / SOP EVIDENCE:');
  });

  it('RagService.search is called with topK=3', async () => {
    const searchSpy = vi.spyOn(ragService, 'search').mockResolvedValue({
      context: 'Some context',
      citations: [{ documentId: 'd1', documentTitle: 'T', documentVersion: '1', chunkId: 'c1', location: 'loc', excerpt: 'ex', score: 0.9, retriever: 'bm25' as const }],
      retrieverUsed: 'bm25' as const,
      documentCount: 1,
      status: 'READY' as const
    });
    vi.spyOn(ModelRouter, 'route').mockResolvedValue('response');

    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    const token = loginRes.body.session.token as string;

    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ intent: 'topK test', capabilities: ['SOP_RETRIEVAL', 'GENERAL_REASONING'] });

    const jobId = createRes.body.id as string;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      const res = await request(app).get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
      if (res.body.status !== 'QUEUED' && res.body.status !== 'RUNNING') break;
    }

    // Must have been called with topK = 3
    expect(searchSpy).toHaveBeenCalledWith(expect.any(String), 3);
  });
});
