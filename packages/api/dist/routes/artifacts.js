"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.artifactsRouter = void 0;
const express_1 = require("express");
const DeliverableService_1 = require("../deliverables/DeliverableService");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const router = (0, express_1.Router)();
exports.artifactsRouter = router;
// GET /api/artifacts?jobId=
router.get('/', (req, res) => {
    const { jobId } = req.query;
    if (!jobId)
        return res.status(400).json({ error: 'INPUT_ERROR: jobId required' });
    const artifacts = DeliverableService_1.deliverableService.listArtifacts(String(jobId));
    return res.json({ artifacts });
});
// GET /api/artifacts/:id
router.get('/:id', (req, res) => {
    const artifact = DeliverableService_1.deliverableService.getArtifact(req.params.id);
    if (!artifact)
        return res.status(404).json({ error: 'Artifact not found' });
    return res.json(artifact);
});
// GET /api/artifacts/:id/download
router.get('/:id/download', (req, res) => {
    const artifact = DeliverableService_1.deliverableService.getArtifact(req.params.id);
    if (!artifact)
        return res.status(404).json({ error: 'Artifact not found' });
    const dir = process.env.ARTIFACTS_DIR ?? path.join(process.cwd(), 'artifacts');
    const filePath = path.join(dir, artifact.filename);
    if (!fs.existsSync(filePath))
        return res.status(404).json({ error: 'File not found on disk' });
    return res.download(filePath, artifact.filename);
});
// POST /api/artifacts/:id/verify
router.post('/:id/verify', (req, res) => {
    try {
        const result = DeliverableService_1.deliverableService.verifyArtifact(req.params.id);
        return res.json({ ...result, artifactId: req.params.id, verdict: result.valid ? 'INTEGRITY_PASS' : 'INTEGRITY_FAIL' });
    }
    catch (err) {
        return res.status(404).json({ error: err.message });
    }
});
// POST /api/artifacts/generate/report
router.post('/generate/report', async (req, res) => {
    try {
        const { jobId, title, sections, citations, executionId } = req.body;
        if (!jobId || !title || !sections)
            return res.status(400).json({ error: 'INPUT_ERROR: jobId, title, sections required' });
        const artifact = await DeliverableService_1.deliverableService.generateReport(jobId, title, sections, citations ?? [], executionId ?? jobId);
        return res.json(artifact);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
