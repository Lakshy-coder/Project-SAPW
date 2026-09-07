import { describe, it, expect, beforeEach } from 'vitest';
import { BM25Search } from '../src/rag/BM25Search';
import { createHash } from 'crypto';

function makeDoc(id: string, content: string) {
  const sha256 = createHash('sha256').update(content).digest('hex');
  return { id, projectId: 'p1', title: `Doc ${id}`, content, version: '1.0', sha256, accessClass: 'RESTRICTED' };
}

describe('BM25Search', () => {
  let index: BM25Search;

  beforeEach(() => { index = new BM25Search(); });

  it('returns empty results on empty index', () => {
    expect(index.search('anything')).toHaveLength(0);
  });

  it('rejects document with wrong sha256', () => {
    const doc = { ...makeDoc('d1', 'hello world'), sha256: 'badhash' };
    expect(() => index.ingest(doc)).toThrow('PROVENANCE_ERROR');
  });

  it('ingests a document and retrieves it by exact term', () => {
    index.ingest(makeDoc('d1', 'ASME B31.3 pipe wall thickness calculation formula pressure design'));
    const results = index.search('ASME B31.3 pipe wall thickness');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].document.id).toBe('d1');
  });

  it('ranks more relevant document higher', () => {
    index.ingest(makeDoc('d1', 'pressure vessel inspection general guidelines'));
    index.ingest(makeDoc('d2', 'pressure vessel inspection corrosion measurement wall thickness standards corrosion corrosion'));
    const results = index.search('corrosion wall thickness');
    expect(results[0].document.id).toBe('d2');
  });

  it('returns top K results limited by topK argument', () => {
    for (let i = 0; i < 10; i++) {
      index.ingest(makeDoc(`d${i}`, `engineering document ${i} safety pressure vessel inspection`));
    }
    const results = index.search('engineering pressure', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns excerpts with content', () => {
    index.ingest(makeDoc('d1', 'The minimum required wall thickness must comply with ASME B31.3 formula.'));
    const results = index.search('wall thickness formula');
    expect(results[0].excerpt.length).toBeGreaterThan(0);
  });
});
