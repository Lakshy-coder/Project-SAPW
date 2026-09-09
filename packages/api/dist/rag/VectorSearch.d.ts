interface QdrantHit {
    id: string;
    score: number;
    payload: {
        docId: string;
        location: string;
        excerpt: string;
        version: string;
    };
}
export declare class VectorSearch {
    private baseUrl;
    private collectionName;
    private available;
    isAvailable(): Promise<boolean>;
    /** Upsert a single chunk embedding into Qdrant */
    upsertChunk(chunkId: string, vector: number[], payload: Record<string, any>): Promise<void>;
    /** Query Qdrant by a raw query vector */
    query(queryVector: number[], topK?: number): Promise<QdrantHit[]>;
}
export declare const vectorSearch: VectorSearch;
export {};
