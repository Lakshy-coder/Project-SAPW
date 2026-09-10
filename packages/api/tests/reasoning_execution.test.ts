import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';
import { ModelRouter } from '../src/models/ModelRouter';

describe('General reasoning execution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists a reasoning result to job.result for a GENERAL_REASONING task', async () => {
    vi.spyOn(ModelRouter, 'route').mockResolvedValue(
      'A compiler translates source code into machine code before execution, while an interpreter reads and executes instructions directly at runtime.'
    );

    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.session.token as string;

    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        intent: 'Explain the difference between a compiler and an interpreter in simple terms.',
        capabilities: ['GENERAL_REASONING']
      });

    expect(createRes.status).toBe(202);
    const jobId = createRes.body.id as string;

    let final: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      const res = await request(app).get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      final = res.body;
      if (final.status !== 'QUEUED') break;
    }

    expect(final).not.toBeNull();
    expect(final.status).not.toBe('QUEUED');
    expect(final.result).toBeDefined();
    expect(final.result.answer).toContain('compiler');
    expect(final.result.answer).toContain('interpreter');
    expect(final.result.answer).not.toContain('VERIFIED DETERMINISTIC ENGINEERING RESULT');
    expect(final.nodes.some((node: any) => node.type === 'REASONING')).toBe(true);
  });
});
