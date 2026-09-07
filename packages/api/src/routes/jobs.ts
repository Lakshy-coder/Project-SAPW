import { Router, Request, Response } from 'express';
import { auditService } from '../audit/AuditService';
import { JobManager } from '../orchestrator/JobManager';

const router = Router();

// GET /api/jobs/:jobId/audit  – full audit chain
router.get('/:jobId/audit', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const chain = auditService.getChain(jobId);
  return res.json({ jobId, events: chain, count: chain.length });
});

// GET /api/jobs/:jobId/receipt  – sealed signed receipt
router.get('/:jobId/receipt', (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const receipt = auditService.seal(jobId);
    return res.json(receipt);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// GET /api/jobs/:jobId  – job status
router.get('/:jobId', async (req: Request, res: Response) => {
  const job = await JobManager.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  return res.json(job);
});

export { router as jobsRouter };
