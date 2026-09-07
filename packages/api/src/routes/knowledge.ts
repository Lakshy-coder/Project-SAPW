import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { ragService } from '../rag/RagService';
import { bm25Index, Document } from '../rag/BM25Search';
import { randomUUID } from 'crypto';

const router = Router();

// POST /api/knowledge/ingest  – ingest a document into the RAG index
router.post('/ingest', async (req: Request, res: Response) => {
  try {
    const { id, title, content, version, accessClass, projectId } = req.body;
    if (!title || !content || !version) {
      return res.status(400).json({ error: 'INPUT_ERROR: title, content, version required' });
    }
    const sha256 = createHash('sha256').update(content).digest('hex');
    const doc: Document = {
      id: id ?? randomUUID(),
      projectId: projectId ?? 'default',
      title,
      content,
      version,
      sha256,
      accessClass: accessClass ?? 'RESTRICTED'
    };
    await ragService.ingestDocument(doc);
    return res.json({ docId: doc.id, sha256, chunks: 'indexed', status: 'INGESTED' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/knowledge/search?query=&topK=
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = String(req.query.query ?? '').trim();
    const topK = Math.min(parseInt(String(req.query.topK ?? '5')), 20);
    if (!query) return res.status(400).json({ error: 'INPUT_ERROR: query required' });
    const result = await ragService.search(query, topK);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export { router as knowledgeRouter };
