import { Router, Request, Response } from 'express';
import { auditService } from '../audit/AuditService';
import { JobManager } from '../orchestrator/JobManager';
import { getExecutionGraph } from '../orchestrator/ExecutionCoordinator';
import { requireAuth, requirePermission, AuthenticatedRequest } from '../auth/middleware';

const router = Router();

// POST /api/jobs - create a new job (requires authentication and permission)
router.post('/', requireAuth, requirePermission('jobs:create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const projectId = req.headers['x-project-id'] as string || 'default';
    const request = {
      ...req.body,
      userPermissions: req.user!.permissions // Pass user permissions for policy evaluation
    };
    
    const executionGraph = getExecutionGraph();
    const job = executionGraph
      ? await executionGraph.createAndQueueJob(request, userId, projectId)
      : await JobManager.createJob(request, userId, projectId);

    return res.status(202).json(job);  // 202 Accepted - job accepted, processing asynchronously
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/jobs/:jobId/audit  – full audit chain (requires auth)
router.get('/:jobId/audit', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { jobId } = req.params;
  const chain = auditService.getChain(jobId);
  return res.json({ jobId, events: chain, count: chain.length });
});

// GET /api/jobs/:jobId/receipt  – sealed signed receipt (requires auth)
router.get('/:jobId/receipt', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { jobId } = req.params;
    const receipt = await auditService.seal(jobId);
    return res.json(receipt);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// GET /api/jobs/:jobId  – job status (requires auth)
router.get('/:jobId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const job = await JobManager.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  return res.json(job);
});

export { router as jobsRouter };
