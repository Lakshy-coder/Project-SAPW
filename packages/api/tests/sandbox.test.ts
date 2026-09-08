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

  it('returns result with sandboxAvailable status based on Docker availability', async () => {
    // In this test environment Docker IS installed (verified at startup)
    const result = await svc.execute('print("hello")');
    // SandboxService.isDockerAvailable() should return true in this environment
    expect(result.sandboxAvailable).toBe(true);
    // When Docker is available and code is safe, execution succeeds
    expect(result.stdout).toContain('hello');
    expect(result.exitCode).toBe(0);
  });
});

