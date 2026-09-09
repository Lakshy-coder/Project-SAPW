"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsRouter = void 0;
const express_1 = require("express");
const AuditService_1 = require("../audit/AuditService");
const JobManager_1 = require("../orchestrator/JobManager");
const middleware_1 = require("../auth/middleware");
const router = (0, express_1.Router)();
exports.jobsRouter = router;
// POST /api/jobs - create a new job (requires authentication and permission)
router.post('/', middleware_1.requireAuth, (0, middleware_1.requirePermission)('jobs:create'), async (req, res) => {
    try {
        const userId = req.user.id;
        const projectId = req.headers['x-project-id'] || 'default';
        const request = {
            ...req.body,
            userPermissions: req.user.permissions // Pass user permissions for policy evaluation
        };
        // Create job and queue for execution - return immediately with jobId
        // Execution runs in background and emits events over WebSocket
        const job = await JobManager_1.JobManager.createJob(request, userId, projectId);
        return res.status(202).json(job); // 202 Accepted - job accepted, processing asynchronously
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// GET /api/jobs/:jobId/audit  – full audit chain (requires auth)
router.get('/:jobId/audit', middleware_1.requireAuth, (req, res) => {
    const { jobId } = req.params;
    const chain = AuditService_1.auditService.getChain(jobId);
    return res.json({ jobId, events: chain, count: chain.length });
});
// GET /api/jobs/:jobId/receipt  – sealed signed receipt (requires auth)
router.get('/:jobId/receipt', middleware_1.requireAuth, (req, res) => {
    try {
        const { jobId } = req.params;
        const receipt = AuditService_1.auditService.seal(jobId);
        return res.json(receipt);
    }
    catch (err) {
        return res.status(404).json({ error: err.message });
    }
});
// GET /api/jobs/:jobId  – job status (requires auth)
router.get('/:jobId', middleware_1.requireAuth, async (req, res) => {
    const job = await JobManager_1.JobManager.getJob(req.params.jobId);
    if (!job)
        return res.status(404).json({ error: 'Job not found' });
    return res.json(job);
});
