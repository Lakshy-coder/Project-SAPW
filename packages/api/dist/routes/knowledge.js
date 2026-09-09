"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeRouter = void 0;
const express_1 = require("express");
const crypto_1 = require("crypto");
const RagService_1 = require("../rag/RagService");
const crypto_2 = require("crypto");
const router = (0, express_1.Router)();
exports.knowledgeRouter = router;
// POST /api/knowledge/ingest  – ingest a document into the RAG index
router.post('/ingest', async (req, res) => {
    try {
        const { id, title, content, version, accessClass, projectId } = req.body;
        if (!title || !content || !version) {
            return res.status(400).json({ error: 'INPUT_ERROR: title, content, version required' });
        }
        const sha256 = (0, crypto_1.createHash)('sha256').update(content).digest('hex');
        const doc = {
            id: id ?? (0, crypto_2.randomUUID)(),
            projectId: projectId ?? 'default',
            title,
            content,
            version,
            sha256,
            accessClass: accessClass ?? 'RESTRICTED'
        };
        await RagService_1.ragService.ingestDocument(doc);
        return res.json({ docId: doc.id, sha256, chunks: 'indexed', status: 'INGESTED' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/knowledge/search?query=&topK=
router.get('/search', async (req, res) => {
    try {
        const query = String(req.query.query ?? '').trim();
        const topK = Math.min(parseInt(String(req.query.topK ?? '5')), 20);
        if (!query)
            return res.status(400).json({ error: 'INPUT_ERROR: query required' });
        const result = await RagService_1.ragService.search(query, topK);
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
