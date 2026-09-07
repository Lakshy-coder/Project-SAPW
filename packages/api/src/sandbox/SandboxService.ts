import { createHash } from 'crypto';
import pino from 'pino';

const logger = pino();

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  sourceHash: string;
  outputHash: string;
  sandboxAvailable: boolean;
}

export class SandboxService {
  private dockerAvailable: boolean | null = null;

  async isDockerAvailable(): Promise<boolean> {
    if (this.dockerAvailable !== null) return this.dockerAvailable;
    try {
      const { execSync } = await import('child_process');
      execSync('docker version', { timeout: 3000, stdio: 'pipe' });
      this.dockerAvailable = true;
    } catch {
      this.dockerAvailable = false;
    }
    return this.dockerAvailable;
  }

  async execute(code: string, _allowedLibraries: string[] = []): Promise<SandboxResult> {
    const sourceHash = createHash('sha256').update(code).digest('hex');

    // Reject clearly dangerous patterns before even trying execution
    const forbidden = [
      /import\s+os\b/, /import\s+subprocess\b/, /import\s+sys\b/,
      /__import__/, /open\s*\(/, /exec\s*\(/, /eval\s*\(/
    ];
    for (const pattern of forbidden) {
      if (pattern.test(code)) {
        const err = 'SECURITY_ERROR: Forbidden code pattern detected. Execution rejected.';
        logger.error({ pattern: pattern.source }, err);
        throw new Error(err);
      }
    }

    const available = await this.isDockerAvailable();
    if (!available) {
      logger.warn('SANDBOX_UNAVAILABLE: Docker is not installed. Code execution is disabled.');
      return {
        stdout: '',
        stderr: 'SANDBOX_UNAVAILABLE: Docker is required for secure code execution.',
        exitCode: -1,
        durationMs: 0,
        sourceHash,
        outputHash: '',
        sandboxAvailable: false
      };
    }

    // Docker available path (runs with network-none, non-root, resource limits)
    const start = Date.now();
    try {
      const { execSync } = await import('child_process');
      // Write code to a temp file, run inside a locked-down container
      const encoded = Buffer.from(code).toString('base64');
      const cmd = `docker run --rm --network none --read-only --memory=128m --cpus=0.5 --user 65534 python:3.11-slim sh -c "echo ${encoded} | base64 -d | python3"`;
      const stdout = execSync(cmd, { timeout: 10000, stdio: 'pipe' }).toString();
      const durationMs = Date.now() - start;
      const outputHash = createHash('sha256').update(stdout).digest('hex');
      return { stdout, stderr: '', exitCode: 0, durationMs, sourceHash, outputHash, sandboxAvailable: true };
    } catch (err: any) {
      const stderr = err.stderr?.toString() ?? err.message;
      return { stdout: '', stderr, exitCode: 1, durationMs: Date.now() - start, sourceHash, outputHash: '', sandboxAvailable: true };
    }
  }
}

export const sandboxService = new SandboxService();
