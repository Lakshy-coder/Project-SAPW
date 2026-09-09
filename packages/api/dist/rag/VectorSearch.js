"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vectorSearch = exports.VectorSearch = void 0;
class VectorSearch {
    baseUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    collectionName = 'sih_chunks';
    available = null;
    async isAvailable() {
        if (this.available !== null)
            return this.available;
        try {
            const res = await fetch(`${this.baseUrl}/collections/${this.collectionName}`, { signal: AbortSignal.timeout(2000) });
            this.available = res.ok;
        }
        catch {
            this.available = false;
        }
        return this.available;
    }
    /** Upsert a single chunk embedding into Qdrant */
    async upsertChunk(chunkId, vector, payload) {
        if (!(await this.isAvailable()))
            return;
        await fetch(`${this.baseUrl}/collections/${this.collectionName}/points`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: [{ id: chunkId, vector, payload }] })
        });
    }
    /** Query Qdrant by a raw query vector */
    async query(queryVector, topK = 5) {
        if (!(await this.isAvailable()))
            return [];
        try {
            const res = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vector: queryVector, limit: topK, with_payload: true })
            });
            if (!res.ok)
                return [];
            const data = await res.json();
            return (data.result ?? []);
        }
        catch {
            return [];
        }
    }
}
exports.VectorSearch = VectorSearch;
exports.vectorSearch = new VectorSearch();
