import { describe, it, expect } from 'vitest';
import { JobManager } from '../src/orchestrator/JobManager';

describe('Job persistence', () => {
  it('persists and retrieves a job across updates', async () => {
    const id = 'persisted-job-1';
    const request = {
      id,
      intent: 'Persist a job',
      capabilities: ['GENERAL_REASONING'],
      riskLevel: 'LOW'
    } as any;

    const created = await JobManager.createJob(request, 'user-1', 'project-1');
    await JobManager.updateJobStatus(id, 'RUNNING');
    const stored = await JobManager.getJob(id);

    expect(created.id).toBe(id);
    expect(stored?.status).toBe('RUNNING');
  });
});
