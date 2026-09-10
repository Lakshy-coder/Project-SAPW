import { SearchResult } from './BM25Search';

interface QdrantHit {
  id: string;
  score: number;
  payload: { docId: string; location: string; excerpt: string; version: string };
}

export class VectorSearch {
  private baseUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  private collectionName = 'sih_chunks';
  private available: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      const res = await fetch(`${this.baseUrl}/collections/${this.collectionName}`, { signal: AbortSignal.timeout(2000) });
      this.available = res.ok;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  /** Upsert a single chunk embedding into Qdrant */
  async upsertChunk(chunkId: string, vector: number[], payload: Record<string, any>): Promise<void> {
    if (!(await this.isAvailable())) return;
    await fetch(`${this.baseUrl}/collections/${this.collectionName}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [{ id: chunkId, vector, payload }] })
    });
  }

  /** Query Qdrant by a raw query vector */
  async query(queryVector: number[], topK = 5): Promise<QdrantHit[]> {
    if (!(await this.isAvailable())) return [];
    try {
      const res = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector: queryVector, limit: topK, with_payload: true })
      });
      if (!res.ok) return [];
      const data: any = await res.json();
      return (data.result ?? []) as QdrantHit[];
    } catch {
      return [];
    }
  }
}

export const vectorSearch = new VectorSearch();
