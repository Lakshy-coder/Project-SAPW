import { createHash } from 'crypto';

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

interface Chunk {
  id: string;
  docId: string;
  location: string;
  text: string;
  tokens: string[];
}

export class BM25Search {
  private chunks: Chunk[] = [];
  private docs: Map<string, Document> = new Map();
  private avgDl = 0;
  private k1 = 1.5;
  private b = 0.75;

  ingest(doc: Document) {
    const sha = createHash('sha256').update(doc.content).digest('hex');
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

  search(query: string, topK = 5): SearchResult[] {
    if (this.chunks.length === 0) return [];

    const qTokens = this.tokenize(query);
    const N = this.chunks.length;

    // IDF calculation
    const idf = (term: string) => {
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
        document: this.docs.get(chunk.docId)!,
        score,
        chunkId: chunk.id,
        location: chunk.location,
        excerpt: chunk.text.slice(0, 300)
      }));
  }

  getDocumentCount() { return this.docs.size; }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }
}

export const bm25Index = new BM25Search();
