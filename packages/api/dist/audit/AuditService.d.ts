export interface AuditEvent {
    id: string;
    jobId: string;
    seq: number;
    nodeId?: string;
    eventType: string;
    parentHashes: string[];
    inputHash: string;
    outputHash: string;
    blockHash: string;
    createdAt: string;
    metadata?: any;
}
export interface ExecutionReceipt {
    id: string;
    jobId: string;
    rootHash: string;
    signature: string;
    keyId: string;
    verifierVersion: string;
    events: AuditEvent[];
    createdAt: string;
}
export declare class AuditService {
    private chains;
    emit(jobId: string, eventType: string, inputData: any, outputData: any, nodeId?: string, metadata?: any): AuditEvent;
    seal(jobId: string): ExecutionReceipt;
    getChain(jobId: string): AuditEvent[];
    verify(receipt: ExecutionReceipt): boolean;
}
export declare const auditService: AuditService;
