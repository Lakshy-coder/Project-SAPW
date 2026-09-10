import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';

describe('Execution lifecycle', () => {
  it('POST /api/jobs triggers background execution (job leaves QUEUED)', async () => {
    // Login as admin
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.session.token as string;

    // Create job
    const jobReq = {
      intent: 'Test execution lifecycle',
      capabilities: ['ASME_CALCULATION'],
      rawRequest: { designPressureMPa: 1.5, outsideDiameterMM: 200, allowableStressMPa: 100 }
    };

    const createRes = await request(app).post('/api/jobs').set('Authorization', `Bearer ${token}`).send(jobReq);
    expect(createRes.status).toBe(202);
    const job = createRes.body;
    expect(job).toHaveProperty('id');
    const jobId = job.id as string;

    // Poll until status changes from QUEUED or timeout
    let final: any = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 200));
      const res = await request(app).get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      final = res.body;
      if (final.status !== 'QUEUED') break;
    }

    expect(final).not.toBeNull();
    expect(final.status).not.toBe('QUEUED');
    expect(Array.isArray(final.nodes)).toBe(true);
    expect(final.nodes.length).toBeGreaterThan(0);
  });
});
