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
}

export class RagService {
  async ingestDocument(doc: Document): Promise<void> {
    bm25Index.ingest(doc);
    logger.info({ docId: doc.id, title: doc.title }, 'Document ingested into BM25 index');
    // Vector ingestion would happen here if Qdrant + embedding model are available
    // For now, deferred – vector store is optional
  }

  async search(query: string, topK = 5): Promise<RagResponse> {
    if (!query || query.trim().length === 0) {
      return { citations: [], context: '', retrieverUsed: 'none', documentCount: bm25Index.getDocumentCount() };
    }

    // Try vector first (not implemented yet without embedding model; falls through)
    const qdrantAvailable = await vectorSearch.isAvailable();
    let results: SearchResult[] = [];
    let retrieverUsed: 'vector' | 'bm25' = 'bm25';

    if (qdrantAvailable) {
      // TODO: embed query using local model and query Qdrant
      // For now fall through to BM25
      logger.info('Qdrant available but embedding model not yet wired; falling back to BM25');
    }

    results = bm25Index.search(query, topK);
    retrieverUsed = 'bm25';

    if (results.length === 0) {
      logger.warn({ query }, 'RAG search returned no results');
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
      documentCount: bm25Index.getDocumentCount()
    };
  }
}

export const ragService = new RagService();
