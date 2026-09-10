import { bm25Index, Document, SearchResult } from './BM25Search';
import { vectorSearch } from './VectorSearch';
import pino from 'pino';

const logger = pino();

export interface Citation {
  documentId: string;
  documentTitle: string;
  documentVersion: string;
  chunkId: string;
  location: string;
  excerpt: string;
  score: number;
  retriever: 'vector' | 'bm25';
}

export interface RagResponse {
  citations: Citation[];
  context: string;
  retrieverUsed: 'vector' | 'bm25' | 'none';
  documentCount: number;
  status: 'READY' | 'DEGRADED' | 'EMPTY';
}

export class RagService {
  async ingestDocument(doc: Document): Promise<void> {
    bm25Index.ingest(doc);
    logger.info({ docId: doc.id, title: doc.title }, 'Document ingested into BM25 index');
  }

  async search(query: string, topK = 5): Promise<RagResponse> {
    if (!query || query.trim().length === 0) {
      return { citations: [], context: '', retrieverUsed: 'none', documentCount: bm25Index.getDocumentCount(), status: 'EMPTY' };
    }

    const qdrantAvailable = await vectorSearch.isAvailable();
    let results: SearchResult[] = [];
    let retrieverUsed: 'vector' | 'bm25' = 'bm25';
    let status: 'READY' | 'DEGRADED' | 'EMPTY' = 'READY';

    if (qdrantAvailable) {
      logger.info('Qdrant available but embedding model not yet wired; BM25 remains the active retriever for this build.');
      status = 'DEGRADED';
    }

    results = bm25Index.search(query, topK);
    retrieverUsed = 'bm25';

    if (results.length === 0) {
      logger.warn({ query }, 'RAG search returned no results');
      status = 'EMPTY';
    }

    const citations: Citation[] = results.map(r => ({
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
      documentCount: bm25Index.getDocumentCount(),
      status
    };
  }
}

export const ragService = new RagService();
