export interface SandboxResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    sourceHash: string;
    outputHash: string;
    sandboxAvailable: boolean;
}
export declare class SandboxService {
    private dockerAvailable;
    isDockerAvailable(): Promise<boolean>;
    execute(code: string, _allowedLibraries?: string[]): Promise<SandboxResult>;
}
export declare const sandboxService: SandboxService;
