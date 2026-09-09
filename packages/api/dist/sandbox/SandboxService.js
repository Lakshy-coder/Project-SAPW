"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sandboxService = exports.SandboxService = void 0;
const crypto_1 = require("crypto");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
class SandboxService {
    dockerAvailable = null;
    async isDockerAvailable() {
        if (this.dockerAvailable !== null)
            return this.dockerAvailable;
        try {
            const { execSync } = await Promise.resolve().then(() => __importStar(require('child_process')));
            execSync('docker version', { timeout: 3000, stdio: 'pipe' });
            this.dockerAvailable = true;
        }
        catch {
            this.dockerAvailable = false;
        }
        return this.dockerAvailable;
    }
    async execute(code, _allowedLibraries = []) {
        const sourceHash = (0, crypto_1.createHash)('sha256').update(code).digest('hex');
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
            const { execSync } = await Promise.resolve().then(() => __importStar(require('child_process')));
            // Write code to a temp file, run inside a locked-down container
            const encoded = Buffer.from(code).toString('base64');
            const cmd = `docker run --rm --network none --read-only --memory=128m --cpus=0.5 --user 65534 python:3.11-slim sh -c "echo ${encoded} | base64 -d | python3"`;
            const stdout = execSync(cmd, { timeout: 10000, stdio: 'pipe' }).toString();
            const durationMs = Date.now() - start;
            const outputHash = (0, crypto_1.createHash)('sha256').update(stdout).digest('hex');
            return { stdout, stderr: '', exitCode: 0, durationMs, sourceHash, outputHash, sandboxAvailable: true };
        }
        catch (err) {
            const stderr = err.stderr?.toString() ?? err.message;
            return { stdout: '', stderr, exitCode: 1, durationMs: Date.now() - start, sourceHash, outputHash: '', sandboxAvailable: true };
        }
    }
}
exports.SandboxService = SandboxService;
exports.sandboxService = new SandboxService();
