export type ConnectionClass = 'LOOPBACK' | 'PRIVATE_LAN' | 'PUBLIC_WAN' | 'INFERENCE_NODE';
export interface NetworkConnection {
    id: string;
    remoteAddress: string;
    remotePort: number;
    protocol: string;
    connectionClass: ConnectionClass;
    allowedByPolicy: boolean;
    timestamp: string;
}
export interface PolicyViolation {
    id: string;
    remoteAddress: string;
    remotePort: number;
    reason: string;
    timestamp: string;
}
export interface SovereigntyStatus {
    sovereignMode: boolean;
    enforcementActive: boolean;
    enforcementReady: boolean;
    policyMode: 'SOVEREIGN' | 'DEVELOPMENT';
    networkInterfaces: Record<string, string[]>;
    allowedCidrs: string[];
    violations: PolicyViolation[];
    violationCount: number;
    lastChecked: string;
    message: string;
}
export declare class NetworkMonitor {
    private connections;
    private violations;
    private violationCounter;
    isOutboundAllowed(remoteAddress: string): boolean;
    enforceOutboundPolicy(remoteAddress: string, remotePort: number, protocol?: string): {
        allowed: boolean;
        reason?: string;
    };
    recordConnection(remoteAddress: string, remotePort: number, protocol?: string): NetworkConnection;
    getStatus(): SovereigntyStatus;
    getConnections(): NetworkConnection[];
    getViolations(): PolicyViolation[];
}
export declare const networkMonitor: NetworkMonitor;
