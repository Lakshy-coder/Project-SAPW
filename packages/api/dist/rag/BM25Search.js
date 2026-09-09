"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bm25Index = exports.BM25Search = void 0;
const crypto_1 = require("crypto");
class BM25Search {
    chunks = [];
    docs = new Map();
    avgDl = 0;
    k1 = 1.5;
    b = 0.75;
    ingest(doc) {
        const sha = (0, crypto_1.createHash)('sha256').update(doc.content).digest('hex');
        if (sha !== doc.sha256) {
            throw new Error(`PROVENANCE_ERROR: SHA-256 mismatch for document ${doc.id}`);
        }
        this.docs.set(doc.id, doc);
        // Simple chunk by paragraph (~500 chars)
        const paragraphs = doc.content.split(/\n{2,}/g).filter(p => p.trim().length > 20);
        let loc = 0;
        for (const para of paragraphs) {
            const chunkId = `${doc.id}_chunk_${loc}`;
            this.chunks.push({
                id: chunkId,
                docId: doc.id,
                location: `para:${loc}`,
                text: para,
                tokens: this.tokenize(para)
            });
            loc++;
        }
        // Recalculate avgDl
        this.avgDl = this.chunks.reduce((sum, c) => sum + c.tokens.length, 0) / (this.chunks.length || 1);
    }
    search(query, topK = 5) {
        if (this.chunks.length === 0)
            return [];
        const qTokens = this.tokenize(query);
        const N = this.chunks.length;
        // IDF calculation
        const idf = (term) => {
            const df = this.chunks.filter(c => c.tokens.includes(term)).length;
            return Math.log((N - df + 0.5) / (df + 0.5) + 1);
        };
        const scores = this.chunks.map(chunk => {
            const dl = chunk.tokens.length;
            let score = 0;
            for (const term of qTokens) {
                const tf = chunk.tokens.filter(t => t === term).length;
                score += idf(term) * (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * dl / this.avgDl));
            }
            return { chunk, score };
        });
        return scores
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(({ chunk, score }) => ({
            document: this.docs.get(chunk.docId),
            score,
            chunkId: chunk.id,
            location: chunk.location,
            excerpt: chunk.text.slice(0, 300)
        }));
    }
    getDocumentCount() { return this.docs.size; }
    tokenize(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2);
    }
}
exports.BM25Search = BM25Search;
exports.bm25Index = new BM25Search();
