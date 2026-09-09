export interface Document {
    id: string;
    projectId: string;
    title: string;
    content: string;
    version: string;
    sha256: string;
    accessClass: string;
}
export interface SearchResult {
    document: Document;
    score: number;
    chunkId: string;
    location: string;
    excerpt: string;
}
export declare class BM25Search {
    private chunks;
    private docs;
    private avgDl;
    private k1;
    private b;
    ingest(doc: Document): void;
    search(query: string, topK?: number): SearchResult[];
    getDocumentCount(): number;
    private tokenize;
}
export declare const bm25Index: BM25Search;
