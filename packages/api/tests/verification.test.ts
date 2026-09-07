import { describe, it, expect } from 'vitest';
import { verifyHash, verifyMath, verifySchema, verificationGate } from '../src/verification/Verifier';
import { createHash } from 'crypto';
import { z } from 'zod';

describe('verifyHash', () => {
  it('passes when hash matches', () => {
    const content = 'engineering data 123';
    const hash = createHash('sha256').update(content).digest('hex');
    const result = verifyHash(content, hash);
    expect(result.status).toBe('PASS');
  });

  it('fails when hash does not match', () => {
    const result = verifyHash('tampered content', 'badhash000');
    expect(result.status).toBe('FAIL');
    expect(result.type).toBe('PROVENANCE');
  });
});

describe('verifyMath', () => {
  it('passes when computed equals expected within tolerance', () => {
    const result = verifyMath({ computed: 6.84, expected: 6.84, tolerancePct: 1 });
    expect(result.status).toBe('PASS');
  });

  it('fails when deviation exceeds tolerance', () => {
    const result = verifyMath({ computed: 10.0, expected: 6.84, tolerancePct: 1 });
    expect(result.status).toBe('FAIL');
    expect(result.type).toBe('MATH');
  });
});

describe('verifySchema', () => {
  const schema = z.object({ value: z.number().positive() });

  it('passes valid data', () => {
    const result = verifySchema({ value: 42 }, schema);
    expect(result.status).toBe('PASS');
  });

  it('fails invalid data', () => {
    const result = verifySchema({ value: -1 }, schema);
    expect(result.status).toBe('FAIL');
  });
});

describe('verificationGate', () => {
  it('allows proceed when all checks pass', () => {
    const content = 'ok';
    const hash = createHash('sha256').update(content).digest('hex');
    const results = [verifyHash(content, hash), verifyMath({ computed: 5, expected: 5 })];
    const gate = verificationGate(results);
    expect(gate.canProceed).toBe(true);
    expect(gate.verdict).toBe('PASS');
  });

  it('blocks when provenance check fails', () => {
    const results = [verifyHash('data', 'wrong_hash')];
    const gate = verificationGate(results);
    expect(gate.canProceed).toBe(false);
    expect(gate.verdict).toBe('BLOCKED');
  });

  it('fails (not blocks) when only math fails', () => {
    const results = [verifyMath({ computed: 10, expected: 1 })];
    const gate = verificationGate(results);
    expect(gate.canProceed).toBe(false);
    expect(gate.verdict).toBe('FAIL');
  });
});
