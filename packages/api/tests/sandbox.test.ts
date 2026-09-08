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

  it('handles safe code when sandbox unavailable gracefully', async () => {
    // Docker may or may not be available depending on environment
    const result = await svc.execute('print("hello")');
    
    // If sandbox is available, execution should succeed
    if (result.sandboxAvailable) {
      expect(result.stdout).toContain('hello');
      expect(result.exitCode).toBe(0);
    } else {
      // If sandbox is not available, should return appropriate error state
      expect(result.exitCode).toBe(-1);
      expect(result.stderr).toContain('SANDBOX_UNAVAILABLE');
    }
  });
});
