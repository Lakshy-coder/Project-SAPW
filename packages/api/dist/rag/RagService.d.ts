import { Document } from './BM25Search';
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
export declare class RagService {
    ingestDocument(doc: Document): Promise<void>;
    search(query: string, topK?: number): Promise<RagResponse>;
}
export declare const ragService: RagService;
