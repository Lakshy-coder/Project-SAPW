"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ragService = exports.RagService = void 0;
const BM25Search_1 = require("./BM25Search");
const VectorSearch_1 = require("./VectorSearch");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
class RagService {
    async ingestDocument(doc) {
        BM25Search_1.bm25Index.ingest(doc);
        logger.info({ docId: doc.id, title: doc.title }, 'Document ingested into BM25 index');
    }
    async search(query, topK = 5) {
        if (!query || query.trim().length === 0) {
            return { citations: [], context: '', retrieverUsed: 'none', documentCount: BM25Search_1.bm25Index.getDocumentCount(), status: 'EMPTY' };
        }
        const qdrantAvailable = await VectorSearch_1.vectorSearch.isAvailable();
        let results = [];
        let retrieverUsed = 'bm25';
        let status = 'READY';
        if (qdrantAvailable) {
            logger.info('Qdrant available but embedding model not yet wired; BM25 remains the active retriever for this build.');
            status = 'DEGRADED';
        }
        results = BM25Search_1.bm25Index.search(query, topK);
        retrieverUsed = 'bm25';
        if (results.length === 0) {
            logger.warn({ query }, 'RAG search returned no results');
            status = 'EMPTY';
        }
        const citations = results.map(r => ({
            documentId: r.document.id,
            documentTitle: r.document.title,
            documentVersion: r.document.version,
            chunkId: r.chunkId,
            location: r.location,
            excerpt: r.excerpt,
            score: r.score,
            retriever: retrieverUsed
        }));
        const context = citations.map(c => `[${c.documentTitle} v${c.documentVersion}] ${c.excerpt}`).join('\n\n');
        return {
            citations,
            context,
            retrieverUsed,
            documentCount: BM25Search_1.bm25Index.getDocumentCount(),
            status
        };
    }
}
exports.RagService = RagService;
exports.ragService = new RagService();
