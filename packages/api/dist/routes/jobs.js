"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsRouter = void 0;
const express_1 = require("express");
const AuditService_1 = require("../audit/AuditService");
const JobManager_1 = require("../orchestrator/JobManager");
const router = (0, express_1.Router)();
exports.jobsRouter = router;
// GET /api/jobs/:jobId/audit  – full audit chain
router.get('/:jobId/audit', (req, res) => {
    const { jobId } = req.params;
    const chain = AuditService_1.auditService.getChain(jobId);
    return res.json({ jobId, events: chain, count: chain.length });
});
// GET /api/jobs/:jobId/receipt  – sealed signed receipt
router.get('/:jobId/receipt', (req, res) => {
    try {
        const { jobId } = req.params;
        const receipt = AuditService_1.auditService.seal(jobId);
        return res.json(receipt);
    }
    catch (err) {
        return res.status(404).json({ error: err.message });
    }
});
// GET /api/jobs/:jobId  – job status
router.get('/:jobId', async (req, res) => {
    const job = await JobManager_1.JobManager.getJob(req.params.jobId);
    if (!job)
        return res.status(404).json({ error: 'Job not found' });
    return res.json(job);
});
