import { Router, Request, Response } from 'express';
import { auditService } from '../audit/AuditService';

const router = Router();

// POST /api/audit/verify  – verify an execution receipt offline
router.post('/verify', (req: Request, res: Response) => {
  try {
    const receipt = req.body;
    if (!receipt || !receipt.jobId || !receipt.events) {
      return res.status(400).json({ error: 'INPUT_ERROR: valid receipt body required' });
    }
    const valid = auditService.verify(receipt);
    return res.json({
      valid,
      jobId: receipt.jobId,
      rootHash: receipt.rootHash,
      eventCount: receipt.events.length,
      verdict: valid ? 'RECEIPT_VALID' : 'RECEIPT_TAMPERED'
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

export { router as auditRouter };
