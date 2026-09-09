"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRouter = void 0;
const express_1 = require("express");
const AuditService_1 = require("../audit/AuditService");
const router = (0, express_1.Router)();
exports.auditRouter = router;
// POST /api/audit/verify  – verify an execution receipt offline
router.post('/verify', (req, res) => {
    try {
        const receipt = req.body;
        if (!receipt || !receipt.jobId || !receipt.events) {
            return res.status(400).json({ error: 'INPUT_ERROR: valid receipt body required' });
        }
        const valid = AuditService_1.auditService.verify(receipt);
        return res.json({
            valid,
            jobId: receipt.jobId,
            rootHash: receipt.rootHash,
            eventCount: receipt.events.length,
            verdict: valid ? 'RECEIPT_VALID' : 'RECEIPT_TAMPERED'
        });
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
