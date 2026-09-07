import { Router, Request, Response } from 'express';
import { deliverableService } from '../deliverables/DeliverableService';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

// GET /api/artifacts?jobId=
router.get('/', (req: Request, res: Response) => {
  const { jobId } = req.query;
  if (!jobId) return res.status(400).json({ error: 'INPUT_ERROR: jobId required' });
  const artifacts = deliverableService.listArtifacts(String(jobId));
  return res.json({ artifacts });
});

// GET /api/artifacts/:id
router.get('/:id', (req: Request, res: Response) => {
  const artifact = deliverableService.getArtifact(req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
  return res.json(artifact);
});

// GET /api/artifacts/:id/download
router.get('/:id/download', (req: Request, res: Response) => {
  const artifact = deliverableService.getArtifact(req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
  const dir = process.env.ARTIFACTS_DIR ?? path.join(process.cwd(), 'artifacts');
  const filePath = path.join(dir, artifact.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
  return res.download(filePath, artifact.filename);
});

// POST /api/artifacts/:id/verify
router.post('/:id/verify', (req: Request, res: Response) => {
  try {
    const result = deliverableService.verifyArtifact(req.params.id);
    return res.json({ ...result, artifactId: req.params.id, verdict: result.valid ? 'INTEGRITY_PASS' : 'INTEGRITY_FAIL' });
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// POST /api/artifacts/generate/report
router.post('/generate/report', async (req: Request, res: Response) => {
  try {
    const { jobId, title, sections, citations, executionId } = req.body;
    if (!jobId || !title || !sections) return res.status(400).json({ error: 'INPUT_ERROR: jobId, title, sections required' });
    const artifact = await deliverableService.generateReport(jobId, title, sections, citations ?? [], executionId ?? jobId);
    return res.json(artifact);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export { router as artifactsRouter };
