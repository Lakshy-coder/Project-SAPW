import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PolicyEngine } from '../src/security/PolicyEngine';

const original = process.env.SOVEREIGN_MODE;

describe('PolicyEngine', () => {
  beforeEach(() => {
    process.env.SOVEREIGN_MODE = 'true';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.SOVEREIGN_MODE;
    else process.env.SOVEREIGN_MODE = original;
  });

  it('denies high-risk jobs without explicit permission', () => {
    const decision = PolicyEngine.evaluateJob({
      id: 'job-1',
      intent: 'Run code in production',
      capabilities: ['CODE_EXECUTION'],
      riskLevel: 'HIGH',
      projectId: 'proj',
      userId: 'user'
    } as any, {
      userPermissions: ['jobs:create'],
      modelEndpoint: 'https://example.com',
      sovereignMode: true,
      executionEnvironment: 'PUBLIC',
      sandboxAvailable: false,
      requiredCapabilities: ['CODE_EXECUTION']
    });

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe('DENY');
  });

  it('allows private local execution in sovereign mode', () => {
    const decision = PolicyEngine.evaluateJob({
      id: 'job-2',
      intent: 'Localized industrial analysis',
      capabilities: ['GENERAL_REASONING'],
      riskLevel: 'LOW',
      projectId: 'proj',
      userId: 'user'
    } as any, {
      userPermissions: ['jobs:create'],
      modelEndpoint: 'http://127.0.0.1:11434',
      sovereignMode: true,
      executionEnvironment: 'PRIVATE_LAN',
      sandboxAvailable: true,
      requiredCapabilities: ['GENERAL_REASONING']
    });

    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe('ALLOW');
  });
});
