"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.networkMonitor = exports.NetworkMonitor = void 0;
const os_1 = require("os");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
const PRIVATE_RANGES = [
    /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^::1$/, /^fc/, /^fd/
];
const INFERENCE_HOSTS = (process.env.INFERENCE_NODES ?? '').split(',').filter(Boolean);
function classifyAddress(addr) {
    if (addr === '::1' || addr === '127.0.0.1')
        return 'LOOPBACK';
    if (INFERENCE_HOSTS.includes(addr))
        return 'INFERENCE_NODE';
    if (PRIVATE_RANGES.some(r => r.test(addr)))
        return 'PRIVATE_LAN';
    return 'PUBLIC_WAN';
}
function isAllowed(conn, sovereignMode) {
    if (!sovereignMode)
        return true;
    return conn.connectionClass === 'LOOPBACK'
        || conn.connectionClass === 'PRIVATE_LAN'
        || conn.connectionClass === 'INFERENCE_NODE';
}
class NetworkMonitor {
    connections = [];
    violations = [];
    violationCounter = 0;
    isOutboundAllowed(remoteAddress) {
        const sovereignMode = process.env.SOVEREIGN_MODE === 'true';
        if (!sovereignMode)
            return true;
        const className = classifyAddress(remoteAddress);
        return className === 'LOOPBACK' || className === 'PRIVATE_LAN' || className === 'INFERENCE_NODE';
    }
    enforceOutboundPolicy(remoteAddress, remotePort, protocol = 'tcp') {
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
    recordConnection(remoteAddress, remotePort, protocol = 'tcp') {
        const sovereignMode = process.env.SOVEREIGN_MODE === 'true';
        const connectionClass = classifyAddress(remoteAddress);
        const conn = {
            id: `conn-${++this.violationCounter}`,
            remoteAddress,
            remotePort,
            protocol,
            connectionClass,
            allowedByPolicy: isAllowed({ connectionClass }, sovereignMode),
            timestamp: new Date().toISOString()
        };
        this.connections.push(conn);
        if (this.connections.length > 200)
            this.connections.shift();
        if (!conn.allowedByPolicy) {
            const v = {
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
    getStatus() {
        const sovereignMode = process.env.SOVEREIGN_MODE === 'true';
        const ifaces = (0, os_1.networkInterfaces)();
        const ifaceMap = {};
        for (const [name, addrs] of Object.entries(ifaces)) {
            if (addrs)
                ifaceMap[name] = addrs.map(a => a.address);
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
    getConnections() { return this.connections.slice(-100); }
    getViolations() { return this.violations.slice(-100); }
}
exports.NetworkMonitor = NetworkMonitor;
exports.networkMonitor = new NetworkMonitor();
