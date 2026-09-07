import { describe, it, expect, beforeEach } from 'vitest';
import { AuditService } from '../src/audit/AuditService';

describe('AuditService', () => {
  let svc: AuditService;

  beforeEach(() => { svc = new AuditService(); });

  it('emits events with sequential seq numbers', () => {
    const e1 = svc.emit('job-1', 'NODE_STARTED', { step: 1 }, { ok: true });
    const e2 = svc.emit('job-1', 'NODE_COMPLETED', { step: 1 }, { hash: 'abc' });
    expect(e1.seq).toBe(0);
    expect(e2.seq).toBe(1);
  });

  it('chains parent hashes correctly', () => {
    const e1 = svc.emit('job-1', 'START', {}, {});
    const e2 = svc.emit('job-1', 'END',   {}, {});
    expect(e2.parentHashes).toContain(e1.blockHash);
  });

  it('throws when sealing a job with no events', () => {
    expect(() => svc.seal('unknown-job')).toThrow('PROVENANCE_ERROR');
  });

  it('seals a receipt and verifies it', () => {
    svc.emit('job-2', 'START', { input: 'x' }, { out: 'y' });
    svc.emit('job-2', 'END',   { input: 'z' }, { out: 'w' });
    const receipt = svc.seal('job-2');
    expect(receipt.rootHash).toBeTruthy();
    expect(receipt.signature).toBeTruthy();
    expect(svc.verify(receipt)).toBe(true);
  });

  it('detects tampered receipt', () => {
    svc.emit('job-3', 'START', { input: 'x' }, { out: 'y' });
    const receipt = svc.seal('job-3');
    // Tamper a block hash
    receipt.events[0].blockHash = 'tampered000';
    expect(svc.verify(receipt)).toBe(false);
  });

  it('maintains separate chains per job', () => {
    svc.emit('jobA', 'E1', {}, {});
    svc.emit('jobB', 'E1', {}, {});
    expect(svc.getChain('jobA')).toHaveLength(1);
    expect(svc.getChain('jobB')).toHaveLength(1);
  });
});
