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
exports.auditService = exports.AuditService = void 0;
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
const runtimeDir = path_1.default.resolve(process.cwd(), '.runtime');
const keyFile = path_1.default.join(runtimeDir, 'audit-signing-key.json');
let _privateKey;
let _publicKey;
let _keyId;
function readStoredKey() {
    try {
        fs.mkdirSync(runtimeDir, { recursive: true });
        const raw = fs.readFileSync(keyFile, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
function writeStoredKey(payload) {
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(keyFile, JSON.stringify(payload, null, 2), 'utf8');
}
function ensureKeys() {
    if (_privateKey && _publicKey && _keyId)
        return;
    const stored = readStoredKey();
    if (stored) {
        _privateKey = stored.privateKey;
        _publicKey = stored.publicKey;
        _keyId = stored.keyId;
        return;
    }
    const { privateKey, publicKey } = (0, crypto_1.generateKeyPairSync)('rsa', { modulusLength: 2048 });
    _privateKey = privateKey.export({ type: 'pkcs8', format: 'pem' });
    _publicKey = publicKey.export({ type: 'spki', format: 'pem' });
    _keyId = `runtime-key-${Date.now()}`;
    writeStoredKey({ keyId: _keyId, privateKey: _privateKey, publicKey: _publicKey });
    logger.warn('Using persisted runtime signing key. For production, store this in a protected key vault or HSM.');
}
class AuditService {
    chains = new Map();
    emit(jobId, eventType, inputData, outputData, nodeId, metadata) {
        ensureKeys();
        const chain = this.chains.get(jobId) ?? [];
        const seq = chain.length;
        const parentHashes = chain.length > 0 ? [chain[chain.length - 1].blockHash] : [];
        const inputHash = (0, crypto_1.createHash)('sha256').update(JSON.stringify(inputData)).digest('hex');
        const outputHash = (0, crypto_1.createHash)('sha256').update(JSON.stringify(outputData)).digest('hex');
        const blockPayload = JSON.stringify({ parentHashes, inputHash, outputHash, seq, jobId, eventType });
        const blockHash = (0, crypto_1.createHash)('sha256').update(blockPayload).digest('hex');
        const event = {
            id: (0, crypto_1.randomUUID)(),
            jobId,
            seq,
            nodeId,
            eventType,
            parentHashes,
            inputHash,
            outputHash,
            blockHash,
            createdAt: new Date().toISOString(),
            metadata
        };
        chain.push(event);
        this.chains.set(jobId, chain);
        logger.info({ jobId, seq, eventType, blockHash }, 'Audit event emitted');
        return event;
    }
    seal(jobId) {
        ensureKeys();
        const chain = this.chains.get(jobId);
        if (!chain || chain.length === 0)
            throw new Error(`PROVENANCE_ERROR: No audit chain for job ${jobId}`);
        const rootHash = chain[chain.length - 1].blockHash;
        const sign = (0, crypto_1.createSign)('SHA256');
        sign.update(rootHash);
        const signature = sign.sign(_privateKey, 'base64');
        const receipt = {
            id: (0, crypto_1.randomUUID)(),
            jobId,
            rootHash,
            signature,
            keyId: _keyId,
            verifierVersion: '1.0.0',
            events: chain,
            createdAt: new Date().toISOString()
        };
        logger.info({ jobId, rootHash, keyId: _keyId }, 'Execution receipt sealed');
        return receipt;
    }
    getChain(jobId) {
        return this.chains.get(jobId) ?? [];
    }
    verify(receipt) {
        ensureKeys();
        if (!_publicKey)
            return false;
        const verify = (0, crypto_1.createVerify)('SHA256');
        verify.update(receipt.rootHash);
        verify.end();
        const signatureValid = verify.verify(_publicKey, receipt.signature, 'base64');
        if (!signatureValid)
            return false;
        let prevHash = '';
        for (const ev of receipt.events) {
            if (ev.seq > 0 && !ev.parentHashes.includes(prevHash))
                return false;
            const blockPayload = JSON.stringify({
                parentHashes: ev.parentHashes,
                inputHash: ev.inputHash,
                outputHash: ev.outputHash,
                seq: ev.seq,
                jobId: ev.jobId,
                eventType: ev.eventType
            });
            const computed = (0, crypto_1.createHash)('sha256').update(blockPayload).digest('hex');
            if (computed !== ev.blockHash)
                return false;
            prevHash = ev.blockHash;
        }
        return true;
    }
}
exports.AuditService = AuditService;
exports.auditService = new AuditService();
