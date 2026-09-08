import { networkInterfaces, hostname } from 'os';
import pino from 'pino';

const logger = pino();

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

const PRIVATE_RANGES = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^::1$/, /^fc/, /^fd/
];
const INFERENCE_HOSTS = (process.env.INFERENCE_NODES ?? '').split(',').filter(Boolean);

function classifyAddress(addr: string): ConnectionClass {
  if (addr === '::1' || addr === '127.0.0.1') return 'LOOPBACK';
  if (INFERENCE_HOSTS.includes(addr)) return 'INFERENCE_NODE';
  if (PRIVATE_RANGES.some(r => r.test(addr))) return 'PRIVATE_LAN';
  return 'PUBLIC_WAN';
}

function isAllowed(conn: NetworkConnection, sovereignMode: boolean): boolean {
  if (!sovereignMode) return true;
  return conn.connectionClass === 'LOOPBACK'
    || conn.connectionClass === 'PRIVATE_LAN'
    || conn.connectionClass === 'INFERENCE_NODE';
}

export class NetworkMonitor {
  private connections: NetworkConnection[] = [];
  private violations: PolicyViolation[] = [];
  private violationCounter = 0;

  isOutboundAllowed(remoteAddress: string): boolean {
    const sovereignMode = process.env.SOVEREIGN_MODE === 'true';
    if (!sovereignMode) return true;
    const className = classifyAddress(remoteAddress);
    return className === 'LOOPBACK' || className === 'PRIVATE_LAN' || className === 'INFERENCE_NODE';
  }

  enforceOutboundPolicy(remoteAddress: string, remotePort: number, protocol = 'tcp'): { allowed: boolean; reason?: string } {
    const allowed = this.isOutboundAllowed(remoteAddress);
    if (!allowed) {
      this.recordConnection(remoteAddress, remotePort, protocol);
      return {
        allowed: false,
        reason: 'PUBLIC_WAN connection blocked by sovereign policy'
      };
    }
    return { allowed: true };
  }

  recordConnection(remoteAddress: string, remotePort: number, protocol = 'tcp'): NetworkConnection {
    const sovereignMode = process.env.SOVEREIGN_MODE === 'true';
    const connectionClass = classifyAddress(remoteAddress);
    const conn: NetworkConnection = {
      id: `conn-${++this.violationCounter}`,
      remoteAddress,
      remotePort,
      protocol,
      connectionClass,
      allowedByPolicy: isAllowed({ connectionClass } as any, sovereignMode),
      timestamp: new Date().toISOString()
    };

    this.connections.push(conn);
    if (this.connections.length > 200) this.connections.shift();

    if (!conn.allowedByPolicy) {
      const v: PolicyViolation = {
        id: `viol-${this.violationCounter}`,
        remoteAddress,
        remotePort,
        reason: `PUBLIC_WAN connection attempted in SOVEREIGN mode`,
        timestamp: conn.timestamp
      };
      this.violations.push(v);
      logger.error({ v }, 'SECURITY_ALERT: Sovereignty policy violation');
    }

    return conn;
  }

  getStatus(): SovereigntyStatus {
    const sovereignMode = process.env.SOVEREIGN_MODE === 'true';
    const ifaces = networkInterfaces();
    const ifaceMap: Record<string, string[]> = {};
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (addrs) ifaceMap[name] = addrs.map(a => a.address);
    }
    const enforcementReady = sovereignMode;
    return {
      sovereignMode,
      enforcementActive: sovereignMode,
      enforcementReady,
      policyMode: sovereignMode ? 'SOVEREIGN' : 'DEVELOPMENT',
      networkInterfaces: ifaceMap,
      allowedCidrs: ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '::1/128'],
      violations: this.violations.slice(-50),
      violationCount: this.violations.length,
      lastChecked: new Date().toISOString(),
      message: sovereignMode
        ? 'SOVEREIGN MODE ACTIVE: non-private outbound connections are denied by policy.'
        : 'DEVELOPMENT MODE: outbound policy is not enforced at OS level; runtime checks remain passive.'
    };
  }

  getConnections(): NetworkConnection[] { return this.connections.slice(-100); }
  getViolations(): PolicyViolation[] { return this.violations.slice(-100); }
}

export const networkMonitor = new NetworkMonitor();
