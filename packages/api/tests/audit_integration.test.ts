import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';
import { PrismaClient } from '@prisma/client';

describe('Audit integration (live execution)', () => {
  it('creates audit events and seals a receipt for an executed job', async () => {
    // Login
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.session.token as string;

    // Create job with required parameters so nodes can run
    const jobReq = {
      intent: 'Audit integration test',
      capabilities: ['ASME_CALCULATION'],
      rawRequest: { designPressureMPa: 1.5, outsideDiameterMM: 200, allowableStressMPa: 100 }
    };

    const createRes = await request(app).post('/api/jobs').set('Authorization', `Bearer ${token}`).send(jobReq);
    expect(createRes.status).toBe(202);
    const job = createRes.body;
    expect(job).toHaveProperty('id');
    const jobId = job.id as string;

    // Poll until terminal state
    let final: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      const res = await request(app).get(`/api/jobs/${jobId}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      final = res.body;
      if (final.status !== 'QUEUED' && final.status !== 'RUNNING') break;
    }

    expect(final).not.toBeNull();
    expect(['COMPLETED', 'BLOCKED', 'FAILED']).toContain(final.status);

    // Fetch audit chain
    const auditRes1 = await request(app).get(`/api/jobs/${jobId}/audit`).set('Authorization', `Bearer ${token}`);
    expect(auditRes1.status).toBe(200);
    expect(auditRes1.body).toHaveProperty('events');
    const events = auditRes1.body.events as any[];
    expect(events.length).toBeGreaterThan(0);
    // All events must reference the same jobId and seq must be ordered
    expect(events.every(e => e.jobId === jobId)).toBe(true);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].seq).toBeGreaterThan(events[i - 1].seq - 1);
    }

    // Re-fetch audit — should not create duplicates
    const auditRes2 = await request(app).get(`/api/jobs/${jobId}/audit`).set('Authorization', `Bearer ${token}`);
    expect(auditRes2.status).toBe(200);
    expect(auditRes2.body.count).toBe(auditRes1.body.count);

    // Request receipt — should succeed when chain exists
    const receiptRes = await request(app).get(`/api/jobs/${jobId}/receipt`).set('Authorization', `Bearer ${token}`);
    // Receipt may return 404 if chain missing; fail the test if so
    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body).toHaveProperty('rootHash');
    expect(receiptRes.body).toHaveProperty('signature');
    expect(receiptRes.body).toHaveProperty('events');

    // DB-backed persistence check (only when DATABASE_URL is configured)
    if (process.env.DATABASE_URL) {
      const prisma = new PrismaClient();
      try {
        const auditRows = await prisma.auditEvent.count({ where: { jobId } });
        const receiptRow = await prisma.executionReceipt.findUnique({ where: { jobId } });
        expect(auditRows).toBeGreaterThan(0);
        expect(receiptRow).not.toBeNull();
        expect(receiptRow?.rootHash).toBe(receiptRes.body.rootHash);
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
