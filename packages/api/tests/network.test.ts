import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { networkMonitor } from '../src/security/NetworkMonitor';

const original = process.env.SOVEREIGN_MODE;

describe('NetworkMonitor', () => {
  beforeEach(() => {
    process.env.SOVEREIGN_MODE = 'true';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SOVEREIGN_MODE;
    else process.env.SOVEREIGN_MODE = original;
  });

  it('blocks public outbound connections in sovereign mode', () => {
    const result = networkMonitor.enforceOutboundPolicy('8.8.8.8', 443, 'tcp');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blocked');
  });

  it('allows private loopback traffic in sovereign mode', () => {
    const result = networkMonitor.enforceOutboundPolicy('127.0.0.1', 11434, 'tcp');
    expect(result.allowed).toBe(true);
  });
});
