import { describe, it, expect } from 'vitest';
import { SandboxService } from '../src/sandbox/SandboxService';

describe('SandboxService — security filters', () => {
  const svc = new SandboxService();

  const dangerous = [
    'import os\nprint(os.getcwd())',
    'import subprocess',
    '__import__("os").listdir(".")',
    'open("/etc/passwd")',
    'exec("print(1)")',
    'eval("1+1")',
  ];

  for (const code of dangerous) {
    it(`rejects forbidden pattern in: ${code.slice(0,40)}`, async () => {
      await expect(svc.execute(code)).rejects.toThrow('SECURITY_ERROR');
    });
  }

  it('returns SANDBOX_UNAVAILABLE when Docker is absent', async () => {
    // In this test environment Docker is not installed
    const result = await svc.execute('print("hello")');
    expect(result.sandboxAvailable).toBe(false);
    expect(result.stderr).toContain('SANDBOX_UNAVAILABLE');
    expect(result.exitCode).toBe(-1);
  });
});
